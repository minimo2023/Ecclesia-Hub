import crypto from 'node:crypto';

import {
    normalizeAnswerText,
    validateDistractorSet,
    validateQuestionOptions
} from './QuestionQualityPolicy.js';

export const GENERATED_DISTRACTOR_REPAIR_SOURCE = 'AUTO_REPAIR_GENERATED_DISTRACTORS_V4';
export const GENERATED_DISTRACTOR_SET_COUNT = 3;
export const GENERATED_DISTRACTOR_SET_SIZE = 5;

const IMMUTABLE_QUESTION_FIELDS = Object.freeze([
    'question',
    'answer',
    'explanation',
    'evidence',
    'evidence_ref',
    'evidence_quote',
    'category',
    'book',
    'chapter',
    'verse_start',
    'verse_end',
    'verse_ref',
    'version'
]);

function readField(object, snake, camel) {
    return object?.[snake] ?? object?.[camel];
}

function normalizedScalar(value) {
    return value == null ? null : value;
}

function deterministicCorrectIndex(question) {
    const seed = `${question?.id || ''}|${question?.answer || ''}|${question?.verse_ref || question?.verseRef || ''}`;
    return crypto.createHash('sha256').update(seed).digest()[0] % 4;
}

export function normalizeDistractorRepairResult(rawResult) {
    if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult) || rawResult.error) {
        throw new Error(`DISTRACTOR_REPAIR_RESPONSE_INVALID:${rawResult?.error || 'EMPTY_OR_UNSTRUCTURED'}`);
    }

    const status = String(rawResult.status || '').toUpperCase();
    const reason = String(rawResult.reason || '').trim();
    const riskFlags = Array.isArray(rawResult.risk_flags)
        ? rawResult.risk_flags.map(value => String(value).trim()).filter(Boolean)
        : [];

    if (status === 'UNREPAIRABLE') {
        return {
            repairable: false,
            status,
            reason: reason || 'GENERATOR_DECLARED_UNREPAIRABLE',
            riskFlags,
            answerType: String(rawResult.answer_type || '').trim(),
            distractorSets: [],
            generationNotes: Array.isArray(rawResult.generation_notes) ? rawResult.generation_notes : []
        };
    }
    if (status !== 'REPAIRABLE') {
        throw new Error('DISTRACTOR_REPAIR_STATUS_INVALID');
    }

    const sets = rawResult.distractor_sets;
    if (!Array.isArray(sets) || sets.length !== GENERATED_DISTRACTOR_SET_COUNT) {
        throw new Error('DISTRACTOR_REPAIR_REQUIRES_THREE_SETS');
    }

    return {
        repairable: true,
        status,
        reason: reason || 'REPAIRABLE',
        riskFlags,
        answerType: String(rawResult.answer_type || '').trim(),
        distractorSets: sets.map((set, setIndex) => {
            if (!Array.isArray(set) || set.length !== GENERATED_DISTRACTOR_SET_SIZE) {
                throw new Error(`DISTRACTOR_REPAIR_SET_SIZE_INVALID:${setIndex + 1}`);
            }
            return set.map(value => String(value ?? '').trim());
        }),
        generationNotes: Array.isArray(rawResult.generation_notes) ? rawResult.generation_notes : []
    };
}

export function validateGeneratedDistractorSets(answer, distractorSets) {
    if (!Array.isArray(distractorSets) || distractorSets.length !== GENERATED_DISTRACTOR_SET_COUNT) {
        return { ok: false, reason: 'DISTRACTOR_REPAIR_REQUIRES_THREE_SETS', setResults: [] };
    }

    const setResults = distractorSets.map((set, index) => ({
        setIndex: index + 1,
        ...(Array.isArray(set) && set.length === GENERATED_DISTRACTOR_SET_SIZE
            ? validateDistractorSet(answer, set, GENERATED_DISTRACTOR_SET_SIZE)
            : { ok: false, reason: 'DISTRACTOR_REPAIR_SET_SIZE_INVALID', itemResults: [] })
    }));
    const failedSet = setResults.find(result => !result.ok);
    if (failedSet) return { ok: false, reason: failedSet.reason, setResults };

    const normalizedAcrossSets = distractorSets.flat().map(normalizeAnswerText);
    if (new Set(normalizedAcrossSets).size !== normalizedAcrossSets.length) {
        return { ok: false, reason: 'DISTRACTOR_REPAIR_CROSS_SET_DUPLICATE', setResults };
    }

    return { ok: true, reason: 'PASS', setResults };
}

export function buildGeneratedDistractorCandidate(question, rawResult) {
    const generation = normalizeDistractorRepairResult(rawResult);
    if (!generation.repairable) {
        throw new Error(`DISTRACTOR_REPAIR_UNREPAIRABLE:${generation.reason}`);
    }

    const setValidation = validateGeneratedDistractorSets(question.answer, generation.distractorSets);
    if (!setValidation.ok) {
        throw new Error(`DISTRACTOR_REPAIR_LOCAL_VALIDATION_FAILED:${setValidation.reason}`);
    }

    const correctIndex = deterministicCorrectIndex(question);
    const options = generation.distractorSets[0].slice(0, 3);
    options.splice(correctIndex, 0, question.answer);
    const optionValidation = validateQuestionOptions(question.answer, options);
    if (!optionValidation.ok) {
        throw new Error(`DISTRACTOR_REPAIR_OPTIONS_INVALID:${optionValidation.reason}`);
    }

    return {
        options,
        correct_index: correctIndex,
        distractors_pool: generation.distractorSets,
        repair_metadata: {
            source: GENERATED_DISTRACTOR_REPAIR_SOURCE,
            generator_status: generation.status,
            generator_reason: generation.reason,
            answer_type: generation.answerType,
            risk_flags: generation.riskFlags,
            generation_notes: generation.generationNotes
        }
    };
}

export function hasOnlyGeneratedDistractorChanges(previousPayload, candidatePayload) {
    if (!previousPayload || !candidatePayload) return false;

    for (const field of IMMUTABLE_QUESTION_FIELDS) {
        const camel = field.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
        if (normalizedScalar(readField(previousPayload, field, camel))
            !== normalizedScalar(readField(candidatePayload, field, camel))) {
            return false;
        }
    }

    return true;
}

export default {
    GENERATED_DISTRACTOR_REPAIR_SOURCE,
    buildGeneratedDistractorCandidate,
    hasOnlyGeneratedDistractorChanges,
    normalizeDistractorRepairResult,
    validateGeneratedDistractorSets
};
