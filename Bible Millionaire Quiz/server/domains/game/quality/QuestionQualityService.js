import crypto from 'node:crypto';
import { dbOps } from '../../../database/index.js';
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { getQuestionTypeSpec } from '../question-types/QuestionTypeSpec.js';
import { scoreQuestionDifficulty } from '../difficulty/DifficultyScorer.js';
import { applyDifficultyConsensus, assessDifficultyConsensus } from '../difficulty/QuestionDifficultyConsensus.js';
import { getExactQuestionEvidence } from './QuestionEvidenceService.js';
import { hasOnlyLocationChanges } from './QuestionLocationRepair.js';
import {
    GENERATED_DISTRACTOR_REPAIR_SOURCE,
    hasOnlyGeneratedDistractorChanges
} from './QuestionDistractorRepair.js';
import {
    QUESTION_QUALITY_STANDARD_VERSION,
    QUESTION_QUALITY_STATES,
    normalizeAnswerText,
    qualityStateForAuditResult,
    validateDistractorSet,
    validateQuestionOptions
} from './QuestionQualityPolicy.js';
import { normalizeDistractorSets } from './QuestionOptionAssembler.js';

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

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

export function normalizeStructuredAuditResult(value) {
    let normalized = value;
    for (let attempt = 0; attempt < 2 && typeof normalized === 'string'; attempt += 1) {
        try {
            normalized = JSON.parse(normalized);
        } catch {
            break;
        }
    }
    return normalized;
}

export function extractDistractorSets(question) {
    const pool = asArray(readField(question, 'distractorsPool', 'distractors_pool'));
    if (pool.length > 0) {
        return typeof pool[0] === 'string' ? [pool] : pool.filter(Array.isArray);
    }
    return [];
}

export const FINAL_QUESTION_AUDIT_AI_POLICY = Object.freeze({
    paidOnly: false,
    freeOnly: false
});

export function assessAutoApprovalAudits(audits, { requiredPasses = 2, version = null } = {}) {
    const normalized = Array.isArray(audits) ? audits : [];
    if (normalized.length < requiredPasses) {
        return { ok: false, reason: 'INSUFFICIENT_PASS_AUDITS' };
    }

    for (const audit of normalized.slice(-requiredPasses)) {
        if (String(audit?.result || '').toUpperCase() !== 'PASS') {
            return { ok: false, reason: `AUDIT_NOT_PASS:${audit?.result || 'EMPTY'}` };
        }
        if (asArray(audit?.riskFlags ?? audit?.risk_flags).length > 0) {
            return { ok: false, reason: 'AUDIT_HAS_RISK_FLAGS' };
        }

        const evidence = audit?.evidenceSnapshot ?? audit?.evidence_snapshot;
        if (!evidence?.available || (version && evidence.version !== version)) {
            return { ok: false, reason: 'EXACT_VERSION_EVIDENCE_NOT_CONFIRMED' };
        }

        const distractorResults = asArray(audit?.distractorResults ?? audit?.distractor_results);
        if (distractorResults.length === 0) {
            return { ok: false, reason: 'DISTRACTOR_AUDIT_MISSING' };
        }
        const distractorsPassed = distractorResults.every(item => {
            if (item?.ok === false) return false;
            if (item?.verdict != null && String(item.verdict).toUpperCase() !== 'PASS') return false;
            if (Array.isArray(item?.itemResults) && item.itemResults.some(result => result?.ok === false)) return false;
            return item?.ok === true || String(item?.verdict || '').toUpperCase() === 'PASS';
        });
        if (!distractorsPassed) {
            return { ok: false, reason: 'DISTRACTOR_AUDIT_NOT_PASS' };
        }

        const rawResult = audit?.rawResult ?? audit?.raw_result;
        if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)
            || String(rawResult.verdict || '').toUpperCase() !== 'PASS') {
            return { ok: false, reason: 'STRUCTURED_AI_PASS_MISSING' };
        }
    }

    return { ok: true, reason: 'DOUBLE_AUDIT_PASS' };
}

export function assessAutoRetirementAudits(audits, { requiredFailures = 2, version = null } = {}) {
    const normalized = Array.isArray(audits) ? audits : [];
    if (normalized.length < requiredFailures) {
        return { ok: false, reason: 'INSUFFICIENT_FAILURE_AUDITS' };
    }

    const failureVerdicts = new Set(['RETRY_DISTRACTORS', 'FREEZE', 'REJECT']);
    for (const audit of normalized.slice(-requiredFailures)) {
        const result = String(audit?.result || '').toUpperCase();
        if (!failureVerdicts.has(result)) {
            return { ok: false, reason: `AUDIT_NOT_CONTENT_FAILURE:${result || 'EMPTY'}` };
        }

        const evidence = audit?.evidenceSnapshot ?? audit?.evidence_snapshot;
        if (!evidence?.available || (version && evidence.version !== version)) {
            return { ok: false, reason: 'EXACT_VERSION_EVIDENCE_NOT_CONFIRMED' };
        }

        const rawResult = audit?.rawResult ?? audit?.raw_result;
        const rawVerdict = String(rawResult?.verdict || '').toUpperCase();
        if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)
            || !failureVerdicts.has(rawVerdict)) {
            return { ok: false, reason: 'STRUCTURED_AI_FAILURE_MISSING' };
        }
    }

    return { ok: true, reason: 'DOUBLE_CONTENT_FAILURE' };
}

