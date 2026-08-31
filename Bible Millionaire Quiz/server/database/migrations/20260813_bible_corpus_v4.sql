BEGIN;

CREATE TABLE IF NOT EXISTS bible_translation_versions (
    version_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_version TEXT,
    display_name_zh TEXT NOT NULL,
    language_code TEXT NOT NULL DEFAULT 'zh-Hant',
    testament_scope TEXT NOT NULL DEFAULT 'FULL',
    storage_policy TEXT NOT NULL,
    legacy_storage_version TEXT,
    expected_books INTEGER,
    expected_chapters INTEGER,
    expected_verses INTEGER,
    actual_books INTEGER NOT NULL DEFAULT 0,
    actual_chapters INTEGER NOT NULL DEFAULT 0,
    actual_verses INTEGER NOT NULL DEFAULT 0,
    blank_verses INTEGER NOT NULL DEFAULT 0,
    coverage_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    evidence_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    new_question_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bible_translation_aliases (
    alias TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES bible_translation_versions(version_id) ON DELETE CASCADE,
    alias_type TEXT NOT NULL DEFAULT 'COMPATIBILITY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bible_verse_staging (
    sync_run_id TEXT NOT NULL,
    version_id TEXT NOT NULL REFERENCES bible_translation_versions(version_id) ON DELETE RESTRICT,
    source_version TEXT NOT NULL,
    book TEXT NOT NULL,
    book_name TEXT NOT NULL,
    chapter INTEGER NOT NULL CHECK (chapter > 0),
    verse INTEGER NOT NULL CHECK (verse > 0),
    text TEXT NOT NULL,
    verse_status TEXT NOT NULL DEFAULT 'TEXT',
    source_sha256 TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sync_run_id, version_id, book, chapter, verse)
);

CREATE INDEX IF NOT EXISTS idx_bible_staging_version_run
    ON bible_verse_staging(version_id, sync_run_id, book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_bible_translation_coverage
    ON bible_translation_versions(coverage_status, evidence_eligible);

INSERT INTO bible_translation_versions (
    version_id, provider, source_version, display_name_zh, storage_policy,
    expected_books, expected_chapters, expected_verses, coverage_status,
    evidence_eligible, new_question_eligible, metadata
) VALUES
    (
        'CUV_TRAD', 'FHL', 'unv', '和合本', 'OFFLINE_ALLOWED',
        66, 1189, 31103, 'PENDING_STAGING', FALSE, FALSE,
        jsonb_build_object('fhl_package', 'bible_little.zip', 'fhl_table', 'nstrunv')
    ),
    (
        'LCC_TRAD', 'FHL', 'lcc', '呂振中譯本', 'OFFLINE_ALLOWED',
        66, 1189, 31103, 'PENDING_STAGING', FALSE, FALSE,
        jsonb_build_object('fhl_package', 'bible_lcc.zip', 'fhl_table', 'lcc')
    ),
    (
        'CNV_TRAD', 'FHL', 'ncv', '新譯本', 'EXISTING_LEGACY',
        66, 1189, 31080, 'COMPLETE_WITH_MERGED_VERSES', TRUE, FALSE,
        jsonb_build_object(
            'offline_download_allowed', FALSE,
            'merged_verse_placeholders', jsonb_build_array('2 Chronicles 30:19', '1 Thessalonians 2:7')
        )
    ),
    (
        'TCV2019_TRAD', 'FHL', 'tcv2019', '現代中文譯本2019', 'EXISTING_LEGACY',
        66, 1189, 31098, 'INCOMPLETE_BOOK', TRUE, FALSE,
        jsonb_build_object(
            'offline_download_allowed', FALSE,
            'missing_books', jsonb_build_array('Hebrews'),
            'legacy_storage_version', 'TCV2010_TRAD'
        )
    )
ON CONFLICT (version_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    source_version = EXCLUDED.source_version,
    display_name_zh = EXCLUDED.display_name_zh,
    storage_policy = EXCLUDED.storage_policy,
    expected_books = EXCLUDED.expected_books,
    expected_chapters = EXCLUDED.expected_chapters,
    expected_verses = EXCLUDED.expected_verses,
    coverage_status = CASE
        WHEN bible_translation_versions.coverage_status LIKE 'STAGED_%'
         AND EXCLUDED.coverage_status = 'PENDING_STAGING'
        THEN bible_translation_versions.coverage_status
        ELSE EXCLUDED.coverage_status
    END,
    evidence_eligible = EXCLUDED.evidence_eligible,
    new_question_eligible = EXCLUDED.new_question_eligible,
    metadata = bible_translation_versions.metadata || EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

UPDATE bible_translation_versions
SET legacy_storage_version = 'TCV2010_TRAD'
WHERE version_id = 'TCV2019_TRAD';

INSERT INTO bible_translation_aliases (alias, version_id, alias_type) VALUES
    ('CUV_TRAD', 'CUV_TRAD', 'CANONICAL'),
    ('unv', 'CUV_TRAD', 'FHL_SOURCE'),
    ('LCC_TRAD', 'LCC_TRAD', 'CANONICAL'),
    ('lcc', 'LCC_TRAD', 'FHL_SOURCE'),
    ('CNV_TRAD', 'CNV_TRAD', 'CANONICAL'),
    ('ncv', 'CNV_TRAD', 'FHL_SOURCE'),
    ('TCV2019_TRAD', 'TCV2019_TRAD', 'CANONICAL'),
    ('tcv2019', 'TCV2019_TRAD', 'FHL_SOURCE'),
    ('TCV2010_TRAD', 'TCV2019_TRAD', 'LEGACY_STORAGE'),
    ('tcv2010', 'TCV2019_TRAD', 'LEGACY_COMPATIBILITY')
ON CONFLICT (alias) DO UPDATE SET
    version_id = EXCLUDED.version_id,
    alias_type = EXCLUDED.alias_type;

UPDATE bible_verses
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'source_version', 'ncv',
        'verse_status', 'MERGED_WITH_PREVIOUS',
        'merged_into_verse', 18,
        'integrity_note', 'Upstream FHL ncv intentionally returns an empty placeholder for this verse number.'
    )
WHERE version = 'CNV_TRAD'
  AND book = '2 Chronicles'
  AND chapter = 30
  AND verse = 19
  AND BTRIM(COALESCE(text, '')) = '';

UPDATE bible_verses
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'source_version', 'ncv',
        'verse_status', 'MERGED_WITH_PREVIOUS',
        'merged_into_verse', 6,
        'integrity_note', 'Upstream FHL ncv intentionally returns an empty placeholder for this verse number.'
    )
