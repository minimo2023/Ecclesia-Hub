import crypto from 'crypto';

const PUNCTUATION_OR_SPACE = /[\s\p{P}\p{S}]+/gu;

export function normalizeSemanticText(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(PUNCTUATION_OR_SPACE, '');
}

function characterBigrams(value) {
    const normalized = normalizeSemanticText(value);
    if (!normalized) return new Set();
    if (normalized.length === 1) return new Set([normalized]);

    const grams = new Set();
    for (let index = 0; index < normalized.length - 1; index += 1) {
        grams.add(normalized.slice(index, index + 2));
    }
    return grams;
}

export function semanticTextSimilarity(left, right) {
    const leftSet = characterBigrams(left);
    const rightSet = characterBigrams(right);
    if (leftSet.size === 0 || rightSet.size === 0) return 0;

    let intersection = 0;
    for (const gram of leftSet) {
        if (rightSet.has(gram)) intersection += 1;
    }
    const union = new Set([...leftSet, ...rightSet]).size;
    return union === 0 ? 0 : intersection / union;
}

function normalizeInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getVerseWindow(question = {}) {
    const start = normalizeInteger(question.verse_start ?? question.verseStart);
    const end = normalizeInteger(question.verse_end ?? question.verseEnd) || start;
    if (start) return { start, end };

    const reference = String(question.verse_ref ?? question.verseRef ?? question.evidence ?? '');
    const range = reference.match(/(?:^|\s|:)(\d+)\s*(?:[-–]\s*(\d+))?\s*$/u);
    if (!range) return null;
    return {
        start: Number.parseInt(range[1], 10),
        end: Number.parseInt(range[2] || range[1], 10)
    };
}