export async function auditQuestionCandidate(question, { db = dbOps.contentDb, aiPolicy = {} } = {}) {
    const evidence = await getExactQuestionEvidence(question, db);
    if (!evidence.available) {
        return {
            result: 'EVIDENCE_UNAVAILABLE',
            reason: evidence.reason,
            riskFlags: ['EVIDENCE_UNAVAILABLE'],
            distractorResults: [],
            evidenceSnapshot: evidence,
            rawResult: null
        };
    }

    const sets = extractDistractorSets(question);
    if (sets.length === 0) {
        return {
            result: 'RETRY_DISTRACTORS',
            reason: 'NO_DISTRACTOR_SET',
            riskFlags: ['NO_DISTRACTOR_SET'],
            distractorResults: [],
            evidenceSnapshot: evidence,
            rawResult: null
        };
    }

    const localResults = sets.map((set, index) => ({
        setIndex: index + 1,
        ...validateDistractorSet(question.answer, set, 3)
    }));
    if (localResults.some(item => !item.ok)) {
        return {
            result: 'RETRY_DISTRACTORS',
            reason: localResults.find(item => !item.ok)?.reason || 'DISTRACTOR_RULE_FAILED',
            riskFlags: ['DISTRACTOR_RULE_FAILED'],
            distractorResults: localResults,
            evidenceSnapshot: evidence,
            rawResult: null
        };
    }

    const spec = getQuestionTypeSpec(question.category) || {};
    const rawResponse = await LogosEngine.askBrain('question_full_audit', {
        category: question.category || 'verse_fact',
        question: question.question,
        answer: question.answer,
        version: question.version,
        reference: `${question.book} ${question.chapter}:${evidence.verseStart}`
            + `${evidence.verseEnd > evidence.verseStart ? `-${evidence.verseEnd}` : ''}`,
        evidence_text: evidence.verses.map(item => `${item.verse}. ${item.text}`).join('\n'),
        distractors_1: (sets[0] || []).join('、'),
        distractors_2: (sets[1] || []).join('、'),
        distractors_3: (sets[2] || []).join('、'),
        audit_rules: spec.auditRules || [],
        forbidden_patterns: spec.forbiddenPatterns || []
    }, {
        temperature: 0.1,
        priority: true,
        ...FINAL_QUESTION_AUDIT_AI_POLICY,
        ...aiPolicy,
        model: 'gemini-3.1-flash-lite',
        allowModelFallback: false,
        retry: false
    });
    const rawResult = normalizeStructuredAuditResult(rawResponse);

    const isStructuredObject = rawResult
        && typeof rawResult === 'object'
        && !Array.isArray(rawResult);
    if (!isStructuredObject || rawResult.error) {
        const detail = String(
            rawResult?.error
            || (typeof rawResult === 'string' ? 'UNSTRUCTURED_AI_AUDIT_RESPONSE' : 'EMPTY_AI_AUDIT_RESPONSE')
        ).slice(0, 240);
        throw new Error(`QUESTION_AUDIT_INFRASTRUCTURE_ERROR:${detail}`);
    }

    let result = String(rawResult?.verdict || 'FREEZE').toUpperCase();
    if (result === 'RETRY_DISTRACTORS') result = 'RETRY_DISTRACTORS';
    else if (!['PASS', 'FREEZE', 'REJECT'].includes(result)) result = 'FREEZE';

    const aiSetResults = Array.isArray(rawResult?.distractor_set_results)
        ? rawResult.distractor_set_results
        : [];
    if (result === 'PASS') {
        const everySetReported = aiSetResults.length === sets.length;
        const reportedIndexes = new Set(aiSetResults.map(item => Number(item.set_index ?? item.setIndex)));
        const everySetIndexed = sets.every((_, index) => reportedIndexes.has(index + 1));
        const everySetPassed = aiSetResults.every(item => String(item.verdict).toUpperCase() === 'PASS');
        if (!everySetReported || !everySetIndexed || !everySetPassed) result = 'RETRY_DISTRACTORS';
    }

    return {
        result,
        reason: rawResult?.reason || result,
        riskFlags: rawResult?.risk_flags || [],
        distractorResults: aiSetResults.length > 0 ? aiSetResults : localResults,
        evidenceSnapshot: evidence,
        difficultySnapshot: {
            estimatedScore: rawResult?.estimated_difficulty_score ?? null,
            generalBeliever: rawResult?.difficulty_reason_general_believer || null,
            seminaryStudent: rawResult?.difficulty_reason_seminary_student || null
        },
        rawResult
    };
}

