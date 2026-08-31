/**
 * [SOVEREIGN UNIT] Question Replenishment Service
 * v2.0 - Full Format Alignment & Universal Auditing
 * Following "Logos Bank" Engineering Standards.
 *
 * 修正紀錄:
 * - initialize() 還原艦艇位置
 * - syncCoverageGaps() 改用 getLeastUsedBooks
 * - pulse() 紅燈停/黃燈跑1艘/綠燈跑3艘
 * - executeTaskStep() 加 segments、yielded 守衛（不推進章節）
 */

import { dbOps } from '../database/index.js';
import QuestionCore from './QuestionCore.js';
import { ContentManager } from './ContentManager.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { logger } from '../utils/logger.js';
import { GlobalAIState } from './gemini-client.js';
import { activeRooms } from '../socket/expedition/registry.js';

const SUPPORTED_VERSIONS = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD'];

class ReplenishmentTask {
    constructor(vesselId, book, chapter, version = 'CUV_TRAD') {
        this.vesselId = vesselId;
        this.book = bibleTranslator.toChinese(book);
        this.chapter = chapter;
        this.version = version;
        this.priority = 'P2';
    }

    rotateVersion() {
        const idx = SUPPORTED_VERSIONS.indexOf(this.version);
        this.version = SUPPORTED_VERSIONS[(idx + 1) % SUPPORTED_VERSIONS.length];
        return this.version;
    }
}

class QuestionReplenishmentService {
    constructor() {
        this.vessels = new Map();
        this.isCruising = false;
        this.scanner = { lastScan: null, gaps: [] };
        this.stats = { totalStored: 0, lastPulseAt: null, pulseCount: 0, startedAt: null };
    }

    async initialize() {
        logger.info('⚓ [Replenishment] Initializing Full-Spec Fleet...');

        // 預設艦艇位置
        const defaults = {
            Alpha: { book: '創世記', chapter: 1, version: 'CUV_TRAD' },
            Beta:  { book: '馬太福音', chapter: 1, version: 'CNV_TRAD' },
            Gamma: { book: '啟示錄', chapter: 1, version: 'TCV2010_TRAD' },
        };

        // 從設定還原上次艦艇位置（伺服器重啟後繼續）
        for (const [id, def] of Object.entries(defaults)) {
            let book = def.book;
            let chapter = def.chapter;
            let version = def.version;

            try {
                const saved = await dbOps.getSetting(`replenish_vessel_${id}`, null);
                if (saved) {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    book    = parsed.book    || book;
                    chapter = parsed.chapter || chapter;
                    version = parsed.version || version;
                    logger.info(`⚓ [Replenishment] Vessel ${id} restored: ${book} Ch.${chapter} (${version})`);
                }
            } catch (e) {
                logger.warn(`⚠️ [Replenishment] Could not restore vessel ${id}: ${e.message}`);
            }

            this._registerVessel(id, book, chapter, version);
        }

        await this.syncCoverageGaps();
        this.stats.startedAt = new Date().toISOString();
        logger.info('✅ [Replenishment] Fleet ready.');
    }

    _registerVessel(id, book, chapter, version) {
        this.vessels.set(id, new ReplenishmentTask(id, book, chapter, version));
    }

    async syncCoverageGaps() {
        try {
            // 取得所有書卷的題目數量（題數少的優先補）
            const books = await dbOps.getLeastUsedBooks(999);
            this.scanner.gaps = books
                .filter(b => (b.question_count || 0) < 50)
                .map(b => ({ book: b.book, count: b.question_count || 0 }))
                .sort((a, b) => a.count - b.count);
            this.scanner.lastScan = Date.now();
            logger.info(`🔍 [Replenishment] Gap scan: ${this.scanner.gaps.length} books need replenishment.`);
        } catch (e) {
            logger.error(`❌ [Replenishment] Scan failed: ${e.message}`);
        }
    }

    async pulse() {
        if (this.isCruising) return;
        this.isCruising = true;

        try {
            this.stats.lastPulseAt = new Date().toISOString();
            this.stats.pulseCount++;

            // 有玩家在線：完全暫停，讓 AI 資源留給遊戲
            if (activeRooms.size > 0) {
                logger.info(`⏸️  [Replenishment] ${activeRooms.size} active room(s) — pulse deferred.`);
                return;
            }

            // 有玩家在線 → 讓路，完全停止
            if (activeRooms.size > 0) {
                logger.info(`⏸️  [Replenishment] ${activeRooms.size} active room(s) — yielding to players.`);
                return;
            }

            const health = GlobalAIState.checkHealth();

            // 紅燈：完全停止
            if (health === 'red') {
                logger.warn('🔴 [Replenishment] Red state — skipping pulse.');
                return;
            }

            // 黃燈：只跑第一艘（降速保護）
            // 綠燈：全部三艘
            const vesselEntries = Array.from(this.vessels.entries());
            const activeVessels = health === 'yellow' ? vesselEntries.slice(0, 1) : vesselEntries;

            if (health === 'yellow') {
                logger.warn('🟡 [Replenishment] Yellow state — running 1 vessel only.');
            }

            for (const [, task] of activeVessels) {
                await this.executeTaskStep(task);
            }
        } finally {
            this.isCruising = false;
        }
    }

