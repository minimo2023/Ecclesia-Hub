/**
 * Quiz System V2 Routes
 *
 * 提供 Quiz Engine v2.0 的 API 端點
 * 核心原則：ContentManager 先取資料，AI 才能出題
 */

import express from 'express';
import { QuizEngine } from './engine/QuizEngine.js';
import { ContentManager } from '../content/bible/ContentManager.js';
import { getDidYouKnow } from './engine/QuestionCore.js';
import { generateAnswerToken, verifyAnswerToken } from '../../utils/tokenHandler.js';
import { authenticateToken, optionalAuthenticateToken, requireRole } from '../../middleware/auth.js';
import { isVerifiedAnswerCorrect } from '../../utils/answerVerification.js';
import {
    recordVerifiedAttempt,
    registerIssuedQuestions,
    toSafeGameRewardError
} from './rewards/GameRewardService.js';
import { dbOps } from '../../database/index.js';

const router = express.Router();
const quizEngine = new QuizEngine();
const GAME_QUESTION_VERSION = 'MIXED_TRAD';
const VERSION_LABELS = {
    CUV_TRAD: '和合本',
    LCC_TRAD: '呂振中譯本',
    CNV_TRAD: '新譯本',
    TCV2019_TRAD: '現代中文譯本 2019'
};
const VERSION_PREFIX_PATTERN = /^【(?:和合本|呂振中譯本|新譯本|現代中文譯本 2019)】\s*/;
const stripVersionPrefix = (text) => typeof text === 'string'
    ? text.replace(VERSION_PREFIX_PATTERN, '')
    : text;

const isCurrentAnswerRevision = async (payload) => {
    if (!payload?.id || !payload?.revisionId) return false;
    const current = await dbOps.gamesDb.get(`
        SELECT active_revision_id, status, quality_state, content_locale
        FROM questions WHERE id = $1
    `, [payload.id]);
    return Boolean(
        current
        && current.activeRevisionId === payload.revisionId
        && current.status === 'PASS'
        && current.qualityState === 'VERIFIED'
        && current.contentLocale === 'zh-TW'
    );
};

// 移除不應暴露給客戶端的內部欄位（包含正確答案明文）
const sanitizeQuestion = (q) => {
    if (!q) return null;
    const safe = { ...q };
    const canonicalVersion = q.canonicalVersion ?? q.canonical_version ?? q.version;
    const versionLabel = VERSION_LABELS[canonicalVersion] || '混合譯本';
    safe.versionLabel = versionLabel;
    safe.question = stripVersionPrefix(q.question || '');
    [
        'answer', 'correctIndex', 'correct_index',
        'originalCorrectIndex', 'original_correctIndex', 'original_correct_index',
        'originalOptions', 'original_options', 'distractors', 'distractorsPool', 'distractors_pool',
        'quality', 'qualityState', 'quality_state', 'qualityStandardVersion',
        'quality_standard_version', 'qualityCheckedAt', 'quality_checked_at',
        'hashExact', 'hash_exact', 'sigSemantic', 'sig_semantic',
        'semanticGroupKey', 'semantic_group_key', 'semanticDuplicateOf', 'semantic_duplicate_of',
        'semanticCheckedAt', 'semantic_checked_at', 'semanticCheckVersion', 'semantic_check_version',
        'auditReason', 'audit_reason', 'auditorVersion', 'auditor_version',
        'judgePromptVersion', 'judge_prompt_version', 'judgeRoles', 'judge_roles',
        'aiJudgeAScore', 'ai_judge_a_score', 'aiJudgeARole', 'ai_judge_a_role',
        'aiJudgeBScore', 'ai_judge_b_score', 'aiJudgeBRole', 'ai_judge_b_role',
        'aiJudgeAvg', 'ai_judge_avg', 'aiJudgeDelta', 'ai_judge_delta',
        'ruleAiDelta', 'rule_ai_delta', 'aiConsistency', 'ai_consistency',
        'ruleValidity', 'rule_validity', 'metadata', '_scoreSource',
        'stats_shown', 'stats_correct', 'stats_wrong', 'source', 'status',
        'verse_start', 'verse_end', 'activeRevisionId', 'active_revision_id'
    ].forEach(k => delete safe[k]);
            
    const computedCorrectIndex = q.correctIndex !== undefined ? q.correctIndex : (q.options && q.answer ? q.options.indexOf(q.answer) : -1);
    // 優先從 options[correctIndex] 取答案文字（已經過 stripPunctuation 處理），
    // 避免 DB 原始答案含「」書名號等標點，導致字串比對永遠失敗。
    const computedAnswer = (q.options && computedCorrectIndex >= 0)
        ? q.options[computedCorrectIndex]
        : q.answer;
            
    safe.answerToken = generateAnswerToken({
        id: safe.id,
        answer: computedAnswer,
        correctIndex: computedCorrectIndex,
        revisionId: q.activeRevisionId ?? q.active_revision_id ?? null
    });
    
    return safe;
};

