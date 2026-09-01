/**
 * 補題流水線 (Question Pipeline v2.0)
 * 第一線（出題）→ livePrune（去重）→ 第二線（補誘餌）→ 第三線（審核）→ DB PASS
 *
 * 誘餌設計：每組 5 個誘餌，支援 4/5/6 選一全模式。
 *   4 選一 → 取前 3 個誘餌
 *   5 選一 → 取前 4 個誘餌（遠征中期）
 *   6 選一 → 取全部 5 個誘餌（遠征後期）
 */
import { supplementDistractors } from './QuestionCore.js';
import { logger } from '../../../utils/logger.js';
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import {
    assessAutoApprovalAudits,
    auditQuestionCandidate,
    FINAL_QUESTION_AUDIT_AI_POLICY
} from '../quality/QuestionQualityService.js';
import { getExactQuestionEvidence } from '../quality/QuestionEvidenceService.js';
import {
    QUESTION_QUALITY_STANDARD_VERSION,
    QUESTION_QUALITY_STATES,
    validateDistractorSet
} from '../quality/QuestionQualityPolicy.js';
import { getQuestionTypeSpec } from '../question-types/QuestionTypeSpec.js';
import { getBibleCorpusPolicy } from '../../content/bible/BibleCorpusPolicy.js';
import {
    buildGeneratedDistractorCandidate,
    normalizeDistractorRepairResult
} from '../quality/QuestionDistractorRepair.js';

const DISTRACTOR_SETS = 3;        // 每題生成幾組誘餌（存 DB 後每次隨機選一組，增加多樣性）
const AUDIT_TIMEOUT_MS = 45000;   // 正式品質稽核最多等待 45 秒，逾時一律不入庫
const RETRY_DELAY_MS = 300;       // 每題之間的間隔，避免 429

// 去除選項頭尾的中英文標點符號
function stripPunctuation(s) {
    if (typeof s !== 'string') return s;
    return s.trim().replace(/^[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+|[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+$/g, '').trim();
}

/**
 * 隨機排列正解位置，組出選項陣列
 * @param {string} answer       正確答案
 * @param {Array}  distractors  誘餌陣列（至少 5 個）
 * @param {number} optionCount  選項總數（預設 4，可傳 5 或 6）
 */
function buildOptions(answer, distractors, optionCount = 4) {
    const neededDistractors = optionCount - 1;  // 4選一需3個，5選一需4個，6選一需5個
    const selectedDistractors = distractors.slice(0, neededDistractors);
    const correctIndex = Math.floor(Math.random() * optionCount);
    const opts = new Array(optionCount).fill(null);
    opts[correctIndex] = stripPunctuation(answer);
    let dIdx = 0;
    for (let i = 0; i < optionCount; i++) {
        if (i !== correctIndex) opts[i] = stripPunctuation(selectedDistractors[dIdx++]);
    }
    return { options: opts, correctIndex };
}

/**
 * 第二線：為單一題目生成 N 組誘餌
 */
async function generateDistractorSets(q, sets = DISTRACTOR_SETS) {
    const results = [];
    for (let i = 0; i < sets; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        // 請求 5 個誘餌：4選一取前3，5選一取前4，6選一取全部5
        const distractors = await supplementDistractors(q, 5);
        if (distractors && distractors.length >= 5) {
            results.push(distractors.slice(0, 5));
        } else if (distractors && distractors.length >= 3) {
            // 容錯：若 AI 只回傳 3-4 個，仍接受（降級為 4 選一模式）
            logger.warn(`[Pipeline] Distractor set only has ${distractors.length}/5 for "${q.answer}", accepting for 4-option mode`);
            results.push(distractors);
        }
    }
    return results;
}

/**
 * 第三線：審核題目 + 正解 + 誘餌組
 */
async function generateStructuredDistractorSets(q) {
    const evidence = await getExactQuestionEvidence(q);
    if (!evidence.available || evidence.version !== q.version) return [];

    const verseStart = Number(q.verse_start ?? q.verseStart);
    const verseEnd = Number(q.verse_end ?? q.verseEnd ?? verseStart);
    const context = {
        book: q.book,
        chapter: q.chapter,
        reference: `${q.chapter}:${verseStart}${verseEnd > verseStart ? `-${verseEnd}` : ''}`,
        version: q.version,
        evidence_text: evidence.verses.map(item => `${item.verseLabel || item.verse}. ${item.text}`).join('\n'),
        question: q.question,
        answer: q.answer,
        category: q.category || 'verse_fact',
        existing_distractors: ''
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        const raw = await LogosEngine.askBrain('question_distractor_repair', context, {
            temperature: 0.25,
            priority: true,
            paidOnly: false,
            freeOnly: true,
            model: 'gemini-3.1-flash-lite',
            allowModelFallback: false
        });
        const generation = normalizeDistractorRepairResult(raw);
        if (!generation.repairable) continue;
        try {
            return buildGeneratedDistractorCandidate(q, raw).distractors_pool;
        } catch (error) {
            logger.warn(`[Pipeline] Structured distractor validation failed for "${q.answer}": ${error.message}`);
        }
    }
    return [];
}

async function auditQuestion(q, distractorSets, aiPolicy = {}) {
    try {
        const spec = getQuestionTypeSpec(q.category) || {};
        const auditCandidate = {
            ...q,
            distractors_pool: distractorSets,
            audit_rules: spec.auditRules || [],
            forbidden_patterns: spec.forbiddenPatterns || []
        };
        return await Promise.race([
            auditQuestionCandidate(auditCandidate, { aiPolicy }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('audit_timeout')), AUDIT_TIMEOUT_MS))
        ]);
    } catch (e) {
        // 超時或 AI 失敗 → 保守處理，暫不通過（freeze），避免劣質誘餌無聲入庫
        logger.warn(`[Pipeline] Audit timeout/error for "${q.answer}", defaulting to freeze: ${e.message}`);
        return {
            result: 'FREEZE',
            reason: e.message,
            riskFlags: ['AUDIT_ERROR'],
            distractorResults: [],
            rawResult: null
        };
    }
}

