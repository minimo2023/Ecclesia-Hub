/**
 * [SOVEREIGN UNIT] Quiz Engine Service
 * v3.9 - Game Session & Blueprint Orchestrator
 * Pursuing "Stable and Accurate" game mechanics.
 */
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { dbOps } from '../../../database/index.js';
import { ContentManager } from '../../content/bible/ContentManager.js';
import { requireNewQuestionCorpus } from '../../content/bible/BibleCorpusPolicy.js';
import { questionInventoryService } from '../replenishment/QuestionInventoryService.js';
import {
    getDifficultyBand,
    getDifficultyTargets,
    getStoredDifficultyScore,
    getStoredDifficultySource,
    scoreQuestionDifficulty
} from '../difficulty/DifficultyScorer.js';
import {
    getQuestionQualityMode,
    isVerifiedQuestion
} from '../quality/QuestionQualityPolicy.js';
import { assembleVerifiedQuestion } from '../quality/QuestionOptionAssembler.js';
import { logger } from '../../../utils/logger.js';
import crypto from 'crypto';
import { buildSemanticGroupKey } from '../quality/QuestionSemanticDuplicate.js';

function getSemanticGroupKey(question) {
    return question?.semantic_group_key || buildSemanticGroupKey(question || {});
}

const MIXED_VERSION = 'MIXED_TRAD';

function resolveGameVersion(version = MIXED_VERSION) {
    const normalized = String(version || '').trim().toUpperCase();
    if (['MIXED', 'MIXED_TRAD', 'ALL'].includes(normalized)) return MIXED_VERSION;
    try {
        return ContentManager._resolveVersion(version);
    } catch (_) {
        return version || 'CUV_TRAD';
    }
}

function getBalancedHandTargets(count) {
    const high = Math.max(0, Math.round(count * 0.2));
    const easy = Math.max(0, Math.round(count / 3));
    return { EASY: easy, MEDIUM: Math.max(0, count - easy - high), HIGH: high };
}

export function selectBalancedDifficultyHand(
    pool,
    count = 15,
    shuffle = (items) => items.sort(() => Math.random() - 0.5),
    random = Math.random
) {
    const targets = getBalancedHandTargets(count);
    const usedQuestions = new Set();
    const usedSemanticGroups = new Set();
    const selected = [];
    const shortages = {};
    const substitutions = {};

    const takeFromBand = (band, target) => {
        if (target <= 0) return [];

        const byBook = new Map();
        for (const question of pool) {
            if (getDifficultyBand(question._jitScore ?? getStoredDifficultyScore(question)) !== band) continue;
            const semanticGroup = getSemanticGroupKey(question);
            if (usedQuestions.has(question.question) || usedSemanticGroups.has(semanticGroup)) continue;
            const book = question.book || '';
            if (!byBook.has(book)) byBook.set(book, []);
            byBook.get(book).push(question);
        }
        for (const [book, questions] of byBook) byBook.set(book, shuffle([...questions]));
        const books = shuffle([...byBook.keys()]);
        let cursor = 0;
        let taken = 0;
        while (taken < target && books.length > 0) {
            const bookIndex = cursor % books.length;
            const book = books[bookIndex];
            const candidates = byBook.get(book);
            let picked = null;
            while (candidates.length > 0 && !picked) {
                const candidate = candidates.shift();
                const semanticGroup = getSemanticGroupKey(candidate);
                if (usedQuestions.has(candidate.question) || usedSemanticGroups.has(semanticGroup)) continue;
                picked = candidate;
            }
            if (!picked) {
                books.splice(bookIndex, 1);
                continue;
            }
            selected.push(picked);
            usedQuestions.add(picked.question);
            usedSemanticGroups.add(getSemanticGroupKey(picked));
            taken += 1;
            cursor = books.length ? (bookIndex + 1) % books.length : 0;
        }
        return selected.slice(selected.length - taken);
    };

    const missingTargets = {
        EASY: targets.EASY - takeFromBand('EASY', targets.EASY).length,
        MEDIUM: targets.MEDIUM - takeFromBand('MEDIUM', targets.MEDIUM).length,
        HIGH: 0
    };
    const highDifficultyMix = { HARD: 0, VERY_HARD: 0 };
    for (let slot = 0; slot < targets.HIGH; slot += 1) {
        const preferredBand = random() < 0.7 ? 'HARD' : 'VERY_HARD';
        const alternateBand = preferredBand === 'HARD' ? 'VERY_HARD' : 'HARD';
        const pickedBand = takeFromBand(preferredBand, 1).length > 0
            ? preferredBand
            : (takeFromBand(alternateBand, 1).length > 0 ? alternateBand : null);
        if (pickedBand) highDifficultyMix[pickedBand] += 1;
        else missingTargets.HIGH += 1;
    }

    const fallbackOrder = {
        EASY: ['MEDIUM', 'HARD', 'VERY_HARD'],
        MEDIUM: ['EASY', 'HARD', 'VERY_HARD'],
        HIGH: ['MEDIUM', 'EASY']
    };
    for (const [targetBand, initialMissing] of Object.entries(missingTargets)) {
        if (initialMissing <= 0) continue;
        let missing = initialMissing;
        for (const fallbackBand of fallbackOrder[targetBand]) {
            if (missing <= 0) break;
            const borrowed = takeFromBand(fallbackBand, missing).length;
            if (borrowed > 0) {
                substitutions[targetBand] ||= { required: initialMissing, filled: 0, bands: {} };
                substitutions[targetBand].filled += borrowed;
                substitutions[targetBand].bands[fallbackBand] = borrowed;
                missing -= borrowed;
            }
        }

        if (missing > 0) {
            shortages[targetBand] = {
                required: initialMissing,
                available: initialMissing - missing,
                missing
            };
        }
    }

    return {
        questions: selected.slice(0, count),
        targets,
        shortages,
        substitutions,
        highDifficultyMix
    };
}