export function buildSemanticGroupKey(question = {}) {
    const verseWindow = getVerseWindow(question);
    const answer = normalizeSemanticText(question.answer);
    const scopeParts = [
        normalizeSemanticText(question.book),
        String(question.version || '').trim().toUpperCase(),
        String(normalizeInteger(question.chapter) || ''),
        verseWindow ? `${verseWindow.start}-${verseWindow.end}` : '',
        answer
    ];
    const hasStableScope = scopeParts[0] && scopeParts[2] && scopeParts[3] && answer;
    const identity = hasStableScope
        ? scopeParts.join('|')
        : `${scopeParts.slice(0, 3).join('|')}|${normalizeSemanticText(question.question)}|${answer}`;
    return `sem_v1_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

export function hasOverlappingVerseWindow(left, right) {
    const leftWindow = getVerseWindow(left);
    const rightWindow = getVerseWindow(right);
    if (!leftWindow || !rightWindow) return false;
    return leftWindow.start <= rightWindow.end && rightWindow.start <= leftWindow.end;
}

function isSameScope(candidate, reference) {
    if (normalizeSemanticText(candidate.book) !== normalizeSemanticText(reference.book)) return false;

    const candidateChapter = normalizeInteger(candidate.chapter);
    const referenceChapter = normalizeInteger(reference.chapter);
    if (candidateChapter && referenceChapter && candidateChapter !== referenceChapter) return false;

    const candidateVersion = String(candidate.version || '').trim().toUpperCase();
    const referenceVersion = String(reference.version || '').trim().toUpperCase();
    return !candidateVersion || !referenceVersion || candidateVersion === referenceVersion;
}

export function rankSemanticDuplicateCandidates(candidate, references = [], limit = 12) {
    const candidateStem = normalizeSemanticText(candidate.question);
    const candidateAnswer = normalizeSemanticText(candidate.answer);

    return references
        .filter(reference => reference && String(reference.id) !== String(candidate.id))
        .filter(reference => isSameScope(candidate, reference))
        .map(reference => {
            const referenceStem = normalizeSemanticText(reference.question);
            const sameStem = !!candidateStem && candidateStem === referenceStem;
            const sameAnswer = !!candidateAnswer
                && candidateAnswer === normalizeSemanticText(reference.answer);
            const sameVerse = hasOverlappingVerseWindow(candidate, reference);
            const textSimilarity = semanticTextSimilarity(candidate.question, reference.question);
            const relevant = sameStem
                || sameVerse
                || (sameAnswer && textSimilarity >= 0.2)
                || textSimilarity >= 0.55;

            return {
                reference,
                sameStem,
                sameAnswer,
                sameVerse,
                textSimilarity,
                relevant,
                score: (sameStem ? 100 : 0)
                    + (sameVerse ? 20 : 0)
                    + (sameAnswer ? 12 : 0)
                    + Math.round(textSimilarity * 10)
            };
        })
        .filter(item => item.relevant)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(1, limit));
}

export function buildSemanticDuplicateCases(candidates = [], references = [], limit = 12) {
    const exactDuplicates = [];
    const cases = [];

    candidates.forEach((candidate, index) => {
        const candidateId = String(candidate.id || `candidate_${index + 1}`);
        const earlierCandidates = candidates.slice(0, index).map((item, earlierIndex) => ({
            ...item,
            id: String(item.id || `candidate_${earlierIndex + 1}`),
            source_kind: 'NEW_CANDIDATE'
        }));
        const ranked = rankSemanticDuplicateCandidates(
            candidate,
            [...references, ...earlierCandidates],
            limit
        );
        const exact = ranked.find(item => item.sameStem);

        if (exact) {
            exactDuplicates.push({
                candidate,
                candidateId,
                verdict: 'DUPLICATE',
                duplicateQuestionId: String(exact.reference.id),
                confidence: 1,
                reason: 'NORMALIZED_QUESTION_TEXT_MATCH'
            });
            return;
        }

        if (ranked.length === 0) return;
        cases.push({
            candidate,
            candidateId,
            aiInput: {
                candidate_id: candidateId,
                candidate: summarizeQuestion(candidate),
                possible_duplicates: ranked.map(item => ({
                    ...summarizeQuestion(item.reference),
                    text_similarity: Number(item.textSimilarity.toFixed(4)),
                    same_answer: item.sameAnswer,
                    same_verse: item.sameVerse,
                    source_kind: item.reference.source_kind || 'EXISTING_QUESTION'
                }))
            }
        });
    });

    return { exactDuplicates, cases };
}

function summarizeQuestion(question = {}) {
    return {
        id: String(question.id || ''),
        book: question.book || '',
        chapter: normalizeInteger(question.chapter),
        verse_start: normalizeInteger(question.verse_start ?? question.verseStart),
        verse_end: normalizeInteger(question.verse_end ?? question.verseEnd),
        verse_ref: question.verse_ref ?? question.verseRef ?? '',
        version: question.version || '',
        question: question.question || '',
        answer: question.answer || '',
        category: question.category || ''
    };
}

export function normalizeDuplicateAuditResult(rawResult, candidateId) {
    const result = rawResult && typeof rawResult === 'object' ? rawResult : {};
    const verdict = String(result.verdict || 'UNCERTAIN').toUpperCase();
    const confidence = Number(result.confidence);
    const safeConfidence = Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : 0;

    if (!['UNIQUE', 'DUPLICATE', 'UNCERTAIN'].includes(verdict)) {
        return {
            candidateId,
            verdict: 'UNCERTAIN',
            confidence: 0,
            reason: 'INVALID_DUPLICATE_AUDIT_VERDICT',
            duplicateQuestionId: null,
            sharedFact: null,
            suggestedNewAngle: null
        };
    }

    return {
        candidateId,
        verdict,
        confidence: safeConfidence,
        reason: String(result.reason || '').trim() || 'NO_REASON_PROVIDED',
        duplicateQuestionId: result.duplicate_question_id
            ? String(result.duplicate_question_id)
            : null,
        sharedFact: result.shared_fact || null,
        suggestedNewAngle: result.suggested_new_angle || null
    };
}

export function isDuplicateAuditPass(audit, minimumConfidence = 0.8) {
    return audit?.verdict === 'UNIQUE' && Number(audit.confidence) >= minimumConfidence;
}

export function isDuplicateAuditResolved(audit, minimumConfidence = 0.8) {
    return ['UNIQUE', 'DUPLICATE'].includes(audit?.verdict)
        && Number(audit.confidence) >= minimumConfidence;
}
