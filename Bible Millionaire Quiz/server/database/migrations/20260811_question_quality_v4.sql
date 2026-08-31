BEGIN;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_state TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_standard_version TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS active_revision_id TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ;

UPDATE questions
SET quality_state = CASE status
    WHEN 'flagged' THEN 'NEEDS_REPAIR'
    WHEN 'FREEZE' THEN 'QUARANTINED'
    WHEN 'RETIRED' THEN 'RETIRED'
    ELSE 'LEGACY'
END
WHERE quality_state IS NULL;

ALTER TABLE questions ALTER COLUMN quality_state SET DEFAULT 'LEGACY';
ALTER TABLE questions ALTER COLUMN quality_state SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'questions_quality_state_check'
    ) THEN
        ALTER TABLE questions ADD CONSTRAINT questions_quality_state_check CHECK (
            quality_state IN (
                'LEGACY', 'DRAFT', 'SCANNING', 'VERIFIED', 'NEEDS_REPAIR',
                'QUARANTINED', 'EVIDENCE_UNAVAILABLE', 'RETIRED'
            )
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS question_revisions (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    revision_number INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (
        state IN ('CANDIDATE', 'APPROVED', 'REJECTED', 'SUPERSEDED')
    ),
    source TEXT NOT NULL,
    created_by TEXT,
    previous_payload JSONB NOT NULL,
    candidate_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    UNIQUE(question_id, revision_number)
);

CREATE TABLE IF NOT EXISTS question_quality_audits (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    revision_id TEXT REFERENCES question_revisions(id) ON DELETE SET NULL,
    standard_version TEXT NOT NULL,
    result TEXT NOT NULL CHECK (
        result IN ('PASS', 'FREEZE', 'REJECT', 'RETRY_DISTRACTORS', 'EVIDENCE_UNAVAILABLE', 'INFRASTRUCTURE_ERROR')
    ),
    reason TEXT,
    risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    distractor_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_snapshot JSONB,
    difficulty_snapshot JSONB,
    raw_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_quality_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (
        job_type IN (
            'LEGACY_AUDIT', 'DISTRACTOR_REPAIR', 'QUESTION_REPAIR',
            'NEW_QUESTION_AUDIT', 'QUESTION_AUDIT_V4_1', 'NEW_QUESTION_PRODUCTION'
        )
    ),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
    scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER NOT NULL DEFAULT 100,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    dedupe_key TEXT,
    last_error TEXT,
    result JSONB,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_jobs_active_dedupe
    ON question_quality_jobs(dedupe_key)
    WHERE dedupe_key IS NOT NULL AND status IN ('PENDING', 'RUNNING');

CREATE TABLE IF NOT EXISTS bible_source_sync_runs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_version TEXT NOT NULL,
    target_version TEXT NOT NULL,
    book TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED')),
    chapter_count INTEGER NOT NULL DEFAULT 0,
    fetched_verse_count INTEGER NOT NULL DEFAULT 0,
    inserted_verse_count INTEGER NOT NULL DEFAULT 0,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'questions_active_revision_fk'
    ) THEN
        ALTER TABLE questions ADD CONSTRAINT questions_active_revision_fk
            FOREIGN KEY (active_revision_id) REFERENCES question_revisions(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF TO_REGCLASS('public.attempts') IS NOT NULL THEN
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_revision_id TEXT;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS selected_option TEXT;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS response_ms INTEGER;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS game_mode TEXT;
    END IF;

    IF TO_REGCLASS('public.game_reward_attempts') IS NOT NULL THEN
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS question_revision_id TEXT;
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS selected_option TEXT;
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS response_ms INTEGER;
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS game_mode TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_quality_state ON questions(quality_state);
CREATE INDEX IF NOT EXISTS idx_questions_quality_checked_at ON questions(quality_checked_at);
CREATE INDEX IF NOT EXISTS idx_question_revisions_question ON question_revisions(question_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_question_quality_audits_question ON question_quality_audits(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_quality_audits_revision ON question_quality_audits(revision_id);
CREATE INDEX IF NOT EXISTS idx_question_quality_jobs_queue
    ON question_quality_jobs(status, priority, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_bible_source_sync_runs_lookup
    ON bible_source_sync_runs(target_version, book, started_at DESC);
DO $$
BEGIN
    IF TO_REGCLASS('public.game_reward_attempts') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_game_reward_attempts_question
            ON game_reward_attempts(question_id, attempted_at DESC);
    END IF;
END $$;

COMMIT;
