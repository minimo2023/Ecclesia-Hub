/**
 * 遊戲資料庫操作
 * Games Database Operations (questions, leaderboard)
 * PostgreSQL Async Version
 */
import crypto from 'crypto';
import {
    QUESTION_QUALITY_STANDARD_VERSION,
    getPlayableQualitySql,
    getQuestionQualityMode
} from '../domains/game/quality/QuestionQualityPolicy.js';
import { normalizeDistractorSets } from '../domains/game/quality/QuestionOptionAssembler.js';
import { resolveBibleVersion } from '../domains/content/bible/BibleVersionRegistry.js';

const QUESTION_QUALITY_MODE = getQuestionQualityMode();
const PLAYABLE_QUALITY_PREDICATE = getPlayableQualitySql(QUESTION_QUALITY_MODE);
const VERIFIED_ORDER_SQL = QUESTION_QUALITY_MODE === 'shadow'
    ? ''
    : "CASE WHEN quality_state = 'VERIFIED' THEN 0 ELSE 1 END,";

const PRODUCTION_TEST_QUESTION_MARKERS = ['【JIT 測試】', '[JIT TEST]'];

function canonicalQuestionVersion(version = 'CUV_TRAD') {
    return resolveBibleVersion(version)?.canonicalVersion || String(version || 'CUV_TRAD');
}

const MIXED_TRADITIONAL_VERSIONS = ['CUV_TRAD', 'LCC_TRAD', 'CNV_TRAD', 'TCV2019_TRAD'];

function questionVersionFilter(version = 'CUV_TRAD') {
    const normalized = String(version || '').trim().toUpperCase();
    return ['MIXED', 'MIXED_TRAD', 'ALL'].includes(normalized)
        ? MIXED_TRADITIONAL_VERSIONS
        : [canonicalQuestionVersion(version)];
}

export function isProductionTestQuestion({ id = '', question = '' } = {}) {
    const normalizedId = String(id || '').trim().toLowerCase();
    const normalizedQuestion = String(question || '').trim().toUpperCase();
    return normalizedId.startsWith('test_')
        || PRODUCTION_TEST_QUESTION_MARKERS.some(marker => normalizedQuestion.includes(marker.toUpperCase()));
}

// 「可用庫存」必須能在遊戲請求內直接組成至少四個選項，不能依賴前台即時呼叫 AI。
const PLAYABLE_QUESTION_PREDICATE = `
    question IS NOT NULL
    AND BTRIM(question) <> ''
    AND LEFT(LOWER(id), 5) <> 'test_'
    AND question NOT ILIKE '%【JIT 測試】%'
    AND answer IS NOT NULL
    AND BTRIM(answer) <> ''
    AND publication_state = 'PUBLISHED'
    AND active_revision_id IS NOT NULL
    AND quality_standard_version = 'question_quality_v4_1'
    AND version IS NOT NULL
    AND BTRIM(version) <> ''
    AND verse_start IS NOT NULL
    AND verse_ref IS NOT NULL
    AND BTRIM(verse_ref) <> ''
    AND final_difficulty_score IS NOT NULL
    AND difficulty_band IS NOT NULL
    AND jsonb_typeof(distractors_pool) = 'array'
    AND jsonb_array_length(distractors_pool) > 0
    AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(distractors_pool) AS candidate(value)
        WHERE jsonb_typeof(candidate.value) <> 'array'
           OR jsonb_array_length(candidate.value) < 3
    )
    AND (
        SELECT audit.result
        FROM question_quality_audits audit
        WHERE audit.question_id = questions.id
          AND audit.revision_id = active_revision_id
        ORDER BY audit.created_at DESC
        LIMIT 1
    ) = 'PASS'
`;

function assertPublishableGeneratedQuestion(data) {
    const status = String(data?.status || '').toUpperCase();
    const qualityState = String(data?.quality_state || data?.qualityState || '').toUpperCase();
    if (status !== 'PASS' || qualityState !== 'VERIFIED') {
        throw new Error('UNPUBLISHABLE_QUESTION:PASS_AND_VERIFIED_REQUIRED');
    }

    const rawPool = data?.distractors_pool ?? data?.distractorsPool;
    if (!Array.isArray(rawPool) || rawPool.length === 0 || rawPool.some(set => !Array.isArray(set) || set.length < 3)) {
        throw new Error('UNPUBLISHABLE_QUESTION:STANDARD_DISTRACTOR_POOL_REQUIRED');
    }
    const validSets = normalizeDistractorSets(rawPool, data.answer);
    if (validSets.length !== rawPool.length) {
        throw new Error('UNPUBLISHABLE_QUESTION:DISTRACTOR_POOL_FAILED_LOCAL_VALIDATION');
    }

    if (!Number.isFinite(Number(data?.final_difficulty_score)) || !data?.difficulty_band) {
        throw new Error('UNPUBLISHABLE_QUESTION:DIFFICULTY_RESULT_REQUIRED');
    }

    const audits = Array.isArray(data?.quality_audits)
        ? data.quality_audits
        : (data?.quality_audit ? [data.quality_audit] : []);
    if (audits.length < 2) {
        throw new Error('UNPUBLISHABLE_QUESTION:DOUBLE_AUDIT_REQUIRED');
    }

    const version = data.version || 'CUV_TRAD';
    for (const audit of audits.slice(-2)) {
        const riskFlags = audit?.riskFlags ?? audit?.risk_flags ?? [];
        const evidence = audit?.evidenceSnapshot ?? audit?.evidence_snapshot;
        const rawResult = audit?.rawResult ?? audit?.raw_result;
        const distractorResults = audit?.distractorResults ?? audit?.distractor_results ?? [];
        if (String(audit?.result || '').toUpperCase() !== 'PASS'
            || (Array.isArray(riskFlags) && riskFlags.length > 0)
            || !evidence?.available
            || evidence.version !== version
            || String(rawResult?.verdict || '').toUpperCase() !== 'PASS'
            || !Array.isArray(distractorResults)
            || distractorResults.length === 0) {
            throw new Error('UNPUBLISHABLE_QUESTION:DOUBLE_AUDIT_NOT_PUBLISHABLE');
        }
    }

    return { audits, distractorSets: validSets };
}

