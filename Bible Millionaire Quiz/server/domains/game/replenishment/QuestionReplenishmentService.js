/**
 * [SOVEREIGN UNIT] Question Replenishment Service
 * v4.0 - Playable Inventory Strategy
 * Following "Logos Bank" Engineering Standards.
 *
 * 庫存定義：PASS + 品質可用 + 正確譯本 + 已有四選一所需的選項或誘餌。
 * 玩家實際遇到的缺貨訊號優先於固定巡航位置。
 */

import { dbOps } from '../../../database/index.js';
import QuestionCore from '../engine/QuestionCore.js';
import { ContentManager } from '../../content/bible/ContentManager.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { logger } from '../../../utils/logger.js';
import { GlobalAIState } from '../../../infrastructure/ai/gemini-client.js';
import { activeRooms } from '../../../socket/expedition/registry.js';
import { QuestionSourcePlanner } from './QuestionSourcePlanner.js';
import { questionInventoryService } from './QuestionInventoryService.js';
import {
    assessAutoApprovalAudits,
    questionQualityService
} from '../quality/QuestionQualityService.js';
import { assessDifficultyConsensus } from '../difficulty/QuestionDifficultyConsensus.js';
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { getBibleCorpusPolicy } from '../../content/bible/BibleCorpusPolicy.js';
import {
    questionBankGovernanceService,
    getPolicyTargetAtStage
} from '../governance/QuestionBankGovernanceService.js';

/**
 * [ScoringPriorityQueue] QuizEngine 發現 fallback 題時透過此佇列通知海巡艦隊優先補分
 * 靜態对象，全局共享（無需 pub/sub）
 */
export const scoringPriorityQueue = new Set();

const SUPPORTED_VERSIONS = ['CUV_TRAD', 'LCC_TRAD', 'CNV_TRAD', 'TCV2010_TRAD'];
const GLOBAL_PLAN_SETTING_KEY = 'replenishment_global_plan_v1';

const globalScopeKey = (version, book) => `${version}|${bibleTranslator.toChinese(book)}`;