// 保留既有匯出名稱，避免其他模組在同次部署中失去相容性。
export const selectStrictDifficultyHand = selectBalancedDifficultyHand;

/**
 * 遊戲模式枚舉
 */
const GAME_MODES = {
    TRIVIA: 'trivia',
    EXPEDITION: 'expedition'
};

/**
 * 模式配置 (MODE_CONFIGS) - 回填路由層依賴
 */
const MODE_CONFIGS = {
    trivia: {
        initialPoolSize: 10,
        batchSize: 5,
        aiThreshold: 3
    },
    expedition: {
        initialPoolSize: 20,
        batchSize: 8,
        aiThreshold: 5
    }
};

/**
 * 難度階梯映射 (Difficulty Ladder) - V1.0 (Fallback)
 * L1-5: 填空為主 | L6-10: 人物地理為主 | L11-15: 百科事實為主
 */
const DIFFICULTY_LADDER = {
    easy: { levels: [1, 2, 3, 4, 5], categories: ['verse_fill', 'verse_fact'], quota: "2x verse_fill, 3x verse_fact" },
    medium: { levels: [6, 7, 8, 9, 10], categories: ['person', 'geography'], quota: "3x person, 2x geography" },
    hard: { levels: [11, 12, 13, 14, 15], categories: ['lexicon', 'verse_fact'], quota: "3x lexicon, 2x verse_fact" }
};

/**
 * 分數階梯映射 (Score Ladder) - V2.0 (Hybrid Dynamic)
 * 定義各關卡目標分數區間 (final_difficulty_score)
 */
const SCORE_LADDER = {
    easy: { minScore: 10, maxScore: 45 },
    medium: { minScore: 40, maxScore: 75 },
    hard: { minScore: 70, maxScore: 100 }
};

/**
 * QuizEngine - 遊戲核心調度 Class
 */
class QuizEngine {
    constructor() {
        this.activeSessions = new Map();
    }

    /**
     * [HQ 2.0 / V5.0 Hybrid] 獲取指定關卡的合適題型與分數區間
     */
    _getDifficultyCriteria(level) {
        let group = 'hard';
        if (level <= 5) group = 'easy';
        else if (level <= 10) group = 'medium';
        
        return {
            group,
            categories: DIFFICULTY_LADDER[group].categories,
            quota: DIFFICULTY_LADDER[group].quota,
            minScore: SCORE_LADDER[group].minScore,
            maxScore: SCORE_LADDER[group].maxScore
        };
    }