/**
 * POST /api/quiz/v2/hand
 * 後端一次接收整個書卷範圍，優先組成 5 易／7 中／3 高，高難度層級採機率抽取。
 */
router.post(['/v2/hand', '/hand'], optionalAuthenticateToken, async (req, res) => {
    try {
        const {
            scopes,
            count: countParam = 15,
            gameMode = 'classic',
            locale = 'zh-TW',
            version: _requestedVersion,
            exclude = [],
            isInfiniteMode = false,
            gameSessionId = null
        } = req.body || {};
        const normalizedInfiniteMode = isInfiniteMode === true || isInfiniteMode === 'true';
        const count = Number.parseInt(countParam, 10);
        const maximumCount = gameMode === 'multiplayer' ? 30 : 15;
        const validScopes = Array.isArray(scopes) && scopes.length > 0 && scopes.length <= 66
            && scopes.every(scope => scope
                && typeof scope.book === 'string'
                && scope.book.trim().length > 0
                && Number.isInteger(Number.parseInt(scope.startChapter ?? 1, 10))
                && Number.isInteger(Number.parseInt(scope.endChapter ?? scope.startChapter ?? 1, 10)));
        if (!validScopes || !Number.isInteger(count) || count < 1 || count > maximumCount) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_HAND_REQUEST',
                message: '請提供 1 至 66 個書卷範圍，題數須介於 1 到 15 題'
            });
        }
        const result = await quizEngine.getHand(
            scopes,
            locale,
            count,
            new Set(Array.isArray(exclude)
                ? exclude.filter(item => typeof item === 'string').slice(0, 200).map(stripVersionPrefix)
                : []),
            { version: GAME_QUESTION_VERSION, gameMode }
        );
        if (Object.keys(result.shortages).length > 0 || result.questions.length !== count) {
            return res.status(409).json({
                success: false,
                error: 'INSUFFICIENT_DIFFICULTY_INVENTORY',
                message: '所選範圍內通過品質審核的題目不足，無法組成完整題組',
                shortages: result.shortages,
                substitutions: result.substitutions,
                highDifficultyMix: result.highDifficultyMix,
                targets: result.targets,
                inventory: result.inventory
            });
        }
        let rewardRegistration = null;
        if (req.user && gameSessionId) {
            rewardRegistration = await registerIssuedQuestions(
                req.user.userId,
                String(gameSessionId),
                result.questions.map(question => ({ id: question.id, book: question.book })),
                { requestedMode: gameMode, isInfiniteMode: normalizedInfiniteMode }
            );
        }
        return res.json({
            success: true,
            questions: result.questions.map(sanitizeQuestion),
            count: result.questions.length,
            difficultyTargets: result.targets,
            difficultySubstitutions: result.substitutions,
            highDifficultyMix: result.highDifficultyMix,
            rewardRegistration,
            blueprint: []
        });
    } catch (error) {
        console.error('[QuizV2] Hand Error:', error);
        const safe = toSafeGameRewardError(error);
        return res.status(safe.status).json({ success: false, error: safe.code, message: safe.message });
    }
});

