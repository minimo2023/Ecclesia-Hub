/**
 * [SOVEREIGN UNIT] Question Core Service
 * v3.11 - AI-Driven Bible Question Generation
 */
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { callGeminiRaw } from '../../../infrastructure/ai/gemini-client.js';

import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { ContentManager } from '../../content/bible/ContentManager.js';
import { dbOps } from '../../../database/index.js';
import { logger } from '../../../utils/logger.js';
import { scoreQuestionDifficulty } from '../difficulty/DifficultyScorer.js';
import {
    getPlayableQualitySql,
    getQuestionQualityMode
} from '../quality/QuestionQualityPolicy.js';
import { assembleVerifiedQuestion } from '../quality/QuestionOptionAssembler.js';
import { buildSemanticGroupKey } from '../quality/QuestionSemanticDuplicate.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { serverDataRoot } from '../../../utils/paths.js';
import { requireNewQuestionCorpus } from '../../content/bible/BibleCorpusPolicy.js';

const triviaPath = path.join(serverDataRoot, 'staticTrivia.json');
let staticTrivia = [];
try { if (fs.existsSync(triviaPath)) { staticTrivia = JSON.parse(fs.readFileSync(triviaPath, 'utf8')); } } catch (e) { }

let lastCorrectIndex = -1;
function getFairCorrectIndex(optionCount = 4) {
    let newIndex;
    do { newIndex = Math.floor(Math.random() * optionCount); } while (newIndex === lastCorrectIndex && optionCount > 1);
    lastCorrectIndex = newIndex;
    return newIndex;
}

