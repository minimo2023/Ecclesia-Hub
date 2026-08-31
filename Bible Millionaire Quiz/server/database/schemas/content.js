/**
 * 聖經數據與內容主體 Schema (content)
 * [V3 Sovereign Proxy]
 */

/**
 * 建立核心內容資料表 (PostgreSQL)
 */
export async function createContentTables(db) {
    // Bible verses
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bible_verses (
            id TEXT PRIMARY KEY,
            version TEXT,
            book TEXT,
            book_name TEXT,
            chapter INTEGER,
            verse INTEGER,
            text TEXT,
            source TEXT,
            metadata JSONB,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(version, book, chapter, verse)
        );
        CREATE INDEX IF NOT EXISTS idx_verse_ref ON bible_verses(book, chapter, verse);
        CREATE INDEX IF NOT EXISTS idx_verse_version ON bible_verses(version, book);
    `);

    // V4 canonical translation registry and non-destructive import staging.
    // bible_verses remains the compatibility table until a staged corpus has
    // passed verification and is explicitly promoted.
    await db.exec(`
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
            active_sync_run_id TEXT,
            active_promotion_id TEXT,
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

        INSERT INTO bible_translation_versions (
            version_id, provider, source_version, display_name_zh, storage_policy,
            expected_books, expected_chapters, expected_verses, coverage_status,
            evidence_eligible, new_question_eligible, metadata
        ) VALUES
            ('CUV_TRAD', 'FHL', 'unv', '和合本', 'OFFLINE_ALLOWED',
             66, 1189, 31103, 'PENDING_STAGING', FALSE, FALSE,
             jsonb_build_object('fhl_package', 'bible_little.zip', 'fhl_table', 'nstrunv')),
            ('LCC_TRAD', 'FHL', 'lcc', '呂振中譯本', 'OFFLINE_ALLOWED',
             66, 1189, 31103, 'PENDING_STAGING', FALSE, FALSE,
             jsonb_build_object('fhl_package', 'bible_lcc.zip', 'fhl_table', 'lcc')),
            ('CNV_TRAD', 'FHL', 'ncv', '新譯本', 'EXISTING_LEGACY',
             66, 1189, 31080, 'COMPLETE_WITH_MERGED_VERSES', TRUE, FALSE,
             jsonb_build_object('offline_download_allowed', FALSE)),
            ('TCV2019_TRAD', 'FHL', 'tcv2019', '現代中文譯本2019', 'EXISTING_LEGACY',
             66, 1189, 31098, 'INCOMPLETE_BOOK', TRUE, FALSE,
             jsonb_build_object('offline_download_allowed', FALSE,
                                'missing_books', jsonb_build_array('Hebrews'),
                                'legacy_storage_version', 'TCV2010_TRAD')),
            ('TCV1995_TRAD', 'FHL', 'tcv95', '現代中文譯本1995（舊題證據）', 'EVIDENCE_ONLY',
             66, 1189, NULL, 'PENDING_SYNC', FALSE, FALSE,
             jsonb_build_object('public', FALSE, 'evidence_only', TRUE))
        ON CONFLICT (version_id) DO NOTHING;

        UPDATE bible_translation_versions
        SET legacy_storage_version = 'TCV2010_TRAD'
        WHERE version_id = 'TCV2019_TRAD' AND legacy_storage_version IS NULL;

        INSERT INTO bible_translation_aliases (alias, version_id, alias_type) VALUES
            ('CUV_TRAD', 'CUV_TRAD', 'CANONICAL'), ('unv', 'CUV_TRAD', 'FHL_SOURCE'),
            ('LCC_TRAD', 'LCC_TRAD', 'CANONICAL'), ('lcc', 'LCC_TRAD', 'FHL_SOURCE'),
            ('CNV_TRAD', 'CNV_TRAD', 'CANONICAL'), ('ncv', 'CNV_TRAD', 'FHL_SOURCE'),
            ('TCV2019_TRAD', 'TCV2019_TRAD', 'CANONICAL'), ('tcv2019', 'TCV2019_TRAD', 'FHL_SOURCE'),
            ('TCV2010_TRAD', 'TCV2019_TRAD', 'LEGACY_STORAGE'),
            ('tcv2010', 'TCV2019_TRAD', 'LEGACY_COMPATIBILITY'),
            ('TCV_TRAD', 'TCV2019_TRAD', 'LEGACY_COMPATIBILITY'),
            ('tcv', 'TCV2019_TRAD', 'LEGACY_COMPATIBILITY'),
            ('TCV1995_TRAD', 'TCV1995_TRAD', 'CANONICAL'),
            ('TCV95_TRAD', 'TCV1995_TRAD', 'LEGACY_COMPATIBILITY'),
            ('tcv95', 'TCV1995_TRAD', 'FHL_SOURCE')
        ON CONFLICT (alias) DO UPDATE SET
            version_id = EXCLUDED.version_id,
            alias_type = EXCLUDED.alias_type;
    `);

    // Bible Books
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bible_books (
            id TEXT PRIMARY KEY,
            name_zh TEXT,
            name_en TEXT,
            testament TEXT,
            category TEXT,
            chapters INTEGER,
            order_num INTEGER,
            metadata JSONB DEFAULT '{}'
        );
    `);

    // Unified Leaderboard
    await db.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            name TEXT,
            score INTEGER DEFAULT 0,
            total_score INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            high_score INTEGER DEFAULT 0,
            is_victory BOOLEAN DEFAULT FALSE,
            mode TEXT DEFAULT 'general',
            game_mode TEXT DEFAULT 'general',
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            timestamp BIGINT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard(user_id);
    `);

    // Infinite challenge leaderboard (server-settled only).
    await db.exec(`
        CREATE TABLE IF NOT EXISTS infinite_leaderboard (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            level INTEGER NOT NULL DEFAULT 0,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            timestamp BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_infinite_leaderboard_level
            ON infinite_leaderboard(level DESC);
    `);

    // questions 的唯一 schema 擁有者是 games.js；內容模組只管理經文與知識資料。


    // Locations (地理資訊)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            code TEXT,
            name_zh TEXT,
            name_en TEXT,
            modern_name TEXT,
            type TEXT,
            book TEXT,
            chapter INTEGER,
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            meaning TEXT,
            description TEXT,
            entities JSONB DEFAULT '[]',
            verse_refs TEXT,
            metadata JSONB DEFAULT '{}',
            image_path TEXT,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed BOOLEAN DEFAULT FALSE
        );
    `);

    // Verse Locations (經文與地理關聯)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS verse_locations (
            id SERIAL PRIMARY KEY,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER,
            location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_verse_loc_ref ON verse_locations(book, chapter, verse);
    `);

    // Map Sheets
    await db.exec(`
        CREATE TABLE IF NOT EXISTS maps (
            gid TEXT PRIMARY KEY,
            title TEXT,
            image_local TEXT,
            narrative TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Lexicons (聖經百科)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS lexicons (
            id SERIAL PRIMARY KEY,
            category INTEGER,
            key_id TEXT,
            name_zh TEXT NOT NULL,
            name_en TEXT,
            description TEXT,
            discussion TEXT,
            symbolism TEXT,
            translation_notes TEXT,
            content_raw TEXT,
            content_ai TEXT,
            quiz_pool JSONB DEFAULT '[]',
            image_local TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, key_id)
        );
    `);
}

/**
 * Narrative Content 故事內容層資料表 (PostgreSQL)
 */
export async function createNarrativeContentTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_stories (
            story_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            testament TEXT CHECK (testament IN ('OT', 'NT')),
            genre TEXT,
            default_narrative_tone TEXT,
            entry_scene_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_scenes (
            id SERIAL PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories(story_id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL,
            title TEXT NOT NULL,
            entry_text TEXT NOT NULL,
            main_goal TEXT,
            main_choice_label TEXT,
            next_scene_id TEXT,
            lore_keys JSONB NOT NULL DEFAULT '[]',
            character_ids JSONB NOT NULL DEFAULT '[]',
            scripture_refs_json JSONB NOT NULL DEFAULT '[]',
            source_entity_ids_json JSONB NOT NULL DEFAULT '[]',
            source_commentary_ids_json JSONB NOT NULL DEFAULT '[]',
            generation_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (generation_mode IN ('fixed', 'ai_assisted')),
            entry_text_source TEXT DEFAULT 'manual',
            source_hash TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (story_id, scene_id)
        );
        CREATE INDEX IF NOT EXISTS idx_narr_scenes_lookup ON narrative_story_scenes(story_id, scene_id);
    `);
}

export async function migrateNarrativeScenesV2(db) {
    await db.exec(`
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS scripture_refs_json JSONB NOT NULL DEFAULT '[]';
        ALTER TABLE narrative_story_scenes ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'fixed';
    `);
}

export async function migrateNarrativeCatalog(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_catalog (
            story_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subtitle TEXT,
            summary TEXT,
            theme_tags_json JSONB NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'published',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
}