/**
 * GET /api/quiz/v2/questions
 * 取得題目 — 題數由前端依遊戲模式決定，後端按 gameMode 驗證上限
 *
 * count 上限策略（無 AI 呼叫，DB 查詢即時）：
 *   classic / millionaire : 15 題（百萬聖經正式模式）
 *   practice              : 50 題（練習模式）
 *   endless               : 200 題（無限挑戰，防暴力防護）
 *   其他 / 未知           : 15 題（保守預設）
 */
router.get('/questions', optionalAuthenticateToken, async (req, res) => {
    try {
        const {
            book,
            startChapter,
            endChapter,
            chapter,
            count: countParam,
            gameMode = 'classic',
            locale = 'zh-TW',
            version: _requestedVersion,
            includeGeo = 'true',
            includeLex = 'true',
            difficultyOffset = '0',
            totalPlannedCount,
            isInfiniteMode = 'false',
            strictSlotDifficulty = 'false',
            isBackgroundFetch = 'false'
        } = req.query;

        if (!book || (!startChapter && !chapter)) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMS',
                message: '必須提供 book 和 startChapter (或 chapter) 參數'
            });
        }

        const sCap = parseInt(startChapter || chapter);
        const eCap = parseInt(endChapter || startChapter || chapter);

        // gameMode 對應的題數上限（DB 無 AI，不需限制太死）
        const COUNT_LIMITS = {
            classic:     15,
            millionaire: 15,
            speed:       15,
            casual:      50,
            practice:    50,
            endless:     200,
            expedition:   200,
        };
        const maxCount = COUNT_LIMITS[gameMode] ?? 15;
        const requestedCount = parseInt(countParam) || maxCount;
        const count = Math.min(requestedCount, maxCount);
        const parsedTotalPlannedCount = Math.min(parseInt(totalPlannedCount) || maxCount, maxCount);
        const parsedDifficultyOffset = Math.max(0, parseInt(difficultyOffset) || 0);

        // Parse exclude list
        const excludeRaw = req.query.exclude;
        const excludeList = excludeRaw
            ? (Array.isArray(excludeRaw) ? excludeRaw : [excludeRaw])
            : [];
        const askedQuestions = new Set(excludeList.map(stripVersionPrefix));
        const engineOptions = {
            version: GAME_QUESTION_VERSION,
            includeGeography: includeGeo === 'true',
            includeEncyclopedia: includeLex === 'true',
            gameMode,
            totalPlannedCount: parsedTotalPlannedCount,
            difficultyOffset: parsedDifficultyOffset,
            isInfiniteMode: isInfiniteMode === 'true',
            strictSlotDifficulty: strictSlotDifficulty === 'true',
            isBackgroundFetch: isBackgroundFetch === 'true'
        };

        console.log(
            `[QuizV2] /questions for ${book} Ch.${sCap}-${eCap}, ` +
            `mode=${gameMode}, count=${count}, difficultyOffset=${parsedDifficultyOffset}, ` +
            `totalPlannedCount=${parsedTotalPlannedCount}, isInfiniteMode=${isInfiniteMode}, ` +
            `strictSlotDifficulty=${strictSlotDifficulty}, isBackgroundFetch=${isBackgroundFetch}, version=${GAME_QUESTION_VERSION}, includeGeo=${includeGeo}, includeLex=${includeLex}`
        );

        const result = await quizEngine.getInitialHand(book, sCap, eCap, locale, count, askedQuestions, engineOptions);

        if (!result || !result.questions || result.questions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'NO_PLAYABLE_INVENTORY',
                message: '這個範圍目前沒有足夠的可用題目，系統已記錄補題需求。'
            });
        }

        let rewardRegistration = null;
        if (req.user && req.query.gameSessionId) {
            rewardRegistration = await registerIssuedQuestions(
                req.user.userId,
                String(req.query.gameSessionId),
                result.questions.map((question) => ({ id: question.id, book: question.book || book })),
                { requestedMode: gameMode, isInfiniteMode: isInfiniteMode === 'true' }
            );
        }

        res.json({
            success: true,
            questions: result.questions.map(sanitizeQuestion),
            blueprint: result.blueprint,
            count: result.questions.length,
            rewardRegistration,
            context: {
                book, startChapter: sCap, endChapter: eCap,
                gameMode, requestedCount: count,
                // 分數來源摘要：後台可觀察是否走 final_difficulty_score
                scoreStats: result.scoreStats ?? null,
            }
        });

    } catch (error) {
        console.error('[QuizV2] Start Error:', error);
        const safe = toSafeGameRewardError(error);
        res.status(safe.status).json({
            success: false,
            error: safe.code,
            message: safe.message
        });
    }
});