// 安全移除標點符號的比較法 (與出題時的 stripPunctuation 邏輯一致)
const stripPunc = (s) => typeof s === 'string' ? s.trim().replace(/^[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+|[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+$/g, '').trim() : s;

export function normalizeGeneratedQuestionText(value) {
    return String(value || '').trim().replace(/[＿_]{2,}/gu, '___');
}

function normalizeQuestionData(q) {
    if (!q) return null;
    return {
        question: normalizeGeneratedQuestionText(q.question),
        answer: stripPunc((q.answer || "").trim()),
        distractors: (q.distractors || []).map(d => stripPunc((d || "").trim())),
        evidence: (q.evidence || "").trim(),
        category: q.category || 'verse_fact',
        verseRef: q.verseRef || ""
    };
}

function parseGeneratedVerseRef(verseRef) {
    const match = String(verseRef || '').trim().match(
        /^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*[-–—~～至]\s*(\d+))?$/u
    );
    if (!match) return null;
    const verseStart = Number(match[3]);
    const verseEnd = Number(match[4] || match[3]);
    if (!Number.isInteger(verseStart) || !Number.isInteger(verseEnd) || verseStart < 1 || verseEnd < verseStart) {
        return null;
    }
    return {
        book: bibleTranslator.toChinese(match[1].trim()),
        chapter: Number(match[2]),
        verseStart,
        verseEnd
    };
}

export function validateGeneratedQuestionLocation(question, segments = [], expectedBook = '') {
    const segment = (segments || []).find(item => String(item?.id) === String(question?.segment_id));
    if (!segment) return { ok: false, reason: 'UNKNOWN_SEGMENT_ID' };

    const location = parseGeneratedVerseRef(question?.verseRef);
    if (!location) return { ok: false, reason: 'INVALID_VERSE_REF' };

    const canonicalBook = bibleTranslator.toChinese(expectedBook);
    const segmentStart = Number(segment?.verseRange?.start || 1);
    const segmentEnd = Number(segment?.verseRange?.end || Number.MAX_SAFE_INTEGER);
    if (location.book !== canonicalBook) return { ok: false, reason: 'BOOK_MISMATCH' };
    if (location.chapter !== Number(segment.chapter)) return { ok: false, reason: 'CHAPTER_MISMATCH' };
    if (location.verseStart < segmentStart || location.verseEnd > segmentEnd) {
        return { ok: false, reason: 'VERSE_OUTSIDE_SEGMENT' };
    }

    return { ok: true, segment, location };
}

export function validateGeneratedDifficultyScope(question, targetBand = null) {
    const band = String(targetBand || '').toUpperCase();
    if (!['HARD', 'VERY_HARD'].includes(band)) return { ok: true };

    const location = parseGeneratedVerseRef(question?.verseRef);
    if (!location) return { ok: false, reason: 'INVALID_VERSE_REF' };
    const verseCount = location.verseEnd - location.verseStart + 1;
    const minimumVerses = band === 'VERY_HARD' ? 3 : 2;
    return verseCount >= minimumVerses
        ? { ok: true, verseCount }
        : { ok: false, reason: `${band}_REQUIRES_MULTI_VERSE_SCOPE`, verseCount };
}

export function isGeneratedCategoryAllowed(question, targetCategory = null) {
    return !targetCategory || question?.category === targetCategory;
}

export function getGenerationQualityModel(targetBand) {
    // 新題是長期資產：所有難度都優先使用完整 Flash 生成。
    // Flash-Lite 保留給結構固定、已有明確證據的審查工作。
    return 'gemini-3.5-flash';
}

export function getGenerationKeyPolicy(options = {}) {
    const paidOnly = options.paidOnly === true;
    const paidPreferred = options.paidPreferred === true;
    return { paidOnly, freeOnly: !paidOnly && !paidPreferred };
}

// 靜態備用誤導選項（AI 超時時使用，依題目類別分組）
const FALLBACK_DISTRACTORS = {
    verse_fill:   ['以色列人',   '耶路撒冷',   '摩西的律法', '大衛的子孫', '聖靈的恩賜'],
    verse_fact:   ['舊約時代',   '新約時代',   '曠野中',     '聖殿裡',     '會幕中'],
    person:       ['亞伯拉罕',   '摩西',       '大衛',       '以利亞',     '使徒保羅'],
    geography:    ['迦南地',     '埃及',       '巴比倫',     '羅馬',       '耶利哥城'],
    theology:     ['恩典',       '救贖',       '審判',       '聖潔',       '復活'],
    lexicon:      ['希伯來文',   '希臘文',     '亞蘭文',     '拉丁文',     '敘利亞文'],
    default:      ['以色列',     '大衛',       '摩西',       '迦南地',     '耶路撒冷'],
};

// 常見聖經數字池（用於數字型答案的靜態備用）
const BIBLE_NUMBERS = [1, 3, 5, 7, 10, 12, 14, 20, 21, 30, 35, 40, 49, 50, 70, 77, 100, 120, 153, 400, 430, 480];

/**
 * 判斷答案是否為數字型（純數字或數字+單位）
 * e.g. "40年", "七次", "120人", "3天"
 */
export function detectAnswerType(answer) {
    if (!answer) return 'other';
    const a = answer.trim();
    if (/^\d+[年月日天次人位代個塊碗]?$/.test(a)) return 'number';
    if (/^[零一二三四五六七八九十百千萬兩]+[年月日天次人位代個塊碗]/.test(a)) return 'number';
    return 'other';
}

/**
 * 為數字型答案生成靜態備用誘餌（相近量級，相同單位）
 */
function getNumericFallbacks(answer, count = 3) {
    const unitMatch = answer.trim().match(/[年月日天次人位代個塊碗]$/);
    const unit = unitMatch ? unitMatch[0] : '';
    const numMatch = answer.trim().match(/\d+/);
    const correctNum = numMatch ? parseInt(numMatch[0]) : 0;

    return BIBLE_NUMBERS
        .filter(n => n !== correctNum)
        .sort(() => Math.random() - 0.5)
        .slice(0, count)
        .map(n => `${n}${unit}`);
}

async function supplementDistractors(q, count = 3) {
    const TIMEOUT_MS = 15000;
    const correctAnswerNorm = (q.answer || '').trim();
    const answerType = detectAnswerType(correctAnswerNorm);

    const sanitize = (arr) => [...new Set(
        (arr || [])
            .map(d => (d || '').trim())
            .filter(d => d.length > 0 && d !== correctAnswerNorm)
    )].slice(0, count);

    try {
        const contextLine = q.book ? `Bible Book Context: ${q.book}${q.chapter ? ' Ch.' + q.chapter : ''}` : '';
        const evidenceLine = q.evidence ? `\nRelated Verse/Evidence: ${q.evidence}` : '';
        
        const isLongAnswer = correctAnswerNorm.length > 8;
        
        const prompt = `任務：為以下聖經問題生成 ${count} 個錯誤選項（誘餌）。
規則：
1. 必須與正確答案屬於「相同屬性或類別」（例如：正解是人名，錯項就必須是聖經中的其他人名）。
2. 【極重要】錯項必須在「結構、格式與字數」上盡可能模仿正確答案。例如正解是「三個字+門」(如便雅敏門)，錯項也必須是「三個字+門」(如以法蓮門)；若正解是名字，錯項必須也是名字。
3. 必須具有「高度迷惑性」，看起來非常合理，但對這題來說「絕對錯誤」。
4. 嚴格輸出單純的「逗號分隔字串」，不要引號、不要解釋、不要編號。
5. 為了排版美觀，每個錯誤選項的長度「盡量不超過 12 個中文字」。
${isLongAnswer ? '6. 由於正解是長句，錯誤選項的句型與節奏必須高度對稱。' : ''}

${contextLine}${evidenceLine}
問題：${q.question}
正確答案：${q.answer}

格式範例：錯誤選項1,錯誤選項2,錯誤選項3`;

        const SAFETY_OFF = [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
        ];

        let raw = await Promise.race([
            callGeminiRaw(prompt, {
                systemInstruction: `你是一個專業的聖經出題老師。嚴格只輸出逗號分隔的${count}個錯誤選項。`,
                maxOutputTokens: 100,
                temperature: 0.7,
                thinkingBudget: 0,
                priority: true,
                freeOnly: true,
                json: false,
                moduleName: 'distractor',
                safetySettings: SAFETY_OFF
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('distractor_timeout')), TIMEOUT_MS))
        ]);

        const distractors = sanitize(
            (raw || '').split(',').map(d => d.trim().replace(/^[\d\.\-\*\s]+/, ''))
        );
        if (distractors.length >= count) {
            return distractors;
        }
        throw new Error('insufficient_result');
    } catch (e) {
        if (e.message === 'distractor_timeout') {
            logger.warn(`⏱️ [QuestionCore] Distractor timeout (${TIMEOUT_MS}ms) for "${correctAnswerNorm}", using fallback.`);
        }

        // 數字型：用相近量級的聖經數字組合
        if (answerType === 'number') {
            return getNumericFallbacks(correctAnswerNorm, count);
        }

        // 其他類型：依類別靜態備用池
        const pool = FALLBACK_DISTRACTORS[q.category] || FALLBACK_DISTRACTORS.default;
        return pool
            .filter(d => d !== correctAnswerNorm)
            .sort(() => Math.random() - 0.5)
            .slice(0, count);
    }
}