function includeSemanticDuplicateAudit(question, audit) {
    if (!question?.semantic_duplicate_audit) return audit;
    const existingRaw = audit?.rawResult && typeof audit.rawResult === 'object'
        ? audit.rawResult
        : (audit?.rawResult ? { originalAuditResult: audit.rawResult } : {});
    return {
        ...audit,
        rawResult: {
            ...existingRaw,
            semanticDuplicateAudit: question.semantic_duplicate_audit
        }
    };
}

import { QuestionBodyAuditor } from './QuestionBodyAuditor.js';
import { scoreQuestionDifficulty } from '../difficulty/DifficultyScorer.js';
import {
    applyDifficultyConsensus,
    assessDifficultyConsensus,
    normalizeDedicatedDifficultyAudit
} from '../difficulty/QuestionDifficultyConsensus.js';

async function auditQuestionDifficulty(q, evidence, aiPolicy = {}) {
    try {
        const verseStart = Number(evidence?.verseStart ?? q.verse_start ?? q.verseStart);
        const verseEnd = Number(evidence?.verseEnd ?? q.verse_end ?? q.verseEnd ?? verseStart);
        const rawResult = await Promise.race([
            LogosEngine.askBrain('question_difficulty_audit', {
                category: q.category || 'verse_fact',
                question: q.question,
                answer: q.answer,
                version: q.version,
                reference: `${q.book} ${q.chapter}:${verseStart}`
                    + `${verseEnd > verseStart ? `-${verseEnd}` : ''}`,
                evidence_text: (evidence?.verses || [])
                    .map(item => `${item.verse}. ${item.text}`)
                    .join('\n'),
                production_target_band: q.generation_target_difficulty_band || null
            }, {
                temperature: 0.1,
                priority: true,
                ...FINAL_QUESTION_AUDIT_AI_POLICY,
                ...aiPolicy,
                model: q.quality_model || 'gemini-3.1-flash-lite',
                allowModelFallback: false
            }),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('difficulty_audit_timeout')),
                AUDIT_TIMEOUT_MS
            ))
        ]);
        return normalizeDedicatedDifficultyAudit(rawResult);
    } catch (error) {
        logger.warn(`[Pipeline] Difficulty audit error for "${q.answer}": ${error.message}`);
        return {
            result: 'FREEZE',
            reason: `DIFFICULTY_AUDIT_ERROR:${error.message}`,
            difficultySnapshot: null,
            rawResult: null
        };
    }
}

