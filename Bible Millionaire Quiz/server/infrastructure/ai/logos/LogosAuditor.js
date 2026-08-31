/**
 * [SOVEREIGN UNIT] Logos Auditor
 * v4.0 - Central knowledge integrity and cleaning service.
 * Integrated into LogosEngine as the guardian of Truth.
 */
import { dbOps } from '../../../database/index.js';
import { auditQuestion } from '../../../domains/game/engine/questionAuditor.js';
import {
    buildSemanticGroupKey,
    buildSemanticDuplicateCases,
    isDuplicateAuditResolved,
    normalizeDuplicateAuditResult,
    normalizeSemanticText
} from '../../../domains/game/quality/QuestionSemanticDuplicate.js';

class LogosAuditor {
    constructor(engine) {
        this.engine = engine;
    }

    /**
     * [V4.0] 物理刪除特定章節中的重複題目 (Hard Delete)
     * 從資料庫層面清理「撞車」的題目。
     */
    async pruneChapter(book, chapter) {
        console.log(`🛡️ [LogosAuditor] Pruning duplicates in ${book} Ch.${chapter}...`);

        const questions = await dbOps.gamesDb.query(
            `SELECT * FROM questions
             WHERE book = $1 AND chapter = $2 AND status NOT IN ('DELETED', 'flagged')
             ORDER BY created_at ASC`,
            [book, chapter]
        );

        if (questions.length === 0) return { deletedCount: 0, checkedCount: 0 };

        const stripPunc = (s) => typeof s === 'string' ? s.trim().replace(/^[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+|[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+$/g, '').trim() : s;

        // 0. 自動清洗答案標點 (移除頭部與尾部的句號等標點)
        for (const q of questions) {
            const cleanAnswer = stripPunc(q.answer);
            if (cleanAnswer !== q.answer) {
                try {
                    await dbOps.gamesDb.run(`UPDATE questions SET answer = $1 WHERE id = $2`, [cleanAnswer, q.id]);
                    q.answer = cleanAnswer; // 更新記憶體中的值，讓後續去重能用乾淨的值
                } catch (e) {
                    console.error(`[LogosAuditor] Failed to clean answer punctuation for ${q.id}:`, e.message);
                }
            }
        }

        if (questions.length < 2) return { deletedCount: 0, checkedCount: questions.length };

        const answerMap = new Map();
        const toDeleteIds = [];
        const uniqueBatch = [];

        // 1. 依題型分流去重
        // verse_fill, verse_fact 使用精確比對，其他使用 AI 語意比對
        for (const q of questions) {
            if (q.category === 'verse_fill' || q.category === 'verse_fact') {
                const normAnswer = (q.answer || '').trim().toLowerCase();
                const normQuestion = (q.question || '').trim().toLowerCase();
                const key = `${normQuestion}_${normAnswer}`;
                if (answerMap.has(key)) {
                    toDeleteIds.push({ id: q.id, reason: '與其他題目完全重複 (精確比對)' });
                } else {
                    answerMap.set(key, q.id);
                    uniqueBatch.push(q);
                }
            } else {
                uniqueBatch.push(q);
            }
        }

        // 從 uniqueBatch 中分離出需要 AI 去重的題目
        const aiMatchBatch = uniqueBatch.filter(q => q.category !== 'verse_fill' && q.category !== 'verse_fact');
        const aiDuplicateIds = new Set();

        // 2. 深度 AI 語義比對 (神學、人物、地理等)
        if (aiMatchBatch.length >= 2) {
            try {
                const aiResult = await this.engine.askBrain('duplicate_detection', {
                    questions: aiMatchBatch,
                    book,
                    chapter
                });
                if (aiResult.groups) {
                    aiResult.groups.forEach(g => {
                        if (g.duplicate_ids) {
                            g.duplicate_ids.forEach(id => {
                                toDeleteIds.push({ id, reason: 'AI 語意偵測為重複題目' });
                                aiDuplicateIds.add(id);
                            });
                        }
                    });
                }
            } catch (err) {
                console.error(`[LogosAuditor] AI Duplicate Detection failed:`, err.message);
            }
        }

        // 從 uniqueBatch 移除被 AI 判定為重複的題目
        const finalUniqueQuestions = uniqueBatch.filter(q => !aiDuplicateIds.has(q.id));

        // 3. 全面內容糾錯與修辭審查 (Correctness & Wording Audit)
        for (const q of finalUniqueQuestions) {
            // 解析 options (DB 可能存字串或 JSON)
            if (typeof q.options === 'string') {
                try {
                    q.options = JSON.parse(q.options);
                } catch (e) {
                    toDeleteIds.push({ id: q.id, reason: '題目結構錯誤 (選項無法解析)' });
                    continue;
                }
            }

            const auditResult = await auditQuestion(q);
            if (auditResult.status === 'FREEZE') {
                toDeleteIds.push({ 
                    id: q.id, 
                    reason: `AI 審查不通過: ${auditResult.reason}` 
                });
            }
        }

        // 4. 執行軟刪除標記 (Soft Delete / Flagging)
        let processedCount = 0;
        const seenIds = new Set();
        
        for (const item of toDeleteIds) {
            if (seenIds.has(item.id)) continue;
            seenIds.add(item.id);
            
            try {
                // 取出舊的 metadata
                const rows = await dbOps.gamesDb.query(`SELECT metadata FROM questions WHERE id = $1`, [item.id]);
                let metadata = {};
                if (rows.length > 0 && rows[0].metadata) {
                    try {
                        metadata = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
                    } catch(e) {}
                }
                
                metadata.audit_reason = item.reason;
                metadata.audit_timestamp = new Date().toISOString();

                await dbOps.gamesDb.run(
                    `UPDATE questions SET status = 'flagged', metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, 
                    [JSON.stringify(metadata), item.id]
                );
                processedCount++;
            } catch (err) {
                console.error(`[LogosAuditor] Failed to update ${item.id}:`, err.message);
            }
        }

        return { deletedCount: processedCount, checkedCount: questions.length };
    }

    /**
     * [V4.1 Sovereign] 即時去重過濾 (Live Pruning)
     * 確保新生成的 AI 題目不會與資料庫既存題目及本次遊戲記錄 (askedQuestions) 衝突。
     * @param {Array} candidates AI 新生成的題目
     * @param {Array} referencePool 從資料庫撈出的既存題目
     * @param {Array|Set} excludeTexts 本次遊戲已出現過的題目文字清單
     */
    async livePrune(candidates, referencePool = [], excludeTexts = []) {
        if (!candidates || candidates.length === 0) return [];

        const excludedStems = new Set();
        const exclusionList = excludeTexts instanceof Set
            ? Array.from(excludeTexts)
            : (Array.isArray(excludeTexts) ? excludeTexts : []);
        exclusionList.forEach(text => excludedStems.add(normalizeSemanticText(text)));

        const eligible = [];
        const rejected = new Map();
        for (const candidate of candidates) {
            const candidateId = String(candidate.id || '');
            if (excludedStems.has(normalizeSemanticText(candidate.question))) {
                rejected.set(candidateId, {
                    verdict: 'DUPLICATE',
                    confidence: 1,
                    reason: 'QUESTION_ALREADY_USED_IN_CURRENT_SCOPE'
                });
            } else {
                eligible.push(candidate);
            }
        }

        const { exactDuplicates, cases } = buildSemanticDuplicateCases(
            eligible,
            referencePool,
            12
        );
        exactDuplicates.forEach(result => rejected.set(result.candidateId, result));

        const audits = new Map();
        if (cases.length > 0) {
            const aiResult = await this.engine.askBrain('question_duplicate_audit', {
                cases: cases.map(item => item.aiInput),
                minimum_unique_confidence: 0.8
            }, {
                priority: true,
                paidOnly: false,
                freeOnly: true,
                model: 'gemini-3.1-flash-lite',
                allowModelFallback: false,
                thinkingBudget: 1024,
                maxAttempts: 2,
                requestTimeoutMs: 45000
            });

            const rawResults = Array.isArray(aiResult?.results) ? aiResult.results : [];
            const rawById = new Map(rawResults.map(result => [String(result.candidate_id || ''), result]));

            for (const item of cases) {
                const audit = normalizeDuplicateAuditResult(
                    rawById.get(item.candidateId),
                    item.candidateId
                );
                audits.set(item.candidateId, audit);
                if (!isDuplicateAuditResolved(audit)) rejected.set(item.candidateId, audit);
            }
        }

        const questionById = new Map(
            [...referencePool, ...eligible]
                .filter(question => question?.id)
                .map(question => [String(question.id), question])
        );
        const resolveGroupKey = (questionId, seen = new Set()) => {
            const id = String(questionId || '');
            if (!id || seen.has(id)) return null;
            seen.add(id);
            const question = questionById.get(id);
            if (!question) return null;
            if (question.semantic_group_key) return question.semantic_group_key;

            const audit = audits.get(id);
            if (audit?.verdict === 'DUPLICATE' && audit.duplicateQuestionId) {
                const inherited = resolveGroupKey(audit.duplicateQuestionId, seen);
                if (inherited) return inherited;
            }
            return buildSemanticGroupKey(question);
        };

        const accepted = eligible
            .filter(candidate => !rejected.has(String(candidate.id || '')))
            .map(candidate => {
                const candidateId = String(candidate.id || '');
                const audit = audits.get(candidateId) || {
                    candidateId: String(candidate.id || ''),
                    verdict: 'UNIQUE',
                    confidence: 1,
                    reason: 'NO_RELEVANT_SAME_SCOPE_CANDIDATES'
                };
                const inheritedGroup = audit.verdict === 'DUPLICATE'
                    ? resolveGroupKey(audit.duplicateQuestionId)
                    : null;
                return {
                    ...candidate,
                    semantic_group_key: inheritedGroup || buildSemanticGroupKey(candidate),
                    semantic_duplicate_of: audit.verdict === 'DUPLICATE'
                        ? audit.duplicateQuestionId
                        : null,
                    semantic_checked_at: new Date().toISOString(),
                    semantic_check_version: 'question_semantic_v1',
                    semantic_duplicate_audit: audit
                };
            });

        for (const [candidateId, audit] of rejected.entries()) {
            console.warn(
                `[SemanticDuplicateGate] Blocked ${candidateId || '(missing id)'}: `
                + `${audit.verdict} (${audit.confidence ?? 0}) ${audit.reason || ''}`
            );
        }

        return accepted;
    }
}

export { LogosAuditor };
