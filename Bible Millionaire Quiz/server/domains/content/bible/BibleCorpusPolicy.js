import { dbOps } from '../../../database/index.js';
import { resolveBibleVersion } from './BibleVersionRegistry.js';

const COMPLETE_COVERAGE_STATES = Object.freeze([
    'COMPLETE',
    'COMPLETE_WITH_MERGED_VERSES'
]);

function firstRow(result) {
    if (Array.isArray(result)) return result[0] || null;
    return result?.rows?.[0] || result || null;
}

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

export async function getBibleCorpusPolicy(version, db = dbOps.contentDb) {
    const resolved = resolveBibleVersion(version);
    if (!resolved) {
        return {
            recognized: false,
            evidenceEligible: false,
            newQuestionEligible: false,
            reason: 'UNSUPPORTED_VERSION',
            requestedVersion: String(version || '')
        };
    }
    if (!db) {
        return {
            ...resolved,
            recognized: true,
            evidenceEligible: false,
            newQuestionEligible: false,
            reason: 'CORPUS_REGISTRY_UNAVAILABLE'
        };
    }

    const result = typeof db.get === 'function'
        ? await db.get(`
            SELECT version_id, source_version, coverage_status,
                   evidence_eligible, new_question_eligible,
                   active_sync_run_id, active_promotion_id
            FROM bible_translation_versions
            WHERE version_id = $1
        `, [resolved.canonicalVersion])
        : await db.query(`
            SELECT version_id, source_version, coverage_status,
                   evidence_eligible, new_question_eligible,
                   active_sync_run_id, active_promotion_id
            FROM bible_translation_versions
            WHERE version_id = $1
        `, [resolved.canonicalVersion]);
    const row = firstRow(result);
    if (!row) {
        return {
            ...resolved,
            recognized: true,
            evidenceEligible: false,
            newQuestionEligible: false,
            reason: 'CORPUS_NOT_REGISTERED'
        };
    }

    const coverageStatus = readField(row, 'coverageStatus', 'coverage_status');
    const coverageComplete = COMPLETE_COVERAGE_STATES.includes(coverageStatus);
    const evidenceEligible = coverageComplete
        && readField(row, 'evidenceEligible', 'evidence_eligible') === true;
    const newQuestionEligible = evidenceEligible
        && readField(row, 'newQuestionEligible', 'new_question_eligible') === true;
    return {
        ...resolved,
        recognized: true,
        coverageStatus,
        evidenceEligible,
        newQuestionEligible,
        activeSyncRunId: readField(row, 'activeSyncRunId', 'active_sync_run_id') || null,
        activePromotionId: readField(row, 'activePromotionId', 'active_promotion_id') || null,
        reason: !coverageComplete
            ? 'CORPUS_INCOMPLETE'
            : (!evidenceEligible ? 'CORPUS_EVIDENCE_DISABLED'
                : (!newQuestionEligible ? 'NEW_QUESTION_PRODUCTION_DISABLED' : 'PASS'))
    };
}

export async function requireNewQuestionCorpus(version, db = dbOps.contentDb) {
    const policy = await getBibleCorpusPolicy(version, db);
    if (!policy.newQuestionEligible) {
        const error = new Error(`${policy.reason}:${policy.canonicalVersion || policy.requestedVersion}`);
        error.code = policy.reason;
        error.corpusPolicy = policy;
        throw error;
    }
    return policy;
}

export default { getBibleCorpusPolicy, requireNewQuestionCorpus };
