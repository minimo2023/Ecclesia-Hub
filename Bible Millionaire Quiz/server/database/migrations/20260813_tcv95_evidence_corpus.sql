BEGIN;

INSERT INTO bible_translation_versions (
    version_id, provider, source_version, display_name_zh, storage_policy,
    expected_books, expected_chapters, expected_verses, coverage_status,
    evidence_eligible, new_question_eligible, metadata
) VALUES (
    'TCV1995_TRAD', 'FHL', 'tcv95', '現代中文譯本1995（舊題證據）', 'EVIDENCE_ONLY',
    66, 1189, NULL, 'PENDING_SYNC', FALSE, FALSE,
    jsonb_build_object('public', FALSE, 'evidence_only', TRUE)
)
ON CONFLICT (version_id) DO UPDATE SET
    source_version = 'tcv95',
    display_name_zh = EXCLUDED.display_name_zh,
    storage_policy = 'EVIDENCE_ONLY',
    new_question_eligible = FALSE,
    metadata = bible_translation_versions.metadata || EXCLUDED.metadata,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO bible_translation_aliases (alias, version_id, alias_type) VALUES
    ('TCV1995_TRAD', 'TCV1995_TRAD', 'CANONICAL'),
    ('TCV95_TRAD', 'TCV1995_TRAD', 'LEGACY_COMPATIBILITY'),
    ('tcv95', 'TCV1995_TRAD', 'FHL_SOURCE')
ON CONFLICT (alias) DO UPDATE SET
    version_id = EXCLUDED.version_id,
    alias_type = EXCLUDED.alias_type;

COMMIT;