function inferLegacyStageIndex(targetCount) {
    const target = Number(targetCount) || 15;
    if (target <= 15) return 0;
    if (target <= 30) return 1;
    if (target <= 50) return 2;
    if (target <= 100) return 3;
    return 3 + Math.ceil((target - 100) / 50);
}

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
        this.stats = { totalStored: 0, lastPulseAt: null, pulseCount: 0, startedAt: null };
        this.targetedRun = {
            state: 'idle',
            book: null,
            version: 'CUV_TRAD',
            maxBatches: 0,
            completedBatches: 0,
            stored: 0,
            rejected: 0,
            startedAt: null,
            completedAt: null,
            message: '尚未執行單卷補題',
            readiness: null,
            initialReadiness: null,
            progress: null,
            latestQuestions: [],
            lastUpdatedAt: null
        };
        this.targetedCancelRequested = false;
        this.globalPlan = {
            stageIndex: 0,
            targetCount: 15,
            exhaustedBooks: [],
            bookSignals: {},
            updatedAt: null
        };
    }

    async initialize() {
        logger.info('⚓ [Replenishment] Initializing Full-Spec Fleet...');

        const defaults = {
            Alpha: { book: '創世記', chapter: 1, version: 'CUV_TRAD' },
            Delta: { book: '詩篇', chapter: 1, version: 'LCC_TRAD' },
            Beta:  { book: '馬太福音', chapter: 1, version: 'CNV_TRAD' },
            Gamma: { book: '啟示錄', chapter: 1, version: 'TCV2010_TRAD' }
        };

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

        try {
            const savedPlan = await dbOps.getSetting(GLOBAL_PLAN_SETTING_KEY, null);
            const parsedPlan = typeof savedPlan === 'string' ? JSON.parse(savedPlan) : savedPlan;
            if (parsedPlan && Number(parsedPlan.targetCount) >= 15) {
                this.globalPlan = {
                    stageIndex: parsedPlan.stageIndex === undefined
                        ? inferLegacyStageIndex(parsedPlan.targetCount)
                        : Math.max(0, Number(parsedPlan.stageIndex) || 0),
                    targetCount: Number(parsedPlan.targetCount),
                    exhaustedBooks: Array.isArray(parsedPlan.exhaustedBooks)
                        ? parsedPlan.exhaustedBooks.map(key => String(key).includes('|') ? key : globalScopeKey('CUV_TRAD', key))
                        : [],
                    bookSignals: parsedPlan.bookSignals && typeof parsedPlan.bookSignals === 'object'
                        ? parsedPlan.bookSignals
                        : {},
                    updatedAt: parsedPlan.updatedAt || null
                };
            }
        } catch (error) {
            logger.warn(`[Replenishment] Could not restore global plan: ${error.message}`);
        }

        this.stats.startedAt = new Date().toISOString();
        logger.info('✅ [Replenishment] Fleet ready.');
    }

    _registerVessel(id, book, chapter, version) {
        this.vessels.set(id, new ReplenishmentTask(id, book, chapter, version));
    }

    async _saveGlobalPlan() {
        this.globalPlan.updatedAt = new Date().toISOString();
        const saved = await dbOps.saveSetting(
            GLOBAL_PLAN_SETTING_KEY,
            this.globalPlan,
            '全站完整經文庫分階段自動補題進度'
        );
        if (!saved) throw new Error('GLOBAL_REPLENISHMENT_PLAN_SAVE_FAILED');
    }

    async _recordGlobalOutcome(version, book, outcome) {
        if (!outcome || outcome.yielded || outcome.error || outcome.blocked) return;
        const key = globalScopeKey(version, book);
        const current = this.globalPlan.bookSignals[key] || {
            duplicateStreak: 0,
            noVerifiedStreak: 0
        };
        if (Number(outcome.stored || 0) > 0) {
            current.duplicateStreak = 0;
            current.noVerifiedStreak = 0;
        } else {
            const generated = Number(outcome.generated || 0);
            const unique = Number(outcome.unique || 0);
            current.duplicateStreak = generated > 0 && unique === 0
                ? current.duplicateStreak + 1
                : 0;
            if (unique > 0 || generated === 0) current.noVerifiedStreak += 1;
        }
        current.lastOutcomeAt = new Date().toISOString();
        this.globalPlan.bookSignals[key] = current;
        if (current.duplicateStreak >= 3 || current.noVerifiedStreak >= 10) {
            if (!this.globalPlan.exhaustedBooks.includes(key)) {
                this.globalPlan.exhaustedBooks.push(key);
                logger.warn(`[Replenishment] ${book} (${version}) marked saturated after repeated/no-verifiable output.`);
            }
        }
        await this._saveGlobalPlan();
    }

    async pulse() {
        if (this.isCruising) return;
        this.isCruising = true;

        try {
            this.stats.lastPulseAt = new Date().toISOString();
            this.stats.pulseCount++;

            // [防呆] 有玩家在線：讓路，AI 資源優先給遊戲
            if (activeRooms.size > 0) {
                logger.info(`⏸️  [Replenishment] ${activeRooms.size} active room(s) — pulse deferred.`);
                return;
            }

            const health = GlobalAIState.checkHealth();

            if (health === 'red') {
                logger.warn('🔴 [Replenishment] Red state — skipping pulse.');
                return;
            }

            const vesselEntries = Array.from(this.vessels.entries());
            const activeVessels = health === 'yellow' ? vesselEntries.slice(0, 1) : vesselEntries;
            const demandSignals = questionInventoryService.getPendingDemandSignals({
                limit: activeVessels.length
            });
            const exhaustedBooks = new Set(this.globalPlan.exhaustedBooks);
            const corpusStatuses = await questionBankGovernanceService.getCorpusStatus();
            const corpusByStorage = new Map(corpusStatuses.map(item => [item.storageVersion, item]));
            const policyByVersion = new Map(await Promise.all(SUPPORTED_VERSIONS.map(async version => {
                const canonicalVersion = corpusByStorage.get(version)?.id;
                const effective = await questionBankGovernanceService.getEffectivePolicy({ versionId: canonicalVersion });
                return [version, effective.policy];
            })));
            let coverage = [];
            let gapBooks = [];
            // 目前階段全部達標後才晉級；既有庫存可能讓目標一次跨過數階段。
            for (let promotionCheck = 0; promotionCheck < 20; promotionCheck += 1) {
                coverage = (await Promise.all(SUPPORTED_VERSIONS.map(async version => {
                    const policy = policyByVersion.get(version);
                    if (policy?.enabled === false || policy?.autoReplenishment === false) return [];
                    const targetCount = getPolicyTargetAtStage(policy, this.globalPlan.stageIndex);
                    const corpusReady = corpusByStorage.get(version)?.ready === true;
                    return (
                    (await questionInventoryService.getBookCoverage({
                        books: bibleTranslator.allBooks,
                        version,
                        targetCount
                    })).map(item => ({ ...item, version, targetCount, corpusReady })))
                }
                ))).flat();
                gapBooks = coverage.filter(item =>
                    item.shortageTotal > 0 && !exhaustedBooks.has(globalScopeKey(item.version, item.book))
                ).sort((a, b) =>
                    bibleTranslator.compareBooks(a.book, b.book)
                    || SUPPORTED_VERSIONS.indexOf(a.version) - SUPPORTED_VERSIONS.indexOf(b.version)
                );
                if (gapBooks.length > 0) break;
                this.globalPlan.stageIndex += 1;
                this.globalPlan.targetCount = getPolicyTargetAtStage(
                    policyByVersion.get('CUV_TRAD'),
                    this.globalPlan.stageIndex
                );
                this.globalPlan.bookSignals = {};
                await this._saveGlobalPlan();
                logger.info(`[Replenishment] Global inventory target advanced to ${this.globalPlan.targetCount}.`);
            }
            const assignedScopes = new Set();
            const assignments = [];

            // 玩家實際遇到的缺貨最優先，其餘固定依創世記到啟示錄巡航。
            for (const demand of demandSignals) {
                const book = bibleTranslator.toChinese(demand.book);
                const version = SUPPORTED_VERSIONS.includes(demand.version) ? demand.version : 'CUV_TRAD';
                const key = globalScopeKey(version, book);
                const policy = policyByVersion.get(version);
                if (assignedScopes.has(key) || policy?.enabled === false || policy?.autoReplenishment === false || !corpusByStorage.get(version)?.ready) continue;
                assignments.push({
                    book,
                    chapter: demand.startChapter,
                    version,
                    priority: 'P0_GAME_DEMAND',
                    missing: demand.missing,
                    targetCount: getPolicyTargetAtStage(policy, this.globalPlan.stageIndex)
                });
                assignedScopes.add(key);
            }
            for (const gap of gapBooks) {
                if (assignments.length >= activeVessels.length) break;
                const key = globalScopeKey(gap.version, gap.book);
                if (assignedScopes.has(key) || !gap.corpusReady) continue;
                const structure = await ContentManager.getBookStructure(gap.book);
                const chapterNumbers = (structure?.chapters || []).map(item => Number(item.chapter)).filter(Number.isInteger);
                const rankedChapters = chapterNumbers.sort((a, b) =>
                    Number(gap.byChapter?.[a] || 0) - Number(gap.byChapter?.[b] || 0) || a - b
                );
                const retryOffset = Number(this.globalPlan.bookSignals[key]?.noVerifiedStreak || 0);
                const chapter = rankedChapters[retryOffset % Math.max(1, rankedChapters.length)] || 1;
                assignments.push({
                    book: gap.book,
                    chapter,
                    version: gap.version,
                    priority: 'P1_GLOBAL_GAP',
                    missing: gap.shortageTotal,
                    targetCount: gap.targetCount
                });
                assignedScopes.add(key);
            }

            const assignedVessels = activeVessels.slice(0, assignments.length);
            assignedVessels.forEach(([, task], index) => {
                const assignment = assignments[index];
                task.book = assignment.book;
                task.chapter = assignment.chapter;
                task.version = assignment.version;
                task.priority = assignment.priority;
                task.targetCount = assignment.targetCount;
                logger.info(`🚨 [Replenishment] ${task.vesselId} assigned ${assignment.priority}: ${task.book} Ch.${task.chapter} (${task.version}), missing=${assignment.missing}.`);
            });

            if (health === 'yellow') {
                logger.warn('🟡 [Replenishment] Yellow state — running 1 vessel only.');
            }

            // Phase 12: 升級為依賴 Planner 的精準打擊
            for (const [, task] of assignedVessels) {
                // 1. 向 Planner 請示任務目標
                const plannerTask = await QuestionSourcePlanner.planNextBatch(
                    task.book,
                    task.chapter,
                    task.version,
                    task.targetCount || this.globalPlan.targetCount
                );
                // 若模型已連續無法命中最稀少題型，先保留難度目標、放寬題型，
                // 避免可出題的書卷被單一 category 永久卡住。
                if (Number(this.globalPlan.bookSignals[globalScopeKey(task.version, task.book)]?.noVerifiedStreak || 0) > 0) {
                    plannerTask.target_category = null;
                }
                logger.info(`🎯 [Replenishment Planner] ${task.vesselId} -> ${task.book} Ch.${task.chapter} [${plannerTask.target_category} | ${plannerTask.target_difficulty_band}]`);

                if (!plannerTask.needs_replenishment) {
                    logger.info(`✅ [Replenishment] ${task.book} (${task.version}) playable inventory ready (${plannerTask.inventory_total}).`);
                    questionInventoryService.resolveDemand({ book: task.book, version: task.version });
                    continue;
                }
                
                // 2. 執行出題任務
                const outcome = await this._harvestChapter(task, plannerTask, {
                    freeOnly: true,
                    managedCorpusValidation: true
                });
                await this._recordGlobalOutcome(task.version, task.book, outcome);
            }

            // 全站缺題期間把免費額度保留給可開局庫存；補齊後才整理舊題誘餌。
            if (gapBooks.length === 0) {
                const backfillCount = health === 'yellow' ? 1 : 3;
                await this._runDistractorBackfill(backfillCount);
            }

            // [DifficultyScoring] 純同步計算，無 AI，補完沒有分數的舊 PASS 題
            // 優先處理 QuizEngine 發現的高 fallback 書卷
            const scoringCount = health === 'yellow' ? 3 : 5;
            await this._runDifficultyScoring(scoringCount);

            // V4 既有題巡航預設關閉；開啟後仍以小批次影子檢查，避免搶佔遊戲資源。
            if (String(process.env.QUESTION_QUALITY_PATROL_ENABLED || '').toLowerCase() === 'true') {
                const patrolCount = health === 'yellow' ? 1 : 3;
                await questionQualityService.enqueueLegacyAuditJobs(Math.max(10, patrolCount));
                const patrolResults = await questionQualityService.runPatrolBatch(patrolCount);
                logger.info(`🛡️ [QualityPatrol V4] Completed ${patrolResults.length} audit job(s).`);
            }

        } finally {
            this.isCruising = false;
        }
    }

    /**
     * 核心採集邏輯（共用）
     * 取得章節內容 → 接收 Planner 參數 → AI 生成 → 語義排重 → 寫入 DB → 推進章節
     * @param {ReplenishmentTask} task
     * @param {Object} plannerTask
     */
    async _harvestChapter(task, plannerTask, {
        freeOnly = false,
        managedCorpusValidation = false,
        onProgress = null
    } = {}) {
        try {
            const corpusPolicy = await getBibleCorpusPolicy(task.version);
            const corpusStatus = (await questionBankGovernanceService.getCorpusStatus())
                .find(item => item.id === corpusPolicy.canonicalVersion);
            if (!corpusStatus?.ready) {
                const detail = corpusStatus?.reason || '經文庫尚未通過完整性檢查';
                logger.info(`🔒 [Replenishment] ${task.version} generation blocked: ${detail}.`);
                return {
                    stored: 0,
                    rejected: 0,
                    yielded: false,
                    blocked: true,
                    reason: 'CORPUS_INTEGRITY_NOT_VERIFIED',
                    detail
                };
            }
            const managedCorpusAllowed = managedCorpusValidation && corpusPolicy.evidenceEligible;
            if (!corpusPolicy.newQuestionEligible && !managedCorpusAllowed) {
                logger.info(`🔒 [Replenishment] ${task.version} generation blocked: ${corpusPolicy.reason}.`);
                return {
                    stored: 0,
                    rejected: 0,
                    yielded: false,
                    blocked: true,
                    reason: corpusPolicy.reason
                };
            }
            // 若本章已有 200+ 題，直接跳過（避免過度重複）
            const existingInChapter = await dbOps.getQuestionsInBatchRange(
                task.book,
                task.chapter,
                task.chapter,
                null,
                null,
                [],
                task.version
            );
            if (existingInChapter.length > 200) {
                task.rotateVersion();
                logger.info(`🌊 [Replenishment] ${task.vesselId} advanced to ${task.book} Ch.${task.chapter} [${task.version}]`);
            }

            logger.info(`🌿 [Replenishment] Harvesting: [${task.version}] ${task.book} Ch.${task.chapter}`);

            // 取得章節經文上下文，讓 AI 有根據出題（品質保障）
            let segments = [];
            try {
                segments = await ContentManager.getMultiSegmentContext(
                    task.book,
                    [{ chapter: task.chapter, verseRange: { start: 1, end: 200 } }],
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
                    target_category: plannerTask.target_category,
                    target_difficulty_band: plannerTask.target_difficulty_band,
                    target_score_range: plannerTask.target_score_range,
                    preferred_verse_window: plannerTask.preferred_verse_window,
                    avoid_verse_windows: plannerTask.avoid_verse_windows
                },
                excludeList: existingInChapter.map(q => q.question),
            }, managedCorpusAllowed ? {
                // The registry stays closed globally. This exception is scoped to the
                // admin-only, free-key, bounded small-batch validation workflow.
                corpusGuard: async () => corpusPolicy
            } : {});
            if (typeof onProgress === 'function' && Array.isArray(batch)) {
                onProgress({ stage: 'generated', current: 0, total: batch.length });
            }

            // AI 忙碌時 askBrain 回傳 { yielded: true }，不推進章節
            if (batch?.yielded) {
                logger.warn(`🛡️ [Replenishment] Vessel ${task.vesselId} yielded — retaining position.`);
                return { stored: 0, rejected: 0, yielded: true };
            }

            let stored = 0;
            let rejected = 0;
            let published = [];
            const generated = Array.isArray(batch) ? batch.length : 0;
            let unique = 0;
            if (batch && batch.length > 0) {
                const scopedBatch = batch.map(seed => ({
                    ...seed,
                    book: task.book,
                    chapter: seed.chapter || task.chapter,
                    version: task.version
                }));
                const semanticallyClassified = await LogosEngine.auditor.livePrune(
                    scopedBatch,
                    existingInChapter,
                    existingInChapter.map(question => question.question)
                );
                unique = semanticallyClassified.length;
                const preFiltered = [];
                for (const seed of semanticallyClassified) {
                    const verseStart = parseInt(seed.verse_start || seed.verseStart || 0, 10) || null;
                    const verseEnd   = parseInt(seed.verse_end   || seed.verseEnd   || verseStart, 10) || null;

                    preFiltered.push({
                        ...seed,
                        version:     task.version,
                        verse_start: verseStart,
                        verse_end:   verseEnd,
                        source:      'AI_REPLENISH_BANK_V4'
                    });
                }

                if (preFiltered.length > 0) {
                    // [SOVEREIGN V5.0] 送入 QuestionPipeline 進行嚴格審核與算分 (Phase 3 & Phase 4)
                    const { runPipeline } = await import('../engine/QuestionPipeline.js');
                    if (typeof onProgress === 'function') {
                        onProgress({ stage: 'pruned', current: 0, total: preFiltered.length });
                    }
                    const processedBatch = await runPipeline(preFiltered, {
                        freeOnly,
                        managedCorpusValidation: managedCorpusAllowed,
                        onProgress
                    });
                    
                    // 正式題庫只接受完成 V4.1 稽核的題目；失敗結果保留在工作紀錄與日誌。
                    const passBatch = processedBatch.filter(q =>
                        q.status === 'PASS' && q.quality_state === 'VERIFIED'
                    );
                    const frozenBatch = processedBatch.filter(q => q.status !== 'PASS');
                    if (passBatch.length > 0) {
                        await dbOps.batchSaveQuestions(passBatch);
                    }
                    const publishedIds = new Set(passBatch.map(question => question.id));
                    for (const candidate of processedBatch) {
                        try {
                            await questionQualityService.recordProductionOutcome(candidate, {
                                published: publishedIds.has(candidate.id),
                                source: `replenishment:${task.vesselId}`
                            });
                        } catch (jobError) {
                            logger.warn(`[Replenishment] Could not record production outcome: ${jobError.message}`);
                        }
                    }

                    // [SOVEREIGN V6.0] 觸發漸進換血機制 (Phase 6) 僅對 PASS 題作用
                    this.stats.totalStored += passBatch.length;
                    stored = passBatch.length;
                    rejected = frozenBatch.length;
                    published = passBatch.map(question => ({
                        id: question.id,
                        question: question.question,
                        difficulty: question.difficulty_band || question.difficulty,
                        chapter: question.chapter
                    }));
                    logger.info(`✅ [Replenishment] Stored ${passBatch.length} V4 verified seeds (Rejected before storage: ${frozenBatch.length}) for ${task.book} Ch.${task.chapter}.`);
                }
            }

            // [Phase 12] 無論如何推進艦艇位置，因為 Planner 是動態計算的
            await this._stepVessel(task);
            return {
                stored,
                rejected,
                generated,
                unique,
                yielded: false,
                published
            };

        } catch (e) {
            logger.error(`❌ [Replenishment] ${task.vesselId} error: ${e.message}`);
            await this._stepVessel(task); // 出錯仍推進，避免卡死
            return { stored: 0, rejected: 0, yielded: false, error: e.message };
        }
    }

    async _getBookReadiness(book, version = 'CUV_TRAD') {
        const { QuizEngineInstance: quizEngine } = await import('../engine/QuizEngine.js');
        const result = await quizEngine.getHand(
            [{ book, startChapter: 1, endChapter: 999 }],
            'zh-TW',
            15,
            new Set(),
            { version, gameMode: 'classic' }
        );
        return {
            ready: result.questions.length === 15 && Object.keys(result.shortages || {}).length === 0,
            count: result.questions.length,
            targets: result.targets,
            inventory: result.inventory,
            shortages: result.shortages,
            substitutions: result.substitutions
        };
    }

    getTargetedStatus() {
        return { ...this.targetedRun };
    }

    cancelTargetedRun() {
        if (this.targetedRun.state !== 'running') return false;
        this.targetedCancelRequested = true;
        this.targetedRun.message = '已要求停止；目前批次審核完成後即停止';
        return true;
    }

    async startTargetedRun({ book, version = 'CUV_TRAD', maxBatches = 12 }) {
        if (this.targetedRun.state === 'running') {
            const error = new Error('TARGETED_REPLENISHMENT_BUSY');
            error.code = 'TARGETED_REPLENISHMENT_BUSY';
            throw error;
        }
        if (activeRooms.size > 0) {
            const error = new Error('ACTIVE_GAME_ROOMS');
            error.code = 'ACTIVE_GAME_ROOMS';
            throw error;
        }

        const corpusPolicy = await getBibleCorpusPolicy(version);
        const corpusStatus = (await questionBankGovernanceService.getCorpusStatus())
            .find(item => item.id === corpusPolicy.canonicalVersion);
        if (!corpusPolicy.newQuestionEligible || !corpusStatus?.ready) {
            const error = new Error(corpusStatus?.reason || corpusPolicy.reason || '經文庫尚未就緒');
            error.code = 'CORPUS_NOT_READY';
            error.corpusPolicy = corpusPolicy;
            error.corpusStatus = corpusStatus || null;
            throw error;
        }

        const canonicalBook = bibleTranslator.toChinese(book);
        const effectivePolicy = await questionBankGovernanceService.getEffectivePolicy({
            versionId: corpusPolicy.canonicalVersion,
            book: canonicalBook
        });
        // 單次點擊持續補到可開局；12 批是防止品質連續失敗造成無限循環的安全上限。
        const policyBatchLimit = Math.min(12, Math.max(1, Number(effectivePolicy.policy.batchLimit) || 12));
        const boundedBatches = Math.min(policyBatchLimit, Math.max(1, Number.parseInt(maxBatches, 10) || policyBatchLimit));
        this.targetedCancelRequested = false;
        this.targetedRun = {
            state: 'running',
            book: canonicalBook,
            version,
            maxBatches: boundedBatches,
            completedBatches: 0,
            stored: 0,
            rejected: 0,
            startedAt: new Date().toISOString(),
            completedAt: null,
            message: '正在檢查目前題庫',
            readiness: null,
            initialReadiness: null,
            progress: { stage: 'inventory', current: 0, total: 0 },
            latestQuestions: [],
            lastUpdatedAt: new Date().toISOString(),
            freeOnly: true
        };

        this._runTargetedBatches().catch(error => {
            logger.error(`[TargetedReplenishment] Unhandled error: ${error.message}`);
            this.targetedRun.state = 'failed';
            this.targetedRun.message = error.message;
            this.targetedRun.completedAt = new Date().toISOString();
        });
        return this.getTargetedStatus();
    }

    async _runTargetedBatches() {
        const run = this.targetedRun;
        try {
            let readiness = await this._getBookReadiness(run.book, run.version);
            run.readiness = readiness;
            run.initialReadiness = readiness;
            run.lastUpdatedAt = new Date().toISOString();
            if (readiness.ready) {
                run.state = 'completed';
                run.message = '此書卷已可組成完整 15 題，未呼叫 AI';
                return;
            }

            const structure = await ContentManager.getBookStructure(run.book);
            const chapterCount = Math.max(1, structure?.chapters?.length || 1);

            for (let batchIndex = 0; batchIndex < run.maxBatches; batchIndex += 1) {
                if (this.targetedCancelRequested) {
                    run.state = 'cancelled';
                    run.message = '已停止單卷補題';
                    break;
                }
                if (activeRooms.size > 0) {
                    run.state = 'paused';
                    run.message = '偵測到進行中的遊戲，已停止後續批次';
                    break;
                }
                if (GlobalAIState.checkHealth() === 'red') {
                    run.state = 'paused';
                    run.message = '免費 AI 額度目前不可用，已停止後續批次';
                    break;
                }

                const chapter = (batchIndex % chapterCount) + 1;
                const task = new ReplenishmentTask('ManualTarget', run.book, chapter, run.version);
                const chapterPlan = await QuestionSourcePlanner.planNextBatch(run.book, chapter, run.version);
                const bookInventory = await questionInventoryService.getSnapshot({
                    book: run.book,
                    version: run.version,
                    targetCount: 15
                });
                const priorityGap = bookInventory.priorityGap || {};
                const plannerTask = {
                    ...chapterPlan,
                    needs_replenishment: true,
                    target_category: priorityGap.category || chapterPlan.target_category,
                    target_difficulty_band: priorityGap.band || chapterPlan.target_difficulty_band,
                    target_score_range: priorityGap.band === 'EASY' ? '0-30'
                        : priorityGap.band === 'MEDIUM' ? '31-65'
                        : priorityGap.band === 'HARD' ? '66-85'
                        : priorityGap.band === 'VERY_HARD' ? '86-100'
                        : chapterPlan.target_score_range
                };

                run.message = `正在處理第 ${batchIndex + 1}/${run.maxBatches} 批（${run.book} 第 ${chapter} 章）`;
                run.progress = { stage: 'generation', current: 0, total: 8, batch: batchIndex + 1 };
                run.lastUpdatedAt = new Date().toISOString();
                const outcome = await this._harvestChapter(task, plannerTask, {
                    freeOnly: true,
                    managedCorpusValidation: true,
                    onProgress: progress => {
                        run.progress = { ...progress, batch: batchIndex + 1 };
                        run.lastUpdatedAt = new Date().toISOString();
                        if (progress.stage === 'generated') {
                            run.message = `第 ${batchIndex + 1} 批已生成 ${progress.total} 題候選，正在去重與驗證`;
                        } else if (progress.stage === 'pruned') {
                            run.message = `第 ${batchIndex + 1} 批保留 ${progress.total} 題候選，開始品質審核`;
                        } else if (progress.stage === 'audit') {
                            run.message = `第 ${batchIndex + 1} 批正在審核第 ${progress.current}/${progress.total} 題`;
                        } else if (progress.stage === 'audited') {
                            run.message = `第 ${batchIndex + 1} 批已審核 ${progress.current}/${progress.total} 題（最新：${progress.status}）`;
                        }
                    }
                });
                if (outcome?.blocked) {
                    run.state = 'blocked';
                    run.message = `此譯本目前不符合受控補題條件（${outcome.reason}），未呼叫 AI`;
                    run.progress = { stage: 'blocked', current: 0, total: 0, batch: batchIndex + 1 };
                    run.lastUpdatedAt = new Date().toISOString();
                    break;
                }
                run.completedBatches += 1;
                run.stored += outcome?.stored || 0;
                run.rejected += outcome?.rejected || 0;
                run.latestQuestions = [
                    ...(outcome?.published || []),
                    ...(run.latestQuestions || [])
                ].slice(0, 12);
                run.progress = {
                    stage: 'batch_complete',
                    current: outcome?.stored || 0,
                    total: (outcome?.stored || 0) + (outcome?.rejected || 0),
                    batch: batchIndex + 1
                };
                run.lastUpdatedAt = new Date().toISOString();
                if (outcome?.error) run.message = `本批次失敗：${outcome.error}`;

                readiness = await this._getBookReadiness(run.book, run.version);
                run.readiness = readiness;
                if (readiness.ready) {
                    run.state = 'completed';
                    run.message = `已可開局，共新增 ${run.stored} 題通過審核的題目`;
                    break;
                }
            }

            if (run.state === 'running') {
                run.state = 'paused';
                run.message = `已達安全上限 ${run.completedBatches} 批；目前仍未達可開局標準`;
            }
        } catch (error) {
            run.state = 'failed';
            run.message = error.message;
        } finally {
            run.completedAt = new Date().toISOString();
            this.targetedCancelRequested = false;
        }
    }


    /**
     * [DistractorBackfill] 為舊 PASS 題補齊 distractors_pool
     * 每次 pulse 只處理少量（limit），避免搶佔 AI 資源。
     * 在無玩家在線、AI 狀態非 red 時才執行。
     */
    async _runDistractorBackfill(limit = 3) {
        try {
            const { pipelineForGame } = await import('../engine/QuestionPipeline.js');

            // 撈取 PASS 但無 distractors_pool 的舊題（隨機取樣，避免每次補同一批）
            const candidates = await dbOps.getPassQuestionsWithoutDistractors(limit);

            if (!candidates || candidates.length === 0) {
                logger.info('✅ [DistractorBackfill] All PASS questions have distractors_pool.');
                return;
            }

            logger.info(`🔄 [DistractorBackfill] Filling ${candidates.length} legacy question(s)...`);
            let saved = 0;

            for (const q of candidates) {
                try {
                    const result = await pipelineForGame(
                        { ...q, options: null, correctIndex: null },
                        []
                    );

                    if (result?.distractors_pool?.length >= 1) {
                        const revision = await questionQualityService.createRevision(q.id, {
                            options: result.options,
                            correct_index: result.correctIndex,
                            distractors_pool: result.distractors_pool
                        }, { source: 'DISTRACTOR_BACKFILL_V4', createdBy: 'system' });
                        const audits = [
                            await questionQualityService.auditRevision(revision.id),
                            await questionQualityService.auditRevision(revision.id)
                        ];
                        const approvalGate = assessAutoApprovalAudits(audits, {
                            requiredPasses: 2,
                            version: q.version
                        });
                        const difficultyConsensus = assessDifficultyConsensus(audits, { requiredScores: 2 });
                        if (!approvalGate.ok || !difficultyConsensus.ok) {
                            await questionQualityService.rejectRevision(
                                revision.id,
                                'system:distractor-backfill',
                                `AUTO_BACKFILL_GATE_FAILED:${approvalGate.reason}:${difficultyConsensus.reason}`
                            );
                            logger.warn(`  ⚠️  [Backfill] "${q.answer}" failed V4.1 publish gate`);
                            continue;
                        }
                        await questionQualityService.approveRevision(
                            revision.id,
                            'system:distractor-backfill',
                            { difficultyConsensus }
                        );

                        saved++;
                        logger.info(`  ✅ [Backfill] "${q.answer}" (${q.book} ${q.chapter}) → ${result.distractors_pool.length} sets`);
                    } else {
                        logger.warn(`  ⚠️  [Backfill] "${q.answer}" — insufficient distractor sets, will retry next pulse`);
                    }
                } catch (e) {
                    logger.warn(`  ❌ [Backfill] "${q.answer}" error: ${e.message}`);
                }
                // 每題間隔 400ms 避免 rate limit
                await new Promise(r => setTimeout(r, 400));
            }

            logger.info(`✅ [DistractorBackfill] Done: ${saved}/${candidates.length} saved this pulse`);

        } catch (e) {
            // backfill 失敗不影響主流程
            logger.warn(`⚠️  [DistractorBackfill] Error: ${e.message}`);
        }
    }



    /**
     * [DifficultyScoring] 為無難度分數的舊 PASS 題補算 difficulty score
     * 純同步計算（不呼叫 AI），可在 yellow 狀態下安全執行。
     * @param {number} limit - 每次 pulse 最多處理幾題
     */
    async _runDifficultyScoring(limit = 5) {
        try {
            // 撈取 PASS 但 final_difficulty_score 為 null 的舊題
            const unscored = await dbOps.getPassQuestionsWithoutScore(limit);

            if (!unscored || unscored.length === 0) {
                logger.info('✅ [DifficultyScoring] All PASS questions have scores.');
                return;
            }

            // V4.1 不允許巡航直接改寫正式難度；先停止供題，再交給完整雙重稽核。
            for (const q of unscored) {
                await dbOps.gamesDb.run(`
                    UPDATE questions
                    SET quality_state = 'NEEDS_REPAIR', verified = FALSE,
                        audit_reason = 'V4_1_DIFFICULTY_RESULT_MISSING', updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND final_difficulty_score IS NULL
                `, [q.id]);
            }
            await questionQualityService.enqueueAuditJobs({
                limit: unscored.length,
                states: ['NEEDS_REPAIR']
            });
            logger.info(`📊 [DifficultyScoring] Queued ${unscored.length} question(s) for governed V4.1 re-audit.`);

        } catch (e) {
            // 計分失敗不影響主流程
            logger.warn(`⚠️ [DifficultyScoring] Error: ${e.message}`);
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
            pendingGameDemands: questionInventoryService.getPendingDemandSignals(),
            globalPlan: { ...this.globalPlan },
            targetedRun: this.getTargetedStatus(),
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
            const { ContentManager } = await import('../../content/bible/ContentManager.js');
            const struct = await ContentManager.getBookStructure(task.book);
            const maxChapter = struct?.chapters?.length || 0;
            
            if (maxChapter > 0 && task.chapter > maxChapter) {
                logger.info(`🔄 [Replenishment] ${task.vesselId} finished ${task.book} Ch.${maxChapter}, wrapping back to Ch.1`);
                task.chapter = 1;
            }
        } catch (e) {
            logger.warn(`⚠️ [Replenishment] Could not fetch struct for ${task.book}: ${e.message}`);
        }

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
