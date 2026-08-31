const CONTENT_FAILURE_RESULTS = new Set(['FREEZE', 'REJECT']);

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function isQualifiedPass(audit) {
    const result = String(audit?.result || '').toUpperCase();
    const rawVerdict = String(audit?.rawResult?.verdict || audit?.raw_result?.verdict || '').toUpperCase();
    const evidence = audit?.evidenceSnapshot || audit?.evidence_snapshot;
    const riskFlags = asArray(audit?.riskFlags || audit?.risk_flags);
    return result === 'PASS'
        && rawVerdict === 'PASS'
        && evidence?.available === true
        && riskFlags.length === 0;
}

export function assessCorpusReauditHistory(history, {
    requiredPasses = 2,
    requiredFailures = 2,
    maxDecisionAudits = 3
} = {}) {
    const audits = asArray(history);
    const last = audits.at(-1) || null;
    const lastResult = String(last?.result || '').toUpperCase();

    if (lastResult === 'EVIDENCE_UNAVAILABLE') {
        return { terminal: true, finalResult: 'EVIDENCE_UNAVAILABLE', qualityState: 'EVIDENCE_UNAVAILABLE' };
    }
    if (lastResult === 'RETRY_DISTRACTORS') {
        return { terminal: true, finalResult: 'RETRY_DISTRACTORS', qualityState: 'NEEDS_REPAIR' };
    }

    const passCount = audits.filter(isQualifiedPass).length;
    const failureCount = audits.filter(audit =>
        CONTENT_FAILURE_RESULTS.has(String(audit?.result || '').toUpperCase())
    ).length;

    if (passCount >= requiredPasses) {
        return { terminal: true, finalResult: 'PASS', qualityState: 'VERIFIED', passCount, failureCount };
    }
    if (failureCount >= requiredFailures) {
        return { terminal: true, finalResult: 'CONTENT_FAILURE', qualityState: 'QUARANTINED', passCount, failureCount };
    }
    if (audits.length >= maxDecisionAudits) {
        return { terminal: true, finalResult: 'INCONCLUSIVE', qualityState: 'QUARANTINED', passCount, failureCount };
    }

    return { terminal: false, finalResult: null, qualityState: null, passCount, failureCount };
}

export function shouldPreserveInactiveQuestion(originalStatus, originalQualityState) {
    const status = String(originalStatus || '').toUpperCase();
    const state = String(originalQualityState || '').toUpperCase();
    return status === 'RETIRED' || state === 'RETIRED';
}

export default { assessCorpusReauditHistory, shouldPreserveInactiveQuestion };