    /**
     * Fisher-Yates 洗牌演算法 (標準亂數化)
     */
    _shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    /**
     * [Phase 15] JIT 難度計分：直接從 DB 欄位推算，不呼叫 AI，不寫 DB
     * 優先使用 final_difficulty_score，沒有則用 rule_difficulty_score，最後用類別 fallback
     */
    _computeJitScore(q) {
        return getStoredDifficultyScore(q);
    }

    /**
     * [Phase 15] 依分數判斷難度帶，對齊 DifficultyScorer.getDifficultyBand 閾值
     * EASY: <=30 | MEDIUM: <=65 | HARD: <=85 | VERY_HARD: >85
     */
    _getDifficultyBand(score) {
        return getDifficultyBand(score);
    }

    /**
     * [Phase 15] 四層難度分層抽樣（35/35/20/10 比例）
     * 確保每份手牌有適度難度梯度，避免全易或全難
     */
    _layeredSample(pool, count, excludes = new Set()) {
        const available = pool.filter(q => !excludes.has(q.question));
        if (available.length === 0) return [];
        const usedSemanticGroups = new Set(
            pool
                .filter(q => excludes.has(q.question))
                .map(getSemanticGroupKey)
        );

        // 按難度帶分桶
        const buckets = { EASY: [], MEDIUM: [], HARD: [], VERY_HARD: [] };
        for (const q of available) {
            const band = this._getDifficultyBand(q._jitScore ?? 50);
            buckets[band].push(q);
        }

        // 各桶目標數量（35 / 35 / 20 / 10 比例）
        const targets = getDifficultyTargets(count);

        const selected = [];
        const usedSet = new Set();

        // 從各桶依比例抽樣
        for (const [band, target] of Object.entries(targets)) {
            const shuffled = this._shuffle([...buckets[band]]);
            if (getQuestionQualityMode() !== 'shadow') {
                shuffled.sort((a, b) => Number(isVerifiedQuestion(b)) - Number(isVerifiedQuestion(a)));
            }
            let taken = 0;
            for (const q of shuffled) {
                if (taken >= target) break;
                const semanticGroup = getSemanticGroupKey(q);
                if (!usedSet.has(q.question) && !usedSemanticGroups.has(semanticGroup)) {
                    selected.push(q);
                    usedSet.add(q.question);
                    usedSemanticGroups.add(semanticGroup);
                    taken++;
                }
            }
        }

        // 若數量不足（某難度桶為空），從剩餘可用題目補足
        if (selected.length < count) {
            const remaining = this._shuffle(available.filter(q => !usedSet.has(q.question)));
            for (const q of remaining) {
                if (selected.length >= count) break;
                const semanticGroup = getSemanticGroupKey(q);
                if (usedSemanticGroups.has(semanticGroup)) continue;
                selected.push(q);
                usedSet.add(q.question);
                usedSemanticGroups.add(semanticGroup);
            }
        }

        return selected.slice(0, count);
    }