    async executeTaskStep(task) {
        // 優先處理覆蓋缺口（題數不足的書卷）
        if (this.scanner.gaps.length > 0) {
            const topGap = this.scanner.gaps.shift();
            task.book = topGap.book;
            task.chapter = 1;
            task.priority = 'P0';
        }

        try {
            // 取得該章節已有題目
            const existingInChapter = await dbOps.getQuestionsInBatchRange(task.book, task.chapter, task.chapter);

            if (existingInChapter.length > 200) {
                await this._stepVessel(task);
                return;
            }

            logger.info(`🌿 [Replenishment] Harvesting: [${task.version}] ${task.book} Ch.${task.chapter}`);

            // 先取得章節經文上下文，讓 AI 有根據出題
            let segments = [];
            try {
                segments = await ContentManager.getMultiSegmentContext(
                    task.book,
                    [],
                    task.version,
                    { chapter: task.chapter }
                );
            } catch (e) {
                logger.warn(`⚠️ [Replenishment] Could not fetch segments for ${task.book} Ch.${task.chapter}: ${e.message}`);
            }

            const batch = await QuestionCore.generateBatch({
                book: task.book,
                segments,
                count: 8,
                options: {
                    chapter: task.chapter,
                    version: task.version,
                },
                excludeList: existingInChapter.map(q => q.question),
            });

            // AI 忙碌時 askBrain 回傳 { yielded: true }，不推進章節
            if (batch?.yielded) {
                logger.warn(`🛡️ [Replenishment] Vessel ${task.vesselId} yielded — retaining position.`);
                return;
            }

            if (batch && batch.length > 0) {
                const filtered = [];
                for (const seed of batch) {
                    const verseStart = parseInt(seed.verse_start || seed.verseStart || 0, 10) || null;
                    const verseEnd   = parseInt(seed.verse_end   || seed.verseEnd   || verseStart, 10) || null;

                    const isDuplicate = await dbOps.checkSemanticDuplicate(seed.question);
                    if (!isDuplicate) {
                        filtered.push({
                            ...seed,
                            version:     task.version,
                            verse_start: verseStart,
                            verse_end:   verseEnd,
                            status:      'PASS',
                            source:      'AI_REPLENISH_BANK_V2',
                        });
                    }
                }

                if (filtered.length > 0) {
                    await dbOps.batchSaveQuestions(filtered);
                    this.stats.totalStored += filtered.length;
                    logger.info(`✅ [Replenishment] Stored ${filtered.length} seeds for ${task.book} Ch.${task.chapter}.`);
                }
            }

            task.rotateVersion();
            await this._stepVessel(task);

        } catch (e) {
            logger.error(`❌ [Replenishment] ${task.vesselId} error: ${e.message}`);
            await this._stepVessel(task);
        }
    }

    getStatus() {
        return {
            running: this.stats.startedAt !== null,
            isCruising: this.isCruising,
            startedAt: this.stats.startedAt,
            lastPulseAt: this.stats.lastPulseAt,
            pulseCount: this.stats.pulseCount,
            totalStoredThisSession: this.stats.totalStored,
            pendingGaps: this.scanner.gaps.length,
            lastGapScanAt: this.scanner.lastScan ? new Date(this.scanner.lastScan).toISOString() : null,
            vessels: Array.from(this.vessels.entries()).map(([id, v]) => ({
                id,
                book: v.book,
                chapter: v.chapter,
                version: v.version,
            })),
        };
    }

    async _stepVessel(task) {
        task.chapter++;
        try {
            await dbOps.saveSetting(`replenish_vessel_${task.vesselId}`, JSON.stringify({
                book:    task.book,
                chapter: task.chapter,
                version: task.version,
            }));
        } catch (e) {
            logger.warn(`⚠️ [Replenishment] Could not save vessel ${task.vesselId} position: ${e.message}`);
        }
    }
}

const replenishmentService = new QuestionReplenishmentService();
export { replenishmentService as QuestionReplenishmentService };
export default replenishmentService;
