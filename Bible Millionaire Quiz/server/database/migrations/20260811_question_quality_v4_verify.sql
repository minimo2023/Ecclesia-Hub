\pset tuples_only on
\pset format unaligned

SELECT 'questions=' || COUNT(*) FROM questions;
SELECT 'playable_pass=' || COUNT(*) FROM questions WHERE status = 'PASS';
SELECT 'quality_null=' || COUNT(*) FROM questions WHERE quality_state IS NULL;
SELECT 'legacy_pass=' || COUNT(*) FROM questions WHERE status = 'PASS' AND quality_state = 'LEGACY';
SELECT 'bad_initial_mapping=' || COUNT(*)
FROM questions
WHERE (status = 'PASS' AND quality_state <> 'LEGACY')
   OR (status = 'flagged' AND quality_state <> 'NEEDS_REPAIR')
   OR (status = 'FREEZE' AND quality_state <> 'QUARANTINED')
   OR (status = 'RETIRED' AND quality_state <> 'RETIRED');

SELECT 'v4_tables=' || COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'question_revisions',
      'question_quality_audits',
      'question_quality_jobs',
      'bible_source_sync_runs'
  );