function mergeDifficultyAudit(qualityAudit, difficultyAudit) {
    const qualityRaw = qualityAudit?.rawResult && typeof qualityAudit.rawResult === 'object'
        ? qualityAudit.rawResult
        : {};
    return {
        ...qualityAudit,
        difficultySnapshot: difficultyAudit?.difficultySnapshot || null,
        rawResult: {
            ...qualityRaw,
            difficultyAudit: difficultyAudit?.rawResult || null
        }
    };
}

async function auditQuestionTwice(q, distractorSets, aiPolicy = {}) {
    const qualityAudits = [
        await auditQuestion(q, distractorSets, aiPolicy),
        await auditQuestion(q, distractorSets, aiPolicy)
    ];
    const approval = assessAutoApprovalAudits(qualityAudits, {
        requiredPasses: 2,
        version: q.version
    });
    if (!approval.ok) {
        const verdicts = qualityAudits.map(audit => String(audit?.result || 'FREEZE').toUpperCase());
        const result = verdicts.some(verdict => verdict === 'RETRY_DISTRACTORS')
            ? 'RETRY_DISTRACTORS'
            : (verdicts.every(verdict => verdict === 'REJECT') ? 'REJECT' : 'FREEZE');
        return {
            ...qualityAudits[qualityAudits.length - 1],
            result,
            reason: `NEW_QUESTION_DOUBLE_AUDIT_FAILED:${approval.reason}`,
            audits: qualityAudits,
            difficultyConsensus: { ok: false, reason: 'QUALITY_AUDIT_FAILED' }
        };
    }

    const evidence = qualityAudits[0].evidenceSnapshot;
    const difficultyAudits = [
        await auditQuestionDifficulty(q, evidence, aiPolicy),
        await auditQuestionDifficulty(q, evidence, aiPolicy)
    ];
    const audits = qualityAudits.map((audit, index) => mergeDifficultyAudit(audit, difficultyAudits[index]));
    const difficultyConsensus = assessDifficultyConsensus(difficultyAudits, { requiredScores: 2 });
    if (difficultyConsensus.ok) {
        return {
            ...audits[audits.length - 1],
            result: 'PASS',
            reason: 'NEW_QUESTION_DOUBLE_AUDIT_PASS',
            audits,
            difficultyConsensus
        };
    }

    return {
        ...audits[audits.length - 1],
        result: 'FREEZE',
        reason: `NEW_QUESTION_DIFFICULTY_AUDIT_FAILED:${difficultyConsensus.reason}`,
        audits,
        difficultyConsensus
    };
}

function applyPassedDoubleAudit(finalQ, distractorSets, auditBundle, sourceQuestion) {
    let result = applyDifficultyConsensus(finalQ, auditBundle.difficultyConsensus);
    const ruleDifficulty = scoreQuestionDifficulty(result);
    result = {
        ...result,
        ...ruleDifficulty,
        difficulty: auditBundle.difficultyConsensus.band,
        difficulty_band: auditBundle.difficultyConsensus.band,
        ai_difficulty_score: auditBundle.difficultyConsensus.score,
        final_difficulty_score: auditBundle.difficultyConsensus.score,
        final_difficulty_source: 'double_audit_v4',
        final_difficulty_confidence: 0.95
    };
    return {
        ...result,
        distractors_pool: distractorSets,
        quality_state: QUESTION_QUALITY_STATES.VERIFIED,
        quality_audits: auditBundle.audits.map(audit => includeSemanticDuplicateAudit(sourceQuestion, audit)),
        quality_audit: includeSemanticDuplicateAudit(sourceQuestion, auditBundle.audits[auditBundle.audits.length - 1]),
        audit_reason: auditBundle.reason
    };
}

