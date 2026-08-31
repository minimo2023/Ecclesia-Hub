BEGIN;

ALTER TABLE question_quality_audits
    DROP CONSTRAINT IF EXISTS question_quality_audits_result_check;
ALTER TABLE question_quality_audits
    ADD CONSTRAINT question_quality_audits_result_check CHECK (
        result IN (
            'PASS', 'FREEZE', 'REJECT', 'RETRY_DISTRACTORS',
            'EVIDENCE_UNAVAILABLE', 'INFRASTRUCTURE_ERROR'
        )
    );

CREATE TEMP TABLE v4_ai_infra_affected_questions ON COMMIT DROP AS
SELECT DISTINCT question_id
FROM question_quality_audits
WHERE result IN ('FREEZE', 'INFRASTRUCTURE_ERROR')
  AND (
      COALESCE(raw_result ->> 'error', '') ILIKE '%no longer available%'
      OR (result = 'FREEZE' AND jsonb_typeof(raw_result) = 'string')
  );

UPDATE question_quality_audits
SET result = 'INFRASTRUCTURE_ERROR',
    reason = CASE
        WHEN jsonb_typeof(raw_result) = 'string' THEN 'DOUBLE_ENCODED_AUDIT_RESPONSE'
        ELSE 'MODEL_UNAVAILABLE_404'
    END,
    risk_flags = risk_flags || CASE
        WHEN jsonb_typeof(raw_result) = 'string'
            THEN '["INFRASTRUCTURE_ERROR","RESPONSE_PARSE_ERROR"]'::jsonb
        ELSE '["INFRASTRUCTURE_ERROR","MODEL_UNAVAILABLE"]'::jsonb
    END
WHERE question_id IN (SELECT question_id FROM v4_ai_infra_affected_questions)
  AND (
      COALESCE(raw_result ->> 'error', '') ILIKE '%no longer available%'
      OR (result = 'FREEZE' AND jsonb_typeof(raw_result) = 'string')
  );

UPDATE questions
SET quality_state = 'LEGACY',
    quality_standard_version = NULL,
    quality_checked_at = NULL,
    audit_reason = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT question_id FROM v4_ai_infra_affected_questions)
  AND status = 'PASS'
  AND quality_state = 'NEEDS_REPAIR';

UPDATE question_quality_jobs
SET status = 'FAILED',
    last_error = 'MODEL_UNAVAILABLE_404_MISCLASSIFIED',
    result = '{"result":"INFRASTRUCTURE_ERROR","restoredQualityState":"LEGACY"}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE question_id IN (SELECT question_id FROM v4_ai_infra_affected_questions)
  AND status = 'COMPLETED'
  AND COALESCE(result ->> 'result', '') = 'FREEZE';

INSERT INTO ai_gov.ai_system_config (key, value)
VALUES ('default_ai_model', 'gemini-3.1-flash-lite')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = CURRENT_TIMESTAMP;

UPDATE ai_gov.ai_model_config
SET is_active = CASE WHEN model_id = 'gemini-3.1-flash-lite' THEN TRUE ELSE FALSE END,
    updated_at = CURRENT_TIMESTAMP
WHERE model_id IN ('gemini-3.1-flash-lite', 'gemini-2.5-flash-lite');

COMMIT;
