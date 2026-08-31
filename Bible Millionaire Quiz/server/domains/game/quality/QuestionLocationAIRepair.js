function asInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeLocationFixResult(rawResult) {
    if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult) || rawResult.error) {
        throw new Error(`LOCATION_FIX_RESPONSE_INVALID:${rawResult?.error || 'EMPTY_OR_UNSTRUCTURED'}`);
    }
    const status = String(rawResult.status || '').toUpperCase();
    const rawConfidence = Number(rawResult.confidence);
    // Structured output occasionally serializes confidence as a percentage
    // despite the schema requesting a 0..1 fraction. Normalize that wire
    // representation without relaxing the actual approval threshold.
    const confidence = rawConfidence > 1 && rawConfidence <= 100
        ? rawConfidence / 100
        : rawConfidence;
    if (!['FOUND', 'NOT_FOUND'].includes(status)) throw new Error('LOCATION_FIX_STATUS_INVALID');
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error(`LOCATION_FIX_CONFIDENCE_INVALID:${JSON.stringify(rawResult.confidence)}`);
    }
    if (status === 'NOT_FOUND') {
        return {
            status,
            confidence,
            reason: String(rawResult.reason || '').trim() || 'DIRECT_EVIDENCE_NOT_FOUND',
            chapter: null,
            verseStart: null,
            verseEnd: null,
            evidenceQuote: ''
        };
    }

    const chapter = asInteger(rawResult.chapter);
    const verseStart = asInteger(rawResult.verse_start ?? rawResult.verseStart);
    const verseEnd = asInteger(rawResult.verse_end ?? rawResult.verseEnd) || verseStart;
    if (!chapter || !verseStart || !verseEnd || verseEnd < verseStart) {
        throw new Error('LOCATION_FIX_RANGE_INVALID');
    }
    return {
        status,
        confidence,
        reason: String(rawResult.reason || '').trim() || 'DIRECT_EVIDENCE_FOUND',
        chapter,
        verseStart,
        verseEnd,
        evidenceQuote: String(rawResult.evidence_quote ?? rawResult.evidenceQuote ?? '').trim()
    };
}

export function assessLocationFixConsensus(results, { minimumConfidence = 0.9 } = {}) {
    const normalized = (Array.isArray(results) ? results : []).map(normalizeLocationFixResult);
    if (normalized.length < 2) return { ok: false, reason: 'INSUFFICIENT_LOCATION_AUDITS' };
    const recent = normalized.slice(-3);
    const qualified = recent.filter(result => result.confidence >= minimumConfidence);
    if (qualified.length < 2) {
        return { ok: false, reason: 'LOCATION_CONFIDENCE_TOO_LOW', results: recent };
    }

    const notFound = qualified.filter(result => result.status === 'NOT_FOUND');
    if (notFound.length >= 2) {
        return { ok: true, status: 'NOT_FOUND', reason: 'DOUBLE_LOCATION_NOT_FOUND', results: notFound.slice(-2) };
    }

    const foundGroups = new Map();
    for (const result of qualified.filter(item => item.status === 'FOUND')) {
        const key = `${result.chapter}:${result.verseStart}-${result.verseEnd}`;
        const group = foundGroups.get(key) || [];
        group.push(result);
        foundGroups.set(key, group);
    }
    const matching = [...foundGroups.values()].find(group => group.length >= 2);
    if (matching) {
        const pair = matching.slice(-2);
        return {
            ok: true,
            status: 'FOUND',
            reason: 'DOUBLE_LOCATION_MATCH',
            chapter: pair[0].chapter,
            verseStart: pair[0].verseStart,
            verseEnd: pair[0].verseEnd,
            results: pair
        };
    }
    return {
        ok: false,
        reason: recent.length >= 3 ? 'LOCATION_THREE_AUDIT_NO_CONSENSUS' : 'LOCATION_AUDITS_DISAGREE',
        results: recent
    };
}

export default { normalizeLocationFixResult, assessLocationFixConsensus };
