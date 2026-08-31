import { getDifficultyBand } from './DifficultyScorer.js';

export function normalizeDedicatedDifficultyAudit(raw) {
    const score = Number(raw?.estimated_difficulty_score);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || !Number.isFinite(score) || score < 0 || score > 100) {
        return {
            result: 'FREEZE',
            reason: 'DIFFICULTY_AUDIT_INVALID',
            difficultySnapshot: null,
            rawResult: raw || null
        };
    }
    const resolvedScore = Math.round(score);
    const resolvedBand = getDifficultyBand(resolvedScore);
    if (String(raw.difficulty_band || '').toUpperCase() !== resolvedBand) {
        return {
            result: 'FREEZE',
            reason: 'DIFFICULTY_AUDIT_BAND_MISMATCH',
            difficultySnapshot: null,
            rawResult: raw
        };
    }
    return {
        result: 'PASS',
        reason: 'DEDICATED_DIFFICULTY_AUDIT_PASS',
        difficultySnapshot: {
            estimatedScore: resolvedScore,
            generalBeliever: raw.difficulty_reason_general_believer || null,
            seminaryStudent: raw.difficulty_reason_seminary_student || null,
            evidenceComplexity: raw.evidence_complexity || null,
            targetBandSupported: raw.target_band_supported === true
        },
        rawResult: raw
    };
}

function readDifficultyScore(audit) {
    const snapshot = audit?.difficultySnapshot ?? audit?.difficulty_snapshot;
    const raw = snapshot?.estimatedScore ?? snapshot?.estimated_score
        ?? audit?.rawResult?.estimated_difficulty_score
        ?? audit?.raw_result?.estimated_difficulty_score;
    const score = Number(raw);
    return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function readDifficultyReason(audit, field) {
    const snapshot = audit?.difficultySnapshot ?? audit?.difficulty_snapshot;
    const rawResult = audit?.rawResult ?? audit?.raw_result;
    if (field === 'general') {
        return snapshot?.generalBeliever
            ?? snapshot?.general_believer
            ?? rawResult?.difficulty_reason_general_believer
            ?? null;
    }
    return snapshot?.seminaryStudent
        ?? snapshot?.seminary_student
        ?? rawResult?.difficulty_reason_seminary_student
        ?? null;
}

export function assessDifficultyConsensus(audits, {
    requiredScores = 2,
    maxSpread = 20
} = {}) {
    const passedAudits = (Array.isArray(audits) ? audits : [])
        .filter(audit => String(audit?.result || '').toUpperCase() === 'PASS')
        .slice(-Math.max(requiredScores, 3))
        .filter(audit => readDifficultyScore(audit) !== null);
    if (passedAudits.length < requiredScores) {
        return {
            ok: false,
            reason: 'INSUFFICIENT_DIFFICULTY_SCORES',
            scores: passedAudits.map(readDifficultyScore)
        };
    }

    let passed = passedAudits.slice(-requiredScores);
    if (passedAudits.length > requiredScores && requiredScores === 2) {
        const pairs = [];
        for (let left = 0; left < passedAudits.length - 1; left += 1) {
            for (let right = left + 1; right < passedAudits.length; right += 1) {
                const pair = [passedAudits[left], passedAudits[right]];
                const pairScores = pair.map(readDifficultyScore);
                pairs.push({ pair, spread: Math.max(...pairScores) - Math.min(...pairScores) });
            }
        }
        pairs.sort((a, b) => a.spread - b.spread);
        passed = pairs[0].pair;
    }

    const scores = passed.map(readDifficultyScore);

    const spread = Math.max(...scores) - Math.min(...scores);
    if (spread > maxSpread) {
        return { ok: false, reason: 'DIFFICULTY_SCORE_DISAGREEMENT', scores, spread };
    }

    const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    const band = getDifficultyBand(score);
    return {
        ok: true,
        reason: 'DOUBLE_AUDIT_DIFFICULTY_CONSENSUS',
        score,
        band,
        scores,
        spread,
        generalBelieverReason: passed.map(audit => readDifficultyReason(audit, 'general')).filter(Boolean).join('\n---\n') || null,
        seminaryStudentReason: passed.map(audit => readDifficultyReason(audit, 'seminary')).filter(Boolean).join('\n---\n') || null
    };
}

export function applyDifficultyConsensus(candidate, consensus) {
    if (!consensus?.ok) return { ...candidate };
    return {
        ...candidate,
        difficulty: consensus.band,
        ai_difficulty_score: consensus.score,
        ai_difficulty_reason_general_believer: consensus.generalBelieverReason,
        ai_difficulty_reason_seminary_student: consensus.seminaryStudentReason,
        difficulty_consensus: {
            standard: 'DOUBLE_AUDIT_V4',
            scores: consensus.scores,
            spread: consensus.spread,
            band: consensus.band
        }
    };
}

export default { assessDifficultyConsensus, applyDifficultyConsensus };