function snapshotQuestion(question) {
    return {
        question: question.question,
        answer: question.answer,
        options: asArray(question.options),
        correct_index: readField(question, 'correctIndex', 'correct_index'),
        distractors_pool: asArray(readField(question, 'distractorsPool', 'distractors_pool')),
        explanation: question.explanation,
        evidence: question.evidence,
        evidence_ref: readField(question, 'evidenceRef', 'evidence_ref'),
        evidence_quote: readField(question, 'evidenceQuote', 'evidence_quote'),
        category: question.category,
        difficulty: question.difficulty,
        final_difficulty_score: readField(question, 'finalDifficultyScore', 'final_difficulty_score'),
        difficulty_band: readField(question, 'difficultyBand', 'difficulty_band'),
        ai_difficulty_score: readField(question, 'aiDifficultyScore', 'ai_difficulty_score'),
        ai_difficulty_reason_general_believer: readField(
            question,
            'aiDifficultyReasonGeneralBeliever',
            'ai_difficulty_reason_general_believer'
        ),
        ai_difficulty_reason_seminary_student: readField(
            question,
            'aiDifficultyReasonSeminaryStudent',
            'ai_difficulty_reason_seminary_student'
        ),
        book: question.book,
        chapter: question.chapter,
        verse_start: readField(question, 'verseStart', 'verse_start'),
        verse_end: readField(question, 'verseEnd', 'verse_end'),
        verse_ref: readField(question, 'verseRef', 'verse_ref'),
        version: question.version
    };
}

export class QuestionQualityService {
    constructor(db = null) {
        // Database initialization happens after ESM modules are loaded. Keep the
        // default connection lazy so the singleton never captures `undefined`
        // during import-time startup.
        this.explicitDb = db;
    }

    get db() {
        const database = this.explicitDb || dbOps.gamesDb;
        if (!database) throw new Error('QUESTION_QUALITY_DATABASE_NOT_READY');
        return database;
    }

    async createRevision(questionId, candidatePayload, { source = 'MANUAL', createdBy = null } = {}) {
        return this.db.transaction(async tx => {
            const question = await tx.get('SELECT * FROM questions WHERE id = $1 FOR UPDATE', [questionId]);
            if (!question) throw new Error('QUESTION_NOT_FOUND');
            const latest = await tx.get(`
                SELECT COALESCE(MAX(revision_number), 0) AS revision_number
                FROM question_revisions WHERE question_id = $1
            `, [questionId]);
            const revisionNumber = Number(latest?.revisionNumber || 0) + 1;
            const id = crypto.randomUUID();
            const previousPayload = snapshotQuestion(question);
            const candidate = { ...previousPayload, ...candidatePayload };

            await tx.run(`
                INSERT INTO question_revisions
                    (id, question_id, revision_number, state, source, created_by, previous_payload, candidate_payload)
                VALUES ($1,$2,$3,'CANDIDATE',$4,$5,$6::jsonb,$7::jsonb)
            `, [id, questionId, revisionNumber, source, createdBy, JSON.stringify(previousPayload), JSON.stringify(candidate)]);
            return { id, questionId, revisionNumber, state: 'CANDIDATE', candidatePayload: candidate };
        });
    }

    async recordAudit(questionId, audit, { revisionId = null, tx = this.db } = {}) {
        const id = crypto.randomUUID();
        await tx.run(`
            INSERT INTO question_quality_audits
                (id, question_id, revision_id, standard_version, result, reason,
                 risk_flags, distractor_results, evidence_snapshot, difficulty_snapshot, raw_result)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)
        `, [
            id,
            questionId,
            revisionId,
            QUESTION_QUALITY_STANDARD_VERSION,
            audit.result,
            audit.reason || null,
            JSON.stringify(audit.riskFlags || []),
            JSON.stringify(audit.distractorResults || []),
            audit.evidenceSnapshot ? JSON.stringify(audit.evidenceSnapshot) : null,
            audit.difficultySnapshot ? JSON.stringify(audit.difficultySnapshot) : null,
            audit.rawResult ? JSON.stringify(audit.rawResult) : null
        ]);
        return id;
    }

    async auditRevision(revisionId) {
        const revision = await this.db.get(`
            SELECT r.*, q.id AS current_question_id
            FROM question_revisions r
            JOIN questions q ON q.id = r.question_id
            WHERE r.id = $1
        `, [revisionId]);
        if (!revision || revision.state !== 'CANDIDATE') throw new Error('REVISION_NOT_AUDITABLE');
        const candidate = revision.candidatePayload || revision.candidate_payload;
        const audit = await auditQuestionCandidate(candidate, { db: dbOps.contentDb });
        const auditId = await this.recordAudit(revision.questionId, audit, { revisionId });
        return { auditId, ...audit };
    }

