import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { getQuestionTypeSpec, getSupportedCategories } from '../question-types/QuestionTypeSpec.js';

function extractReferenceChapter(text) {
    if (!text || typeof text !== 'string') return null;
    const normalized = text.replace(/[：]/g, ':');
    const chapterMatch = normalized.match(/(?:第\s*)?(\d+)\s*章/);
    if (chapterMatch) return parseInt(chapterMatch[1], 10);

    const colonMatch = normalized.match(/(?:^|[\s，,；;（(])(?:[^\d\s:：]{1,12})?\s*(\d+)\s*:/);
    if (colonMatch) return parseInt(colonMatch[1], 10);

    return null;
}

/**
 * Question Body Auditor
 * 專職審核題目本體品質（題幹、答案、屬性），不依賴 Options/Distractors。
 */
export const QuestionBodyAuditor = {
    AUDITOR_VERSION: 'body_v1.1',

    async audit(question) {
        // ==========================================
        // 1. Rule Check (Hard Constraints)
        // ==========================================
        const ruleStatus = this._checkRules(question);
        if (ruleStatus.status !== 'PASS') {
            return ruleStatus; // FREEZE or REJECTED
        }

        // ==========================================
        // 2. AI Body Judge (Semantic & Quality Check)
        // ==========================================
        try {
            // [SOVEREIGN] 我們使用 system prompt 讓 AI 扮演兩個角色來審查
            const aiVerdict = await this._aiBodyJudge(question);
            
            const difficultyParams = {
                ai_difficulty_score: aiVerdict.estimated_difficulty_score !== undefined ? aiVerdict.estimated_difficulty_score : null,
                ai_difficulty_reason_general_believer: aiVerdict.difficulty_reason_general_believer || null,
                ai_difficulty_reason_seminary_student: aiVerdict.difficulty_reason_seminary_student || null
            };
            
            if (aiVerdict.verdict === 'REJECT') {
                return {
                    status: 'REJECTED',
                    reason: `AI 審查退回: ${aiVerdict.reason}`,
                    risk_flags: aiVerdict.risk_flags || ['AI_REJECTED'],
                    auditor_version: this.AUDITOR_VERSION,
                    ...difficultyParams
                };
            }

            if (aiVerdict.verdict === 'FREEZE') {
                return {
                    status: 'FREEZE',
                    reason: `AI 審查凍結: ${aiVerdict.reason}`,
                    risk_flags: aiVerdict.risk_flags || ['AI_FREEZE'],
                    auditor_version: this.AUDITOR_VERSION,
                    ...difficultyParams
                };
            }

            // ==========================================
            // 3. Aggregation: Rule PASS + AI PASS
            // ==========================================
            return {
                status: 'PASS',
                reason: '通過本體審核',
                risk_flags: [],
                auditor_version: this.AUDITOR_VERSION,
                ...difficultyParams
            };

        } catch (e) {
            console.warn(`[BodyAuditor] AI timeout/error for "${question.question}", freezing.`, e);
            return {
                status: 'FREEZE',
                reason: 'AI 審核連線超時或失敗',
                risk_flags: ['AI_ERROR'],
                auditor_version: this.AUDITOR_VERSION
            };
        }
    },

    /**
     * 靜態規則審查
     */
    _checkRules(q) {
        // 1 & 2: question / answer 不可空
        if (!q.question || !q.question.trim() || !q.answer || !q.answer.trim()) {
            return { status: 'FREEZE', reason: '題幹或答案為空', risk_flags: ['EMPTY_BODY'], auditor_version: this.AUDITOR_VERSION };
        }

        // 3: category 合法
        const validCategories = getSupportedCategories();
        if (!q.category || !validCategories.includes(q.category)) {
            return { status: 'FREEZE', reason: `無效的題目類別: ${q.category}`, risk_flags: ['INVALID_CATEGORY'], auditor_version: this.AUDITOR_VERSION };
        }
        if (q.category === 'verse_fill' && !String(q.question || '').includes('___')) {
            return {
                status: 'REJECTED',
                reason: '填空題缺少明確的 ___ 空格',
                risk_flags: ['VERSE_FILL_PLACEHOLDER_MISSING'],
                auditor_version: this.AUDITOR_VERSION
            };
        }

        // 4: 取得動態題型規格
        const spec = getQuestionTypeSpec(q.category);
        const maxLength = spec?.answerConstraints?.maxLength || 15;

        // 5: answer 不可過長
        if (q.answer.length > maxLength) {
            return { status: 'FREEZE', reason: `答案長度超過題型限制 (${maxLength})`, risk_flags: ['ANSWER_TOO_LONG'], auditor_version: this.AUDITOR_VERSION };
        }

        // 6: book / chapter 合理
        if (!q.book || !bibleTranslator.isKnownBook(q.book)) {
            return { status: 'FREEZE', reason: '未知的書卷名稱', risk_flags: ['INVALID_REFERENCE'], auditor_version: this.AUDITOR_VERSION };
        }
        // 強制統一轉為繁體中文，避免中英夾雜
        q.book = bibleTranslator.toChinese(q.book);

        if (!q.chapter || q.chapter < 1) {
            return { status: 'FREEZE', reason: '無效的章節資訊', risk_flags: ['INVALID_REFERENCE'], auditor_version: this.AUDITOR_VERSION };
        }

        // 7: 不跨章，除非 theology/lexicon
        const systemChapter = parseInt(q.chapter, 10);
        const verseRefChapter = extractReferenceChapter(q.verse_ref || q.verseRef || q.evidence_ref || '');
        if (verseRefChapter && verseRefChapter !== systemChapter) {
            return {
                status: 'FREEZE',
                reason: `題目引用章節 (${verseRefChapter}) 與系統章節 (${systemChapter}) 不一致`,
                risk_flags: ['REFERENCE_CHAPTER_MISMATCH'],
                auditor_version: this.AUDITOR_VERSION
            };
        }

        const questionChapter = extractReferenceChapter(q.question || '');
        if (questionChapter && questionChapter !== systemChapter) {
            return {
                status: 'FREEZE',
                reason: `題幹敘述章節 (${questionChapter}) 與系統章節 (${systemChapter}) 不一致`,
                risk_flags: ['QUESTION_CHAPTER_MISMATCH'],
                auditor_version: this.AUDITOR_VERSION
            };
        }

        if (q.chapter_end && q.chapter_end !== q.chapter && q.category !== 'theology' && q.category !== 'lexicon') {
            return { status: 'FREEZE', reason: '一般題型不可跨章節', risk_flags: ['MULTI_CHAPTER'], auditor_version: this.AUDITOR_VERSION };
        }

        return { status: 'PASS' };
    },

    /**
     * 呼叫 AI 進行語意與合理性審查
     */
    async _aiBodyJudge(q) {
        // [Phase 13] 取得專屬題型的審核限制
        let auditRules = null;
        let forbiddenPatterns = null;
        let answerMaxLength = 15; // default
        let requireExactMatch = false;

        const spec = await import('../question-types/QuestionTypeSpec.js').then(m => m.getQuestionTypeSpec(q.category));
        if (spec) {
            auditRules = spec.auditRules;
            forbiddenPatterns = spec.forbiddenPatterns;
            answerMaxLength = spec.answerConstraints?.maxLength || 15;
            requireExactMatch = spec.answerConstraints?.requireExactMatch || false;
        }

        const promptParams = {
            question: q.question,
            answer: q.answer,
            category: q.category,
            reference: `${q.book} ${q.chapter}` + (q.verse_start ? `:${q.verse_start}` : ''),
            audit_rules: auditRules,
            forbidden_patterns: forbiddenPatterns,
            max_length: answerMaxLength,
            exact_match: requireExactMatch
        };

        try {
            // [SOVEREIGN] 嚴格要求符合 schemas.js 註冊的格式
            const res = await LogosEngine.askBrain('question_body_audit', promptParams, {
                temperature: 0.1,
                priority: true,
                paidOnly: false,
                freeOnly: true,
                model: 'gemini-3.1-flash-lite',
                allowModelFallback: false
            });
            return res;
        } catch(e) {
            console.warn(`[BodyAuditor] askBrain error:`, e.message);
            throw e;
        }
    }
};
