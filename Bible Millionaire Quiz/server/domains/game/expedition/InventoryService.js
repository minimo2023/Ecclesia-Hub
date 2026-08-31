/**
 * InventoryService (夜間智慧艦隊海巡引擎)
 * 核心職責：
 * 1. 管理「巡邏艦隊 (Patrol Fleet)」多線航道進度。
 * 2. 實作 01:00-04:00 夜間作業時窗與節流保護。
 * 3. 驅動 QuizEngine 生成多譯本高品質題庫，確保全本聖經覆蓋。
 */
import { dbOps } from '../../../database/index.js';
import { QuizEngineInstance as quizEngine } from '../engine/QuizEngine.js';
// import { runPipeline } from '../engine/QuestionPipeline.js';
import bibleTranslator from '../../../utils/bibleTranslator.js';
import { logger } from '../../../utils/logger.js';
import { GlobalAIState } from '../../../infrastructure/ai/gemini-client.js';
import { runPipeline } from '../engine/QuestionPipeline.js';
import { questionInventoryService } from '../replenishment/QuestionInventoryService.js';
import { questionQualityService } from '../quality/QuestionQualityService.js';

const PATROL_FLEET_KEY = 'patrol_fleet';
const SEGMENT_SIZE = 10;
const NIGHT_SHIFT_START = 1; // 01:00
const NIGHT_SHIFT_END = 4;   // 04:00
const THROTTLE_MS = 15000;   // 提升為 15 秒節流，確保治理穩定

export class InventoryService {
    constructor() {
        this.bibleIndex = null;
        this.isWorking = false;
        this.stopNightShift = false;
        this.startedAt = null; // Track when service starts working
        this.lastPulseAt = null;
        this.pulseCount = 0;
        this.totalStoredThisSession = 0;
        this.pendingGaps = 0;
        this.usePaidKey = false; // 是否正在使用付費金鑰模式
    }

    /**
     * [Sovereign] 初始化聖經結構索引 (依正典順序排列)
     */
    async ensureIndex() {
        if (this.bibleIndex) return;
        const books = await dbOps.getAllBooks();

        const canonicalCodes = [
            'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nah', 'hab', 'zep', 'hag', 'zec', 'mal', 'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev'
        ];

        this.bibleIndex = books.sort((a, b) => {
            const codeA = (a.id).toLowerCase();
            const codeB = (b.id).toLowerCase();
            return canonicalCodes.indexOf(codeA) - canonicalCodes.indexOf(codeB);
        }).map(b => ({
            id: b.id,
            shortCode: b.id.toLowerCase(),
            nameEn: b.nameEn || b.name_en || b.id,
            nameZh: b.nameZh || b.name_zh || bibleTranslator.toChinese(b.nameEn || b.name_en || b.id),
            chapters: b.chapters
        }));
    }

    /**
     * 取得目前艦隊狀態 (或初始化預設艦隊)
     */
    async getFleet() {
        const defaultFleet = {
            'Alpha_OT': { book: 'Genesis', chapter: 1, verse_start: 1, translation: 'CNV_TRAD', patrol_count: 0, active: true },
            'Beta_NT':  { book: 'Matthew', chapter: 1, verse_start: 1, translation: 'CUV_TRAD', patrol_count: 0, active: true },
            'Gamma_Scout': { book: 'John', chapter: 1, verse_start: 1, translation: 'TCV2010_TRAD', patrol_count: 0, active: true }
        };
        return await dbOps.getSetting(PATROL_FLEET_KEY, defaultFleet);
    }

    /**
     * [NightShift] 啟動夜間艦隊巡航 (Obsolete - Moved to Unified Idle Engine)
     */
    // 已由 startIdleCruise 取代