    async approveRevision(revisionId, reviewedBy = null, { difficultyConsensus = null } = {}) {
        return this.db.transaction(async tx => {
            const revision = await tx.get(`
                SELECT * FROM question_revisions WHERE id = $1 FOR UPDATE
            `, [revisionId]);
            if (!revision || revision.state !== 'CANDIDATE') throw new Error('REVISION_NOT_APPROVABLE');

            const recentAudits = await tx.query(`
                SELECT * FROM question_quality_audits
                WHERE revision_id = $1
                ORDER BY created_at DESC LIMIT 2
            `, [revisionId]);

            const current = await tx.get('SELECT * FROM questions WHERE id = $1 FOR UPDATE', [revision.questionId]);
            if (!current) throw new Error('QUESTION_NOT_FOUND');
            const orderedAudits = [...recentAudits].reverse();
            const approvalAssessment = assessAutoApprovalAudits(orderedAudits, {
                requiredPasses: 2,
                version: current.version
            });
            if (!approvalAssessment.ok) {
                throw new Error(`REVISION_REQUIRES_DOUBLE_PASS_AUDIT:${approvalAssessment.reason}`);
            }
            const effectiveDifficultyConsensus = difficultyConsensus?.ok
                ? difficultyConsensus
                : assessDifficultyConsensus(orderedAudits, { requiredScores: 2 });
            if (!effectiveDifficultyConsensus.ok) {
                throw new Error(`REVISION_REQUIRES_DIFFICULTY_CONSENSUS:${effectiveDifficultyConsensus.reason}`);
            }
            const candidate = applyDifficultyConsensus(
                { ...snapshotQuestion(current), ...(revision.candidatePayload || revision.candidate_payload) },
                effectiveDifficultyConsensus
            );
            const rawPool = asArray(candidate.distractors_pool);
            const distractorSets = normalizeDistractorSets(rawPool, candidate.answer);
            if (rawPool.length === 0
                || rawPool.some(set => !Array.isArray(set) || set.length < 3)
                || distractorSets.length !== rawPool.length) {
                throw new Error('INVALID_CANDIDATE_DISTRACTOR_POOL');
            }
            const options = [candidate.answer, ...distractorSets[0].slice(0, 3)];
            const optionCheck = validateQuestionOptions(candidate.answer, options);
            if (!optionCheck.ok) throw new Error(`INVALID_CANDIDATE_OPTIONS:${optionCheck.reason}`);
            const correctIndex = 0;
            const difficulty = scoreQuestionDifficulty(candidate);

            await tx.run(`
                UPDATE question_revisions
                SET state = 'SUPERSEDED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE question_id = $2 AND state = 'APPROVED'
            `, [reviewedBy, revision.questionId]);
            await tx.run(`
                UPDATE question_revisions
                SET state = 'APPROVED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE id = $2
            `, [reviewedBy, revisionId]);
            await tx.run(`
                UPDATE questions SET
                    question = $1,
                    answer = $2,
                    options = $3::jsonb,
                    correct_index = $4,
                    distractors_pool = $5::jsonb,
                    explanation = $6,
                    evidence = $7,
                    evidence_ref = $8,
                    evidence_quote = $9,
                    category = $10,
                    difficulty = $11,
                    final_difficulty_score = $12,
                    rule_difficulty_score = $13,
                    difficulty_band = $14,
                    difficulty_breakdown = $15::jsonb,
                    difficulty_flags = $16::jsonb,
                    ai_difficulty_score = $17,
                    ai_difficulty_reason_general_believer = $18,
                    ai_difficulty_reason_seminary_student = $19,
                    difficulty_score_source = $20,
                    final_difficulty_source = $21,
                    book = $22,
                    chapter = $23,
                    verse_start = $24,
                    verse_end = $25,
                    verse_ref = $26,
                    version = $27,
                    active_revision_id = $28,
                    quality_state = 'VERIFIED',
                    publication_state = 'PUBLISHED',
                    publication_state_reason = NULL,
                    publication_state_changed_at = CURRENT_TIMESTAMP,
                    quality_standard_version = $29,
                    quality_checked_at = CURRENT_TIMESTAMP,
                    quality = 'good',
                    verified = TRUE,
                    status = 'PASS',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $30
            `, [
                candidate.question,
                candidate.answer,
                JSON.stringify(options),
                correctIndex,
                JSON.stringify(distractorSets),
                candidate.explanation || null,
                candidate.evidence || null,
                candidate.evidence_ref || null,
                candidate.evidence_quote || null,
                candidate.category || 'verse_fact',
                candidate.difficulty || difficulty.difficulty,
                difficulty.final_difficulty_score,
                difficulty.rule_difficulty_score,
                difficulty.difficulty_band,
                JSON.stringify(difficulty.difficulty_breakdown || {}),
                JSON.stringify(difficulty.difficulty_flags || []),
                candidate.ai_difficulty_score ?? null,
                candidate.ai_difficulty_reason_general_believer || null,
                candidate.ai_difficulty_reason_seminary_student || null,
                'double_audit_v4_1',
                'double_audit_v4_1',
                candidate.book,
                candidate.chapter,
                candidate.verse_start ?? candidate.verseStart ?? null,
                candidate.verse_end ?? candidate.verseEnd ?? null,
                candidate.verse_ref ?? candidate.verseRef ?? null,
                candidate.version,
                revisionId,
                QUESTION_QUALITY_STANDARD_VERSION,
                revision.questionId
            ]);
            return { questionId: revision.questionId, revisionId, qualityState: 'VERIFIED' };
        });
    }