WHERE version = 'CNV_TRAD'
  AND book = '1 Thessalonians'
  AND chapter = 2
  AND verse = 7
  AND BTRIM(COALESCE(text, '')) = '';

UPDATE bible_translation_versions registry
SET actual_books = stats.books,
    actual_chapters = stats.chapters,
    actual_verses = stats.verses,
    blank_verses = stats.blanks,
    last_verified_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT
        CASE WHEN version = 'TCV2010_TRAD' THEN 'TCV2019_TRAD' ELSE version END AS version_id,
        COUNT(DISTINCT book)::INTEGER AS books,
        COUNT(DISTINCT (book, chapter))::INTEGER AS chapters,
        COUNT(*)::INTEGER AS verses,
        COUNT(*) FILTER (WHERE BTRIM(COALESCE(text, '')) = '')::INTEGER AS blanks
    FROM bible_verses
    WHERE version IN ('CNV_TRAD', 'TCV2010_TRAD')
    GROUP BY version
) stats
WHERE registry.version_id = stats.version_id;

-- A completed compatibility corpus must remain completed when this migration
-- is safely re-run after a missing-book sync.
UPDATE bible_translation_versions
SET coverage_status = CASE
        WHEN actual_books = expected_books
         AND actual_chapters = expected_chapters
         AND actual_verses = expected_verses
         AND blank_verses = 0
        THEN 'COMPLETE'
        ELSE 'INCOMPLETE_BOOK'
    END,
    metadata = CASE
        WHEN actual_books = expected_books
         AND actual_chapters = expected_chapters
         AND actual_verses = expected_verses
         AND blank_verses = 0
        THEN metadata - 'missing_books'
        ELSE metadata || jsonb_build_object('missing_books', jsonb_build_array('Hebrews'))
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE version_id = 'TCV2019_TRAD';

COMMIT;