    /**
     * 執行單一船艦的巡航步進
     */
    async executeVesselStep(vesselId, currentPointer) {
        try {
            await this.ensureIndex(); // 確保 bibleIndex 已初始化
            // 1. 以「能否組出一局 15 題」盤點，而非使用原始 PASS 總數。
            let startIdx = 0;
            let endIdx = this.bibleIndex.length - 1;
            if (vesselId === 'Alpha_OT') endIdx = 38;
            else if (vesselId === 'Beta_NT') startIdx = 39;

            const candidateBooksInfo = this.bibleIndex.slice(startIdx, endIdx + 1);
            const candidateBooks = candidateBooksInfo.map(info => bibleTranslator.toChinese(info.nameEn));
            const coverage = await questionInventoryService.getBookCoverage({
                books: candidateBooks,
                version: currentPointer.translation
            });
            this.pendingGaps = coverage.reduce((sum, item) => sum + item.shortageTotal, 0);

            const weakest = coverage[0];
            if (!weakest || weakest.shortageTotal === 0) {
                logger.info(`✅ [Inventory] ${currentPointer.translation} ${vesselId} scope is playable; no replenishment required.`);
                const nextPointer = await this.calculateNextPointer(currentPointer, vesselId);
                nextPointer.translation = this.rotateTranslation(currentPointer.translation);
                return { success: true, nextPointer, skipped: true, reason: 'inventory_ready' };
            }

            const weakestBookInfo = candidateBooksInfo.find(info =>
                bibleTranslator.toChinese(info.nameEn) === weakest.book
            );
            if (weakestBookInfo && weakestBookInfo.nameEn !== currentPointer.book) {
                logger.info(`🎯 [Inventory] Warping ${vesselId} to ${weakest.book} (${currentPointer.translation}), shortage=${weakest.shortageTotal}.`);
                currentPointer.book = weakestBookInfo.nameEn;
                currentPointer.chapter = 1;
                currentPointer.verse_start = 1;
            }

            // 2. 防重複檢查（包含同譯本尚待加工的 PASS 題，避免重複生成）
            const stdBook = bibleTranslator.toChinese(currentPointer.book);
            const existingQuestions = await dbOps.getQuestionsInBatchRange(
                stdBook,
                currentPointer.chapter,
                currentPointer.chapter,
                currentPointer.verse_start,
                currentPointer.verse_start + SEGMENT_SIZE,
                [],
                currentPointer.translation
            );

            const currentInventory = await questionInventoryService.getSnapshot({
                book: stdBook,
                version: currentPointer.translation
            });
            const priorityGap = currentInventory.priorityGap;
            const targetCategory = priorityGap?.category || 'verse_fact';
            const targetBand = priorityGap?.band || 'MEDIUM';
            const scoreRanges = { EASY: '0-30', MEDIUM: '31-65', HARD: '66-85', VERY_HARD: '86-100' };
            const categoryQuota = targetCategory === 'verse_fact'
                ? '5x verse_fact'
                : `3x ${targetCategory}, 2x verse_fact`;
            logger.info(`🎯 [Inventory] Replenishing ${stdBook} [${targetBand}/${targetCategory}], missing=${priorityGap?.missing || 0}.`);

            // 2. 驅動生成 (強行穿透譯本)
            const result = await quizEngine.generateBatch({
                count: 5,
                book: currentPointer.book,
                chapter: currentPointer.chapter,
                verseStart: currentPointer.verse_start,
                verseEnd: currentPointer.verse_start + SEGMENT_SIZE,
                exclusions: existingQuestions,
                mode: 'patrol',
                priority: GlobalAIState.isPaidPatrolActive() ? true : false,
                version: currentPointer.translation,
                options: {
                    categoryQuota,
                    target_category: targetCategory,
                    target_difficulty_band: targetBand,
                    target_score_range: scoreRanges[targetBand]
                }
            });

            if (result && result.length > 0) {
                // 4. 新題必須完成本體審核、難度評分、誘餌生成與聯合審核後才可入庫。
                const tagged = result.map(q => ({
                    ...q,
                    version: currentPointer.translation,
                    source: `patrol:${vesselId}`
                }));
                const processed = await runPipeline(tagged);
                const playableStored = processed.filter(q =>
                    q.status === 'PASS' &&
                    q.quality_state === 'VERIFIED' &&
                    q.final_difficulty_score != null &&
                    Array.isArray(q.distractors_pool) &&
                    q.distractors_pool.some(set => Array.isArray(set) && set.length >= 3)
                );
                if (playableStored.length > 0) await dbOps.batchSaveQuestions(playableStored);
                const publishedIds = new Set(playableStored.map(question => question.id));
                for (const candidate of processed) {
                    try {
                        await questionQualityService.recordProductionOutcome(candidate, {
                            published: publishedIds.has(candidate.id),
                            source: `patrol:${vesselId}`
                        });
                    } catch (jobError) {
                        logger.warn(`[Inventory] Could not record production outcome: ${jobError.message}`);
                    }
                }
                const held = processed.length - playableStored.length;
                this.totalStoredThisSession += playableStored.length;
                logger.info(`[Inventory] Stored ${playableStored.length} playable question(s); ${held} held for review/backfill.`);
            }

            // 4. 計算下一站且輪替譯本 (Rotation Logic)
            const nextPointer = await this.calculateNextPointer(currentPointer, vesselId);
            nextPointer.translation = this.rotateTranslation(currentPointer.translation);

            return { success: true, nextPointer };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 譯本自動輪替池 (和合 -> 新譯 -> 現代 -> 循環)
     */
    rotateTranslation(current) {
        const pool = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD'];
        const idx = pool.indexOf(current);
        return pool[(idx + 1) % pool.length];
    }

    /**
     * 計算下一個巡航指針 (正典順序導航，依據艦隊指定範圍)
     */
    async calculateNextPointer(current, vesselId) {
        const next = { ...current, last_patrol_at: new Date().toISOString() };
        const currentCode = bibleTranslator.toShortCode(current.book).toLowerCase();

        const currentIdx = this.bibleIndex.findIndex(b => b.shortCode === currentCode);
        if (currentIdx === -1) {
            return { ...current, book: 'Genesis', chapter: 1, patrol_count: current.patrol_count + 1 };
        }

        const bookInfo = this.bibleIndex[currentIdx];

        if (current.chapter < bookInfo.chapters) {
            next.chapter += 1;
            next.verse_start = 1;
        } else {
            // 決定艦隊的巡邏範圍
            let startIdx = 0; // Genesis
            let endIdx = this.bibleIndex.length - 1; // Revelation

            if (vesselId === 'Alpha_OT') {
                endIdx = 38; // Malachi
            } else if (vesselId === 'Beta_NT') {
                startIdx = 39; // Matthew
            }

            // [BugFix] 立即矯正：若目前的書卷根本不在艦隊負責範圍內，直接跳躍回起點！
            if (currentIdx < startIdx || currentIdx > endIdx) {
                const nextBook = this.bibleIndex[startIdx];
                next.book = nextBook.nameEn;
                next.chapter = 1;
                next.verse_start = 1;
                return next;
            }

            if (currentIdx < endIdx) {
                // 若仍在範圍內，前進到下一卷書
                // 但如果因為某些原因 (如剛啟動) currentIdx < startIdx，就直接跳到 startIdx
                const nextBookIdx = Math.max(currentIdx + 1, startIdx);
                const nextBook = this.bibleIndex[nextBookIdx];
                next.book = nextBook.nameEn;
                next.chapter = 1;
                next.verse_start = 1;
            } else {
                // 超出範圍，循環回該範圍的起點
                const nextBook = this.bibleIndex[startIdx];
                next.book = nextBook.nameEn;
                next.chapter = 1;
                next.verse_start = 1;
                next.patrol_count += 1;
            }
        }
        return next;
    }

    /**
     * [IdlePatrol] 啟動閒置自動巡航 (當活動量為 0 時執行)
     */
    async startIdleCruise() {
        if (this.isWorking) return false;

        try {
            this.isWorking = true;
            this.startedAt = this.startedAt || new Date().toISOString();
            this.lastPulseAt = new Date().toISOString();
            this.pulseCount += 1;
            
            await this.ensureIndex();

            logger.info('🛰️ [Inventory] Idle Cruise activated. Scanning for coverage gaps...');

            // 執行一輪完整的艦隊跳躍
            const fleet = await this.getFleet();
            const activeVesselIds = Object.keys(fleet).filter(id => fleet[id].active);

            // 執行前再次確認是否閒置 (多重保險)
            if (!(await this.checkIsIdle())) {
                logger.info('🛑 [Inventory] Activity detected before cruise start. Aborting.');
                return;
            }

            const results = [];
            for (const vid of activeVesselIds) {
                // 每艘船出發前都檢查一次閒置狀態
                if (!(await this.checkIsIdle())) {
                    results.push({ vid, skip: true });
                    continue;
                }

                // [GOVERNANCE] Check system health before each vessel step
                if (GlobalAIState.checkHealth() !== 'green' && !GlobalAIState.isPaidPatrolActive()) {
                    logger.warn(`🛡️ [Inventory] System busy (${GlobalAIState.status}). Vessel [${vid}] holding...`);
                    results.push({ vid, yielded: true });
                    continue;
                }
                if (GlobalAIState.isPaidPatrolActive()) {
                    logger.info(`💳 [Inventory] Paid Patrol Mode active — Vessel [${vid}] using PAID key.`);
                }

                logger.info(`🛰️ [Inventory] Idle Vessel [${vid}] embarking...`);
                const stepResult = await this.executeVesselStep(vid, fleet[vid]);

                if (stepResult.success) {
                    logger.info(`✅ [Inventory] Vessel [${vid}] step completed: ${fleet[vid].book} Ch.${fleet[vid].chapter}`);
                    // 串行執行時，每步完成後稍微呼吸一下，避免連續撞擊
                    await this.sleep(THROTTLE_MS);
                } else {
                    logger.warn(`⚠️ [Inventory] Vessel [${vid}] failed: ${stepResult.error}`);
                    // 若失敗且是因為 429，則中斷本次批次
                    if (stepResult.error?.includes('429')) break;
                }
                results.push({ vid, ...stepResult });
            }

            let updated = false;
            for (const res of results) {
                if (res.skip) continue;
                if (res.success) {
                    fleet[res.vid] = res.nextPointer;
                    updated = true;
                }
            }

            if (updated) {
                await dbOps.saveSetting(PATROL_FLEET_KEY, fleet, '閒置巡航進度更新');
                logger.info('✅ [Inventory] Idle Cruise batch successful.');
                return true; // 表示有進度更新，可以繼續
            }
            return false;

        } catch (error) {
            logger.error('❌ [Inventory] Idle Cruise failed:', error.message);
            return false;
        } finally {
            this.isWorking = false;
        }
    }

    /**
     * [V6.0] 檢查系統是否處於閒置狀態 (感應器優化)
     * 因為已經將遊戲 AI 與背景補題 AI 分開金鑰池，不再需要限制在無人時才補題。
     */
    async checkIsIdle() {
        return true;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 快遞模式 (Legacy 支援)
     */
    async executePatrol() {
        const fleet = await this.getFleet();
        const primary = Object.keys(fleet)[0];
        return await this.executeVesselStep(primary, fleet[primary]);
    }
}

export const inventoryService = new InventoryService();