/**
 * 建立遊戲操作模組
 * @param {DatabaseAdapter} gamesDb - Async Database Adapter (PostgresAdapter)
 */
export function createGamesOps(gamesDb) {
    return {
        /**
         * 更新題目誘餌選項池（背景生成後寫回 DB，供下次遊戲直接使用）
         * @param {string} id - 題目 ID
         * @param {Array}  distractorsPool - 多組誘餌 [[d1,d2,d3],[d1,d2,d3],...]
         * @param {Array}  [options]        - 已組裝的完整選項陣列（可選）
         * @param {number} [correctIndex]   - 正解索引（可選）
         */
        async updateQuestionDistractors(id, distractorsPool, options, correctIndex) {
            if (options != null && correctIndex != null) {
                // 完整更新：distractors_pool + options + correct_index
                await gamesDb.run(`
                    UPDATE questions
                    SET distractors_pool = $1,
                        options = $2,
                        correct_index = $3,
                        updated_at = $4
                    WHERE id = $5
                `, [JSON.stringify(distractorsPool), JSON.stringify(options), correctIndex, new Date().toISOString(), id]);
            } else {
                // 僅更新 distractors_pool（不動 options，保留原始選項格式）
                await gamesDb.run(`
                    UPDATE questions
                    SET distractors_pool = $1,
                        updated_at = $2
                    WHERE id = $3
                `, [JSON.stringify(distractorsPool), new Date().toISOString(), id]);
            }
        },

        /**
         * 儲存單一題目
         */
        async saveQuestion(docId, data) {
            await gamesDb.run(`
                INSERT INTO questions (
                    id, book, chapter, verse_ref, 
                    question, options, answer, correct_index, explanation, 
                    evidence, category, source, status, quality, 
                    audit_reason, auditor_version,
                    final_difficulty_score, rule_difficulty_score, difficulty_band, difficulty_flags, difficulty_breakdown, difficulty_score_source, difficulty_scored_at,
                    judge_prompt_version, judge_roles, ai_judge_a_score, ai_judge_a_role, ai_judge_b_score, ai_judge_b_role, ai_judge_avg, ai_judge_delta, rule_ai_delta, ai_consistency, rule_validity, final_difficulty_source, final_difficulty_confidence,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
                ON CONFLICT (id) DO UPDATE SET
                    book = EXCLUDED.book, chapter = EXCLUDED.chapter, 
                    verse_ref = EXCLUDED.verse_ref,
                    question = EXCLUDED.question, options = EXCLUDED.options,
                    answer = EXCLUDED.answer, correct_index = EXCLUDED.correct_index,
                    explanation = EXCLUDED.explanation, evidence = EXCLUDED.evidence,
                    category = EXCLUDED.category, status = EXCLUDED.status,
                    quality = EXCLUDED.quality,
                    audit_reason = EXCLUDED.audit_reason,
                    auditor_version = EXCLUDED.auditor_version,
                    final_difficulty_score = EXCLUDED.final_difficulty_score,
                    rule_difficulty_score = EXCLUDED.rule_difficulty_score,
                    difficulty_band = EXCLUDED.difficulty_band,
                    difficulty_flags = EXCLUDED.difficulty_flags,
                    difficulty_breakdown = EXCLUDED.difficulty_breakdown,
                    difficulty_score_source = EXCLUDED.difficulty_score_source,
                    difficulty_scored_at = EXCLUDED.difficulty_scored_at,
                    judge_prompt_version = EXCLUDED.judge_prompt_version,
                    judge_roles = EXCLUDED.judge_roles,
                    ai_judge_a_score = EXCLUDED.ai_judge_a_score,
                    ai_judge_a_role = EXCLUDED.ai_judge_a_role,
                    ai_judge_b_score = EXCLUDED.ai_judge_b_score,
                    ai_judge_b_role = EXCLUDED.ai_judge_b_role,
                    ai_judge_avg = EXCLUDED.ai_judge_avg,
                    ai_judge_delta = EXCLUDED.ai_judge_delta,
                    rule_ai_delta = EXCLUDED.rule_ai_delta,
                    ai_consistency = EXCLUDED.ai_consistency,
                    rule_validity = EXCLUDED.rule_validity,
                    final_difficulty_source = EXCLUDED.final_difficulty_source,
                    final_difficulty_confidence = EXCLUDED.final_difficulty_confidence,
                    updated_at = EXCLUDED.updated_at
            `, [
                docId,
                data.book,
                data.chapter,
                data.verseRef || '',
                data.question,
                data.options ? JSON.stringify(data.options) : null,
                data.answer,
                data.correctIndex !== undefined ? data.correctIndex : null,
                data.explanation || '',
                data.evidence || '',
                data.category || 'verse_fact',
                data.source || 'api',
                data.status || 'PASS',
                data.quality || null,
                data.audit_reason || null,
                data.auditor_version || null,
                data.final_difficulty_score || null,
                data.rule_difficulty_score || null,
                data.difficulty_band || null,
                data.difficulty_flags ? JSON.stringify(data.difficulty_flags) : null,
                data.difficulty_breakdown ? JSON.stringify(data.difficulty_breakdown) : null,
                data.difficulty_score_source || null,
                data.difficulty_scored_at ? new Date(data.difficulty_scored_at) : null,
                data.judge_prompt_version || null,
                data.judge_roles ? JSON.stringify(data.judge_roles) : null,
                data.ai_judge_a_score || null,
                data.ai_judge_a_role || null,
                data.ai_judge_b_score || null,
                data.ai_judge_b_role || null,
                data.ai_judge_avg || null,
                data.ai_judge_delta || null,
                data.rule_ai_delta || null,
                data.ai_consistency || null,
                data.rule_validity || null,
                data.final_difficulty_source || null,
                data.final_difficulty_confidence || null,
                data.createdAt ? new Date(data.createdAt) : new Date(),
                new Date()
            ]);
            return docId;
        },

        /**
         * 取得單一題目
         */
        async getQuestion(docId) {
            const row = await gamesDb.get('SELECT * FROM questions WHERE id = ?', [docId]);
            // PostgresAdapter already handles camelization and JSON parsing
            return row || null;
        },

        /**
         * 查詢題目
         * 注意：預設排除 flagged 和 disabled 狀態的題目（系統規則）
         */
        async queryQuestions(conditions = {}) {
            try {
                const { books, limit, random, includeAllStatus, ...otherConditions } = conditions;

                let query = 'SELECT * FROM questions';
                const whereClauses = [];
                const params = [];

                // 系統規則：預設排除 flagged 和 disabled 題目
                if (!includeAllStatus) {
                    whereClauses.push(`(quality IS NULL OR quality NOT IN ('flagged', 'disabled'))`);
                }

                if (books) {
                    const bookList = books.split(',').map(b => b.trim()).filter(b => b);
                    if (bookList.length > 0) {
                        const placeholders = bookList.map(() => '?').join(',');
                        whereClauses.push(`book IN (${placeholders})`);
                        params.push(...bookList);
                    }
                }

                for (const [key, value] of Object.entries(otherConditions)) {
                    whereClauses.push(`${key} = ?`);
                    params.push(value);
                }

                if (whereClauses.length > 0) {
                    query += ` WHERE ${whereClauses.join(' AND ')}`;
                }

                if (random === 'true') query += ' ORDER BY RANDOM()';
                if (limit) {
                    query += ' LIMIT ?';
                    params.push(parseInt(limit, 10));
                }

                const rows = await gamesDb.query(query, params);
                return rows; // PostgresAdapter already handles camelization and JSON parsing
            } catch (error) {
                console.error('Query questions error:', error);
                return [];
            }
        },

        /**
         * 計數題目
         */
        async countQuestions(conditions = {}) {
            if (Object.keys(conditions).length === 0) {
                const result = await gamesDb.get('SELECT COUNT(*) as c FROM questions');
                return result ? result.c : 0;
            }
            const questions = await this.queryQuestions(conditions);
            return questions.length;
        },

        /**
         * 刪除題目
         */
        async deleteQuestion(docId) {
            await gamesDb.run('DELETE FROM questions WHERE id = ?', [docId]);
        },

        /** 撈取干擾項池少於兩組的 PASS 題，既有 options 不再排除。 */
        async getPassQuestionsWithoutDistractors(limit = 5) {
            try {
                const rows = await gamesDb.query(
                    `SELECT id, question, answer, book, chapter, verse_ref, verse_start, verse_end,
                            category, version, options, correct_index, distractors_pool,
                            quality_state, quality_standard_version
                     FROM questions
                     WHERE status = 'PASS'
                       AND (
                            distractors_pool IS NULL
                            OR jsonb_typeof(distractors_pool) <> 'array'
                            OR jsonb_array_length(distractors_pool) = 0
                            OR jsonb_typeof(distractors_pool -> 0) = 'string'
                            OR jsonb_array_length(distractors_pool) < 2
                       )
                     ORDER BY
                        CASE WHEN verse_start IS NOT NULL AND verse_ref IS NOT NULL THEN 0 ELSE 1 END,
                        quality_checked_at NULLS FIRST,
                        RANDOM()
                     LIMIT ?`,
                    [limit]
                );
                return rows || [];
            } catch (e) {
                console.error('[DB] getPassQuestionsWithoutDistractors error:', e.message);
                return [];
            }
        },

        /**
         * 更新題目的難度分數（供 QuizEngine 背景補分、海巡艦隊補分使用）
         * @param {string} id  題目 ID
         * @param {Object} sd  scoreQuestionDifficulty() 的回傳值
         */
        async updateQuestionDifficultyScore(id, sd) {
            try {
                await gamesDb.run(
                    `UPDATE questions SET
                        rule_difficulty_score       = $1,
                        final_difficulty_score      = $2,
                        difficulty_band             = $3,
                        difficulty_flags            = $4,
                        difficulty_breakdown        = $5,
                        difficulty_score_source     = $6,
                        final_difficulty_source     = $7,
                        final_difficulty_confidence = $8,
                        difficulty_scored_at        = $9,
                        updated_at                  = NOW()
                     WHERE id = $10`,
                    [
                        sd.rule_difficulty_score  ?? null,
                        sd.final_difficulty_score ?? null,
                        sd.difficulty_band        ?? null,
                        sd.difficulty_flags       ? JSON.stringify(sd.difficulty_flags)     : null,
                        sd.difficulty_breakdown   ? JSON.stringify(sd.difficulty_breakdown) : null,
                        sd.difficulty_score_source  ?? null,
                        sd.final_difficulty_source  ?? null,
                        sd.final_difficulty_confidence != null ? sd.final_difficulty_confidence : null,
                        sd.difficulty_scored_at   ?? null,
                        id
                    ]
                );
            } catch (e) {
                console.error(`[DB] updateQuestionDifficultyScore(${id}) error:`, e.message);
                throw e;
            }
        },

        /**
         * 撈取 PASS 但尚未計算難度分數的題目（供海巡艦隊補算使用）
         * @param {number} limit - 最多撈幾題
         * @returns {Array} 題目陣列
         */
        async getPassQuestionsWithoutScore(limit = 5) {
            try {
                const rows = await gamesDb.query(
                    `SELECT id, question, answer, book, chapter, category, difficulty, version,
                            ai_difficulty_score, rule_difficulty_score
                     FROM questions
                     WHERE status = 'PASS'
                       AND final_difficulty_score IS NULL
                     ORDER BY RANDOM()
                     LIMIT $1`,
                    [limit]
                );
                return rows || [];
            } catch (e) {
                console.error('[DB] getPassQuestionsWithoutScore error:', e.message);
                return [];
            }
        },

        /**
         * 取得題數最少的卷別 (用於補題優先順序)
         * @param {number} limit - 最多回傳幾筆
         * @param {string|null} version - 指定譯本（獨立計數）；null = 全部合計
         */
        async getLeastUsedBooks(limit = 5, version = null) {
            try {
                let rows;
                if (version) {
                    // [SOVEREIGN] 依譯本獨立計數：每個 (book, version) 各自計算
                    rows = await gamesDb.query(`
                        SELECT book, version, COUNT(*) as question_count
                        FROM questions
                        WHERE status = 'PASS' AND version = $1
                        GROUP BY book, version
                        ORDER BY question_count ASC
                        LIMIT $2
                    `, [version, limit]);
                } else {
                    // 無指定譯本：回傳各 (book, version) 分組統計
                    rows = await gamesDb.query(`
                        SELECT book, version, COUNT(*) as question_count
                        FROM questions
                        WHERE status = 'PASS'
                        GROUP BY book, version
                        ORDER BY question_count ASC
                        LIMIT $1
                    `, [limit]);
                }
                return rows || [];
            } catch (error) {
                console.error('❌ [gamesOps] getLeastUsedBooks error:', error.message);
                return [];
            }
        },

        /**
         * 批次儲存題目 (使用 Transaction)
         */
        async batchSaveQuestions(items) {
            return await gamesDb.transaction(async (tx) => {
                const results = [];
                for (const item of items) {
                    const docId = item.id || crypto.randomUUID();
                    const data = item.data || item;
                    const publication = assertPublishableGeneratedQuestion(data);

                    if (isProductionTestQuestion({ id: docId, question: data.question })) {
                        throw new Error(`PRODUCTION_TEST_QUESTION_BLOCKED:${docId}`);
                    }

                    const existing = await tx.get('SELECT id FROM questions WHERE id = $1 FOR UPDATE', [docId]);
                    if (existing) {
                        throw new Error(`QUESTION_ALREADY_EXISTS_REQUIRES_REVISION:${docId}`);
                    }

                    await tx.run(`
                        INSERT INTO questions (
                            id, book, chapter, verse_ref, verse_start, verse_end,
                            question, options, answer, correct_index, explanation, 
                            evidence, category, source, status, quality,
                            audit_reason, auditor_version,
                            version, hash_exact,
                            final_difficulty_score, rule_difficulty_score, difficulty_band, difficulty_flags, difficulty_breakdown, difficulty_score_source, difficulty_scored_at,
                            judge_prompt_version, judge_roles, ai_judge_a_score, ai_judge_a_role, ai_judge_b_score, ai_judge_b_role, ai_judge_avg, ai_judge_delta, rule_ai_delta, ai_consistency, rule_validity, final_difficulty_source, final_difficulty_confidence,
                            ai_difficulty_score, ai_difficulty_reason_general_believer, ai_difficulty_reason_seminary_student,
                            distractors_pool,
                            quality_state, quality_standard_version, quality_checked_at,
                            semantic_group_key, semantic_duplicate_of, semantic_checked_at, semantic_check_version,
                            created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53)
                        ON CONFLICT (id) DO UPDATE SET
                            book = EXCLUDED.book, chapter = EXCLUDED.chapter,
                            verse_ref = EXCLUDED.verse_ref,
                            verse_start = EXCLUDED.verse_start,
                            verse_end = EXCLUDED.verse_end,
                            question = EXCLUDED.question, options = EXCLUDED.options,
                            answer = EXCLUDED.answer, correct_index = EXCLUDED.correct_index,
                            explanation = EXCLUDED.explanation, evidence = EXCLUDED.evidence,
                            category = EXCLUDED.category, status = EXCLUDED.status,
                            quality = EXCLUDED.quality,
                            audit_reason = EXCLUDED.audit_reason,
                            auditor_version = EXCLUDED.auditor_version,
                            version = EXCLUDED.version,
                            final_difficulty_score = EXCLUDED.final_difficulty_score,
                            rule_difficulty_score = EXCLUDED.rule_difficulty_score,
                            difficulty_band = EXCLUDED.difficulty_band,
                            difficulty_flags = EXCLUDED.difficulty_flags,
                            difficulty_breakdown = EXCLUDED.difficulty_breakdown,
                            difficulty_score_source = EXCLUDED.difficulty_score_source,
                            difficulty_scored_at = EXCLUDED.difficulty_scored_at,
                            judge_prompt_version = EXCLUDED.judge_prompt_version,
                            judge_roles = EXCLUDED.judge_roles,
                            ai_judge_a_score = EXCLUDED.ai_judge_a_score,
                            ai_judge_a_role = EXCLUDED.ai_judge_a_role,
                            ai_judge_b_score = EXCLUDED.ai_judge_b_score,
                            ai_judge_b_role = EXCLUDED.ai_judge_b_role,
                            ai_judge_avg = EXCLUDED.ai_judge_avg,
                            ai_judge_delta = EXCLUDED.ai_judge_delta,
                            rule_ai_delta = EXCLUDED.rule_ai_delta,
                            ai_consistency = EXCLUDED.ai_consistency,
                            rule_validity = EXCLUDED.rule_validity,
                            final_difficulty_source = EXCLUDED.final_difficulty_source,
                            final_difficulty_confidence = EXCLUDED.final_difficulty_confidence,
                            ai_difficulty_score = EXCLUDED.ai_difficulty_score,
                            ai_difficulty_reason_general_believer = EXCLUDED.ai_difficulty_reason_general_believer,
                            ai_difficulty_reason_seminary_student = EXCLUDED.ai_difficulty_reason_seminary_student,
                            distractors_pool = EXCLUDED.distractors_pool,
                            quality_state = EXCLUDED.quality_state,
                            quality_standard_version = EXCLUDED.quality_standard_version,
                            quality_checked_at = EXCLUDED.quality_checked_at,
                            semantic_group_key = EXCLUDED.semantic_group_key,
                            semantic_duplicate_of = EXCLUDED.semantic_duplicate_of,
                            semantic_checked_at = EXCLUDED.semantic_checked_at,
                            semantic_check_version = EXCLUDED.semantic_check_version,
                            updated_at = EXCLUDED.updated_at
                    `, [
                        docId,
                        data.book,
                        data.chapter,
                        data.verseRef || data.verse_ref || '',
                        data.verse_start || null,
                        data.verse_end || null,
                        data.question,
                        data.options ? JSON.stringify(data.options) : null,
                        data.answer,
                        data.correctIndex !== undefined ? data.correctIndex : (data.correct_index !== undefined ? data.correct_index : null),
                        data.explanation || '',
                        data.evidence || '',
                        data.category || 'verse_fact',
                        data.source || 'api',
                        data.status || 'PASS',
                        data.quality || null,
                        data.audit_reason || null,
                        data.auditor_version || null,
                        data.version || 'CUV_TRAD', // [SOVEREIGN] 顯式持久化譯本來源
                        data.hash_exact || null,
                        data.final_difficulty_score !== undefined ? data.final_difficulty_score : null,
                        data.rule_difficulty_score !== undefined ? data.rule_difficulty_score : null,
                        data.difficulty_band || null,
                        data.difficulty_flags ? JSON.stringify(data.difficulty_flags) : null,
                        data.difficulty_breakdown ? JSON.stringify(data.difficulty_breakdown) : null,
                        data.difficulty_score_source || null,
                        data.difficulty_scored_at ? new Date(data.difficulty_scored_at) : null,
                        data.judge_prompt_version || null,
                        data.judge_roles ? JSON.stringify(data.judge_roles) : null,
                        data.ai_judge_a_score !== undefined ? data.ai_judge_a_score : null,
                        data.ai_judge_a_role || null,
                        data.ai_judge_b_score !== undefined ? data.ai_judge_b_score : null,
                        data.ai_judge_b_role || null,
                        data.ai_judge_avg !== undefined ? data.ai_judge_avg : null,
                        data.ai_judge_delta !== undefined ? data.ai_judge_delta : null,
                        data.rule_ai_delta !== undefined ? data.rule_ai_delta : null,
                        data.ai_consistency || null,
                        data.rule_validity || null,
                        data.final_difficulty_source || null,
                        data.final_difficulty_confidence !== undefined ? data.final_difficulty_confidence : null,
                        // AI 難度三欄（追溯審核依據）
                        data.ai_difficulty_score !== undefined ? data.ai_difficulty_score : null,
                        data.ai_difficulty_reason_general_believer || null,
                        data.ai_difficulty_reason_seminary_student || null,
                        // 誘餌池（必須是 array of arrays）
                        JSON.stringify(publication.distractorSets),
                        // The row cannot become VERIFIED until its approved revision and
                        // audit records exist later in this same transaction.
                        'SCANNING',
                        QUESTION_QUALITY_STANDARD_VERSION,
                        data.quality_checked_at ? new Date(data.quality_checked_at) : null,
                        data.semantic_group_key || null,
                        data.semantic_duplicate_of || null,
                        data.semantic_checked_at ? new Date(data.semantic_checked_at) : null,
                        data.semantic_check_version || null,
                        data.createdAt ? new Date(data.createdAt) : new Date(),
                        new Date()
                    ]);

                    const revisionId = crypto.randomUUID();
                    const candidatePayload = {
                        question: data.question,
                        answer: data.answer,
                        options: null,
                        correct_index: null,
                        distractors_pool: publication.distractorSets,
                        explanation: data.explanation || '',
                        evidence: data.evidence || '',
                        evidence_ref: data.evidence_ref || data.evidenceRef || null,
                        evidence_quote: data.evidence_quote || data.evidenceQuote || null,
                        category: data.category || 'verse_fact',
                        difficulty: data.difficulty || data.difficulty_band || null,
                        final_difficulty_score: data.final_difficulty_score,
                        difficulty_band: data.difficulty_band,
                        ai_difficulty_score: data.ai_difficulty_score ?? null,
                        ai_difficulty_reason_general_believer: data.ai_difficulty_reason_general_believer || null,
                        ai_difficulty_reason_seminary_student: data.ai_difficulty_reason_seminary_student || null,
                        book: data.book,
                        chapter: data.chapter,
                        verse_start: data.verse_start || null,
                        verse_end: data.verse_end || null,
                        verse_ref: data.verseRef || data.verse_ref || '',
                        version: data.version || 'CUV_TRAD'
                    };
                    await tx.run(`
                        INSERT INTO question_revisions
                            (id, question_id, revision_number, state, source, created_by,
                             previous_payload, candidate_payload, reviewed_at, reviewed_by)
                        VALUES ($1,$2,1,'APPROVED','AUTO_GENERATION_V4_1','system:new-question',
                                '{}'::jsonb,$3::jsonb,CURRENT_TIMESTAMP,'system:auto-publish')
                    `, [revisionId, docId, JSON.stringify(candidatePayload)]);

                    for (const audit of publication.audits) {
                        await tx.run(`
                            INSERT INTO question_quality_audits
                                (id, question_id, revision_id, standard_version, result, reason,
                                 risk_flags, distractor_results, evidence_snapshot, difficulty_snapshot, raw_result)
                            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)
                        `, [
                            crypto.randomUUID(),
                            docId,
                            revisionId,
                            QUESTION_QUALITY_STANDARD_VERSION,
                            audit.result,
                            audit.reason || null,
                            JSON.stringify(audit.riskFlags || []),
                            JSON.stringify(audit.distractorResults || []),
                            audit.evidenceSnapshot ? JSON.stringify(audit.evidenceSnapshot) : null,
                            audit.difficultySnapshot ? JSON.stringify(audit.difficultySnapshot) : null,
                            audit.rawResult ? JSON.stringify(audit.rawResult) : null
                        ]);
                    }
                    await tx.run(`
                        UPDATE questions
                        SET active_revision_id = $1,
                            quality_state = 'VERIFIED',
                            publication_state = 'PUBLISHED',
                            publication_state_reason = NULL,
                            publication_state_changed_at = CURRENT_TIMESTAMP,
                            legacy_version_code = COALESCE(legacy_version_code, version),
                            canonical_version = CASE LOWER(COALESCE(version, ''))
                                WHEN 'unv' THEN 'CUV_TRAD'
                                WHEN 'cuv_trad' THEN 'CUV_TRAD'
                                WHEN 'cnv_trad' THEN 'CNV_TRAD'
                                WHEN 'lcc_trad' THEN 'LCC_TRAD'
                                WHEN 'tcv2010_trad' THEN 'TCV2019_TRAD'
                                WHEN 'tcv2019_trad' THEN 'TCV2019_TRAD'
                                ELSE version
                            END,
                            quality_standard_version = $2,
                            quality_checked_at = CURRENT_TIMESTAMP,
                            quality = 'good',
                            verified = TRUE,
                            status = 'PASS',
                            options = NULL,
                            correct_index = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $3
                    `, [revisionId, QUESTION_QUALITY_STANDARD_VERSION, docId]);
                    results.push(docId);
                }
                return results;
            });
        },

        /**
         * 取得排行榜
         */
        async getLeaderboard(limit = 50) {
            const rows = await gamesDb.query(`
                SELECT id, name, score, is_victory as isVictory, date, timestamp 
                FROM leaderboard ORDER BY score DESC LIMIT ?
            `, [limit]);
            return rows.map(row => ({ ...row, isVictory: Boolean(row.isVictory) }));
        },

        /**
         * 取得特定書卷的總題數 (用於 Phase 1 短期目標)
         */
        async getBookTotalQuestions(book) {
            try {
                const row = await gamesDb.get('SELECT COUNT(*) as count FROM questions WHERE book = $1 AND status = $2', [book, 'PASS']);
                return parseInt(row?.count || 0, 10);
            } catch (error) {
                console.error('❌ [gamesOps] getBookTotalQuestions error:', error.message);
                return 0;
            }
        },

        /**
         * 獲取多卷書的總題數
         * @param {string[]} books - 書卷名稱陣列
         * @returns {Promise<Record<string, number>>}
         */
        async getBookQuestionCounts(books) {
            if (!books || books.length === 0) return {};
            try {
                const rows = await gamesDb.query(
                    'SELECT book, COUNT(*) as count FROM questions WHERE book = ANY($1) AND status = $2 GROUP BY book',
                    [books, 'PASS']
                );
                const counts = {};
                books.forEach(b => counts[b] = 0); // 初始化為 0
                rows.forEach(r => {
                    counts[r.book] = parseInt(r.count || 0, 10);
                });
                return counts;
            } catch (error) {
                console.error('❌ [gamesOps] getBookQuestionCounts error:', error.message);
                return {};
            }
        },

        /**
         * 取得特定章節的分類統計 (用於背景補題平衡)
         */
        async getChapterCategoryStats(book, chapter) {
            try {
                const rows = await gamesDb.query(`
                    SELECT category, COUNT(*) as count 
                    FROM questions 
                    WHERE book = $1 AND chapter = $2 AND status = 'PASS'
                    GROUP BY category
                `, [book, chapter]);
                
                const stats = {
                    total: 0,
                    categories: {}
                };
                
                rows.forEach(r => {
                    const c = r.category || 'unknown';
                    const cnt = parseInt(r.count, 10);
                    stats.categories[c] = cnt;
                    stats.total += cnt;
                });
                
                return stats;
            } catch (error) {
                console.error('Get chapter category stats error:', error);
                return { total: 0, categories: {} };
            }
        },

        /**
         * 新增排行榜分數
         */
        async addLeaderboardEntry({ name, score, isVictory, date }) {
            const id = crypto.randomUUID();
            await gamesDb.run(`
                INSERT INTO leaderboard (id, name, score, is_victory, date, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id, name, score, isVictory ? 1 : 0, date || new Date().toISOString(), Date.now()]);
            return id;
        },

        /**
         * [V39] 根據範圍獲取隨機題目 (Postgres 專屬)
         */
        async getQuestionsByRange(book, startChapter, endChapter, categories = [], excludeList = [], verseStart = null, verseEnd = null, version = 'CUV_TRAD', excludeSemanticGroups = []) {
            try {
                // 為避免 ANY($4) 傳入空陣列導致報錯，提供預設值
                const targetCategories = categories.length > 0 ? categories : ['verse_fact', 'verse_fill', 'person', 'geography', 'theology'];
                const excludeCaps = excludeList.length > 0 ? excludeList : ['__dummy__'];

                let orderByClause = `ORDER BY ${VERIFIED_ORDER_SQL} RANDOM()`;
                const excludedGroups = excludeSemanticGroups.length > 0 ? excludeSemanticGroups : ['__dummy__'];
                const args = [book, startChapter, endChapter, targetCategories, excludeCaps, questionVersionFilter(version), excludedGroups];

                // 若有提供節號範圍，優先挑選落在此範圍內的題目
                if (verseStart !== null && verseEnd !== null) {
                    orderByClause = `
                    ORDER BY 
                      ${VERIFIED_ORDER_SQL}
                      CASE WHEN verse_start IS NOT NULL AND ((verse_start >= $8 AND verse_start <= $9) OR (verse_end >= $8 AND verse_end <= $9)) THEN 0 ELSE 1 END ASC,
                      RANDOM()
                    `;
                    args.push(verseStart, verseEnd);
                }

                const row = await gamesDb.get(`
                    SELECT * FROM questions
                    WHERE book = $1
                      AND chapter >= $2 AND chapter <= $3
                      AND category = ANY($4)
                      AND question != ALL($5)
                      AND status = 'PASS'
                      AND canonical_version = ANY($6)
                      AND (semantic_group_key IS NULL OR semantic_group_key != ALL($7))
                      AND (quality IS NULL OR quality NOT IN ('flagged', 'disabled'))
                      AND ${PLAYABLE_QUALITY_PREDICATE}
                      AND ${PLAYABLE_QUESTION_PREDICATE}
                    ${orderByClause}
                    LIMIT 1
                `, args);
                
                return row || null;
            } catch (error) {
                console.error('❌ [gamesOps] getQuestionsByRange error:', error.message);
                return null;
            }
        },

        /**
         * 語義排重檢查 (簡易精確比對)
         * 用於補題前確認相同題目文字是否已存在
         */
        async checkSemanticDuplicate(questionText) {
            if (!questionText) return false;
            try {
                const row = await gamesDb.get(
                    'SELECT 1 FROM questions WHERE question = $1 LIMIT 1',
                    [questionText.trim()]
                );
                return !!row;
            } catch (error) {
                console.error('❌ [gamesOps] checkSemanticDuplicate error:', error.message);
                return false;
            }
        },

        /**
         * [V40 Sovereign] 批量獲取範圍內候選題目 (用於對位檢核)
         * @param {string} version - 指定譯本（預設 CUV_TRAD）
         */
        async getQuestionsInBatchRange(book, startChapter, endChapter, verseStart = null, verseEnd = null, categories = [], version = 'CUV_TRAD') {
            try {
                let sql = `
                    SELECT * FROM questions 
                    WHERE book = $1 
                      AND chapter >= $2 AND chapter <= $3 
                      AND (quality IS NULL OR quality NOT IN ('flagged', 'disabled'))
                      AND status = 'PASS'
                `;
                const params = [book, startChapter, endChapter];
                let paramIdx = 4;

                if (version) {
                    sql += ` AND canonical_version = ANY($${paramIdx++}) `;
                    params.push(questionVersionFilter(version));
                }
                if (verseStart !== null && verseEnd !== null) {
                    sql += ` AND verse_start >= $${paramIdx++} AND verse_end <= $${paramIdx++} `;
                    params.push(verseStart, verseEnd);
                }

                if (categories && categories.length > 0) {
                    sql += ` AND category = ANY($${paramIdx++}) `;
                    params.push(categories);
                }

                sql += ` ORDER BY chapter ASC, verse_start ASC`;
                
                const rows = await gamesDb.query(sql, params);
                return rows || [];
            } catch (error) {
                console.error('❌ [gamesOps] getQuestionsInBatchRange error:', error.message);
                return [];
            }
        },

        async getSemanticGroupKeysByQuestionTexts(questionTexts = []) {
            const texts = Array.isArray(questionTexts)
                ? questionTexts.filter(text => typeof text === 'string' && text.trim())
                : [];
            if (texts.length === 0) return [];
            try {
                const rows = await gamesDb.query(
                    `SELECT DISTINCT semantic_group_key
                     FROM questions
                     WHERE question = ANY($1)
                       AND semantic_group_key IS NOT NULL`,
                    [texts]
                );
                return (rows || []).map(row => row.semantic_group_key).filter(Boolean);
            } catch (error) {
                console.error('❌ [gamesOps] getSemanticGroupKeysByQuestionTexts error:', error.message);
                return [];
            }
        },

        /**
         * 取得可直接進入遊戲的題目。與一般 PASS 查詢分開，避免補題排重把尚待加工的題目漏掉。
         */
        async getPlayableQuestionsInBatchRange(book, startChapter, endChapter, version = 'CUV_TRAD', categories = []) {
            try {
                let sql = `
                    SELECT * FROM questions
                    WHERE book = $1
                      AND chapter >= $2 AND chapter <= $3
                      AND status = 'PASS'
                      AND content_locale = 'zh-TW'
                      AND (quality IS NULL OR quality NOT IN ('flagged', 'disabled'))
                      AND ${PLAYABLE_QUALITY_PREDICATE}
                      AND ${PLAYABLE_QUESTION_PREDICATE}
                `;
                const params = [book, startChapter, endChapter];
                let paramIdx = 4;

                if (version) {
                    sql += ` AND canonical_version = ANY($${paramIdx++}) `;
                    params.push(questionVersionFilter(version));
                }
                if (categories && categories.length > 0) {
                    sql += ` AND category = ANY($${paramIdx++}) `;
                    params.push(categories);
                }

                sql += ` ORDER BY ${VERIFIED_ORDER_SQL} chapter ASC, verse_start ASC`;
                return await gamesDb.query(sql, params) || [];
            } catch (error) {
                console.error('❌ [gamesOps] getPlayableQuestionsInBatchRange error:', error.message);
                return [];
            }
        },

        /**
         * 取得庫存明細。每一列代表「書卷 × 譯本 × 章節 × 題型 × 難度帶」的可玩題數。
         */
        async getPlayableQuestionInventory({ books = [], book = null, startChapter = null, endChapter = null, version = 'CUV_TRAD' } = {}) {
            try {
                const filters = [
                    "status = 'PASS'",
                    "content_locale = 'zh-TW'",
                    "(quality IS NULL OR quality NOT IN ('flagged', 'disabled'))",
                    PLAYABLE_QUALITY_PREDICATE,
                    PLAYABLE_QUESTION_PREDICATE
                ];
                const params = [];

                const addParam = (value) => {
                    params.push(value);
                    return `$${params.length}`;
                };

                if (book) filters.push(`book = ${addParam(book)}`);
                if (Array.isArray(books) && books.length > 0) filters.push(`book = ANY(${addParam(books)})`);
                if (version) filters.push(`canonical_version = ANY(${addParam(questionVersionFilter(version))})`);
                if (startChapter !== null) filters.push(`chapter >= ${addParam(startChapter)}`);
                if (endChapter !== null) filters.push(`chapter <= ${addParam(endChapter)}`);

                const rows = await gamesDb.query(`
                    WITH playable AS (
                        SELECT
                            book,
                            canonical_version AS version,
                            chapter,
                            COALESCE(category, 'unknown') AS category,
                            COALESCE(semantic_group_key, id::TEXT) AS playable_identity,
                            COALESCE(
                                final_difficulty_score,
                                rule_difficulty_score,
                                ai_difficulty_score,
                                CASE LOWER(COALESCE(difficulty, 'medium'))
                                    WHEN 'easy' THEN 15
                                    WHEN 'hard' THEN 75
                                    WHEN 'very_hard' THEN 92
                                    WHEN 'veryhard' THEN 92
                                    ELSE 48
                                END
                            ) AS resolved_score
                        FROM questions
                        WHERE ${filters.join('\n AND ')}
                    )
                    SELECT
                        book,
                        version,
                        chapter,
                        category,
                        CASE
                            WHEN resolved_score <= 30 THEN 'EASY'
                            WHEN resolved_score <= 65 THEN 'MEDIUM'
                            WHEN resolved_score <= 85 THEN 'HARD'
                            ELSE 'VERY_HARD'
                        END AS difficulty_band,
                        COUNT(DISTINCT playable_identity)::INTEGER AS question_count
                    FROM playable
                    GROUP BY book, version, chapter, category, difficulty_band
                    ORDER BY book, version, chapter, category, difficulty_band
                `, params);

                return rows || [];
            } catch (error) {
                console.error('❌ [gamesOps] getPlayableQuestionInventory error:', error.message);
                return [];
            }
        }
    };
}
