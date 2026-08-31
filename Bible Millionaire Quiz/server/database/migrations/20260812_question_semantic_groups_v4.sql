BEGIN;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_group_key TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_duplicate_of TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_checked_at TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_check_version TEXT;

UPDATE questions
SET semantic_group_key = 'sem_v1_' || MD5(
        LOWER(REGEXP_REPLACE(COALESCE(book, ''), '[[:space:][:punct:]]', '', 'g')) || '|' ||
        UPPER(COALESCE(version, '')) || '|' ||
        COALESCE(chapter::text, '') || '|' ||
        CASE
            WHEN verse_start IS NOT NULL
            THEN verse_start::text || '-' || COALESCE(verse_end, verse_start)::text
            WHEN NULLIF(BTRIM(verse_ref), '') IS NOT NULL
            THEN LOWER(REGEXP_REPLACE(verse_ref, '[[:space:][:punct:]]', '', 'g'))
            ELSE ''
        END || '|' ||
        CASE
            WHEN (verse_start IS NOT NULL OR NULLIF(BTRIM(verse_ref), '') IS NOT NULL)
                 AND NULLIF(BTRIM(answer), '') IS NOT NULL
            THEN LOWER(REGEXP_REPLACE(answer, '[[:space:][:punct:]]', '', 'g'))
            ELSE LOWER(REGEXP_REPLACE(COALESCE(question, ''), '[[:space:][:punct:]]', '', 'g')) || '|' ||
                 LOWER(REGEXP_REPLACE(COALESCE(answer, ''), '[[:space:][:punct:]]', '', 'g'))
        END
    ),
    semantic_checked_at = COALESCE(semantic_checked_at, CURRENT_TIMESTAMP),
    semantic_check_version = COALESCE(semantic_check_version, 'question_semantic_v1_scope_backfill')
WHERE semantic_group_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_semantic_group ON questions(semantic_group_key);

COMMIT;
