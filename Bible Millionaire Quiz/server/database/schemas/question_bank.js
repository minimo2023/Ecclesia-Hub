/**
 * Question Bank Governance V1.
 *
 * This layer intentionally coexists with the V4 quality schema.  Runtime code
 * can be switched over only after the shadow inventory matches production.
 */
export async function createQuestionBankGovernanceTables(db) {
    await db.exec(`
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS canonical_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS legacy_version_code TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS publication_state TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS publication_state_reason TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS publication_state_changed_at TIMESTAMPTZ;

        UPDATE questions
        SET legacy_version_code = COALESCE(legacy_version_code, version),
            canonical_version = COALESCE(
                canonical_version,
                CASE LOWER(COALESCE(version, ''))
                    WHEN 'unv' THEN 'CUV_TRAD'
                    WHEN 'cuv' THEN 'CUV_TRAD'
                    WHEN 'cuv_trad' THEN 'CUV_TRAD'
                    WHEN 'ncv' THEN 'CNV_TRAD'
                    WHEN 'cnv_trad' THEN 'CNV_TRAD'
                    WHEN 'lcc' THEN 'LCC_TRAD'
                    WHEN 'lcc_trad' THEN 'LCC_TRAD'
                    WHEN 'tcv2010_trad' THEN 'TCV2019_TRAD'
                    WHEN 'tcv2019_trad' THEN 'TCV2019_TRAD'
                    WHEN 'tcv_trad' THEN 'TCV2019_TRAD'
                    WHEN 'tcv95' THEN 'TCV1995_TRAD'
                    WHEN 'tcv95_trad' THEN 'TCV1995_TRAD'
                    WHEN 'tcv1995_trad' THEN 'TCV1995_TRAD'
                    ELSE NULLIF(BTRIM(version), '')
                END
            ),
            publication_state = COALESCE(
                publication_state,
                CASE
                    WHEN LOWER(COALESCE(version, '')) IN ('tcv95', 'tcv95_trad', 'tcv1995_trad') THEN 'ARCHIVED'
                    WHEN COALESCE(quality_state, 'LEGACY') = 'VERIFIED' AND status = 'PASS' THEN 'PUBLISHED'
                    WHEN COALESCE(quality_state, 'LEGACY') IN ('NEEDS_REPAIR', 'QUARANTINED', 'EVIDENCE_UNAVAILABLE') THEN 'SUSPENDED'
                    WHEN COALESCE(quality_state, 'LEGACY') = 'RETIRED' OR status = 'RETIRED' THEN 'ARCHIVED'
                    WHEN COALESCE(quality_state, 'LEGACY') = 'DRAFT' THEN 'DRAFT'
                    ELSE 'IN_REVIEW'
                END
            ),
            publication_state_changed_at = COALESCE(publication_state_changed_at, updated_at, created_at, CURRENT_TIMESTAMP)
        WHERE legacy_version_code IS NULL
           OR canonical_version IS NULL
           OR publication_state IS NULL;

        ALTER TABLE questions ALTER COLUMN publication_state SET DEFAULT 'IN_REVIEW';

        CREATE TABLE IF NOT EXISTS question_bank_versions (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            source_version TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            generation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            expected_books INTEGER NOT NULL DEFAULT 66,
            expected_chapters INTEGER NOT NULL DEFAULT 1189,
            sort_order INTEGER NOT NULL DEFAULT 100,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO question_bank_versions
            (id, display_name, source_version, enabled, generation_enabled, sort_order)
        VALUES
            ('CUV_TRAD', '和合本', 'unv', TRUE, TRUE, 10),
            ('LCC_TRAD', '呂振中譯本', 'lcc', TRUE, TRUE, 20),
            ('CNV_TRAD', '新譯本', 'ncv', TRUE, TRUE, 30),
            ('TCV2019_TRAD', '現代中文譯本 2019', 'tcv2019', TRUE, TRUE, 40)
        ON CONFLICT (id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            source_version = EXCLUDED.source_version,
            sort_order = EXCLUDED.sort_order,
            updated_at = CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS question_bank_policies (
            id TEXT PRIMARY KEY,
            scope_type TEXT NOT NULL,
            version_id TEXT REFERENCES question_bank_versions(id) ON DELETE CASCADE,
            book TEXT,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            revision INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            previous_policy_id TEXT REFERENCES question_bank_policies(id) ON DELETE SET NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deactivated_at TIMESTAMPTZ,
            CHECK (scope_type IN ('GLOBAL', 'VERSION', 'BOOK')),
            CHECK (
                (scope_type = 'GLOBAL' AND version_id IS NULL AND book IS NULL)
                OR (scope_type = 'VERSION' AND version_id IS NOT NULL AND book IS NULL)
                OR (scope_type = 'BOOK' AND version_id IS NOT NULL AND book IS NOT NULL)
            )
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_question_bank_policy_active_scope
            ON question_bank_policies(
                scope_type,
                COALESCE(version_id, ''),
                COALESCE(book, '')
            ) WHERE is_active = TRUE;

        CREATE TABLE IF NOT EXISTS question_checks (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
            revision_id TEXT REFERENCES question_revisions(id) ON DELETE SET NULL,
            check_type TEXT NOT NULL,
            result TEXT NOT NULL,
            reason TEXT,
            skill_version TEXT NOT NULL,
            model TEXT,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (check_type IN ('STRUCTURE', 'EVIDENCE', 'DUPLICATE', 'DIFFICULTY', 'FULL_AUDIT')),
            CHECK (result IN ('PENDING', 'PASS', 'WARN', 'FAIL', 'UNAVAILABLE'))
        );

        CREATE INDEX IF NOT EXISTS idx_questions_canonical_bank
            ON questions(canonical_version, book, publication_state);
        CREATE INDEX IF NOT EXISTS idx_questions_publication_state
            ON questions(publication_state);
        CREATE INDEX IF NOT EXISTS idx_question_checks_latest
            ON question_checks(question_id, check_type, created_at DESC);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'questions_publication_state_check'
            ) THEN
                ALTER TABLE questions ADD CONSTRAINT questions_publication_state_check CHECK (
                    publication_state IS NULL OR publication_state IN
                    ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED')
                ) NOT VALID;
            END IF;
        END $$;
    `);
}

export default createQuestionBankGovernanceTables;
