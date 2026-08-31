#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';

import { initializeInfrastructure, dbOps } from '../database/index.js';
import { normalizeDistractorSets } from '../domains/game/quality/QuestionOptionAssembler.js';
import { normalizeAnswerText } from '../domains/game/quality/QuestionQualityPolicy.js';
import { questionQualityService } from '../domains/game/quality/QuestionQualityService.js';

const args = process.argv.slice(2);
const writeEnabled = args.includes('--write');
const deleteRetired = args.includes('--delete-retired');
const backupReference = (args.find(arg => arg.startsWith('--backup-reference=')) || '')
    .split('=').slice(1).join('=').trim();

if (deleteRetired && (!writeEnabled || !backupReference)) {
    throw new Error('DELETE_RETIRED_REQUIRES_WRITE_AND_BACKUP_REFERENCE');
}

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

function deriveStandardPool(question) {
    const rawPool = asArray(readField(question, 'distractorsPool', 'distractors_pool'));
    if (rawPool.length > 0) {
        const nested = Array.isArray(rawPool[0]) ? rawPool : [rawPool];
        const normalized = normalizeDistractorSets(nested, question.answer);
        if (normalized.length === nested.length) return normalized;
    }

    const answer = normalizeAnswerText(question.answer);
    const fromOptions = asArray(question.options)
        .map(value => String(value ?? '').trim())
        .filter(value => normalizeAnswerText(value) !== answer);
    const normalized = normalizeDistractorSets([fromOptions], question.answer);
    return normalized.length === 1 ? normalized : [];
}