/**
 * 主流水線：處理一批第一線生成的題目
 * 流程：本體審核 → 難度評分 → 誘餌生成（3組）→ 聯合審核（題幹+誘餌）→ PASS 入庫
 * @param {Array} questions - livePrune 之後的題目陣列
 * @returns {Array} 處理完的題目（含 PASS/FREEZE/REJECT 狀態）
 */
async function runPipeline(questions, {
    freeOnly = false,
    managedCorpusValidation = false,
    onProgress = null
} = {}) {
    if (!questions || questions.length === 0) return [];

    const approved = [];
    const aiPolicy = freeOnly ? { paidOnly: false, freeOnly: true } : {};

    for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
        const q = questions[questionIndex];
        if (typeof onProgress === 'function') {
            onProgress({ stage: 'audit', current: questionIndex + 1, total: questions.length, question: q.question });
        }
        const corpusPolicy = await getBibleCorpusPolicy(q.version || 'CUV_TRAD');
        const managedCorpusAllowed = managedCorpusValidation && corpusPolicy.evidenceEligible;
        if (!corpusPolicy.newQuestionEligible && !managedCorpusAllowed) {
            approved.push({
                ...q,
                options: null,
                correctIndex: null,
                distractors_pool: null,
                status: 'FREEZE',
                quality: 'flagged',
                quality_state: QUESTION_QUALITY_STATES.EVIDENCE_UNAVAILABLE,
                quality_standard_version: QUESTION_QUALITY_STANDARD_VERSION,
                quality_checked_at: new Date().toISOString(),
                audit_reason: `NEW_QUESTION_BLOCKED: ${corpusPolicy.reason}`,
                auditor_version: QUESTION_QUALITY_STANDARD_VERSION,
                quality_audit: {
                    result: 'EVIDENCE_UNAVAILABLE',
                    reason: corpusPolicy.reason,
                    riskFlags: ['NEW_QUESTION_PRODUCTION_DISABLED'],
                    evidenceSnapshot: null,
                    distractorResults: []
                }
            });
            continue;
        }
        // === Step 0: 指定譯本經文證據（禁止跨譯本 fallback）===
        const evidence = await getExactQuestionEvidence(q);
        if (!evidence.available) {
            approved.push({
                ...q,
                options: null,
                correctIndex: null,
                distractors_pool: null,
                status: 'FREEZE',
                quality: 'flagged',
                quality_state: QUESTION_QUALITY_STATES.EVIDENCE_UNAVAILABLE,
                quality_standard_version: QUESTION_QUALITY_STANDARD_VERSION,
                quality_checked_at: new Date().toISOString(),
                audit_reason: `EVIDENCE_UNAVAILABLE: ${evidence.reason}`,
                auditor_version: QUESTION_QUALITY_STANDARD_VERSION,
                quality_audit: {
                    result: 'EVIDENCE_UNAVAILABLE',
                    reason: evidence.reason,
                    riskFlags: ['EVIDENCE_UNAVAILABLE'],
                    evidenceSnapshot: evidence,
                    distractorResults: []
                }
            });
            continue;
        }

        // === Step 1: 本體審核（題幹 + 正解，不含誘餌）===
        const auditResult = await QuestionBodyAuditor.audit(q);

        let finalQ = {
            ...q,
            options: null,
            correctIndex: null,
            distractors_pool: null,
            status: auditResult.status,
            quality: auditResult.status === 'PASS' ? 'good' : (auditResult.status === 'FREEZE' ? 'flagged' : null),
            audit_reason: auditResult.reason || '',
            auditor_version: auditResult.auditor_version || 'body_v2.0',
            difficulty_flags: auditResult.risk_flags || [],
            ai_difficulty_score: auditResult.ai_difficulty_score ?? null,
            ai_difficulty_reason_general_believer: auditResult.ai_difficulty_reason_general_believer || null,
            ai_difficulty_reason_seminary_student: auditResult.ai_difficulty_reason_seminary_student || null,
            quality_state: auditResult.status === 'PASS'
                ? QUESTION_QUALITY_STATES.SCANNING
                : (auditResult.status === 'FREEZE' ? QUESTION_QUALITY_STATES.NEEDS_REPAIR : QUESTION_QUALITY_STATES.QUARANTINED),
            quality_standard_version: QUESTION_QUALITY_STANDARD_VERSION,
            quality_checked_at: new Date().toISOString()
        };

        // === Step 2: 難度評分（僅 PASS 題）===
        if (finalQ.status === 'PASS') {
            const diffData = scoreQuestionDifficulty(finalQ);
            Object.assign(finalQ, diffData);
        }

        // === Step 3: 誘餌生成 + 聯合審核（僅 PASS 題）===
        // 誘餌品質管控前移：確保入庫題目都有可用誘餌，選題時不再 runtime 生成
        if (finalQ.status === 'PASS') {
            try {
                let distractorSets = await generateStructuredDistractorSets(finalQ);

                // 規則預驗：過濾明顯劣質組
                const validSets = distractorSets.filter(set => validateDistractorSet(finalQ.answer, set).ok);

                if (validSets.length >= 2) {
                    // 聯合審核：題幹 + 正解 + 誘餌一起送審
                    const combinedAudit = await auditQuestionTwice(finalQ, validSets, aiPolicy);
                    const verdict = String(combinedAudit.result || 'FREEZE').toUpperCase();

                    if (verdict === 'PASS') {
                        finalQ = applyPassedDoubleAudit(finalQ, validSets, combinedAudit, q);
                        logger.info(`[Pipeline] ✅ "${finalQ.answer}" - body+distractor PASS (${validSets.length} sets)`);
                    } else if (verdict === 'RETRY_DISTRACTORS') {
                        // 重試一次
                        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                        const retried = (await generateStructuredDistractorSets(finalQ))
                            .filter(set => validateDistractorSet(finalQ.answer, set).ok);
                        const retryAudit = retried.length >= 2
                            ? await auditQuestionTwice(finalQ, retried, aiPolicy)
                            : { result: 'FREEZE', reason: 'INSUFFICIENT_RETRY_SETS', riskFlags: ['INSUFFICIENT_DISTRACTORS'] };
                        if (retryAudit.result === 'PASS') {
                            finalQ = applyPassedDoubleAudit(finalQ, retried, retryAudit, q);
                            logger.info(`[Pipeline] ✅ "${finalQ.answer}" - distractor PASS on retry`);
                        } else {
                            // 誘餌仍不合格 → FREEZE 等待 DistractorBackfill 補完
                            finalQ.status = 'FREEZE';
                            finalQ.quality = 'flagged';
                            finalQ.quality_state = QUESTION_QUALITY_STATES.NEEDS_REPAIR;
                            finalQ.quality_audit = retryAudit;
                            finalQ.audit_reason += ' | FREEZE: distractor quality failed after retry';
                            logger.warn(`[Pipeline] ⚠️ "${finalQ.answer}" - FREEZE: distractor failed on retry`);
                        }
                    } else {
                        // FREEZE 或 REJECT from combined audit → 保守暫存
                        finalQ.status = 'FREEZE';
                        finalQ.quality = 'flagged';
                        finalQ.quality_state = verdict === 'REJECT'
                            ? QUESTION_QUALITY_STATES.QUARANTINED
                            : QUESTION_QUALITY_STATES.NEEDS_REPAIR;
                        finalQ.quality_audit = includeSemanticDuplicateAudit(q, combinedAudit);
                        finalQ.audit_reason += ` | FREEZE: combined audit verdict=${verdict}`;
                        logger.warn(`[Pipeline] ⚠️ "${finalQ.answer}" - FREEZE from combined audit: ${verdict}`);
                    }
                } else {
                    // 有效組不足 → FREEZE 等待補完
                    finalQ.status = 'FREEZE';
                    finalQ.quality = 'flagged';
                    finalQ.quality_state = QUESTION_QUALITY_STATES.NEEDS_REPAIR;
                    finalQ.audit_reason += ` | FREEZE: only ${validSets.length}/${DISTRACTOR_SETS} valid distractor sets`;
                    logger.warn(`[Pipeline] ⚠️ "${finalQ.answer}" - FREEZE: insufficient valid distractor sets (${validSets.length}/${DISTRACTOR_SETS})`);
                }
            } catch (e) {
                // 誘餌生成/審核失敗 → FREEZE（不刪除）
                finalQ.status = 'FREEZE';
                finalQ.quality = 'flagged';
                finalQ.quality_state = QUESTION_QUALITY_STATES.NEEDS_REPAIR;
                finalQ.audit_reason += ` | FREEZE: distractor generation error: ${e.message}`;
                logger.error(`[Pipeline] ❌ "${finalQ.answer}" - FREEZE due to distractor error: ${e.message}`);
            }
        }

        approved.push(finalQ);
        if (typeof onProgress === 'function') {
            onProgress({
                stage: 'audited',
                current: questionIndex + 1,
                total: questions.length,
                status: finalQ.status,
                question: q.question
            });
        }
    }

    const passCount = approved.filter(a => a.status === 'PASS').length;
    const freezeCount = approved.filter(a => a.status === 'FREEZE').length;
    logger.info(`[Pipeline] Result: ${passCount} PASS / ${freezeCount} FREEZE / ${questions.length - passCount - freezeCount} REJECT`);
    return approved;
}


