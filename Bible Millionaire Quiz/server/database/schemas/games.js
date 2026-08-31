/**
 * 遊戲與遠征隊 Schema (games)
 * [V3 Sovereign Proxy]
 */

/**
 * 建立基礎遊戲資料表 (PostgreSQL)
 */
export async function createGamesTables(db) {
    // Unified Questions (Trivia Bank)
    // Runtime game services read/write questions through gamesDb；此處是 questions
    // 的唯一基礎 schema 擁有者，V4 品質欄位由 question_quality.js 擴充。
    await db.exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            difficulty TEXT DEFAULT 'MEDIUM',
            book TEXT,
            chapter INTEGER,
            verse_start INTEGER,
            verse_end INTEGER,
            verse_ref TEXT,
            question TEXT NOT NULL DEFAULT '',
            options JSONB,
            answer TEXT NOT NULL DEFAULT '',
            correct_index INTEGER,
            explanation TEXT,
            evidence TEXT,
            evidence_ref TEXT,
            evidence_quote TEXT,
            source TEXT DEFAULT 'ai',
            status TEXT DEFAULT 'PASS',
            quality TEXT,
            category TEXT,
            tags JSONB DEFAULT '[]',
            verified BOOLEAN DEFAULT FALSE,
            hash_exact TEXT UNIQUE,
            metadata JSONB DEFAULT '{}',
            audit_reason TEXT,
            auditor_version TEXT,
            version TEXT DEFAULT 'CUV_TRAD',
            content_locale TEXT DEFAULT 'unknown',
            content_locale_checked_at TIMESTAMPTZ,
            content_locale_rule_version TEXT,
            difficulty_band TEXT,
            difficulty_scored_at TIMESTAMP,
            rule_difficulty_score INTEGER,
            final_difficulty_score INTEGER,
            difficulty_breakdown JSONB,
            difficulty_flags JSONB,
            difficulty_score_source TEXT,
            final_difficulty_source TEXT,
            final_difficulty_confidence NUMERIC,
            ai_difficulty_score INTEGER,
            ai_difficulty_reason_general_believer TEXT,
            ai_difficulty_reason_seminary_student TEXT,
            judge_prompt_version TEXT,
            judge_roles JSONB,
            ai_judge_a_score INTEGER,
            ai_judge_a_role TEXT,
            ai_judge_b_score INTEGER,
            ai_judge_b_role TEXT,
            ai_judge_avg NUMERIC,
            ai_judge_delta NUMERIC,
            rule_ai_delta NUMERIC,
            ai_consistency TEXT,
            rule_validity TEXT,
            distractors_pool JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'MEDIUM';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS book TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS chapter INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS verse_start INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS verse_end INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS verse_ref TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS question TEXT NOT NULL DEFAULT '';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS options JSONB;
        ALTER TABLE questions ALTER COLUMN options DROP NOT NULL;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT '';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_index INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence_ref TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence_quote TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ai';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PASS';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_locale TEXT DEFAULT 'unknown';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_locale_checked_at TIMESTAMPTZ;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_locale_rule_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS category TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS hash_exact TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS audit_reason TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS auditor_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS version TEXT DEFAULT 'CUV_TRAD';
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_band TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_scored_at TIMESTAMP;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_difficulty_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_breakdown JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_flags JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_score_source TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_source TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_confidence NUMERIC;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_difficulty_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_difficulty_reason_general_believer TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_difficulty_reason_seminary_student TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS judge_prompt_version TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS judge_roles JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_a_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_a_role TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_b_score INTEGER;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_b_role TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_avg NUMERIC;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_delta NUMERIC;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_ai_delta NUMERIC;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_consistency TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_validity TEXT;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS distractors_pool JSONB;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        CREATE INDEX IF NOT EXISTS idx_questions_ref ON questions(book, chapter);
        CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
        CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
        CREATE INDEX IF NOT EXISTS idx_questions_version ON questions(version, book, chapter);
        CREATE INDEX IF NOT EXISTS idx_questions_final_score ON questions(final_difficulty_score);
    `);

    // Game History (Trivia Mode)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_history (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            mode TEXT NOT NULL,
            score INTEGER NOT NULL,
            questions_answered INTEGER,
            correct_count INTEGER,
            time_elapsed INTEGER,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(user_id);
    `);

    // Game Ratings (Module Popularity Tracking)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_ratings (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            mode TEXT NOT NULL,
            rating INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_ratings_mode ON game_ratings(mode);
    `);

    // Attempts (Question Answering Log)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS attempts (
            id SERIAL PRIMARY KEY,
            questionId TEXT,
            isCorrect BOOLEAN,
            level TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            clientTimestamp BIGINT,
            question_revision_id TEXT,
            selected_option TEXT,
            response_ms INTEGER,
            game_mode TEXT
        );
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_revision_id TEXT;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS selected_option TEXT;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS response_ms INTEGER;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS game_mode TEXT;
        CREATE INDEX IF NOT EXISTS idx_attempts_qid ON attempts(questionId);
    `);
}