    async approveLocationRevision(revisionId, reviewedBy = 'system:location-repair') {
        return this.db.transaction(async tx => {
            const revision = await tx.get(`
                SELECT * FROM question_revisions WHERE id = $1 FOR UPDATE
            `, [revisionId]);
            if (!revision || revision.state !== 'CANDIDATE') throw new Error('LOCATION_REVISION_NOT_APPROVABLE');
            if (revision.source !== 'LOCATION_REPAIR_V4') throw new Error('LOCATION_REVISION_SOURCE_INVALID');

            const previousPayload = revision.previousPayload || revision.previous_payload;
            const candidatePayload = revision.candidatePayload || revision.candidate_payload;
            if (!hasOnlyLocationChanges(previousPayload, candidatePayload)) {
                throw new Error('LOCATION_REVISION_CHANGED_CONTENT');
            }

            const latestAudit = await tx.get(`
                SELECT result, evidence_snapshot, raw_result
                FROM question_quality_audits
                WHERE revision_id = $1
                ORDER BY created_at DESC LIMIT 1
            `, [revisionId]);
            const rawResult = latestAudit?.rawResult || latestAudit?.raw_result;
            if (latestAudit?.result !== 'PASS'
                || rawResult?.auditType !== 'QUESTION_LOCATION'
                || rawResult?.verdict !== 'PASS') {
                throw new Error('LOCATION_REVISION_REQUIRES_LOCATION_PASS');
            }

            const evidence = latestAudit.evidenceSnapshot || latestAudit.evidence_snapshot;
            const expectedVersion = candidatePayload.version;
            if (!evidence?.available || evidence.version !== expectedVersion
                || Number(evidence.chapter) !== Number(candidatePayload.chapter)
                || Number(evidence.verseStart) !== Number(candidatePayload.verse_start)
                || Number(evidence.verseEnd) !== Number(candidatePayload.verse_end)) {
                throw new Error('LOCATION_REVISION_EVIDENCE_MISMATCH');
            }

            const current = await tx.get('SELECT * FROM questions WHERE id = $1 FOR UPDATE', [revision.questionId]);
            if (!current) throw new Error('QUESTION_NOT_FOUND');

            await tx.run(`
                UPDATE question_revisions
                SET state = 'SUPERSEDED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE question_id = $2 AND state = 'APPROVED'
            `, [reviewedBy, revision.questionId]);
            await tx.run(`
                UPDATE question_revisions
                SET state = 'APPROVED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE id = $2
            `, [reviewedBy, revisionId]);
            await tx.run(`
                UPDATE questions SET
                    chapter = $1,
                    verse_start = $2,
                    verse_end = $3,
                    verse_ref = $4,
                    active_revision_id = $5,
                    quality_state = CASE WHEN quality_state = 'VERIFIED' THEN 'LEGACY' ELSE quality_state END,
                    publication_state = 'IN_REVIEW',
                    publication_state_reason = '經文位置修訂後需重新審核',
                    publication_state_changed_at = CURRENT_TIMESTAMP,
                    verified = CASE WHEN quality_state = 'VERIFIED' THEN FALSE ELSE verified END,
                    quality_checked_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
            `, [
                candidatePayload.chapter,
                candidatePayload.verse_start,
                candidatePayload.verse_end,
                candidatePayload.verse_ref,
                revisionId,
                revision.questionId
            ]);

            return {
                questionId: revision.questionId,
                revisionId,
                chapter: candidatePayload.chapter,
                verseRef: candidatePayload.verse_ref
            };
        });
    }

    async rejectLocationRevision(revisionId, reviewedBy = 'system:location-repair', reason = null) {
        return this.db.transaction(async tx => {
            const revision = await tx.get('SELECT * FROM question_revisions WHERE id = $1 FOR UPDATE', [revisionId]);
            if (!revision || revision.state !== 'CANDIDATE') return { revisionId, state: revision?.state || 'MISSING' };
            if (revision.source !== 'LOCATION_REPAIR_V4') throw new Error('LOCATION_REVISION_SOURCE_INVALID');
            await tx.run(`
                UPDATE question_revisions
                SET state = 'REJECTED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE id = $2
            `, [reviewedBy, revisionId]);
            if (reason) {
                await this.recordAudit(revision.questionId, {
                    result: 'REJECT',
                    reason,
                    riskFlags: ['LOCATION_REPAIR_FAILED'],
                    distractorResults: [],
                    rawResult: { auditType: 'QUESTION_LOCATION', verdict: 'REJECT', reason }
                }, { revisionId, tx });
            }
            return { revisionId, state: 'REJECTED' };
        });
    }