// 補題開關：可透過 admin API 動態切換 (依據老C要求，預設關閉)
let _replenishEnabled = false;
export function setReplenishEnabled(enabled) { _replenishEnabled = !!enabled; }
export function getReplenishEnabled() { return _replenishEnabled; }

async function replenishStock(book, count = 10, options = {}) {
    if (!_replenishEnabled) {
        logger.info(`⏸️  [QuestionCore] Replenishment paused (disabled by admin).`);
        return [];
    }
    logger.info(`🔄 [QuestionCore] Replenishing stock for ${book} (${count} q's)...`);
    const segments = await ContentManager.getMultiSegmentContext(book, [], options.version || 'unv');
    return await generateBatch({ book, segments, count, options });
}

function isAIAvailable() { return LogosEngine !== undefined; }

async function generateBatch(params = {}, dependencies = {}) {
    const { book, segments, count = 8, mode = 'trivia', options = {}, excludeList = [] } = params;
    const stdBook = bibleTranslator.toChinese(book);
    // V4 production gate: a registry flag is authoritative.  A disabled
    // corpus must fail before any model call or static generated fallback.
    const corpusGuard = dependencies.corpusGuard || requireNewQuestionCorpus;
    await corpusGuard(options.version || params.version || 'CUV_TRAD');
    try {
        // [SOVEREIGN V3.12] Payload 降壓：限制傳送給 AI 的上下文片段數
        const prunedSegments = Array.isArray(segments) ? segments.slice(0, 10) : segments;

        const {
            categoryQuota,
            sovereignInsights,
            target_category,
            target_difficulty_band,
            target_score_range,
            preferred_verse_window,
            avoid_verse_windows
        } = options;

        const generationKeyPolicy = getGenerationKeyPolicy(options);
        const batchResults = await LogosEngine.askBrain(
            mode === 'expedition' ? 'batch_expedition' : 'batch_questions',
            {
                book: stdBook,
                version: options.version || params.version || 'CUV_TRAD',
                count,
                segments: prunedSegments,
                categoryQuota: categoryQuota || "25% person, 25% geography, 50% verse_fact", // 預設安全配額
                sovereignInsights: sovereignInsights || null,
                target_category: target_category || null,
                target_difficulty_band: target_difficulty_band || null,
                target_score_range: target_score_range || null,
                preferred_verse_window: preferred_verse_window || null,
                avoid_verse_windows: avoid_verse_windows || null,
                excludeList: Array.from(excludeList)
            },
            {
                ...options,
                priority: true,
                ...generationKeyPolicy
            }
        );
        
        if (!batchResults || batchResults.error) {
            if (mode === 'patrol') throw new Error(batchResults?.error || 'AI Generation Failed');
            return [];
        }

        // 取得題目列表並過濾掉生成失敗 (need_more_context) 或嚴格缺失的資料
        const validQuestions = (batchResults.questions || []).filter(q => {
            if (!q || q.status !== 'success') return false;
            if ((q.question || '').trim().length <= 5 || (q.answer || '').trim().length === 0) return false;
            if (!isGeneratedCategoryAllowed(q, target_category)) {
                logger.warn(`[QuestionCore] Rejected generated category ${q.category}; expected ${target_category}`);
                return false;
            }
            const locationCheck = validateGeneratedQuestionLocation(q, prunedSegments, stdBook);
            if (!locationCheck.ok) {
                logger.warn(`[QuestionCore] Rejected generated question location: ${locationCheck.reason}`);
                return false;
            }
            const difficultyScope = validateGeneratedDifficultyScope(q, target_difficulty_band);
            if (!difficultyScope.ok) {
                logger.warn(`[QuestionCore] Rejected generated difficulty scope: ${difficultyScope.reason}`);
                return false;
            }
            return true;
        });

        return validQuestions.map(q => {
            const cleaned = normalizeQuestionData(q);

            // 種子階段僅保留題目與正解；入庫前由 QuestionPipeline 完成誘餌與聯合審核。
            const correctIndex = null;

            // [SOVEREIGN V4.3] 解析節號範圍以供高品質資料庫索引
            const locationCheck = validateGeneratedQuestionLocation(q, prunedSegments, stdBook);
            let verseStart = null, verseEnd = null;
            if (cleaned.verseRef) {
                const parts = cleaned.verseRef.split(':');
                const rangePart = parts[parts.length - 1];
                if (rangePart) {
                    const rangeMatch = rangePart.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
                    if (rangeMatch) {
                        verseStart = parseInt(rangeMatch[1]);
                        verseEnd = rangeMatch[2] ? parseInt(rangeMatch[2]) : verseStart;
                    }
                }
            }

            // 取得片段中定義的 chapter
            verseStart = locationCheck.location.verseStart;
            verseEnd = locationCheck.location.verseEnd;
            const chapter = locationCheck.location.chapter;

            // [SOVEREIGN V5.0 + Hybrid Scoring] 產生基礎權重分數
            const difficultyData = scoreQuestionDifficulty(cleaned);

            return {
                ...cleaned,
                id: `live_${crypto.randomUUID()}`,
                options: null,
                correctIndex,
                book: stdBook,
                chapter: chapter,
                version: params.options?.version || 'CUV_TRAD',
                generation_target_difficulty_band: target_difficulty_band || null,
                quality_model: options.model || null,
                verse_start: verseStart,
                verse_end: verseEnd,
                verse_ref: cleaned.verseRef,
                // 打上新版難度分數
                ...difficultyData
            };
        });
    } catch (e) {
        if (mode === 'patrol') throw e;
        logger.warn(`[QuestionCore V4] Generation failed for ${stdBook}; no synthetic fallback will be stored: ${e.message}`);
        return [];
    }
}