/**
 * 遊戲出題流水線：單題 Line 2 + Line 3
 * 通過後立即可用，並非同步寫回 DB distractors_pool
 * @param {Object} q - DB 撈出的題目（已有 question + answer）
 * @param {Array} dbPool - 同批其他題目（可選，用於 Tier 1 參考，通常傳空）
 * @returns {Object|null} 填入 options/correctIndex/distractors_pool 的題目，或 null（換題）
 */
async function pipelineForGame(q, dbPool = []) {
    try {
        // 第二線：生成 N 組誘餌
        let distractorSets = await generateDistractorSets(q, DISTRACTOR_SETS);

        if (distractorSets.length === 0) {
            logger.warn(`[Pipeline:Game] No distractors for "${q.answer}", skipping.`);
            return null;
        }

        // [品質閘門 1] 快速規則預驗：過濾明顯劣質的誘餌組
        const validSets = distractorSets.filter(set => validateDistractorSet(q.answer, set).ok);
        if (validSets.length === 0) {
            logger.warn(`[Pipeline:Game] All distractor sets failed pre-validation for "${q.answer}", skipping.`);
            return null;
        }
        distractorSets = validSets;

        // [品質閘門 2] AI 第三線審核
        let audit = await auditQuestion(q, distractorSets);
        let verdict = String(audit.result || 'FREEZE').toUpperCase();

        if (verdict === 'RETRY_DISTRACTORS') {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            const retried = (await generateDistractorSets(q, DISTRACTOR_SETS))
                .filter(set => validateDistractorSet(q.answer, set).ok);
            distractorSets = retried.length > 0 ? retried : distractorSets;
            audit = await auditQuestion(q, distractorSets);
            verdict = String(audit.result || 'FREEZE').toUpperCase();
        }

        if (verdict !== 'PASS') {
            logger.warn(`[Pipeline:Game] Question did not pass full audit (${verdict}): "${q.question?.slice(0, 30)}..."`);
            return null;
        }

        // 通過：用第一組組出本次遊戲選項（其餘組存入 distractors_pool 供下次使用）
        const primary = buildOptions(q.answer, distractorSets[0]);
        return {
            ...q,
            options: primary.options,
            correctIndex: primary.correctIndex,
            distractors_pool: distractorSets,
            quality_state: QUESTION_QUALITY_STATES.VERIFIED,
            quality_standard_version: QUESTION_QUALITY_STANDARD_VERSION,
            quality_audit: audit
        };
    } catch (e) {
        logger.error(`[Pipeline:Game] Error for "${q.answer}": ${e.message}`);
        return null;
    }
}

export { runPipeline, pipelineForGame, buildOptions, validateDistractorSet };