    async rejectRevision(revisionId, reviewedBy = null, reason = null) {
        return this.db.transaction(async tx => {
            const revision = await tx.get('SELECT * FROM question_revisions WHERE id = $1 FOR UPDATE', [revisionId]);
            if (!revision || revision.state !== 'CANDIDATE') throw new Error('REVISION_NOT_REJECTABLE');
            await tx.run(`
                UPDATE question_revisions
                SET state = 'REJECTED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE id = $2
            `, [reviewedBy, revisionId]);
            await tx.run(`
                UPDATE questions
                SET quality_state = 'NEEDS_REPAIR',
                    publication_state = 'SUSPENDED',
                    publication_state_reason = COALESCE($1, audit_reason),
                    publication_state_changed_at = CURRENT_TIMESTAMP,
                    audit_reason = COALESCE($1, audit_reason), updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [reason, revision.questionId]);
            return { questionId: revision.questionId, revisionId, qualityState: 'NEEDS_REPAIR' };
        });
    }

    async retireFailedDistractorRevision(revisionId, reviewedBy = 'system:distractor-repair', reason = null) {
        return this.db.transaction(async tx => {
            const revision = await tx.get('SELECT * FROM question_revisions WHERE id = $1 FOR UPDATE', [revisionId]);
            if (!revision || revision.state !== 'CANDIDATE') throw new Error('REVISION_NOT_RETIRABLE');
            if (revision.source !== GENERATED_DISTRACTOR_REPAIR_SOURCE) {
                throw new Error('DISTRACTOR_RETIREMENT_SOURCE_INVALID');
            }

            const previousPayload = revision.previousPayload || revision.previous_payload;
            const candidatePayload = revision.candidatePayload || revision.candidate_payload;
            if (!hasOnlyGeneratedDistractorChanges(previousPayload, candidatePayload)) {
                throw new Error('DISTRACTOR_REVISION_CHANGED_IMMUTABLE_CONTENT');
            }

            const audits = await tx.query(`
                SELECT result, reason, risk_flags, distractor_results, evidence_snapshot, raw_result
                FROM question_quality_audits
                WHERE revision_id = $1
                ORDER BY created_at DESC
                LIMIT 2
            `, [revisionId]);
            const auditRows = Array.isArray(audits) ? audits : [];
            const gate = assessAutoRetirementAudits(auditRows, {
                requiredFailures: 2,
                version: candidatePayload.version
            });
            if (!gate.ok) throw new Error(`DISTRACTOR_RETIREMENT_GATE_FAILED:${gate.reason}`);

            const current = await tx.get('SELECT * FROM questions WHERE id = $1 FOR UPDATE', [revision.questionId]);
            if (!current) throw new Error('QUESTION_NOT_FOUND');
            if (!hasOnlyGeneratedDistractorChanges(previousPayload, snapshotQuestion(current))) {
                throw new Error('QUESTION_CHANGED_DURING_DISTRACTOR_REPAIR');
            }

            await tx.run(`
                UPDATE question_revisions
                SET state = 'REJECTED', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
                WHERE id = $2
            `, [reviewedBy, revisionId]);
            await tx.run(`
                UPDATE questions
                SET quality_state = 'RETIRED', status = 'RETIRED', quality = 'bad', verified = FALSE,
                    publication_state = 'ARCHIVED',
                    publication_state_reason = $1,
                    publication_state_changed_at = CURRENT_TIMESTAMP,
                    quality_checked_at = CURRENT_TIMESTAMP,
                    audit_reason = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [reason || `DISTRACTOR_REPAIR_RETIRED:${gate.reason}`, revision.questionId]);

            return {
                questionId: revision.questionId,
                revisionId,
                qualityState: 'RETIRED',
                reason: reason || gate.reason
            };
        });
    }

    async enqueueLegacyAuditJobs(limit = 100) {
        return this.enqueueAuditJobs({
            limit,
            states: ['LEGACY', 'NEEDS_REPAIR', 'EVIDENCE_UNAVAILABLE']
        });
    }

    async enqueueAuditJobs({ limit = 100, book = null, chapter = null, states = null } = {}) {
        const filters = ["status = 'PASS'"];
        const params = [];
        const addParam = value => {
            params.push(value);
            return `$${params.length}`;
        };
        if (book) filters.push(`book = ${addParam(book)}`);
        if (chapter !== null && chapter !== undefined && chapter !== '') {
            filters.push(`chapter = ${addParam(Number(chapter))}`);
        }
        if (Array.isArray(states) && states.length > 0) {
            filters.push(`COALESCE(quality_state, 'LEGACY') = ANY(${addParam(states)})`);
        }
        const limitParam = addParam(Math.max(1, Math.min(Number(limit) || 100, 10000)));

        const questions = await this.db.query(`
            SELECT id,
                CASE
                    WHEN distractors_pool IS NULL OR jsonb_typeof(distractors_pool) <> 'array' OR jsonb_array_length(distractors_pool) < 2 THEN 10
                    WHEN verse_start IS NULL OR verse_ref IS NULL THEN 20
                    ELSE 100
                END AS priority
            FROM questions
            WHERE ${filters.join('\n              AND ')}
            ORDER BY priority, quality_checked_at NULLS FIRST, updated_at
            LIMIT ${limitParam}
        `, params);

        let enqueued = 0;
        for (const question of questions) {
            const result = await this.db.run(`
                INSERT INTO question_quality_jobs
                    (id, job_type, question_id, priority, dedupe_key)
                VALUES ($1, 'QUESTION_AUDIT_V4_1', $2, $3, $4)
                ON CONFLICT DO NOTHING
            `, [crypto.randomUUID(), question.id, Number(question.priority), `QUESTION_AUDIT_V4_1:${question.id}`]);
            enqueued += result.changes || 0;
        }
        return { enqueued, selected: questions.length, book, chapter: chapter || null };
    }