function getStaticTrivia(book, count = 1) {
    const stdBook = bibleTranslator.toChinese(book);
    // Fallback since staticTrivia.json is actually containing strings of facts, not question objects.
    return Array.from({ length: 1 }).map((_, i) => ({
        id: `static_${crypto.randomUUID()}`,
        question: `目前伺服器正忙碌中，關於《${stdBook}》的題目需要點時間整理。`,
        options: ["稍後重試", "喝杯水", "深呼吸", "繼續等待"],
        correctIndex: 0,
        evidence: "箴言 3:5 你要專心仰賴耶和華",
        category: "verse_fact",
        book: stdBook
    }));
}

// 遠征隨機出題用的書卷池（涵蓋新舊約常見段落）
const EXPEDITION_BOOK_POOL = [
    '創世記', '出埃及記', '詩篇', '箴言', '以賽亞書',
    '馬太福音', '馬可福音', '路加福音', '約翰福音',
    '使徒行傳', '羅馬書', '哥林多前書', '加拉太書',
    '以弗所書', '希伯來書', '啟示錄'
];

/**
 * 從題庫隨機撈一題遠征用題（排除已答過的 id）
 */
async function drawFromBank(excludeIds = []) {
    try {
        const excludedRows = excludeIds.length > 0
            ? await dbOps.gamesDb.query(`
                SELECT id, question, answer, book, chapter, semantic_group_key
                FROM questions WHERE id = ANY($1::text[])
            `, [excludeIds])
            : [];
        const excludedSemanticGroups = new Set(excludedRows.map(row =>
            row.semanticGroupKey ?? row.semantic_group_key ?? buildSemanticGroupKey(row)
        ));
        const qualityMode = getQuestionQualityMode();
        const qualityOrder = qualityMode === 'shadow'
            ? ''
            : "CASE WHEN quality_state = 'VERIFIED' THEN 0 ELSE 1 END,";
        const rows = await dbOps.gamesDb.query(
            `SELECT * FROM questions
             WHERE status = 'PASS'
               AND (quality IS NULL OR quality NOT IN ('flagged', 'disabled'))
               AND ${getPlayableQualitySql(qualityMode)}
               AND char_length(question) >= 20
             ORDER BY ${qualityOrder} RANDOM()
             LIMIT 20`
        );
        if (!rows || rows.length === 0) return null;

        const playable = rows
            .map(row => ({ row, assembled: assembleVerifiedQuestion(row) }))
            .filter(item => item.assembled.ok)
            .filter(item => !excludedSemanticGroups.has(
                item.row.semanticGroupKey ?? item.row.semantic_group_key ?? buildSemanticGroupKey(item.row)
            ));
        if (playable.length === 0) return null;

        // 優先選未答過的題目
        const fresh = playable.filter(item => !excludeIds.includes(item.row.id));
        const chosen = fresh.length > 0
            ? fresh[Math.floor(Math.random() * fresh.length)]
            : playable[Math.floor(Math.random() * playable.length)]; // 全答過時循環
        const selectedRow = chosen.assembled.question;

        return {
            id: selectedRow.id,
            question: selectedRow.question,
            answer: selectedRow.answer,
            options: selectedRow.options,
            correctIndex: selectedRow.correctIndex,
            category: selectedRow.category || 'verse_fact',
            evidence: selectedRow.evidence || selectedRow.verse_ref || '',
            book: selectedRow.book,
            chapter: selectedRow.chapter,
            activeRevisionId: selectedRow.activeRevisionId ?? selectedRow.active_revision_id ?? null,
            source: selectedRow.verse_ref ? {
                book: selectedRow.book,
                chapter: selectedRow.chapter,
                verse: selectedRow.verse_ref
            } : null
        };
    } catch (e) {
        logger.warn(`[QuestionCore] drawFromBank failed: ${e.message}`);
        return null;
    }
}

