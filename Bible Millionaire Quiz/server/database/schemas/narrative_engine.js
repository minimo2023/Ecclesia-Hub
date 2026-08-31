/**
 * AI 敘事引擎與藍圖 Schema (narrative_engine)
 * [V3 Sovereign Proxy]
 */

/**
 * 建立敘事引擎 V1 資料表 (PostgreSQL)
 */
export async function createNarrativeEngineTables(db) {
    // 1. User Story Progress
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_story_progress (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            current_scene_id TEXT,
            understanding_score INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT FALSE,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, story_id)
        );
    `);

    // 2. Game Sessions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_game_sessions (
            session_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            current_scene_id TEXT,
            current_turn_id INTEGER DEFAULT 1,
            current_available_actions JSONB DEFAULT '{}',
            feed_history JSONB DEFAULT '[]',
            session_status TEXT NOT NULL DEFAULT 'active' CHECK (session_status IN ('active', 'paused', 'completed', 'abandoned')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_narr_sessions_user ON narrative_game_sessions(user_id);
    `);

    // 3. Scene States
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_scene_states (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES narrative_game_sessions(session_id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            goal_progress INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT FALSE,
            local_flags_json JSONB DEFAULT '{}',
            summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (session_id, scene_id)
        );
    `);

    // 4. Character States
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_character_states (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES narrative_game_sessions(session_id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL,
            character_id TEXT NOT NULL,
            trust_level INTEGER DEFAULT 0,
            openness_level INTEGER DEFAULT 0,
            attitude TEXT,
            memory_summary TEXT,
            state_flags_json JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (session_id, scene_id, character_id)
        );
    `);

    // 5. Dialogue Logs
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_dialogue_logs (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES narrative_game_sessions(session_id) ON DELETE SET NULL,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            story_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            character_id TEXT,
            speaker TEXT NOT NULL CHECK (speaker IN ('user', 'character', 'narrator', 'system')),
            message TEXT NOT NULL,
            message_type TEXT,
            ai_credit_cost INTEGER DEFAULT 0,
            token_in INTEGER,
            token_out INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 6. Lore Unlocks
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_lore_unlocks (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id TEXT NOT NULL,
            lore_key TEXT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, story_id, lore_key)
        );
    `);
}

/**
 * 建立敘事藍圖 V2 資料表 (PostgreSQL) - "13 誡命架構"
 */
export async function createNarrativeBlueprintV2Tables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_stories_v2 (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            primary_source TEXT NOT NULL,
            parallel_refs_json JSONB DEFAULT '[]',
            immutable_beats_json JSONB NOT NULL DEFAULT '[]',
            threads_json JSONB NOT NULL DEFAULT '[]',
            start_scene_id TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            reusable_as_module BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_story_scenes_v2 (
            id TEXT PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            goal TEXT NOT NULL,
            must_happen_json JSONB NOT NULL DEFAULT '[]',
            entry_text TEXT NOT NULL,
            actions_json JSONB NOT NULL,
            characters_present_json JSONB DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_scenes_v2_story ON narrative_story_scenes_v2(story_id);
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_npc_archetypes (
            id TEXT PRIMARY KEY,
            story_id TEXT NOT NULL REFERENCES narrative_stories_v2(id) ON DELETE CASCADE,
            npc_type TEXT NOT NULL,
            label TEXT NOT NULL,
            social_role TEXT,
            speech_style TEXT,
            knowledge_scope TEXT NOT NULL,
            theological_authority TEXT DEFAULT 'none',
            interaction_depth TEXT DEFAULT 'light',
            persistence TEXT DEFAULT 'scene',
            allowed_functions_json JSONB DEFAULT '[]',
            forbidden_functions_json JSONB DEFAULT '[]',
            global_entity_id TEXT,
            source_archetype_id TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_global_entities (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL CHECK (category IN ('person', 'location', 'event', 'object')),
            canonical_name TEXT NOT NULL,
            aliases_json JSONB DEFAULT '[]',
            description TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS narrative_global_memories (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            global_entity_id TEXT NOT NULL REFERENCES narrative_global_entities(id) ON DELETE CASCADE,
            memory_summary TEXT,
            last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, global_entity_id)
        );
    `);
}

/**
 * 建立聖經時空旅人資料表 (PostgreSQL)
 */
export async function createTimeTravelerTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS time_traveler_scenes (
            id TEXT PRIMARY KEY,
            story_id TEXT,
            canonical_anchor TEXT NOT NULL,
            title TEXT NOT NULL,
            rules_json JSONB NOT NULL DEFAULT '[]',
            npcs_json JSONB NOT NULL DEFAULT '[]',
            initial_narrative TEXT NOT NULL,
            initial_buttons_json JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS time_traveler_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL REFERENCES time_traveler_scenes(id) ON DELETE CASCADE,
            story_id TEXT,
            current_state TEXT DEFAULT 'active',
            context_history JSONB NOT NULL DEFAULT '[]',
            memory_summary TEXT,
            sync_rate INTEGER DEFAULT 100,
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'failed')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS witness_logs (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES time_traveler_sessions(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scene_id TEXT NOT NULL REFERENCES time_traveler_scenes(id) ON DELETE CASCADE,
            fragment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS action_candidates (
            id SERIAL PRIMARY KEY,
            scene_id TEXT NOT NULL REFERENCES time_traveler_scenes(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action_text TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
}