    async runPatrolBatch(limit = 1) {
        const results = [];
        for (let index = 0; index < limit; index++) {
            const job = await this.db.transaction(async tx => {
                const candidate = await tx.get(`
                    SELECT * FROM question_quality_jobs
                    WHERE status = 'PENDING'
                      AND job_type IN ('LEGACY_AUDIT', 'QUESTION_AUDIT_V4_1')
                      AND available_at <= CURRENT_TIMESTAMP
                      AND NOT EXISTS (
                          SELECT 1
                          FROM question_corpus_reaudit_items corpus_item
                          JOIN question_corpus_reaudit_runs corpus_run ON corpus_run.id = corpus_item.run_id
                          WHERE corpus_item.question_id = question_quality_jobs.question_id
                            AND corpus_run.status IN ('PREPARING', 'RUNNING')
                      )
                    ORDER BY priority, created_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                `);
                if (!candidate) return null;
                const previousQuestion = await tx.get(`
                    SELECT quality_state FROM questions WHERE id = $1 FOR UPDATE
                `, [candidate.questionId]);
                if (!previousQuestion) throw new Error('QUESTION_NOT_FOUND');
                await tx.run(`
                    UPDATE question_quality_jobs
                    SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP,
                        attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [candidate.id]);
                if (String(previousQuestion.qualityState ?? previousQuestion.quality_state).toUpperCase() !== 'VERIFIED') {
                    await tx.run(`
                        UPDATE questions SET quality_state = 'SCANNING',
                            publication_state = 'IN_REVIEW',
                            publication_state_reason = '品質重新檢查中',
                            publication_state_changed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `, [candidate.questionId]);
                }
                return {
                    ...candidate,
                    previousQualityState: previousQuestion.qualityState
                        || previousQuestion.quality_state
                        || QUESTION_QUALITY_STATES.LEGACY
                };
            });
            if (!job) break;

            try {
                const question = await this.db.get('SELECT * FROM questions WHERE id = $1', [job.questionId]);
                if (!question) throw new Error('QUESTION_NOT_FOUND');
                let revision = null;
                let audits = [];
                if (!readField(question, 'activeRevisionId', 'active_revision_id')) {
                    const normalizedPool = normalizeDistractorSets(question);
                    revision = await this.createRevision(question.id, {
                        distractors_pool: normalizedPool
                    }, { source: 'BASELINE_REAUDIT_V4_1', createdBy: 'system:quality-patrol' });
                    audits = [
                        await this.auditRevision(revision.id),
                        await this.auditRevision(revision.id)
                    ];
                } else {
                    const revisionId = readField(question, 'activeRevisionId', 'active_revision_id');
                    for (let auditIndex = 0; auditIndex < 2; auditIndex += 1) {
                        const audit = await auditQuestionCandidate(question, { db: dbOps.contentDb });
                        await this.recordAudit(question.id, audit, { revisionId });
                        audits.push(audit);
                    }
                }

                const approvalGate = assessAutoApprovalAudits(audits, {
                    requiredPasses: 2,
                    version: question.version
                });
                const difficultyConsensus = assessDifficultyConsensus(audits, { requiredScores: 2 });
                const lastAudit = audits[audits.length - 1];
                let state;
                if (approvalGate.ok && difficultyConsensus.ok) {
                    state = QUESTION_QUALITY_STATES.VERIFIED;
                    if (revision) {
                        await this.approveRevision(
                            revision.id,
                            'system:quality-patrol',
                            { difficultyConsensus }
                        );
                    }
                } else {
                    if (revision) {
                        await this.rejectRevision(
                            revision.id,
                            'system:quality-patrol',
                            `V4_1_REAUDIT_FAILED:${approvalGate.reason}:${difficultyConsensus.reason}`
                        );
                    }
                    state = audits.some(audit => audit.result === 'EVIDENCE_UNAVAILABLE')
                        ? QUESTION_QUALITY_STATES.EVIDENCE_UNAVAILABLE
                        : audits.some(audit => audit.result === 'RETRY_DISTRACTORS')
                            ? QUESTION_QUALITY_STATES.NEEDS_REPAIR
                            : qualityStateForAuditResult(lastAudit?.result);
                }
                await this.db.run(`
                    UPDATE questions
                    SET quality_state = $1,
                        publication_state = CASE
                            WHEN $1 = 'VERIFIED' AND active_revision_id IS NOT NULL THEN 'PUBLISHED'
                            WHEN $1 IN ('NEEDS_REPAIR', 'QUARANTINED', 'EVIDENCE_UNAVAILABLE') THEN 'SUSPENDED'
                            ELSE 'IN_REVIEW'
                        END,
                        publication_state_reason = $3,
                        publication_state_changed_at = CURRENT_TIMESTAMP,
                        quality_standard_version = $2,
                        quality_checked_at = CURRENT_TIMESTAMP,
                        audit_reason = $3,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4
                `, [
                    state,
                    QUESTION_QUALITY_STANDARD_VERSION,
                    approvalGate.ok && difficultyConsensus.ok
                        ? 'V4_1_DOUBLE_AUDIT_PASS'
                        : `V4_1_REAUDIT_FAILED:${approvalGate.reason}:${difficultyConsensus.reason}`,
                    question.id
                ]);
                await this.db.run(`
                    UPDATE question_quality_jobs
                    SET status = 'COMPLETED', result = $1::jsonb,
                        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [JSON.stringify({
                    auditResults: audits.map(audit => audit.result),
                    approvalGate,
                    difficultyConsensus,
                    qualityState: state,
                    revisionId: revision?.id || readField(question, 'activeRevisionId', 'active_revision_id') || null
                }), job.id]);
                results.push({
                    jobId: job.id,
                    questionId: question.id,
                    auditResults: audits.map(audit => audit.result),
                    qualityState: state,
                    revisionId: revision?.id || null
                });
            } catch (error) {
                await this.db.transaction(async tx => {
                    await tx.run(`
                        UPDATE question_quality_jobs
                        SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
                            available_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
                            last_error = $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [error.message, job.id]);
                    await tx.run(`
                        UPDATE questions
                        SET quality_state = $1,
                            publication_state = CASE WHEN $1 = 'VERIFIED' THEN 'PUBLISHED' ELSE 'IN_REVIEW' END,
                            publication_state_changed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [job.previousQualityState, job.questionId]);
                });
                results.push({ jobId: job.id, error: error.message });
            }
        }
        return results;
    }

    async getSummary() {
        const byState = await this.db.query(`
            SELECT COALESCE(quality_state, 'LEGACY') AS quality_state, COUNT(*)::INTEGER AS count
            FROM questions GROUP BY COALESCE(quality_state, 'LEGACY') ORDER BY quality_state
        `);
        const jobs = await this.db.query(`
            SELECT status, COUNT(*)::INTEGER AS count
            FROM question_quality_jobs GROUP BY status ORDER BY status
        `);
        const coverage = await this.db.query(`
            SELECT version, COUNT(*)::INTEGER AS verses, COUNT(DISTINCT book)::INTEGER AS books,
                   COUNT(DISTINCT (book, chapter))::INTEGER AS chapters,
                   COUNT(*) FILTER (WHERE BTRIM(COALESCE(text, '')) = '')::INTEGER AS blank_text
            FROM bible_verses GROUP BY version ORDER BY version
        `);
        return { standardVersion: QUESTION_QUALITY_STANDARD_VERSION, byState, jobs, coverage };
    }

    async recordProductionOutcome(candidate, {
        published = false,
        source = 'AUTO_GENERATION_V4_1',
        error = null
    } = {}) {
        const candidateId = String(candidate?.id || crypto.randomUUID());
        const result = {
            published,
            candidateId,
            status: candidate?.status || null,
            qualityState: candidate?.quality_state ?? candidate?.qualityState ?? null,
            reason: error || candidate?.audit_reason || candidate?.quality_audit?.reason || null,
            riskFlags: candidate?.quality_audit?.riskFlags
                ?? candidate?.quality_audit?.risk_flags
                ?? [],
            audits: candidate?.quality_audits || (candidate?.quality_audit ? [candidate.quality_audit] : [])
        };
        const scope = {
            source,
            candidateId,
            book: candidate?.book || null,
            chapter: candidate?.chapter || null,
            verseRef: candidate?.verse_ref ?? candidate?.verseRef ?? null,
            version: candidate?.version || null,
            category: candidate?.category || null,
            difficultyBand: candidate?.difficulty_band ?? candidate?.difficultyBand ?? null,
            question: candidate?.question || null,
            answer: candidate?.answer || null
        };
        await this.db.run(`
            INSERT INTO question_quality_jobs
                (id, job_type, status, question_id, scope, priority,
                 attempt_count, max_attempts, result, last_error,
                 started_at, completed_at, updated_at)
            VALUES ($1,'NEW_QUESTION_PRODUCTION',$2,$3,$4::jsonb,100,
                    1,1,$5::jsonb,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `, [
            crypto.randomUUID(),
            published ? 'COMPLETED' : 'FAILED',
            published ? candidateId : null,
            JSON.stringify(scope),
            JSON.stringify(result),
            error || (!published ? result.reason || 'NEW_QUESTION_PUBLISH_GATE_FAILED' : null)
        ]);
        return result;
    }

    async deleteQuestionsPermanently(questionIds, deletedBy = 'system') {
        const ids = [...new Set((Array.isArray(questionIds) ? questionIds : [])
            .map(value => String(value || '').trim())
            .filter(Boolean))];
        if (ids.length === 0) return { deleted: 0, requested: 0, deletedBy };

        return this.db.transaction(async tx => {
            const existing = await tx.query('SELECT id FROM questions WHERE id = ANY($1::text[]) FOR UPDATE', [ids]);
            const existingIds = existing.map(row => row.id);
            if (existingIds.length === 0) return { deleted: 0, requested: ids.length, deletedBy };

            await tx.run('UPDATE questions SET active_revision_id = NULL WHERE id = ANY($1::text[])', [existingIds]);
            await tx.run('DELETE FROM question_corpus_reaudit_items WHERE question_id = ANY($1::text[])', [existingIds]);
            await tx.run('DELETE FROM question_quality_jobs WHERE question_id = ANY($1::text[])', [existingIds]);
            await tx.run('DELETE FROM question_quality_audits WHERE question_id = ANY($1::text[])', [existingIds]);
            await tx.run('DELETE FROM question_revisions WHERE question_id = ANY($1::text[])', [existingIds]);
            const result = await tx.run('DELETE FROM questions WHERE id = ANY($1::text[])', [existingIds]);
            return {
                deleted: result.rowCount ?? result.changes ?? 0,
                requested: ids.length,
                deletedBy
            };
        });
    }
}

export const questionQualityService = new QuestionQualityService();
export default questionQualityService;