    /**
     * V4.2 整局選題：5 易／7 中／3 高；高難度槽以 70/30 機率抽 HARD/VERY_HARD。
     */
    async getHand(scopes, locale = 'zh-TW', count = 15, askedQuestions = new Set(), options = {}) {
        const normalizedScopes = (Array.isArray(scopes) ? scopes : []).map(scope => ({
            book: bibleTranslator.toChinese(scope.book),
            startChapter: Math.max(1, Number.parseInt(scope.startChapter, 10) || 1),
            endChapter: Math.max(1, Number.parseInt(scope.endChapter ?? scope.startChapter, 10) || 1)
        }));
        if (normalizedScopes.length === 0 || normalizedScopes.length > 66) {
            throw new Error('INVALID_HAND_SCOPE');
        }

        const resolvedVersion = resolveGameVersion(options.version);

        const pools = await Promise.all(normalizedScopes.map(scope =>
            dbOps.getPlayableQuestionsInBatchRange(
                scope.book,
                Math.min(scope.startChapter, scope.endChapter),
                Math.max(scope.startChapter, scope.endChapter),
                resolvedVersion
            )
        ));
        const excludedGroups = new Set(await dbOps.getSemanticGroupKeysByQuestionTexts([...askedQuestions]));
        const seenIds = new Set();
        const playablePool = [];
        for (const question of pools.flat()) {
            if (seenIds.has(question.id) || askedQuestions.has(question.question)) continue;
            seenIds.add(question.id);
            if (!isVerifiedQuestion(question)) continue;
            const contentLocale = question.contentLocale ?? question.content_locale;
            if (locale === 'zh-TW' && contentLocale !== 'zh-TW') continue;
            if (excludedGroups.has(getSemanticGroupKey(question))) continue;
            question._jitScore = this._computeJitScore(question);
            question._scoreSource = getStoredDifficultySource(question);
            const assembled = assembleVerifiedQuestion({ ...question, source: question.source || 'DB_HAND_V42' });
            if (assembled.ok) {
                assembled.question._jitScore = question._jitScore;
                assembled.question._scoreSource = question._scoreSource;
                playablePool.push(assembled.question);
            }
        }

        const result = selectBalancedDifficultyHand(playablePool, count, items => this._shuffle(items));
        const questions = result.questions.map(question => {
            const copy = { ...question };
            delete copy._jitScore;
            return copy;
        });
        return {
            questions,
            shortages: result.shortages,
            substitutions: result.substitutions,
            highDifficultyMix: result.highDifficultyMix,
            targets: result.targets,
            inventory: (() => {
                const actual = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
                for (const question of playablePool) actual[this._getDifficultyBand(question._jitScore)] += 1;
                return { ...actual, HIGH: actual.HARD + actual.VERY_HARD };
            })()
        };
    }

    _verifiedPoolMeetsTargets(pool, count) {
        const targets = getDifficultyTargets(count);
        const counts = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
        for (const question of pool.filter(isVerifiedQuestion)) {
            counts[this._getDifficultyBand(question._jitScore ?? 50)]++;
        }
        return Object.entries(targets).every(([band, target]) => counts[band] >= target);
    }

    /**
     * [V4.0] 獲取定錨藍圖 (委託 LogosEngine 辦理)
     */
    async generateBlueprint(book, sCap, eCap, targetCount = 20, options = {}) {

        const { LogosEngine } = await import('../../../infrastructure/ai/LogosEngine.js');
        return LogosEngine.anchor.createBlueprint(book, sCap, eCap, targetCount);
    }

