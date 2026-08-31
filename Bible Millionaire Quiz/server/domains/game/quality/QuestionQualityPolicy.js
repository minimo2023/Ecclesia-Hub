export const QUESTION_QUALITY_STANDARD_VERSION = 'question_quality_v4_1';

export const QUESTION_QUALITY_STATES = Object.freeze({
    LEGACY: 'LEGACY',
    DRAFT: 'DRAFT',
    SCANNING: 'SCANNING',
    VERIFIED: 'VERIFIED',
    NEEDS_REPAIR: 'NEEDS_REPAIR',
    QUARANTINED: 'QUARANTINED',
    EVIDENCE_UNAVAILABLE: 'EVIDENCE_UNAVAILABLE',
    RETIRED: 'RETIRED'
});

const QUALITY_MODES = new Set(['shadow', 'prefer', 'enforce']);

export function getQuestionQualityMode(env = process.env) {
    const configured = String(env.QUESTION_QUALITY_MODE || 'shadow').toLowerCase();
    return QUALITY_MODES.has(configured) ? configured : 'shadow';
}

export function normalizeAnswerText(value) {
    return String(value ?? '')
        .trim()
        .replace(/^[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+|[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('zh-Hant');
}

export function parseNumericAnswer(value) {
    const normalized = normalizeAnswerText(value);
    const match = normalized.match(/^(-?\d+(?:\.\d+)?)([年月日天次人位代個塊碗章節肘舍客勒他連得]?)$/);
    if (match) return { numeric: true, value: Number(match[1]), unit: match[2] || '' };
    if (/^[零〇一二三四五六七八九十百千萬兩]+[年月日天次人位代個塊碗章節肘舍客勒他連得]?$/.test(normalized)) {
        const unitMatch = normalized.match(/[年月日天次人位代個塊碗章節肘舍客勒他連得]$/);
        return { numeric: true, value: null, unit: unitMatch?.[0] || '' };
    }
    return { numeric: false, value: null, unit: '' };
}

export function validateDistractorSet(answer, distractors, minCount = 3) {
    if (!Array.isArray(distractors) || distractors.length < minCount) {
        return { ok: false, reason: 'TOO_FEW_DISTRACTORS', itemResults: [] };
    }

    const answerText = normalizeAnswerText(answer);
    const answerNumber = parseNumericAnswer(answer);
    const seen = new Set();
    const itemResults = [];

    for (let index = 0; index < distractors.length; index++) {
        const raw = distractors[index];
        const normalized = normalizeAnswerText(raw);
        const flags = [];
        if (!normalized) flags.push('EMPTY_DISTRACTOR');
        if (normalized.length > 50) flags.push('DISTRACTOR_TOO_LONG');
        if (normalized === answerText) flags.push('SAME_AS_ANSWER');
        if (seen.has(normalized)) flags.push('DUPLICATE_DISTRACTOR');

        const distractorNumber = parseNumericAnswer(raw);
        if (answerNumber.numeric && !distractorNumber.numeric) flags.push('NUMERIC_TYPE_MISMATCH');
        if (!answerNumber.numeric && distractorNumber.numeric) flags.push('DISTRACTOR_TYPE_MISMATCH');
        if (answerNumber.numeric && distractorNumber.numeric
            && answerNumber.unit && distractorNumber.unit !== answerNumber.unit) {
            flags.push('NUMERIC_UNIT_MISMATCH');
        }

        if (normalized) seen.add(normalized);
        itemResults.push({ index, value: raw, ok: flags.length === 0, flags });
    }

    const failed = itemResults.find(item => !item.ok);
    return {
        ok: !failed,
        reason: failed?.flags?.[0] || 'PASS',
        itemResults
    };
}

export function validateQuestionOptions(answer, options, { minimum = 4 } = {}) {
    if (!Array.isArray(options) || options.length < minimum) {
        return { ok: false, reason: 'TOO_FEW_OPTIONS', answerOccurrences: 0 };
    }
    const normalized = options.map(normalizeAnswerText);
    if (normalized.some(value => !value)) {
        return { ok: false, reason: 'EMPTY_OPTION', answerOccurrences: 0 };
    }
    if (new Set(normalized).size !== normalized.length) {
        return { ok: false, reason: 'DUPLICATE_OPTION', answerOccurrences: 0 };
    }
    const target = normalizeAnswerText(answer);
    const answerOccurrences = normalized.filter(value => value === target).length;
    if (answerOccurrences !== 1) {
        return { ok: false, reason: 'ANSWER_MUST_APPEAR_EXACTLY_ONCE', answerOccurrences };
    }
    return { ok: true, reason: 'PASS', answerOccurrences };
}

export function qualityStateForAuditResult(result) {
    const verdict = String(result || '').toUpperCase();
    if (verdict === 'PASS') return QUESTION_QUALITY_STATES.VERIFIED;
    if (verdict === 'EVIDENCE_UNAVAILABLE') return QUESTION_QUALITY_STATES.EVIDENCE_UNAVAILABLE;
    if (verdict === 'FREEZE' || verdict === 'RETRY_DISTRACTORS') return QUESTION_QUALITY_STATES.NEEDS_REPAIR;
    return QUESTION_QUALITY_STATES.QUARANTINED;
}

export function isVerifiedQuestion(question) {
    return String(question?.qualityState ?? question?.quality_state ?? '').toUpperCase() === QUESTION_QUALITY_STATES.VERIFIED;
}

export function isQuestionAllowedByQuality(question, mode = getQuestionQualityMode()) {
    void mode;
    const state = String(question?.qualityState ?? question?.quality_state ?? QUESTION_QUALITY_STATES.LEGACY).toUpperCase();
    return state === QUESTION_QUALITY_STATES.VERIFIED;
}

export function getPlayableQualitySql(mode = getQuestionQualityMode()) {
    void mode;
    return "quality_state = 'VERIFIED'";
}
