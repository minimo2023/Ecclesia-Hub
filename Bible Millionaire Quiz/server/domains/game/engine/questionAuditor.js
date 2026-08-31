import { dbOps } from '../../../database/index.js';
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import {
    assessAutoApprovalAudits,
    questionQualityService
} from '../quality/QuestionQualityService.js';
import { assessDifficultyConsensus } from '../difficulty/QuestionDifficultyConsensus.js';

/**
 * Audit-First Question System
 * Central Authority for Question Validity
 */

/**
 * Audit a single question against strict Hard Rules and AI Semantic Rules.
 * @param {Object} question - The question object to audit
 * @returns {Promise<Object>} Audit result { status, reason, risk_flags, audit_version }
 */
export async function auditQuestion(question) {
    const AUDITOR_VERSION = 'v1.0';

    // ==========================================
    // STAGE 0: Options Normalization for Distractors Pool
    // If database options are empty but we have distractors_pool, temporarily build option list to prevent AI structurally failing it.
    // ==========================================
    let normalizedQuestion = { ...question };
    const distPool = question.distractors_pool || question.distractorsPool;
    if ((!normalizedQuestion.options || normalizedQuestion.options.length === 0) && Array.isArray(distPool) && distPool.length >= 3) {
        const correctIndex = Math.floor(Math.random() * 4);
        const opts = new Array(4).fill(null);
        opts[correctIndex] = normalizedQuestion.answer;
        let dIdx = 0;
        const pool = typeof distPool[0] === 'string' ? distPool : distPool[0];
        for (let i = 0; i < 4; i++) {
            if (i !== correctIndex) {
                opts[i] = pool[dIdx++];
            }
        }
        normalizedQuestion.options = opts;
        normalizedQuestion.correct_index = correctIndex;
    }

    // ==========================================
    // STAGE 1: Structural Audit (Hard Rules)
    // Failure here = IMMEDIATE FREEZE (No AI cost)
    // ==========================================

    // Rule 1: Missing Metadata
    if (!normalizedQuestion.book || !normalizedQuestion.chapter || !normalizedQuestion.answer) {
        return { status: 'FREEZE', reason: '缺少必要欄位 (書卷、章節或答案)', risk_flags: ['MISSING_META'], auditor_version: AUDITOR_VERSION };
    }
    if (normalizedQuestion.options && normalizedQuestion.options.length > 0 && normalizedQuestion.options.some(opt => !opt || opt.trim() === '')) {
        return { status: 'FREEZE', reason: '選項中包含空白內容', risk_flags: ['EMPTY_OPTION'], auditor_version: AUDITOR_VERSION };
    }

    // Rule 1.5: Answer Length Control
    if (normalizedQuestion.answer.length > 15) {
        return { status: 'FREEZE', reason: '答案長度超過限制 (15字以內)', risk_flags: ['ANSWER_TOO_LONG'], auditor_version: AUDITOR_VERSION };
    }

    // Rule 2: Unknown Type
    // If we haven't classified it yet (legacy), we must fail it or strict check it.
    const qType = normalizedQuestion.category || normalizedQuestion.type;
    if (!qType || qType === 'UNKNOWN') {
        return { status: 'FREEZE', reason: '未知的題目類型', risk_flags: ['UNKNOWN_TYPE'], auditor_version: AUDITOR_VERSION };
    }

    // Rule 3: Multi-Chapter (Strict Single Chapter)
    // If chapter_end exists and is different from chapter_start/chapter
    if (normalizedQuestion.chapter_end && normalizedQuestion.chapter_end !== normalizedQuestion.chapter) {
        return { status: 'FREEZE', reason: '不支援跨章節出題', risk_flags: ['MULTI_CHAPTER'], auditor_version: AUDITOR_VERSION };
    }

    // Rule 4: Option Collision (Identical Options)
    if (normalizedQuestion.options && normalizedQuestion.options.length > 0) {
        const uniqueOptions = new Set(normalizedQuestion.options.map(o => o.trim()));
        if (uniqueOptions.size !== normalizedQuestion.options.length) {
            return { status: 'FREEZE', reason: '選項內容有重複', risk_flags: ['OPTION_COLLISION'], auditor_version: AUDITOR_VERSION };
        }
    }

    // Rule 5: Negative Word Mismatch
    // If type is NOT C (Negation), but question contains '不是', '沒有', '不'
    if (qType !== 'C' && qType !== 'NEGATION_IDENTIFICATION') {
        const negativeKeywords = ['不是', '沒有', '不能', '不可', '並非'];
        const hasNegative = negativeKeywords.some(kw => normalizedQuestion.question.includes(kw));
        if (hasNegative) {
            return { status: 'FREEZE', reason: '非否定題型卻包含否定詞', risk_flags: ['SEMANTIC_MISMATCH'], auditor_version: AUDITOR_VERSION };
        }
    }

    // Rule 6: Verbatim Check (String Inclusion)
    // The correct answer must be loosely present in the verse text.
    // Note: We need the verse text to check this. If we don't have it passed in,
    // we might skip this or fetch it. Assuming question might have 'evidence_quote' or we rely on Semantic Audit.
    // FOR NOW: Skipping strict Verbatim check in Stage 1 if text is missing,
    // relying on Stage 2 AI to check "Is answer explicitly in verse?".

    // Rule 7: Answer Integrity Check (CRITICAL)
    // The question.answer MUST be present in question.options (if options exist).
    if (normalizedQuestion.options && normalizedQuestion.options.length > 0) {
        let isValidAnswer = false;
        const answer = normalizedQuestion.answer;

        // Case A: Answer is one of the options (String Match)
        if (normalizedQuestion.options.includes(answer)) {
            isValidAnswer = true;
        }
        // Case B: Answer is a valid Index (Number or String Index)
        else {
            const idx = parseInt(answer);
            if (!isNaN(idx) && idx >= 0 && idx < normalizedQuestion.options.length) {
                isValidAnswer = true;
            } else {
                const letters = ['A', 'B', 'C', 'D'];
                if (letters.includes(answer)) {
                    const letterIdx = letters.indexOf(answer);
                    if (letterIdx < normalizedQuestion.options.length) {
                        isValidAnswer = true;
                    }
                }
            }
        }

        if (!isValidAnswer) {
            return { status: 'FREEZE', reason: '正確答案不在選項清單中', risk_flags: ['LOGIC_ERROR'], auditor_version: AUDITOR_VERSION };
        }
    }

    // ==========================================
    // STAGE 2: Semantic Audit (AI)
    // ==========================================

    try {
        const hasOptions = normalizedQuestion.options && normalizedQuestion.options.length > 0;
        const auditPrompt = `
SYSTEM GUARDRAIL APPLIES.
Audit this Bible quiz question.

Question: "${normalizedQuestion.question}"
Answer: "${normalizedQuestion.answer}"
${hasOptions ? `Options: ${JSON.stringify(normalizedQuestion.options)}` : ''}
Verse Reference: ${normalizedQuestion.book} ${normalizedQuestion.chapter}

Checks:
1. Is the correct answer explicitly stated in the verse?
2. Are all negations preserved? (e.g. if verse says "not", question must say "not")
${hasOptions ? `3. Are any wrong options defensible? (Ambiguity check)` : ''}
4. Does this require interpretation or theology? (Must be strictly factual)
5. Is the wording consistent with CUV (和合本)? (Reject modern phrasing)
6. Is the question semantically clear and free of redundant words (贅字) or poor phrasing?
7. Is the correct answer concise (under 15 characters)${hasOptions ? ` and are all options valid and non-empty` : ''}?

Return JSON only:
{
  "status": "PASS" | "FREEZE",
  "reason": "explicit" | "negation_error" | "inference_required" | "ambiguous" | "poor_phrasing" | "length_or_empty_error",
  "risk_flags": ["string"]
}
`;
        const auditResult = await LogosEngine.askBrain('audit', {
            rawPrompt: auditPrompt,
            temperature: 0.1
        });

        const reasonTranslationMap = {
            'explicit': '答案未在經文中明確提及',
            'negation_error': '否定詞邏輯錯誤',
            'inference_required': '需要過度推論或神學解釋',
            'ambiguous': '錯誤選項具爭議性或過於模糊',
            'poor_phrasing': '題目語句不順或包含贅字',
            'length_or_empty_error': '答案字數過長或選項包含空白',
            'PASS': ''
        };

        const finalReason = (auditResult.status === 'PASS') 
            ? '' 
            : (reasonTranslationMap[auditResult.reason] || auditResult.reason || 'AI 判定品質不佳');

        return {
            status: auditResult.status,
            reason: finalReason,
            risk_flags: auditResult.risk_flags || [],
            auditor_version: AUDITOR_VERSION
        };

    } catch (error) {
        console.error('Audit AI Error:', error);
        // Fail Safe: If Audit fails, FREEZE the question
        return { status: 'FREEZE', reason: 'AI 審查系統連線異常', risk_flags: ['AUDIT_ERROR'], auditor_version: AUDITOR_VERSION };
    }
}

