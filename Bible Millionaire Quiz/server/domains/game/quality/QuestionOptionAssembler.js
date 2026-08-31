import {
    normalizeAnswerText,
    validateDistractorSet,
    validateQuestionOptions
} from './QuestionQualityPolicy.js';

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
}

export function normalizeDistractorSets(questionOrPool, answerValue = '') {
    const isQuestion = questionOrPool && typeof questionOrPool === 'object' && !Array.isArray(questionOrPool);
    const answer = isQuestion ? questionOrPool.answer : answerValue;
    const rawPool = isQuestion
        ? (questionOrPool.distractorsPool ?? questionOrPool.distractors_pool)
        : questionOrPool;
    const pool = asArray(rawPool);
    const candidateSets = typeof pool[0] === 'string' ? [pool] : pool.filter(Array.isArray);

    return candidateSets
        .map(set => {
            const seen = new Set();
            return set
                .map(value => String(value ?? '').trim())
                .filter(value => {
                    const normalized = normalizeAnswerText(value);
                    if (!normalized || normalized === normalizeAnswerText(answer) || seen.has(normalized)) return false;
                    seen.add(normalized);
                    return true;
                });
        })
        .filter(set => validateDistractorSet(answer, set).ok);
}

export function getQuestionPlayability(question, { optionCount = 4 } = {}) {
    const status = String(question?.status || '').toUpperCase();
    const qualityState = String(question?.qualityState ?? question?.quality_state ?? '').toUpperCase();
    if (status !== 'PASS') return { playable: false, reason: 'STATUS_NOT_PASS', distractorSets: [] };
    if (qualityState !== 'VERIFIED') return { playable: false, reason: 'QUALITY_NOT_VERIFIED', distractorSets: [] };
    if (!(question?.activeRevisionId ?? question?.active_revision_id)) {
        return { playable: false, reason: 'FORMAL_REVISION_MISSING', distractorSets: [] };
    }
    const standardVersion = question?.qualityStandardVersion ?? question?.quality_standard_version;
    if (standardVersion !== 'question_quality_v4_1') {
        return { playable: false, reason: 'V4_1_REAUDIT_REQUIRED', distractorSets: [] };
    }
    if (!question?.version
        || !(question?.verseStart ?? question?.verse_start)
        || !String(question?.verseRef ?? question?.verse_ref ?? '').trim()) {
        return { playable: false, reason: 'EXACT_VERSION_EVIDENCE_MISSING', distractorSets: [] };
    }
    if (!Number.isFinite(Number(question?.finalDifficultyScore ?? question?.final_difficulty_score))
        || !String(question?.difficultyBand ?? question?.difficulty_band ?? '').trim()) {
        return { playable: false, reason: 'DIFFICULTY_RESULT_MISSING', distractorSets: [] };
    }
    const latestAuditResult = question?.latestAudit?.result
        ?? question?.latestAuditResult
        ?? question?.latest_audit_result;
    if (latestAuditResult != null && String(latestAuditResult).toUpperCase() !== 'PASS') {
        return { playable: false, reason: 'LATEST_AUDIT_NOT_PASS', distractorSets: [] };
    }

    const rawPool = asArray(question?.distractorsPool ?? question?.distractors_pool);
    if (rawPool.length === 0 || rawPool.some(set => !Array.isArray(set))) {
        return { playable: false, reason: 'NON_STANDARD_DISTRACTOR_POOL', distractorSets: [] };
    }
    const distractorSets = normalizeDistractorSets(question);
    if (distractorSets.length !== rawPool.length) {
        return { playable: false, reason: 'DISTRACTOR_SET_FAILED_VALIDATION', distractorSets: [] };
    }
    const usableSets = distractorSets.filter(set => set.length >= optionCount - 1);
    if (usableSets.length === 0) {
        return { playable: false, reason: 'NO_AUDITED_DISTRACTOR_SET', distractorSets: [] };
    }
    return { playable: true, reason: 'PASS', distractorSets: usableSets };
}

export function assembleVerifiedQuestion(question, { optionCount = 4, random = Math.random } = {}) {
    const playability = getQuestionPlayability(question, { optionCount });
    if (!playability.playable) return { ok: false, reason: playability.reason, question: null };

    const selectedSet = playability.distractorSets[
        Math.floor(random() * playability.distractorSets.length)
    ];
    const distractors = shuffle(selectedSet, random).slice(0, optionCount - 1);
    const options = shuffle([String(question.answer ?? '').trim(), ...distractors], random);
    const validation = validateQuestionOptions(question.answer, options, { minimum: optionCount });
    if (!validation.ok || options.length !== optionCount) {
        return { ok: false, reason: validation.reason || 'INVALID_ASSEMBLED_OPTIONS', question: null };
    }

    const answer = normalizeAnswerText(question.answer);
    const correctIndex = options.findIndex(option => normalizeAnswerText(option) === answer);
    return {
        ok: true,
        reason: 'PASS',
        distractorSets: playability.distractorSets,
        question: {
            ...question,
            options,
            correctIndex,
            correct_index: correctIndex
        }
    };
}

export default assembleVerifiedQuestion;
