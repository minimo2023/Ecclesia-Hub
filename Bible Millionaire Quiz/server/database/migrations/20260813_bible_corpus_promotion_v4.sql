BEGIN;

ALTER TABLE bible_translation_versions
    ADD COLUMN IF NOT EXISTS active_sync_run_id TEXT;
ALTER TABLE bible_translation_versions
    ADD COLUMN IF NOT EXISTS active_promotion_id TEXT;

CREATE TABLE IF NOT EXISTS bible_corpus_promotions (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES bible_translation_versions(version_id) ON DELETE RESTRICT,
    storage_version TEXT NOT NULL,
    source_version TEXT NOT NULL,
    sync_run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    existing_verses INTEGER NOT NULL DEFAULT 0,
    exact_verses INTEGER NOT NULL DEFAULT 0,
    normalized_equivalent_verses INTEGER NOT NULL DEFAULT 0,
    content_different_verses INTEGER NOT NULL DEFAULT 0,
    inserted_verses INTEGER NOT NULL DEFAULT 0,
    updated_verses INTEGER NOT NULL DEFAULT 0,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    rolled_back_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bible_corpus_completed_promotion
    ON bible_corpus_promotions(version_id, sync_run_id)
    WHERE status = 'COMPLETED';

CREATE TABLE IF NOT EXISTS bible_verse_revisions (
    promotion_id TEXT NOT NULL REFERENCES bible_corpus_promotions(id) ON DELETE RESTRICT,
    verse_id TEXT NOT NULL,
    action TEXT NOT NULL,
    version TEXT NOT NULL,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    previous_text TEXT,
    previous_source TEXT,
    previous_book_name TEXT,
    previous_metadata JSONB,
    previous_cached_at TIMESTAMP,
    new_text_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (promotion_id, version, book, chapter, verse)
);

CREATE INDEX IF NOT EXISTS idx_bible_verse_revisions_reference
    ON bible_verse_revisions(version, book, chapter, verse);

INSERT INTO bible_translation_aliases(alias, version_id, alias_type) VALUES
    ('TCV_TRAD', 'TCV2019_TRAD', 'LEGACY_COMPATIBILITY'),
    ('tcv', 'TCV2019_TRAD', 'LEGACY_COMPATIBILITY')
ON CONFLICT (alias) DO UPDATE SET
    version_id = EXCLUDED.version_id,
    alias_type = EXCLUDED.alias_type;

-- Corpus promotion does not authorize question generation.  Every version
-- remains closed until the separate shadow-generation acceptance stage.
UPDATE bible_translation_versions
SET new_question_eligible = FALSE,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
