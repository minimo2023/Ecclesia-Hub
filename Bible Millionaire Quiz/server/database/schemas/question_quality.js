/**
 * 問答題庫品質閉環 V4 schema。
 * 正式生產升級使用 migrations/20260811_question_quality_v4.sql；此處確保新環境
 * 初始化後具有相同的相容式結構。
 */
export async function createQuestionQualityV4Tables(db) {
    await db.exec(`
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_state TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_standard_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS active_revision_id TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_group_key TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_duplicate_of TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_checked_at TIMESTAMPTZ;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS semantic_check_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_locale TEXT DEFAULT 'unknown';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_locale_checked_at TIMESTAMPTZ;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_locale_rule_version TEXT;

        CREATE OR REPLACE FUNCTION public.classify_question_content_locale()
        RETURNS TRIGGER AS $$
        DECLARE
            source_text TEXT := COALESCE(NEW.question, '') || ' ' || COALESCE(NEW.answer, '');
        BEGIN
            NEW.content_locale := CASE
                WHEN source_text ~ '[一-鿿]' AND source_text ~ '[A-Za-z]{3,}' THEN 'mixed'
                WHEN source_text ~ '[一-鿿]' THEN 'zh-TW'
                WHEN source_text ~ '[A-Za-z]' THEN 'en'
                ELSE 'unknown'
            END;
            NEW.content_locale_checked_at := CURRENT_TIMESTAMP;
            NEW.content_locale_rule_version := 'content_locale_v1';
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_questions_content_locale ON questions;
        CREATE TRIGGER trg_questions_content_locale
        BEFORE INSERT OR UPDATE OF question, answer ON questions
        FOR EACH ROW EXECUTE FUNCTION public.classify_question_content_locale();

        UPDATE questions
        SET content_locale = CASE
                WHEN (COALESCE(question, '') || ' ' || COALESCE(answer, '')) ~ '[一-鿿]'
                     AND (COALESCE(question, '') || ' ' || COALESCE(answer, '')) ~ '[A-Za-z]{3,}' THEN 'mixed'
                WHEN (COALESCE(question, '') || ' ' || COALESCE(answer, '')) ~ '[一-鿿]' THEN 'zh-TW'
                WHEN (COALESCE(question, '') || ' ' || COALESCE(answer, '')) ~ '[A-Za-z]' THEN 'en'
                ELSE 'unknown'
            END,
            content_locale_checked_at = CURRENT_TIMESTAMP,
            content_locale_rule_version = 'content_locale_v1'
        WHERE content_locale_checked_at IS NULL
           OR content_locale_rule_version IS DISTINCT FROM 'content_locale_v1';

        UPDATE questions
        SET quality_state = CASE status
            WHEN 'flagged' THEN 'NEEDS_REPAIR'
            WHEN 'FREEZE' THEN 'QUARANTINED'
            WHEN 'RETIRED' THEN 'RETIRED'
            ELSE 'LEGACY'
        END
        WHERE quality_state IS NULL;

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

        UPDATE questions
        SET status = 'RETIRED',
            quality_state = 'RETIRED',
            quality_checked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'PASS'
          AND (
              LEFT(LOWER(id), 5) = 'test_'
              OR question ILIKE '%【JIT 測試】%'
          );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'questions_no_playable_test_artifacts'
                  AND conrelid = 'questions'::regclass
            ) THEN
                ALTER TABLE questions
                ADD CONSTRAINT questions_no_playable_test_artifacts
                CHECK (
                    status <> 'PASS'
                    OR (
                        LEFT(LOWER(id), 5) <> 'test_'
                        AND question NOT ILIKE '%【JIT 測試】%'
                    )
                ) NOT VALID;
            END IF;
        END $$;

        ALTER TABLE questions
        VALIDATE CONSTRAINT questions_no_playable_test_artifacts;

        ALTER TABLE questions ALTER COLUMN quality_state SET DEFAULT 'LEGACY';
        ALTER TABLE questions ALTER COLUMN quality_state SET NOT NULL;

        CREATE TABLE IF NOT EXISTS question_revisions (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
            revision_number INTEGER NOT NULL,
            state TEXT NOT NULL DEFAULT 'CANDIDATE',
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
            result TEXT NOT NULL,
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
            job_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
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

        CREATE TABLE IF NOT EXISTS question_corpus_reaudit_runs (
            id TEXT PRIMARY KEY,
            standard_version TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PREPARING',
            corpus_fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
            total_questions INTEGER NOT NULL DEFAULT 0,
            evidence_ready_count INTEGER NOT NULL DEFAULT 0,
            evidence_unavailable_count INTEGER NOT NULL DEFAULT 0,
            structural_failure_count INTEGER NOT NULL DEFAULT 0,
            ai_pending_count INTEGER NOT NULL DEFAULT 0,
            ai_completed_count INTEGER NOT NULL DEFAULT 0,
            report JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            prepared_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS question_corpus_reaudit_items (
            run_id TEXT NOT NULL REFERENCES question_corpus_reaudit_runs(id) ON DELETE RESTRICT,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
            original_status TEXT,
            original_quality_state TEXT,
            version_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
            evidence_status TEXT NOT NULL,
            evidence_reason TEXT,
            evidence_snapshot JSONB,
            structural_status TEXT NOT NULL,
            structural_reason TEXT,
            answer_literal_in_evidence BOOLEAN,
            ai_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
            audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
            pass_count INTEGER NOT NULL DEFAULT 0,
            failure_count INTEGER NOT NULL DEFAULT 0,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            priority INTEGER NOT NULL DEFAULT 100,
            final_result TEXT,
            last_error TEXT,
            available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, question_id)
        );

        CREATE TABLE IF NOT EXISTS bible_source_sync_runs (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            source_version TEXT NOT NULL,
            target_version TEXT NOT NULL,
            book TEXT NOT NULL,
            status TEXT NOT NULL,
            chapter_count INTEGER NOT NULL DEFAULT 0,
            fetched_verse_count INTEGER NOT NULL DEFAULT 0,
            inserted_verse_count INTEGER NOT NULL DEFAULT 0,
            report JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ
        );

        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_revision_id TEXT;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS selected_option TEXT;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS response_ms INTEGER;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS game_mode TEXT;

        CREATE INDEX IF NOT EXISTS idx_questions_quality_state ON questions(quality_state);
        CREATE INDEX IF NOT EXISTS idx_questions_quality_checked_at ON questions(quality_checked_at);
        CREATE INDEX IF NOT EXISTS idx_questions_semantic_group ON questions(semantic_group_key);
        CREATE INDEX IF NOT EXISTS idx_questions_content_locale ON questions(content_locale);
        CREATE INDEX IF NOT EXISTS idx_question_revisions_question ON question_revisions(question_id, revision_number DESC);
        CREATE INDEX IF NOT EXISTS idx_question_quality_audits_question ON question_quality_audits(question_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_question_quality_audits_revision ON question_quality_audits(revision_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_jobs_active_dedupe
            ON question_quality_jobs(dedupe_key)
            WHERE dedupe_key IS NOT NULL AND status IN ('PENDING', 'RUNNING');
        CREATE INDEX IF NOT EXISTS idx_question_quality_jobs_queue
            ON question_quality_jobs(status, priority, available_at, created_at);
        CREATE INDEX IF NOT EXISTS idx_question_corpus_reaudit_runs_status
            ON question_corpus_reaudit_runs(status, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_question_corpus_reaudit_items_queue
            ON question_corpus_reaudit_items(run_id, ai_status, priority, available_at, created_at);
        CREATE INDEX IF NOT EXISTS idx_question_corpus_reaudit_items_question
            ON question_corpus_reaudit_items(question_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_bible_source_sync_runs_lookup
            ON bible_source_sync_runs(target_version, book, started_at DESC);
    `);

    await db.exec(`
        ALTER TABLE question_quality_jobs
            DROP CONSTRAINT IF EXISTS question_quality_jobs_job_type_check;
        ALTER TABLE question_quality_jobs
            ADD CONSTRAINT question_quality_jobs_job_type_check CHECK (
                job_type IN (
                    'LEGACY_AUDIT', 'DISTRACTOR_REPAIR', 'QUESTION_REPAIR',
                    'NEW_QUESTION_AUDIT', 'QUESTION_AUDIT_V4_1',
                    'NEW_QUESTION_PRODUCTION'
                )
            );

        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_quality_state_check') THEN
                ALTER TABLE questions ADD CONSTRAINT questions_quality_state_check CHECK (
                    quality_state IN (
                        'LEGACY', 'DRAFT', 'SCANNING', 'VERIFIED', 'NEEDS_REPAIR',
                        'QUARANTINED', 'EVIDENCE_UNAVAILABLE', 'RETIRED'
                    )
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_active_revision_fk') THEN
                ALTER TABLE questions ADD CONSTRAINT questions_active_revision_fk
                    FOREIGN KEY (active_revision_id) REFERENCES question_revisions(id) ON DELETE SET NULL;
            END IF;
        END $$;
    `);
}