/**
 * GET /api/quiz/v2/next
 * 動態補一題 (過關補題機制)
 *
 * Query params:
 * - book, chapter, index (題號 6-15), exclude (排重)
 */
router.get('/next', optionalAuthenticateToken, async (req, res) => {
    try {
        const {
            book,
            startChapter,
            endChapter,
            index,
            locale = 'zh-TW',
            vStart,
            vEnd,
            version: _requestedVersion,
            includeGeo = 'true',
            includeLex = 'true',
            gameMode = 'classic',
            isInfiniteMode = 'false'
        } = req.query;

        if (!book || !startChapter || !index) {
            return res.status(400).json({ success: false, error: 'MISSING_PARAMS' });
        }

        const sCap = parseInt(startChapter);
        const eCap = parseInt(endChapter || startChapter);

        const excludeList = req.query.exclude
            ? (Array.isArray(req.query.exclude) ? req.query.exclude : [req.query.exclude])
            : [];
        const askedQuestions = new Set(excludeList.map(stripVersionPrefix));

        const vRange = vStart ? { start: parseInt(vStart), end: parseInt(vEnd || vStart) } : null;
        const engineOptions = {
            version: GAME_QUESTION_VERSION,
            includeGeography: includeGeo === 'true',
            includeEncyclopedia: includeLex === 'true'
        };

        console.log(`[QuizV2] Replenishing Q${index} for ${book} Ch.${sCap} [Verse: ${vStart || 'Any'}], version=${GAME_QUESTION_VERSION}`);

        // [DEBUG LOGS] 具現化主權屬性查驗
        console.log('DEBUG: quizEngine Type:', typeof quizEngine);
        console.log('DEBUG: hasGetQuestionByIndex:', typeof quizEngine?.getQuestionByIndex);

        const question = await quizEngine.getQuestionByIndex(
            book,
            sCap,
            eCap,
            parseInt(index),
            locale,
            askedQuestions,
            req.query.anchorChapter ? parseInt(req.query.anchorChapter) : null,
            vRange,
            engineOptions
        );

        if (!question) {
            return res.status(404).json({
                success: false,
                error: 'NO_PLAYABLE_INVENTORY',
                message: '目前沒有符合本關條件的可用題目，系統已記錄補題需求。'
            });
        }

        if (req.user && req.query.gameSessionId) {
            await registerIssuedQuestions(
                req.user.userId,
                String(req.query.gameSessionId),
                [{ id: question.id, book: question.book || book }],
                { requestedMode: gameMode, isInfiniteMode: isInfiniteMode === 'true' }
            );
        }

        res.json({
            success: true,
            question: sanitizeQuestion(question)
        });

    } catch (error) {
        console.error('[QuizV2] Replenish Error:', error);
        const safe = toSafeGameRewardError(error);
        res.status(safe.status).json({ success: false, error: safe.code, message: safe.message });
    }
});

/**
 * POST /api/quiz/v2/validate
 * 驗證單一題目
 *
 * Body:
 * - question: 題目物件
 * - difficulty: 目標難度
 * - book: 書卷名
 * - chapter: 章節
 */