function snapshotQuestion(question, distractorSets) {
    return {
        question: question.question,
        answer: question.answer,
        options: asArray(question.options),
        correct_index: readField(question, 'correctIndex', 'correct_index'),
        distractors_pool: distractorSets,
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

function hasRequiredFormalFields(question, distractorSets) {
    const finalDifficultyScore = readField(question, 'finalDifficultyScore', 'final_difficulty_score');
    return distractorSets.length > 0
        && distractorSets.every(set => Array.isArray(set) && set.length >= 3)
        && Boolean(question.version)
        && Number(readField(question, 'verseStart', 'verse_start')) >= 1
        && Boolean(String(readField(question, 'verseRef', 'verse_ref') || '').trim())
        && finalDifficultyScore !== null
        && finalDifficultyScore !== undefined
        && Number.isFinite(Number(finalDifficultyScore))
        && Boolean(String(readField(question, 'difficultyBand', 'difficulty_band') || '').trim());
}

async function qualifyingAudits(tx, question) {
    return tx.query(`
        SELECT *
        FROM question_quality_audits
        WHERE question_id = $1
          AND result = 'PASS'
          AND raw_result ->> 'verdict' = 'PASS'
          AND COALESCE(jsonb_array_length(risk_flags), 0) = 0
          AND COALESCE((evidence_snapshot ->> 'available')::boolean, FALSE) = TRUE
          AND evidence_snapshot ->> 'version' = $2
          AND jsonb_typeof(distractor_results) = 'array'
          AND jsonb_array_length(distractor_results) > 0
        ORDER BY created_at DESC
        LIMIT 2
    `, [question.id, question.version]);
}

async function createBaselineRevision(tx, question, distractorSets, source) {
    await tx.run(`
        UPDATE question_revisions
        SET state = 'SUPERSEDED', reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = 'system:v4.1-migration'
        WHERE question_id = $1 AND state = 'APPROVED'
    `, [question.id]);
    const latest = await tx.get(`
        SELECT COALESCE(MAX(revision_number), 0)::INTEGER AS revision_number
        FROM question_revisions WHERE question_id = $1
    `, [question.id]);
    const revisionId = crypto.randomUUID();
    const payload = snapshotQuestion(question, distractorSets);
    await tx.run(`
        INSERT INTO question_revisions
            (id, question_id, revision_number, state, source, created_by,
             previous_payload, candidate_payload, reviewed_at, reviewed_by)
        VALUES ($1,$2,$3,'APPROVED',$4,'system:v4.1-migration',
                $5::jsonb,$5::jsonb,CURRENT_TIMESTAMP,'system:v4.1-migration')
    `, [
        revisionId,
        question.id,
        Number(latest?.revisionNumber || 0) + 1,
        source,
        JSON.stringify(payload)
    ]);
    return revisionId;
}

async function copyCertificationAudits(tx, questionId, revisionId, audits) {
    for (const audit of [...audits].reverse()) {
        const rawResult = {
            ...(readField(audit, 'rawResult', 'raw_result') || {}),
            v4_1MigrationCertification: true,
            sourceAuditId: audit.id
        };
        await tx.run(`
            INSERT INTO question_quality_audits
                (id, question_id, revision_id, standard_version, result, reason,
                 risk_flags, distractor_results, evidence_snapshot,
                 difficulty_snapshot, raw_result, created_at)
            VALUES ($1,$2,$3,'question_quality_v4_1','PASS',$4,
                    $5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,CURRENT_TIMESTAMP)
        `, [
            crypto.randomUUID(),
            questionId,
            revisionId,
            `V4_1_MIGRATION_CERTIFIED_FROM:${audit.id}`,
            JSON.stringify(asArray(readField(audit, 'riskFlags', 'risk_flags'))),
            JSON.stringify(asArray(readField(audit, 'distractorResults', 'distractor_results'))),
            JSON.stringify(readField(audit, 'evidenceSnapshot', 'evidence_snapshot')),
            JSON.stringify(readField(audit, 'difficultySnapshot', 'difficulty_snapshot')),
            JSON.stringify(rawResult)
        ]);
    }
}

await initializeInfrastructure();

const questions = await dbOps.gamesDb.query('SELECT * FROM questions ORDER BY created_at, id');
const retiredIds = questions
    .filter(question => String(question.status).toUpperCase() === 'RETIRED'
        || String(readField(question, 'qualityState', 'quality_state')).toUpperCase() === 'RETIRED')
    .map(question => question.id);
const verified = questions.filter(question => String(question.status).toUpperCase() === 'PASS'
    && String(readField(question, 'qualityState', 'quality_state')).toUpperCase() === 'VERIFIED');
const invalidVerifiedStatus = questions.filter(question => String(question.status).toUpperCase() !== 'PASS'
    && String(readField(question, 'qualityState', 'quality_state')).toUpperCase() === 'VERIFIED');

const preview = {
    mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
    totalQuestions: questions.length,
    verifiedQuestions: verified.length,
    retiredQuestions: retiredIds.length,
    invalidVerifiedStatus: invalidVerifiedStatus.length,
    missingFormalRevision: 0,
    flatPools: 0,
    optionsOnly: 0,
    invalidFormalShape: 0
};

for (const question of verified) {
    const rawPool = asArray(readField(question, 'distractorsPool', 'distractors_pool'));
    if (!readField(question, 'activeRevisionId', 'active_revision_id')) preview.missingFormalRevision += 1;
    if (rawPool.length > 0 && !Array.isArray(rawPool[0])) preview.flatPools += 1;
    if (rawPool.length === 0 && asArray(question.options).length >= 4) preview.optionsOnly += 1;
    if (!hasRequiredFormalFields(question, deriveStandardPool(question))) preview.invalidFormalShape += 1;
}

if (!writeEnabled) {
    console.log(JSON.stringify({ ...preview, deleteRetiredRequested: deleteRetired }, null, 2));
    process.exit(0);
}

const result = await dbOps.gamesDb.transaction(async tx => {
    const report = {
        certified: 0,
        baselineRevisionsCreated: 0,
        normalizedPools: 0,
        stoppedForRepair: 0,
        certificationAuditsCopied: 0,
        invalidVerifiedStatusStopped: 0
    };

    if (invalidVerifiedStatus.length > 0) {
        const invalidIds = invalidVerifiedStatus.map(question => question.id);
        const placeholders = invalidIds.map((_, index) => `$${index + 1}`).join(',');
        const stopped = await tx.run(`
            UPDATE questions
            SET quality_state = 'NEEDS_REPAIR', verified = FALSE,
                quality_standard_version = 'question_quality_v4_1',
                quality_checked_at = CURRENT_TIMESTAMP,
                audit_reason = 'V4_1_VERIFIED_STATUS_MISMATCH',
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
        `, invalidIds);
        report.invalidVerifiedStatusStopped = Number(stopped?.changes || invalidIds.length);
    }

    for (const question of verified) {
        const rawPool = asArray(readField(question, 'distractorsPool', 'distractors_pool'));
        const distractorSets = deriveStandardPool(question);
        const normalizedChanged = JSON.stringify(rawPool) !== JSON.stringify(distractorSets);
        const auditRows = await qualifyingAudits(tx, question);
        const formalFieldsReady = hasRequiredFormalFields(question, distractorSets);
        if (!formalFieldsReady || auditRows.length < 2) {
            await tx.run(`
                UPDATE questions
                SET quality_state = 'NEEDS_REPAIR', verified = FALSE,
                    quality_standard_version = 'question_quality_v4_1',
                    quality_checked_at = CURRENT_TIMESTAMP,
                    audit_reason = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [
                !formalFieldsReady ? 'V4_1_FORMAL_SHAPE_INCOMPLETE' : 'V4_1_DOUBLE_CERTIFICATION_MISSING',
                question.id
            ]);
            report.stoppedForRepair += 1;
            continue;
        }

        let revisionId = readField(question, 'activeRevisionId', 'active_revision_id');
        if (!revisionId || normalizedChanged) {
            revisionId = await createBaselineRevision(
                tx,
                question,
                distractorSets,
                normalizedChanged ? 'V4_1_DISTRACTOR_POOL_NORMALIZATION' : 'V4_1_BASELINE_MIGRATION'
            );
            report.baselineRevisionsCreated += 1;
        }
        if (normalizedChanged) report.normalizedPools += 1;

        await copyCertificationAudits(tx, question.id, revisionId, auditRows);
        report.certificationAuditsCopied += auditRows.length;
        await tx.run(`
            UPDATE questions
            SET distractors_pool = $1::jsonb,
                active_revision_id = $2,
                quality_state = 'VERIFIED', quality_standard_version = 'question_quality_v4_1',
                quality_checked_at = CURRENT_TIMESTAMP,
                audit_reason = 'V4_1_MIGRATION_DOUBLE_AUDIT_CERTIFIED',
                quality = 'good', verified = TRUE, status = 'PASS',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [JSON.stringify(distractorSets), revisionId, question.id]);
        report.certified += 1;
    }

    await tx.run('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_verified_v4_1_shape');
    await tx.run(`
        ALTER TABLE questions
        ADD CONSTRAINT questions_verified_v4_1_shape CHECK (
            CASE
                WHEN quality_state <> 'VERIFIED' THEN TRUE
                WHEN status <> 'PASS' THEN FALSE
                WHEN active_revision_id IS NULL THEN FALSE
                WHEN quality_standard_version <> 'question_quality_v4_1' THEN FALSE
                WHEN NULLIF(BTRIM(COALESCE(version, '')), '') IS NULL THEN FALSE
                WHEN verse_start IS NULL THEN FALSE
                WHEN NULLIF(BTRIM(COALESCE(verse_ref, '')), '') IS NULL THEN FALSE
                WHEN final_difficulty_score IS NULL THEN FALSE
                WHEN NULLIF(BTRIM(COALESCE(difficulty_band, '')), '') IS NULL THEN FALSE
                WHEN jsonb_typeof(distractors_pool) <> 'array' THEN FALSE
                WHEN jsonb_array_length(distractors_pool) = 0 THEN FALSE
                WHEN jsonb_typeof(distractors_pool -> 0) <> 'array' THEN FALSE
                ELSE jsonb_array_length(distractors_pool -> 0) >= 3
            END
        ) NOT VALID
    `);
    await tx.run('ALTER TABLE questions VALIDATE CONSTRAINT questions_verified_v4_1_shape');
    return report;
});

let deletion = null;
if (deleteRetired) {
    deletion = await questionQualityService.deleteQuestionsPermanently(
        retiredIds,
        `system:v4.1-migration:backup=${backupReference}`
    );
}

const finalCounts = await dbOps.gamesDb.get(`
    SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE status = 'PASS' AND quality_state = 'VERIFIED')::INTEGER AS verified,
        COUNT(*) FILTER (
            WHERE status = 'PASS' AND quality_state = 'VERIFIED'
              AND active_revision_id IS NOT NULL
              AND quality_standard_version = 'question_quality_v4_1'
        )::INTEGER AS certified,
        COUNT(*) FILTER (WHERE status = 'RETIRED' OR quality_state = 'RETIRED')::INTEGER AS retired
    FROM questions
`);
const orphanCounts = await dbOps.gamesDb.get(`
    SELECT
        (SELECT COUNT(*) FROM question_revisions r LEFT JOIN questions q ON q.id = r.question_id WHERE q.id IS NULL)::INTEGER AS revisions,
        (SELECT COUNT(*) FROM question_quality_audits a LEFT JOIN questions q ON q.id = a.question_id WHERE q.id IS NULL)::INTEGER AS audits,
        (SELECT COUNT(*) FROM question_quality_jobs j WHERE j.question_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = j.question_id))::INTEGER AS jobs
`);

console.log(JSON.stringify({
    ...preview,
    backupReference: backupReference || null,
    result,
    deletion,
    finalCounts,
    orphanCounts
}, null, 2));