async function generateQuestion(options) {
    const { book, chapter, mode, contextData } = options;
    const excludeIds = contextData?.answeredIds || [];

    // 遠征模式：只從合格題庫撈題。
    if (mode === 'expedition' || (!book && !chapter)) {
        // 1. 嘗試題庫
        const banked = await drawFromBank(excludeIds);
        if (banked) {
            logger.info(`[QuestionCore] ✅ Drew question from bank: ${banked.id}`);
            return banked;
        }

        logger.warn('[QuestionCore V4] Expedition inventory exhausted; foreground AI generation is disabled.');
        return null;
    }

    logger.warn(`[QuestionCore V4] Inventory exhausted for ${bibleTranslator.toChinese(book)} ${chapter}; foreground AI generation is disabled.`);
    return null;
}

async function getDidYouKnow(book, count = 1, options = {}) {
    // 直接抽取本地冷知識檔案，避免浪費 AI 生成的 30 秒
    const pool = (staticTrivia && staticTrivia.length > 0) ? staticTrivia : ["你知道嗎？聖經由40人寫成"];
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

const QuestionCore = { generateBatch, generateQuestion, getDidYouKnow, getStaticTrivia, isAIAvailable, supplementDistractors, replenishStock };
export { generateBatch, generateQuestion, getDidYouKnow, getStaticTrivia, isAIAvailable, supplementDistractors, replenishStock };
export default QuestionCore;