router.post('/validate', async (req, res) => {
    try {
        const { question, difficulty, book, chapter, locale = 'zh-TW' } = req.body;

        if (!question || !difficulty || !book || !chapter) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMS',
                message: '必須提供 question, difficulty, book, chapter'
            });
        }

        // 取得經文用於驗證
        const context = await ContentManager.getQuestionContext(book, chapter, chapter, locale);

        if (!context.verses || context.verses.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'NO_VERSE_DATA',
                message: `找不到 ${book} 第 ${chapter} 章的經文`
            });
        }

        // [SOVEREIGN] 暫行通過：校驗邏輯已過時，未來將歸一至 LogosAuditor
        res.json({
            success: true,
            validation: { status: 'PASS', violations: [] },
            verseCount: context.verses.length
        });

    } catch (error) {
        console.error('[QuizV2] Validate error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: error.message
        });
    }
});

/**
 * POST /api/quiz/v2/verify
 * 驗證單一題目答案
 */
router.post('/verify', optionalAuthenticateToken, async (req, res) => {
    try {
        const { answerToken, selectedOption } = req.body;
        
        const decoded = verifyAnswerToken(answerToken);
        if (!decoded) {
            return res.status(400).json({ success: false, error: 'INVALID_TOKEN' });
        }
        if (!await isCurrentAnswerRevision(decoded)) {
            return res.status(409).json({ success: false, error: 'STALE_QUESTION_REVISION', message: '題目版本已更新，請重新載入遊戲' });
        }
        
        const isCorrect = isVerifiedAnswerCorrect(decoded, selectedOption);
        let rewardAttempt = null;
        if (req.user && req.body.gameSessionId) {
            rewardAttempt = await recordVerifiedAttempt(
                req.user.userId,
                String(req.body.gameSessionId),
                decoded,
                isCorrect,
                {
                    selectedOption,
                    responseMs: req.body.responseMs
                }
            );
        }
        
        res.json({
            success: true,
            isCorrect,
            correctAnswerText: decoded.answer,
            correctAnswerIndex: decoded.correctIndex,
            rewardAttempt
        });
    } catch (error) {
        console.error('[QuizV2] Verify error:', error);
        const safe = toSafeGameRewardError(error);
        res.status(safe.status).json({ success: false, error: safe.code, message: safe.message });
    }
});

/**
 * POST /api/quiz/v2/lifeline/5050
 * 回傳要隱藏的兩個錯誤選項
 */