/**
 * Auto-fix or Polish a flagged question using AI
 * @param {string} questionId - The ID of the question to fix
 * @param {string} [customInstruction] - Optional custom instructions for polishing
 * @returns {Promise<Object>} The fixed question data or throws an error
 */
export async function autoFixQuestion(questionId, customInstruction = null) {
    // 1. Fetch question
    const q = await dbOps.gamesDb.get(`SELECT * FROM questions WHERE id = $1`, [questionId]);
    if (!q) throw new Error('Question not found');

    let metadataObj = {};
    try {
        metadataObj = typeof q.metadata === 'string' ? JSON.parse(q.metadata) : (q.metadata || {});
    } catch(e) { console.warn('Failed to parse metadata in autoFix'); }
    const auditReason = metadataObj.audit_reason || '未知錯誤';
    const oldOptions = Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options) : []);

    // 2. Prepare fix prompt
    let fixPrompt = '';
    
    if (customInstruction) {
        fixPrompt = `
Task: Polish and refine a Bible quiz question based on user instructions.
User Instruction: "${customInstruction}"

Original Data:
- Book: ${q.book}
- Chapter: ${q.chapter}
- Question: ${q.question}
- Answer: ${q.answer}
- Options: ${JSON.stringify(oldOptions)}

Instructions for Polish:
1. Follow the User Instruction strictly (e.g. remove redundant quotes like 「」, fix unreasonable leading words).
2. Improve the phrasing to be highly professional, objective, and strictly biblical.
3. Ensure the 3 incorrect options are perfectly homogeneous with the correct answer (same category, structure, and length).
4. Do not alter the core theological fact being tested.
5. Provide the output in JSON format exactly as requested.

Return JSON ONLY (no markdown blocks, no other text):
{
  "question": "The polished question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": "The correct option from the options array"
}
`;
    } else {
        fixPrompt = `
Task: Fix a rejected Bible quiz question.
The question was rejected for the following reason: "${auditReason}"

Original Data:
- Book: ${q.book}
- Chapter: ${q.chapter}
- Question: ${q.question}
- Answer: ${q.answer}
- Options: ${JSON.stringify(oldOptions)}

Instructions:
1. Fix the question based strictly on the rejection reason.
2. If the reason is duplicate options, provide 4 unique options.
3. If the reason is poor phrasing or redundant words, rewrite the question cleanly.
4. Ensure the correct answer is one of the options.
5. Ensure the answer is strictly under 15 characters, and all options are filled (no empty strings).
6. Provide the output in JSON format exactly as requested.
7. CRITICAL: The 3 incorrect options MUST be perfectly homogeneous with the correct answer. They must belong to the exact same biblical category (e.g., if the answer is a specific person's name, distractors must be other biblical persons). They must also closely mimic the structure, format, and character length of the correct answer (e.g., if answer is 3 chars + "門", distractors must be 3 chars + "門").

Return JSON ONLY (no markdown blocks, no other text):
{
  "question": "The fixed question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": "The correct option from the options array"
}
`;
    }

    // 3. Call AI
    const rawResult = await LogosEngine.askBrain('fix_question', {
        rawPrompt: fixPrompt,
        temperature: 0.3
    });

    let fixedData;
    try {
        let cleanResult = rawResult;
        if (typeof rawResult === 'string') {
            cleanResult = rawResult.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            // In case it's just wrapped in general code block
            cleanResult = cleanResult.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        }
        
        const parsed = typeof rawResult === 'string' ? JSON.parse(cleanResult) : rawResult;
        fixedData = parsed;
    } catch (e) {
        console.error('Auto-fix JSON parse error:', e, rawResult);
        throw new Error('AI returned invalid format during auto-fix.');
    }

    if (fixedData && fixedData.error) {
        throw new Error(`AI 引擎回報錯誤: ${fixedData.error}`);
    }

    if (!fixedData || !fixedData.question || !fixedData.options || !fixedData.answer) {
        console.error('Auto-fix incomplete data received:', fixedData);
        throw new Error(`AI 回傳資料不完整: ${JSON.stringify(fixedData).substring(0, 100)}`);
    }

    // Determine correctIndex
    const correctIndex = fixedData.options.indexOf(fixedData.answer);
    if (correctIndex === -1) {
        throw new Error('Fixed answer is not in the options array.');
    }

    // 4. V4：建立候選修訂並完整重審，不直接覆寫正式題目。
    const revision = await questionQualityService.createRevision(questionId, {
        question: fixedData.question,
        answer: fixedData.answer,
        options: fixedData.options,
        correct_index: correctIndex,
        distractors_pool: [fixedData.options.filter((_, index) => index !== correctIndex)]
    }, { source: 'AI_AUTOFIX_V4', createdBy: 'system' });
    const qualityAudits = [
        await questionQualityService.auditRevision(revision.id),
        await questionQualityService.auditRevision(revision.id)
    ];
    const qualityAudit = qualityAudits[qualityAudits.length - 1];
    const approvalGate = assessAutoApprovalAudits(qualityAudits, {
        requiredPasses: 2,
        version: q.version
    });
    const difficultyConsensus = assessDifficultyConsensus(qualityAudits, { requiredScores: 2 });
    const approval = approvalGate.ok && difficultyConsensus.ok
        ? await questionQualityService.approveRevision(
            revision.id,
            'system:auto-repair',
            { difficultyConsensus }
        )
        : null;

    return {
        ...q,
        question: fixedData.question,
        answer: fixedData.answer,
        options: fixedData.options,
        correct_index: correctIndex,
        status: approval ? 'PASS' : 'PENDING_REVIEW',
        revision_id: revision.id,
        quality_audit: qualityAudit,
        quality_audits: qualityAudits,
        approval_gate: approvalGate,
        difficulty_consensus: difficultyConsensus,
        auto_approved: Boolean(approval),
        approval
    };
}
