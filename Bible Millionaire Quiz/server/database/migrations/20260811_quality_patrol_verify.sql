\pset tuples_only on
\pset format unaligned

SELECT 'jobs:' || status || ':' || COUNT(*)
FROM question_quality_jobs
GROUP BY status
ORDER BY status;

SELECT 'audits:' || result || ':' || COUNT(*)
FROM question_quality_audits
GROUP BY result
ORDER BY result;

SELECT 'latest_job:' || status || ':' || COALESCE(result ->> 'result', '')
FROM question_quality_jobs
WHERE status = 'COMPLETED'
ORDER BY completed_at DESC
LIMIT 1;

SELECT 'quality:' || quality_state || ':' || COUNT(*)
FROM questions
GROUP BY quality_state
ORDER BY quality_state;