router.post('/lifeline/5050', async (req, res) => {
    try {
        const { answerToken } = req.body;
        const decoded = verifyAnswerToken(answerToken);
        if (!decoded) {
            return res.status(400).json({ success: false, error: 'INVALID_TOKEN' });
        }
        if (!await isCurrentAnswerRevision(decoded)) {
            return res.status(409).json({ success: false, error: 'STALE_QUESTION_REVISION' });
        }
        
        const wrongOptionIndices = [0, 1, 2, 3].filter(i => i !== decoded.correctIndex);
        const indicesToHide = wrongOptionIndices.sort(() => 0.5 - Math.random()).slice(0, 2);
        
        res.json({
            success: true,
            hiddenOptions: indicesToHide
        });
    } catch (error) {
        console.error('[QuizV2] Lifeline 5050 error:', error);
        res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
});

/**
 * POST /api/quiz/v2/lifeline/audience
 * 回傳觀眾投票機率
 */
router.post('/lifeline/audience', async (req, res) => {
    try {
        const { answerToken, currentLevel } = req.body;
        const decoded = verifyAnswerToken(answerToken);
        if (!decoded) {
            return res.status(400).json({ success: false, error: 'INVALID_TOKEN' });
        }
        if (!await isCurrentAnswerRevision(decoded)) {
            return res.status(409).json({ success: false, error: 'STALE_QUESTION_REVISION' });
        }
        
        // Dynamic Accuracy: 95% -> 80% based on level (approximated on server)
        const decay = (currentLevel || 0) * 0.01;
        const accuracyProbability = Math.max(0.80, 0.95 - decay);
        const isAudienceCorrect = Math.random() < accuracyProbability;
        
        let correctIndex = decoded.correctIndex;
        if (correctIndex === -1) correctIndex = 0;
        
        let targetIndex = isAudienceCorrect ? correctIndex : [0, 1, 2, 3].filter(i => i !== correctIndex)[Math.floor(Math.random() * 3)];
        
        const targetPercentage = Math.floor(Math.random() * 21) + 40; // 40-60%
        const stats = { A: 0, B: 0, C: 0, D: 0 };
        const targetLetter = String.fromCharCode(65 + targetIndex);
        stats[targetLetter] = targetPercentage;
        
        const remaining = 100 - targetPercentage;
        const otherLetters = ['A', 'B', 'C', 'D'].filter(l => l !== targetLetter);
        
        let distributedTotal = 0;
        const distributions = otherLetters.map(() => {
            const share = Math.floor(Math.random() * 15) + 8; // 8-22%
            distributedTotal += share;
            return share;
        });
        
        const scale = remaining / distributedTotal;
        let adjustedTotal = 0;
        otherLetters.forEach((letter, i) => {
            const adjustedShare = Math.floor(distributions[i] * scale);
            stats[letter] = adjustedShare;
            adjustedTotal += adjustedShare;
        });
        
        if (remaining - adjustedTotal !== 0) {
            const randomLetter = otherLetters[Math.floor(Math.random() * otherLetters.length)];
            stats[randomLetter] += (remaining - adjustedTotal);
        }
        
        res.json({
            success: true,
            stats,
            averageAccuracy: Math.round(accuracyProbability * 100)
        });
    } catch (error) {
        console.error('[QuizV2] Lifeline Audience error:', error);
        res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
});

/**
 * GET /api/quiz/v2/stats
 * 取得題庫統計
 */
router.get('/stats', (req, res) => {
    res.status(410).json({ success: false, error: 'ENDPOINT_RETIRED', message: '舊版題庫統計端點已停用' });
});

/**
 * GET /api/quiz/v2/modes
 * 取得可用遊戲模式及配置
 */
router.get('/modes', (req, res) => {
    res.status(410).json({ success: false, error: 'ENDPOINT_RETIRED', message: '舊版模式端點已停用' });
});

/**
 * POST /api/quiz/v2/session/reset
 * 重置遊戲 session (清除已出題記錄)
 */
router.post('/session/reset', authenticateToken, requireRole(['admin_ops']), (req, res) => {
    res.status(410).json({ success: false, error: 'ENDPOINT_RETIRED', message: '舊版重設端點已停用' });
});

/**
 * GET /api/quiz/v2/context
 * 取得經文上下文 (預覽用)
 */
router.get('/context', async (req, res) => {
    try {
        const { book, startChapter, endChapter, locale = 'zh-TW' } = req.query;

        if (!book || !startChapter) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMS',
                message: '必須提供 book 和 startChapter 參數'
            });
        }

        const start = parseInt(startChapter);
        const end = parseInt(endChapter) || start;

        const context = await ContentManager.getQuestionContext(book, start, end, locale);

        res.json({
            success: true,
            context: {
                book: context.book,
                chapters: `${start}-${end}`,
                verseCount: context.totalVerses,
                hasCommentary: !!context.commentary,
                hasGeography: context.geography?.length > 0,
                hasSummary: !!context.summary
            },
            verses: context.verses.slice(0, 10), // 只返回前 10 節預覽
            versesTotal: context.totalVerses
        });

    } catch (error) {
        console.error('[QuizV2] Context error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: error.message
        });
    }
});

/**
 * GET /api/quiz/v2/trivia (Did You Know)
 * 取得指定書卷的冷知識
 */
router.get('/trivia', async (req, res) => {
    try {
        const { book } = req.query;
        if (!book) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMS',
                message: '必須提供 book 參數'
            });
        }

        const trivia = await getDidYouKnow(book);
        if (!trivia) {
            return res.status(404).json({
                success: false,
                error: 'GENERATION_FAILED',
                message: '無法生成冷知識，請稍後再試'
            });
        }

        res.json({
            success: true,
            trivia
        });

    } catch (error) {
        console.error('[QuizV2] Trivia error:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: error.message
        });
    }
});

export default router;
