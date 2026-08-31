BEGIN;

-- Candidate revisions can also contain legacy plain-text/Markdown model output.
-- Mark those audits as infrastructure errors without changing the live question.
UPDATE question_quality_audits
SET result = 'INFRASTRUCTURE_ERROR',
    reason = 'UNSTRUCTURED_AI_AUDIT_RESPONSE'
WHERE revision_id IS NOT NULL
  AND result IN ('PASS', 'FREEZE', 'REJECT', 'RETRY_DISTRACTORS')
  AND jsonb_typeof(raw_result) = 'string';

WITH affected AS (
    UPDATE question_quality_audits
    SET result = 'INFRASTRUCTURE_ERROR',
        reason = 'UNSTRUCTURED_AI_AUDIT_RESPONSE'
    WHERE revision_id IS NULL
      AND result IN ('PASS', 'FREEZE', 'REJECT', 'RETRY_DISTRACTORS')
      AND jsonb_typeof(raw_result) = 'string'
    RETURNING question_id
)
UPDATE questions q
SET quality_state = 'LEGACY',
    quality_checked_at = NULL,
    audit_reason = '等待重新執行結構化 V4 稽核',
    updated_at = CURRENT_TIMESTAMP
WHERE q.id IN (SELECT question_id FROM affected)
  AND q.status = 'PASS';

WITH latest_patrol_audits AS (
    SELECT DISTINCT ON (question_id) question_id, result
    FROM question_quality_audits
    WHERE revision_id IS NULL
    ORDER BY question_id, created_at DESC
), infrastructure_questions AS (
    SELECT question_id FROM latest_patrol_audits
    WHERE result = 'INFRASTRUCTURE_ERROR'
)
UPDATE question_quality_jobs job
SET status = 'PENDING',
    attempt_count = 0,
    available_at = CURRENT_TIMESTAMP,
    started_at = NULL,
    completed_at = NULL,
    result = NULL,
    last_error = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE job.job_type = 'LEGACY_AUDIT'
  AND job.status IN ('FAILED', 'COMPLETED')
  AND job.question_id IN (SELECT question_id FROM infrastructure_questions);

COMMIT;