/**
 * 建立遠征隊資料表 (PostgreSQL)
 * [SOVEREIGN CLEANUP] 徹底移除 AI 治理重疊代碼
 */
export async function createExpeditionTables(db) {
    // 1. Expedition Teams
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT,
            owner_name TEXT NOT NULL,
            current_question INTEGER DEFAULT 0,
            current_stage INTEGER DEFAULT 1,
            lives INTEGER DEFAULT 3,
            score INTEGER DEFAULT 0,
            status TEXT DEFAULT 'waiting', 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_exp_teams_owner ON expedition_teams(owner_id);

        -- [MIGRATION] Ensure missing columns from newer schema versions exist (Sovereign Patch)
        ALTER TABLE expedition_teams ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT '';
        ALTER TABLE expedition_teams ADD COLUMN IF NOT EXISTS lives INTEGER DEFAULT 3;
        ALTER TABLE expedition_teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // 2. Expedition Team Members
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_team_members (
            team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
            user_id TEXT,
            display_name TEXT NOT NULL,
            is_owner BOOLEAN DEFAULT FALSE,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (team_id, display_name)
        );
    `);

    // 3. Expedition Saves
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_saves (
            user_id TEXT PRIMARY KEY,
            save_data JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 4. Expedition Inventory
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_inventory (
            user_id TEXT,
            item_id TEXT,
            quantity INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, item_id)
        );
    `);

    // 5. Expedition Questions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_questions (
            id SERIAL PRIMARY KEY,
            question TEXT NOT NULL,
            options JSONB NOT NULL,
            correct_index INTEGER NOT NULL,
            difficulty INTEGER DEFAULT 1,
            question_type TEXT DEFAULT 'choice',
            source_verse TEXT,
            evidence TEXT,
            explanation TEXT,
            source TEXT DEFAULT 'ai_generated',
            times_used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 6. Expedition Answered Log
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_answered (
            team_id TEXT NOT NULL REFERENCES expedition_teams(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL REFERENCES expedition_questions(id) ON DELETE CASCADE,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_correct BOOLEAN,
            PRIMARY KEY (team_id, question_id)
        );
    `);

    // 7. Expedition Leaderboard
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_leaderboard (
            id TEXT PRIMARY KEY,
            captain_id TEXT,
            captain_name TEXT,
            max_stage INTEGER,
            total_questions INTEGER,
            team_members JSONB,
            achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_exp_leaderboard_stage ON expedition_leaderboard(max_stage DESC, total_questions DESC);
    `);

    // 8. Expedition Config
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 9. Expedition Records (Final Cleanup)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS expedition_records (
            id SERIAL PRIMARY KEY,
            team_name TEXT NOT NULL,
            members JSONB,
            score INTEGER DEFAULT 0,
            stage_reached INTEGER DEFAULT 1,
            duration_seconds INTEGER DEFAULT 0,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_expedition_records_score ON expedition_records(score DESC, stage_reached DESC);
    `);
}
