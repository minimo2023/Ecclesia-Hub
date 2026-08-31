#!/usr/bin/env node

import 'dotenv/config';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { questionQualityService } from '../domains/game/quality/QuestionQualityService.js';

const args = process.argv.slice(2);
const getArg = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '')
    .split('=').slice(1).join('=').trim();
const writeEnabled = args.includes('--write');
const runId = getArg('run');
const backupReference = getArg('backup-reference');

if (!runId) throw new Error('CORPUS_RUN_ID_REQUIRED');
if (writeEnabled && !backupReference) throw new Error('WRITE_REQUIRES_BACKUP_REFERENCE');

await initializeInfrastructure();

const run = await dbOps.gamesDb.get(`
    SELECT id, status, report
    FROM question_corpus_reaudit_runs
    WHERE id = $1
`, [runId]);
if (!run) throw new Error('CORPUS_REAUDIT_RUN_NOT_FOUND');
if (writeEnabled && run.status !== 'COMPLETED') {
    throw new Error(`CORPUS_REAUDIT_NOT_COMPLETED:${run.status}`);
}
const infrastructureErrors = Number(run.report?.errors || 0);
if (writeEnabled && infrastructureErrors > 0) {
    throw new Error(`CORPUS_REAUDIT_INFRASTRUCTURE_ERRORS_PENDING:${infrastructureErrors}`);
}

const candidates = await dbOps.gamesDb.query(`
    WITH deletion_candidates AS (
        SELECT q.id, 'CORPUS_' || item.final_result AS reason
        FROM question_corpus_reaudit_items item
        JOIN questions q ON q.id = item.question_id
        WHERE item.run_id = $1
          AND item.final_result IN ('CONTENT_FAILURE', 'INCONCLUSIVE')

        UNION ALL

        SELECT q.id,
               CASE
                   WHEN q.audit_reason LIKE 'DISTRACTOR_REPAIR_UNRESOLVED:%' THEN 'DISTRACTOR_THREE_AUDIT_NO_CONSENSUS'
                   WHEN q.audit_reason LIKE 'DISTRACTOR_REPAIR_%' THEN 'DISTRACTOR_DOUBLE_REPAIR_FAILURE'
                   WHEN q.audit_reason LIKE 'LOCATION_THREE_AUDIT_NO_CONSENSUS:%' THEN 'LOCATION_THREE_AUDIT_NO_CONSENSUS'
                   WHEN q.audit_reason LIKE 'LOCATION_DOUBLE_CONTENT_FAILURE:%' THEN 'LOCATION_DOUBLE_CONTENT_FAILURE'
                   WHEN q.audit_reason = 'DOUBLE_LOCATION_NOT_FOUND' THEN 'LOCATION_DOUBLE_NOT_FOUND'
                   ELSE 'V4_1_REPAIR_TERMINAL'
               END AS reason
        FROM questions q
        WHERE q.status = 'RETIRED'
           OR q.quality_state = 'RETIRED'
           OR q.audit_reason LIKE 'DISTRACTOR_REPAIR_UNRESOLVED:%'
           OR q.audit_reason LIKE 'LOCATION_THREE_AUDIT_NO_CONSENSUS:%'
           OR q.audit_reason LIKE 'LOCATION_DOUBLE_CONTENT_FAILURE:%'
           OR q.audit_reason = 'DOUBLE_LOCATION_NOT_FOUND'
    )
    SELECT id, MIN(reason) AS reason
    FROM deletion_candidates
    GROUP BY id
    ORDER BY id
`, [runId]);

const reasonCounts = Object.fromEntries(
    [...new Set(candidates.map(row => row.reason))]
        .map(reason => [reason, candidates.filter(row => row.reason === reason).length])
);
const preview = {
    mode: writeEnabled ? 'WRITE' : 'DRY_RUN',
    runId,
    runStatus: run.status,
    infrastructureErrors,
    backupReference: backupReference || null,
    deleteCount: candidates.length,
    reasonCounts
};

if (!writeEnabled) {
    console.log(JSON.stringify(preview, null, 2));
    process.exit(0);
}

const deletion = await questionQualityService.deleteQuestionsPermanently(
    candidates.map(row => row.id),
    `system:v4.1-finalizer:run=${runId}:backup=${backupReference}`
);
const orphanCounts = await dbOps.gamesDb.get(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM question_revisions r
       LEFT JOIN questions q ON q.id = r.question_id WHERE q.id IS NULL) AS revisions,
      (SELECT COUNT(*)::INTEGER FROM question_quality_audits a
       LEFT JOIN questions q ON q.id = a.question_id WHERE q.id IS NULL) AS audits,
      (SELECT COUNT(*)::INTEGER FROM question_quality_jobs j
       LEFT JOIN questions q ON q.id = j.question_id
       WHERE j.question_id IS NOT NULL AND q.id IS NULL) AS jobs
`);
const remaining = await dbOps.gamesDb.get(`
    SELECT COUNT(*)::INTEGER AS total,
           COUNT(*) FILTER (WHERE status = 'PASS' AND quality_state = 'VERIFIED')::INTEGER AS verified,
           COUNT(*) FILTER (WHERE status = 'RETIRED' OR quality_state = 'RETIRED')::INTEGER AS retired
    FROM questions
`);

console.log(JSON.stringify({
    ...preview,
    deletion,
    orphanCounts,
    remaining
}, null, 2));