    /**
     * [V6.0] 獲取開局手牌 — 純 DB 路徑，無 AI 呼叫
     *
     * 流程：DB 撈全部 PASS 題 → 分層抽樣 → 全域難度排序 → 組裝 options
     * 誘餌已於入庫時預生成（distractors_pool），選題零 AI 等待。
     *
     * @param {string} book
     * @param {number} sCap    起始章
     * @param {number} eCap    結束章
     * @param {string} locale
     * @param {number} count   題數（預設 15，一次全拿）
     * @param {Set}    askedQuestions  排除清單
     * @param {Object} options
     */
    async getInitialHand(book, sCap, eCap, locale = 'zh-TW', count = 15, askedQuestions = new Set(), options = {}) {
        const stdBook = bibleTranslator.toChinese(book);
        const start = parseInt(sCap) || 1;
        const end   = parseInt(eCap) || start;

        // blueprint 保留供前端參考（3s 超時不阻塞）
        let blueprint = [];
        try {
            blueprint = await Promise.race([
                this.generateBlueprint(stdBook, start, end, 20, options),
                new Promise((_, rej) => setTimeout(() => rej(new Error('Blueprint timeout')), 3000))
            ]);
        } catch (bpErr) {
            console.warn(`[QuizEngine V6] Blueprint skipped: ${bpErr.message}`);
        }

        const activeExcludes = new Set(askedQuestions);

        // 1. 版本解析
        const resolvedVersion = resolveGameVersion(options.version);

        // 2. 全範圍只撈取可直接進入遊戲的 PASS 題目
        // 未完成誘餌／選項的題目仍留在題庫加工，但不算可分配庫存。
        let dbPool = await dbOps.getPlayableQuestionsInBatchRange(
            stdBook,
            start,
            end,
            resolvedVersion
        );
        const excludedSemanticGroups = new Set(
            dbPool
                .filter(question => activeExcludes.has(question.question))
                .map(getSemanticGroupKey)
        );
        const availableSemanticGroups = new Set(
            dbPool
                .filter(question => !excludedSemanticGroups.has(getSemanticGroupKey(question)))
                .map(getSemanticGroupKey)
        ).size;
        console.log(
            `[QuizEngine V6] DB pool for ${stdBook} Ch.${start}-${end}: `
            + `${dbPool.length} questions / ${availableSemanticGroups} semantic groups`
        );

        if (availableSemanticGroups < count) {
            questionInventoryService.recordDemand({
                book: stdBook,
                startChapter: start,
                endChapter: end,
                version: resolvedVersion,
                required: count,
                available: availableSemanticGroups,
                mode: options.gameMode || 'classic'
            });
        } else {
            questionInventoryService.resolveDemand({
                book: stdBook,
                version: resolvedVersion,
                startChapter: start,
                endChapter: end
            });
        }

        // 3. JIT 計分（僅供排序，不寫 DB）
        for (const q of dbPool) {
            q._jitScore = this._computeJitScore(q);
            // 標記分數來源，供後台可觀察
            q._scoreSource = getStoredDifficultySource(q);
        }

        const totalQualityPool = dbPool.length;
        dbPool = dbPool.filter(isVerifiedQuestion);
        console.log(`[QuizEngine V4.1] VERIFIED-only inventory: ${dbPool.length}/${totalQualityPool}.`);

        // 分數來源統計（後台可觀察：確認是否走 final_difficulty_score）
        const poolStats = dbPool.reduce((acc, q) => { acc[q._scoreSource]++; return acc; }, { final: 0, rule: 0, fallback: 0 });
        console.log(`[QuizEngine V6] Score sources in pool: final=${poolStats.final} rule=${poolStats.rule} fallback=${poolStats.fallback} (total=${dbPool.length})`);

        // 背景即時補分：fallback 題第一次被玩到就永久寫回 DB
        // scoreQuestionDifficulty 純同步（無 AI），每題 < 1ms，整批可直接做
        const fallbackQs = dbPool.filter(q => q._scoreSource === 'fallback');
        if (fallbackQs.length > 0) {
            console.log(`[QuizEngine V6] Triggered ${fallbackQs.length} fallback scoring (background)`);
            setImmediate(async () => {
                try {
                    let done = 0;
                    for (const q of fallbackQs) {
                        const sd = scoreQuestionDifficulty(q);
                        await dbOps.updateQuestionDifficultyScore(q.id, sd);
                        done++;
                    }
                    console.log(`[QuizEngine V6] Fallback scoring done: ${done}/${fallbackQs.length} written to DB`);
                } catch (e) {
                    console.warn(`[QuizEngine V6] Fallback scoring error: ${e.message}`);
                }
            });
        }

        // 4. 依照藍圖選題（若有藍圖且長度夠）
        let selected = [];
        if (blueprint && blueprint.length >= count) {
            console.log(`[QuizEngine V6] Applying blueprint anchors for ${count} questions...`);
            const poolByCh = {};
            for (const q of dbPool) {
                if (!activeExcludes.has(q.question)
                    && !excludedSemanticGroups.has(getSemanticGroupKey(q))) {
                    if (!poolByCh[q.chapter]) poolByCh[q.chapter] = [];
                    poolByCh[q.chapter].push(q);
                }
            }

            const targetDiff = getDifficultyTargets(count);

            const getBand = (q) => this._getDifficultyBand(q._jitScore ?? 50);

            for (let i = 0; i < count; i++) {
                const anchor = blueprint[i];
                let chPool = (poolByCh[anchor.chapter] || [])
                    .filter(question => !excludedSemanticGroups.has(getSemanticGroupKey(question)));
                let picked = null;
                if (chPool.length > 0) {
                    chPool = this._shuffle([...chPool]);
                    const neededBands = Object.keys(targetDiff).filter(k => targetDiff[k] > 0);
                    for (const band of neededBands) {
                        picked = chPool.find(q => getBand(q) === band);
                        if (picked) {
                            targetDiff[band]--;
                            break;
                        }
                    }
                    if (!picked) picked = chPool[0]; // 難度不符則硬挑該章的題目
                    
                    selected.push(picked);
                    activeExcludes.add(picked.question);
                    excludedSemanticGroups.add(getSemanticGroupKey(picked));
                    poolByCh[anchor.chapter] = chPool.filter(q => q.id !== picked.id);
                }
            }

            // 若章節庫存不足，用剩餘可用題目補齊
            if (selected.length < count) {
                console.warn(`[QuizEngine V6] Blueprint missed ${count - selected.length} questions, filling dynamically.`);
                const filler = this._layeredSample(dbPool, count - selected.length, activeExcludes);
                selected.push(...filler);
            }
        } else {
            console.log(`[QuizEngine V6] No blueprint available, fallback to layered sample.`);
            selected = this._layeredSample(dbPool, count, activeExcludes);
        }

        // 5. 全域難度排序（由低到高）— 一次對所有 count 題做排序，保證全程漸進
        selected.sort((a, b) => (a._jitScore ?? 50) - (b._jitScore ?? 50));
        selected.forEach(q => activeExcludes.add(q.question));
        console.log(`[QuizEngine V6] Layered selection: ${selected.length}/${count}`);

        // 6. 所有遊戲模式只使用同一個已稽核錯項池組裝器。
        const allResults = [];
        const assemblePlayableQuestion = (q) => {
            const item = {
                ...q,
                source: q.source || 'DB_HARVEST_V6',
            };
            const assembled = assembleVerifiedQuestion(item);
            if (!assembled.ok) {
                console.warn(`[QuizEngine V4.1] Skipped ${q.id || '(unsaved)'}: ${assembled.reason}`);
                return null;
            }
            return assembled.question;
        };

        for (const q of selected) {
            const item = assemblePlayableQuestion(q);
            if (item) allResults.push(item);
        }

        // 舊題若因重複或不合格選項被攔截，繼續從同範圍庫存補足，不呼叫前景 AI。
        if (allResults.length < count) {
            const playedSemanticGroups = new Set(allResults.map(getSemanticGroupKey));
            const reservePool = dbPool
                .filter(q => !activeExcludes.has(q.question))
                .filter(q => !playedSemanticGroups.has(getSemanticGroupKey(q)))
                .sort((a, b) => (a._jitScore ?? 50) - (b._jitScore ?? 50));
            for (const reserve of reservePool) {
                if (allResults.length >= count) break;
                if (playedSemanticGroups.has(getSemanticGroupKey(reserve))) continue;
                const item = assemblePlayableQuestion(reserve);
                if (!item) continue;
                activeExcludes.add(reserve.question);
                playedSemanticGroups.add(getSemanticGroupKey(item));
                allResults.push(item);
            }
        }

        allResults.sort((a, b) => (a._jitScore ?? 50) - (b._jitScore ?? 50));
        allResults.forEach(item => delete item._jitScore);

        // 7. 記錄最終手牌的分數序列（後台確認全域排序是否正確）
        const selStats = { final: 0, rule: 0, fallback: 0 };
        // 縮寫規則：[F]=final_difficulty_score, [r]=rule_difficulty_score, [-]=fallback 無分數
        const SRC_ABBR = { final: 'F', rule: 'r', fallback: '-' };
        const scoreSeq = allResults.map((q, i) => {
            const src = q._scoreSource ?? getStoredDifficultySource(q);
            selStats[src] = (selStats[src] ?? 0) + 1;
            const score = getStoredDifficultyScore(q);
            return `Q${i+1}:${score}[${SRC_ABBR[src] ?? src}]`;
        });
        console.log(`[QuizEngine V6] Final hand (${allResults.length}) score sequence: ${scoreSeq.join(' ')}`);
        console.log(`[QuizEngine V6] Score sources in selection: final=${selStats.final} rule=${selStats.rule} fallback=${selStats.fallback}`);

        const scoreStats = { ...selStats, total: allResults.length };
        return { questions: allResults, blueprint, scoreStats };
    }

