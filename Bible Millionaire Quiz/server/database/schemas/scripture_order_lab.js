/**
 * Scripture Order Lab
 *
 * Scripture ordering game storage plus the versioned, reusable per-verse
 * segmentation library. Lab scores remain isolated from formal assets.
 */
export async function createScriptureOrderLabTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS scripture_order_lab_passages (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL DEFAULT 'CUV_TRAD',
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL CHECK (chapter > 0),
            verse_start INTEGER NOT NULL CHECK (verse_start > 0),
            verse_end INTEGER NOT NULL CHECK (verse_end >= verse_start),
            title TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            source_text TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            source_verses JSONB NOT NULL DEFAULT '[]'::jsonb,
            fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
            fragment_count INTEGER NOT NULL DEFAULT 0,
            segmentation_method TEXT NOT NULL,
            segmentation_version TEXT NOT NULL DEFAULT 'rule-v1',
            generation_model TEXT,
            audit_model TEXT,
            audit_state TEXT NOT NULL DEFAULT 'DETERMINISTIC_PASS',
            audit_details JSONB NOT NULL DEFAULT '{}'::jsonb,
            revision INTEGER NOT NULL DEFAULT 1,
            is_official BOOLEAN NOT NULL DEFAULT FALSE,
            is_published BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (version = 'CUV_TRAD'),
            CHECK (difficulty IN ('INTRO', 'STANDARD', 'CHALLENGE', 'LONG'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_order_lab_passages_public
            ON scripture_order_lab_passages(is_official, is_published, difficulty, book, chapter);

        CREATE TABLE IF NOT EXISTS scripture_order_segmentation_cache (
            cache_key TEXT PRIMARY KEY,
            version TEXT NOT NULL DEFAULT 'CUV_TRAD',
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            source_hash TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            machine_fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
            final_fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
            confidence TEXT NOT NULL,
            review_state TEXT NOT NULL DEFAULT 'RULES_ONLY',
            review_model TEXT,
            review_details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (version = 'CUV_TRAD'),
            CHECK (confidence IN ('HIGH', 'LOW')),
            CHECK (review_state IN ('RULES_ONLY', 'AI_ACCEPTED', 'AI_REJECTED', 'AI_FAILED'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_order_segmentation_cache_source
            ON scripture_order_segmentation_cache(version, book, chapter, verse, source_hash, rule_version);

        CREATE TABLE IF NOT EXISTS scripture_segmentation_protected_terms (
            id TEXT PRIMARY KEY,
            term TEXT NOT NULL,
            normalized_term TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'OTHER',
            source TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            lexicon_version TEXT NOT NULL,
            evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(lexicon_version, normalized_term),
            CHECK (category IN ('PERSON', 'PLACE', 'PEOPLE', 'TITLE', 'PHRASE', 'OTHER')),
            CHECK (source IN ('CORE', 'LOCAL_MODEL', 'INTL', 'FEEDBACK')),
            CHECK (status IN ('ACTIVE', 'RETIRED'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_segmentation_terms_active
            ON scripture_segmentation_protected_terms(lexicon_version, status, normalized_term);

        CREATE TABLE IF NOT EXISTS scripture_segmentation_runs (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL DEFAULT 'CUV_TRAD',
            rule_version TEXT NOT NULL,
            normalization_version TEXT NOT NULL,
            lexicon_version TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            dry_run BOOLEAN NOT NULL DEFAULT TRUE,
            batch_size INTEGER NOT NULL DEFAULT 100,
            total_verses INTEGER NOT NULL DEFAULT 0,
            processed_verses INTEGER NOT NULL DEFAULT 0,
            valid_count INTEGER NOT NULL DEFAULT 0,
            valid_long_count INTEGER NOT NULL DEFAULT 0,
            needs_repair_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            checkpoint_book TEXT,
            checkpoint_chapter INTEGER,
            checkpoint_verse INTEGER,
            error_code TEXT,
            error_message TEXT,
            options JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ,
            CHECK (version = 'CUV_TRAD'),
            CHECK (batch_size BETWEEN 1 AND 1000),
            CHECK (status IN ('PENDING', 'RUNNING', 'PAUSE_REQUESTED', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_scripture_segmentation_runs_one_active
            ON scripture_segmentation_runs(version)
            WHERE status IN ('PENDING', 'RUNNING', 'PAUSE_REQUESTED', 'PAUSED');

        CREATE TABLE IF NOT EXISTS scripture_segmentation_entries (
            entry_key TEXT PRIMARY KEY,
            run_id TEXT REFERENCES scripture_segmentation_runs(id) ON DELETE SET NULL,
            version TEXT NOT NULL DEFAULT 'CUV_TRAD',
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            raw_text TEXT NOT NULL,
            raw_hash TEXT NOT NULL,
            display_text TEXT NOT NULL,
            display_hash TEXT NOT NULL,
            normalization_version TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            lexicon_version TEXT NOT NULL,
            boundary_offsets JSONB NOT NULL DEFAULT '[]'::jsonb,
            candidate_boundaries JSONB NOT NULL DEFAULT '[]'::jsonb,
            fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
            health_state TEXT NOT NULL,
            confidence TEXT NOT NULL,
            generation_source TEXT NOT NULL DEFAULT 'RULES',
            issues JSONB NOT NULL DEFAULT '[]'::jsonb,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            revision INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            activated_at TIMESTAMPTZ,
            CHECK (version = 'CUV_TRAD'),
            CHECK (health_state IN ('VALID', 'VALID_LONG', 'NEEDS_REPAIR', 'INVALIDATED')),
            CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
            CHECK (generation_source IN ('RULES', 'AI_BOUNDARY_REVIEW')),
            UNIQUE(version, book, chapter, verse, display_hash, rule_version, lexicon_version)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_scripture_segmentation_entries_active
            ON scripture_segmentation_entries(version, book, chapter, verse)
            WHERE active = TRUE;

        CREATE INDEX IF NOT EXISTS idx_scripture_segmentation_entries_run
            ON scripture_segmentation_entries(run_id, health_state, book, chapter, verse);

        CREATE TABLE IF NOT EXISTS scripture_segmentation_run_entries (
            run_id TEXT NOT NULL REFERENCES scripture_segmentation_runs(id) ON DELETE CASCADE,
            entry_key TEXT NOT NULL REFERENCES scripture_segmentation_entries(entry_key) ON DELETE CASCADE,
            health_state TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, entry_key),
            CHECK (health_state IN ('VALID', 'VALID_LONG', 'NEEDS_REPAIR', 'INVALIDATED'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_segmentation_run_entries_state
            ON scripture_segmentation_run_entries(run_id, health_state);

        CREATE TABLE IF NOT EXISTS scripture_segmentation_ai_queue (
            entry_key TEXT PRIMARY KEY REFERENCES scripture_segmentation_entries(entry_key) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'PENDING',
            attempts INTEGER NOT NULL DEFAULT 0,
            provider TEXT,
            model_id TEXT,
            failure_code TEXT,
            available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ,
            CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_segmentation_ai_queue_ready
            ON scripture_segmentation_ai_queue(status, available_at);

        CREATE TABLE IF NOT EXISTS scripture_order_segmentation_ai_usage (
            usage_date DATE PRIMARY KEY,
            request_count INTEGER NOT NULL DEFAULT 0,
            estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (request_count >= 0),
            CHECK (estimated_input_tokens >= 0)
        );

        CREATE TABLE IF NOT EXISTS scripture_order_segmentation_ai_requests (
            idempotency_key TEXT PRIMARY KEY,
            usage_date DATE NOT NULL REFERENCES scripture_order_segmentation_ai_usage(usage_date) ON DELETE CASCADE,
            passage_id TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            model_id TEXT NOT NULL,
            estimated_input_tokens INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'STARTED',
            failure_code TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ,
            CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED', 'TIMED_OUT'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_order_segmentation_ai_requests_date
            ON scripture_order_segmentation_ai_requests(usage_date, status);

        CREATE TABLE IF NOT EXISTS scripture_order_lab_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            owner_key TEXT NOT NULL,
            client_session_key TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            ranked BOOLEAN NOT NULL DEFAULT FALSE,
            score INTEGER NOT NULL DEFAULT 0,
            lives INTEGER,
            streak INTEGER NOT NULL DEFAULT 0,
            multiplier INTEGER NOT NULL DEFAULT 1,
            stage_number INTEGER NOT NULL DEFAULT 1,
            completed_stages INTEGER NOT NULL DEFAULT 0,
            assisted BOOLEAN NOT NULL DEFAULT FALSE,
            state JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ,
            CHECK (mode IN ('practice', 'endless', 'daily')),
            CHECK (status IN ('active', 'stage_complete', 'completed', 'failed', 'abandoned')),
            CHECK (multiplier BETWEEN 1 AND 5),
            UNIQUE(owner_key, client_session_key)
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_order_lab_sessions_owner
            ON scripture_order_lab_sessions(owner_key, started_at DESC);

        CREATE TABLE IF NOT EXISTS scripture_order_lab_stage_results (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES scripture_order_lab_sessions(id) ON DELETE CASCADE,
            stage_number INTEGER NOT NULL,
            passage_id TEXT NOT NULL REFERENCES scripture_order_lab_passages(id) ON DELETE RESTRICT,
            passage_revision INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            status TEXT NOT NULL,
            score_earned INTEGER NOT NULL DEFAULT 0,
            fragment_score INTEGER NOT NULL DEFAULT 0,
            completion_bonus INTEGER NOT NULL DEFAULT 0,
            time_bonus INTEGER NOT NULL DEFAULT 0,
            mistakes INTEGER NOT NULL DEFAULT 0,
            assisted BOOLEAN NOT NULL DEFAULT FALSE,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, stage_number),
            CHECK (status IN ('completed', 'failed', 'timeout'))
        );

        CREATE TABLE IF NOT EXISTS scripture_order_lab_actions (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES scripture_order_lab_sessions(id) ON DELETE CASCADE,
            idempotency_key TEXT NOT NULL,
            action_type TEXT NOT NULL,
            response JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, idempotency_key)
        );

        CREATE TABLE IF NOT EXISTS scripture_memory_daily_rewards (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reward_date DATE NOT NULL,
            range_key TEXT NOT NULL,
            game_type TEXT NOT NULL,
            session_id TEXT NOT NULL,
            coins INTEGER NOT NULL CHECK (coins >= 0),
            correct_count INTEGER NOT NULL DEFAULT 0,
            base_coins INTEGER NOT NULL DEFAULT 0,
            bonus_coins INTEGER NOT NULL DEFAULT 0,
            completed BOOLEAN NOT NULL DEFAULT TRUE,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            fragment_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, reward_date, range_key),
            CHECK (game_type IN ('scripture_order', 'scripture_rain'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_memory_daily_rewards_user
            ON scripture_memory_daily_rewards(user_id, reward_date DESC, created_at DESC);

        ALTER TABLE scripture_memory_daily_rewards
            ADD COLUMN IF NOT EXISTS correct_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE scripture_memory_daily_rewards
            ADD COLUMN IF NOT EXISTS base_coins INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE scripture_memory_daily_rewards
            ADD COLUMN IF NOT EXISTS bonus_coins INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE scripture_memory_daily_rewards
            ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT TRUE;
        UPDATE scripture_memory_daily_rewards
            SET correct_count = fragment_count,
                base_coins = coins
            WHERE completed = TRUE AND coins > 0 AND correct_count = 0;

        ALTER TABLE scripture_memory_daily_rewards
            DROP CONSTRAINT IF EXISTS scripture_memory_daily_rewards_coins_check;
        ALTER TABLE scripture_memory_daily_rewards
            ADD CONSTRAINT scripture_memory_daily_rewards_coins_check
            CHECK (coins >= 0);
        ALTER TABLE scripture_memory_daily_rewards
            DROP CONSTRAINT IF EXISTS scripture_memory_daily_rewards_progress_check;
        ALTER TABLE scripture_memory_daily_rewards
            ADD CONSTRAINT scripture_memory_daily_rewards_progress_check
            CHECK (correct_count >= 0 AND base_coins >= 0 AND bonus_coins >= 0);

        CREATE TABLE IF NOT EXISTS scripture_rain_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            owner_key TEXT NOT NULL,
            client_session_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'preview',
            passage JSONB NOT NULL,
            verses JSONB NOT NULL DEFAULT '[]'::jsonb,
            full_text TEXT NOT NULL,
            fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
            external_fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
            difficulty TEXT NOT NULL DEFAULT 'SIMPLE',
            challenge_speed TEXT NOT NULL DEFAULT 'MEDIUM',
            current_index INTEGER NOT NULL DEFAULT 0,
            lives INTEGER NOT NULL DEFAULT 3,
            mistakes INTEGER NOT NULL DEFAULT 0,
            reward JSONB,
            started_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ,
            UNIQUE(owner_key, client_session_key),
            CHECK (status IN ('preview', 'active', 'completed', 'failed', 'abandoned')),
            CHECK (difficulty IN ('SIMPLE', 'MEDIUM', 'HARD')),
            CHECK (challenge_speed IN ('SLOW', 'MEDIUM', 'FAST')),
            CHECK (lives BETWEEN 0 AND 3)
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_rain_sessions_owner
            ON scripture_rain_sessions(owner_key, updated_at DESC);
        ALTER TABLE scripture_rain_sessions
            ADD COLUMN IF NOT EXISTS challenge_speed TEXT NOT NULL DEFAULT 'MEDIUM';
        ALTER TABLE scripture_rain_sessions
            DROP CONSTRAINT IF EXISTS scripture_rain_sessions_challenge_speed_check;
        ALTER TABLE scripture_rain_sessions
            ADD CONSTRAINT scripture_rain_sessions_challenge_speed_check CHECK (challenge_speed IN ('SLOW', 'MEDIUM', 'FAST'));

        CREATE TABLE IF NOT EXISTS scripture_rain_actions (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES scripture_rain_sessions(id) ON DELETE CASCADE,
            idempotency_key TEXT NOT NULL,
            action_type TEXT NOT NULL,
            response JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, idempotency_key)
        );

        CREATE TABLE IF NOT EXISTS scripture_order_lab_daily_sets (
            challenge_date DATE PRIMARY KEY,
            passage_ids JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS scripture_order_lab_leaderboard (
            id TEXT PRIMARY KEY,
            scope_key TEXT NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            session_id TEXT NOT NULL REFERENCES scripture_order_lab_sessions(id) ON DELETE CASCADE,
            nickname TEXT NOT NULL,
            tag TEXT NOT NULL,
            score INTEGER NOT NULL,
            lives_remaining INTEGER,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(scope_key, user_id),
            UNIQUE(session_id),
            CHECK (tag IN ('勇敢', '喜樂', '快手', '專注', '堅持'))
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_order_lab_leaderboard_rank
            ON scripture_order_lab_leaderboard(scope_key, score DESC, lives_remaining DESC, duration_ms, created_at);

        CREATE TABLE IF NOT EXISTS scripture_order_lab_shares (
            token TEXT PRIMARY KEY,
            creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            passage_id TEXT NOT NULL REFERENCES scripture_order_lab_passages(id) ON DELETE CASCADE,
            passage_revision INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            inviter_score INTEGER NOT NULL DEFAULT 0,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_order_lab_shares_expiry
            ON scripture_order_lab_shares(expires_at);

        CREATE TABLE IF NOT EXISTS scripture_order_lab_passage_requests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            version TEXT NOT NULL DEFAULT 'CUV_TRAD',
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse_start INTEGER NOT NULL,
            verse_end INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'REQUESTED',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, version, book, chapter, verse_start, verse_end),
            CHECK (version = 'CUV_TRAD'),
            CHECK (status IN ('REQUESTED', 'QUEUED', 'PUBLISHED', 'DECLINED'))
        );
    `);
}

export default createScriptureOrderLabTables;