    /**
     * 遊戲前景不得臨時產生或拼湊未經稽核的干擾項。
     * 缺少已驗證選項的題目會被略過，交由背景巡航建立 revision 修復。
     */
    async _fillSingleQuestionDistractors(q, dbPool = []) {
        void dbPool;
        console.warn(`[QuizEngine V4] Skipped question ${q.id || '(unsaved)'}: no audited distractor pool or valid stored options.`);
    }

    /**
     * [HQ JIT] 背景預取補餌任務 (併發接力模式)
     */
    async _prefetchDistractors(questions, dbPool = []) {
        if (!questions || questions.length === 0) return;

        const concurrency = 2; // 併發數控制，避免 429
        const queue = [...questions];

        const worker = async () => {
            while (queue.length > 0) {
                const q = queue.shift();
                if (!q) break;
                await this._fillSingleQuestionDistractors(q, dbPool);
                await new Promise(r => setTimeout(r, 200));
            }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }


    /**
     * [V4.5 HQ] 海巡專用批次生成 (Batch Patrol Generation)
     * 調用正式管線進行經文定位生成，並整合資料庫避讓。
     */
    async generateBatch({ count = 5, book, chapter, verseStart, verseEnd, exclusions = [], mode = 'patrol', priority = false, version = 'CUV_TRAD', options = {} }) {
        const stdBook = bibleTranslator.toChinese(book);
        await requireNewQuestionCorpus(version);
        const { generateBatch: rawBatchGen } = await import('./QuestionCore.js');
        const { LogosEngine } = await import('../../../infrastructure/ai/LogosEngine.js');

        console.log(`📡 [QuizEngine] Patrol HQ batch generation triggered for ${stdBook} Ch.${chapter} [${version}] [priority=${priority}]`);

        // 1. 建立偽錨點 (Pseudo-Anchor)
        const pseudoAnchors = [{
            index: 1,
            chapter,
            verseRange: { start: verseStart, end: verseEnd }
        }];

        // 2. 獲取高品質上下文 (包含百科與地理光環)
        const enhancedSegments = await ContentManager.getMultiSegmentContext(stdBook, pseudoAnchors, version, { includeLexicons: true });

        // 3. 定義海巡品質配額 (HQ Quota) - 優先使用傳入的配額需求
        const quota = options.categoryQuota || "1x person, 1x geography, 2x verse_fact, 1x lexicon/verse_fill";

        // 4. 調用 AI 生成管線 (透傳 priority)
        const excludeTexts = new Set(exclusions.map(q => q.question));
        let batch = await rawBatchGen({
            book: stdBook,
            segments: enhancedSegments.map(s => ({ ...s.context, id: s.chapter + ':' + s.verseRange.start })),
            count,
            mode,
            options: {
                ...options,
                mode,
                priority,          // ← 關鍵：傳入 priority
                version,
                categoryQuota: quota,
                sovereignInsights: enhancedSegments.map(s => s.context.sovereignInsights).filter(Boolean)
            },
            excludeList: Array.from(excludeTexts)
        });

        if (!batch || batch.length === 0) {
            if (mode === 'patrol') throw new Error('AI Generation returned 0 valid questions.');
            return [];
        }

        // 5. [SOVEREIGN] 通過 Logos 稽核
        const pruned = await LogosEngine.auditor.livePrune(batch, exclusions, excludeTexts);

        // 6. 轉換為持久化格式 (海巡入庫專用)
        return pruned.map(p => ({
            ...p,
            id: crypto.randomUUID(),
            source: 'AI_PATROL_HQ',
            status: 'PASS',
            book: stdBook,
            chapter,
            verse_start: p.verse_start || verseStart,
            verse_end: p.verse_end || verseEnd,
            version: version
        }));
    }

    /**
     * 動態補題 (Replenish by Index - Ladder Aware)
     */
    async getQuestionByIndex(book, sCap, eCap, index, locale = 'zh-TW', askedQuestions = new Set(), anchorChapter = null, vRange = null, options = {}) {
        const stdBook = bibleTranslator.toChinese(book);
        const resolvedVersion = resolveGameVersion(options.version);

        const currentLevel = (index % 15) || 15;
        const ladder = this._getDifficultyCriteria(currentLevel);
        const preferredCats = ladder.categories;

        let targetAnchor = null;
        if (options.blueprint) {
            targetAnchor = options.blueprint.find(b => b.index === index);
        }

        if (!targetAnchor) {
            const blueprint = await this.generateBlueprint(stdBook, sCap, eCap, 20, options);
            targetAnchor = blueprint.find(b => b.index === index) || blueprint[Math.min(index - 1, blueprint.length - 1)];
        }
        if (!targetAnchor) {
            const fallbackChapter = anchorChapter || parseInt(sCap) || 1;
            targetAnchor = {
                index,
                chapter: fallbackChapter,
                verseRange: vRange || { start: 1, end: Number.MAX_SAFE_INTEGER }
            };
        }

        const c = anchorChapter || targetAnchor.chapter;
        const vStart = vRange ? vRange.start : targetAnchor.verseRange.start;
        const vEnd = vRange ? vRange.end : targetAnchor.verseRange.end;

        // 1. DB 優先 (準確對位難度階梯)
        const activeExcludes = Array.from(askedQuestions);
        const excludedSemanticGroupList = await dbOps.getSemanticGroupKeysByQuestionTexts(activeExcludes);
        const excludedSemanticGroupSet = new Set(excludedSemanticGroupList);
        // 先嘗試抓預期類型的題目
        let cache = await dbOps.getQuestionsByRange(stdBook, c, c, preferredCats, activeExcludes, vStart, vEnd, resolvedVersion, excludedSemanticGroupList);
        // 若無，則抓取事實類保底
        if (!cache) cache = await dbOps.getQuestionsByRange(stdBook, c, c, ['verse_fact'], activeExcludes, vStart, vEnd, resolvedVersion, excludedSemanticGroupList);

        const preparePlayableQuestion = (candidate, source) => {
            if (!candidate) return null;
            const q = { ...candidate, source, anchorId: targetAnchor.index, level: currentLevel };
            const assembled = assembleVerifiedQuestion(q);
            return assembled.ok ? assembled.question : null;
        };

        const anchored = preparePlayableQuestion(cache, 'DB_CACHE_HQ');
        if (anchored) return anchored;

        // 指定章節缺貨時，先從同一遊戲範圍調度最接近本關目標分數的可玩庫存。
        let rangePool = await dbOps.getPlayableQuestionsInBatchRange(
            stdBook,
            parseInt(sCap) || 1,
            parseInt(eCap) || parseInt(sCap) || 1,
            resolvedVersion,
            preferredCats
        );
        rangePool = rangePool.filter(q =>
            !askedQuestions.has(q.question)
            && !excludedSemanticGroupSet.has(getSemanticGroupKey(q))
        );
        if (rangePool.length === 0) {
            rangePool = await dbOps.getPlayableQuestionsInBatchRange(
                stdBook,
                parseInt(sCap) || 1,
                parseInt(eCap) || parseInt(sCap) || 1,
                resolvedVersion
            );
            rangePool = rangePool.filter(q =>
                !askedQuestions.has(q.question)
                && !excludedSemanticGroupSet.has(getSemanticGroupKey(q))
            );
        }

        const targetScore = (ladder.minScore + ladder.maxScore) / 2;
        rangePool.sort((a, b) =>
            Math.abs(getStoredDifficultyScore(a) - targetScore) -
            Math.abs(getStoredDifficultyScore(b) - targetScore)
        );
        for (const candidate of rangePool) {
            const prepared = preparePlayableQuestion(candidate, 'DB_RANGE_INVENTORY');
            if (prepared) return prepared;
        }

        // 遊戲端只消耗已審核庫存；缺口交由巡航補貨，避免玩家等待 AI 或吃到未審核題。
        questionInventoryService.recordDemand({
            book: stdBook,
            startChapter: parseInt(sCap) || 1,
            endChapter: parseInt(eCap) || parseInt(sCap) || 1,
            version: resolvedVersion,
            required: 1,
            available: 0,
            mode: options.gameMode || 'next'
        });
        console.warn(`[QuizEngine] Playable inventory shortage: ${stdBook} Ch.${c} (${resolvedVersion}) Q${index}.`);
        return null;
    }
}

// 單例實體 (用於內部引用)
const quizEngineInstance = new QuizEngine();

/**
 * [SOVEREIGN UNIT] EXPORTS
 */
export {
    QuizEngine,
    GAME_MODES,
    MODE_CONFIGS,
    quizEngineInstance as QuizEngineInstance
};

export default QuizEngine;
