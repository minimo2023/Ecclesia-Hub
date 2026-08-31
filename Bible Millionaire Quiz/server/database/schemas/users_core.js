/**
 * 用戶核心 Schema (users_core)
 * [V3 Sovereign Proxy]
 */

/**
 * 建立使用者資料表 (PostgreSQL)
 */
export async function createUsersTables(db) {
    // 確保 UUID 擴展存在 (用於 V2 故事引擎)
    // [SOVEREIGN 1.1] 物理整流：使用最高安全級別宣告擴展，避免系統索引衝突
    await db.exec(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
                CREATE EXTENSION pgcrypto;
            END IF;
        END $$;
    `);

    // Users table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            email TEXT,
            email_verified_at TIMESTAMPTZ,
            display_name TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            role TEXT DEFAULT 'user',
            admin_roles JSONB DEFAULT '[]',
            status TEXT DEFAULT 'active',
            coins INTEGER DEFAULT 0,
            total_games INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            total_answered INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            last_active_at TIMESTAMP,
            settings JSONB,
            metadata JSONB,
            avatar_url TEXT,
            gender TEXT,
            birth_year INTEGER,
            bio TEXT,
            security_question TEXT,
            security_answer_hash TEXT,
            last_password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_display_name_change TIMESTAMP,
            must_reset_auth BOOLEAN DEFAULT FALSE,
            pwd_warning_dismissed_count INTEGER DEFAULT 0,
            last_warning_dismissed_at TIMESTAMP
        );
    `);

    // Achievements definitions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            type TEXT,
            category TEXT,
            condition_type TEXT,
            condition_value INTEGER,
            sort_order INTEGER,
            coin_reward INTEGER DEFAULT 0
        );
    `);

    // User Achievement Unlocks
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
    `);

    // Coin Ledger
    await db.exec(`
        CREATE TABLE IF NOT EXISTS coin_ledger (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            reason TEXT,
            source_id TEXT,
            idempotency_key TEXT,
            balance_after INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE coin_ledger ADD COLUMN IF NOT EXISTS source_id TEXT;
        ALTER TABLE coin_ledger ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
        CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_ledger_idempotency
            ON coin_ledger(idempotency_key)
            WHERE idempotency_key IS NOT NULL;
    `);

    // Append-only canonical asset ledger. Every server-authorized balance change
    // must share a transaction with the corresponding wallet update.
    await db.exec(`
        CREATE TABLE IF NOT EXISTS asset_ledger (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            asset_type TEXT NOT NULL CHECK (asset_type IN ('COIN', 'AI_CREDIT')),
            delta INTEGER NOT NULL,
            reason_code TEXT NOT NULL,
            source_id TEXT,
            idempotency_key TEXT NOT NULL UNIQUE,
            balance_after INTEGER NOT NULL,
            metadata JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_asset_ledger_user_created
            ON asset_ledger(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_asset_ledger_source
            ON asset_ledger(source_id);
    `);

    // Server-owned game sessions and verified attempts are the source of truth
    // for rewards, statistics, achievements, and leaderboards.
    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_reward_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_session_key TEXT NOT NULL,
            mode TEXT NOT NULL,
            question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 5000),
            selected_books JSONB NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'settled', 'abandoned', 'expired')),
            correct_count INTEGER NOT NULL DEFAULT 0,
            total_answered INTEGER NOT NULL DEFAULT 0,
            current_streak INTEGER NOT NULL DEFAULT 0,
            max_streak INTEGER NOT NULL DEFAULT 0,
            lifelines_used JSONB NOT NULL DEFAULT '{}',
            coins_awarded INTEGER NOT NULL DEFAULT 0,
            points_awarded INTEGER NOT NULL DEFAULT 0,
            server_score INTEGER NOT NULL DEFAULT 0,
            settlement_reason TEXT,
            settlement_result JSONB,
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ NOT NULL,
            settled_at TIMESTAMPTZ,
            UNIQUE(user_id, client_session_key)
        );
        CREATE INDEX IF NOT EXISTS idx_game_reward_sessions_user_status
            ON game_reward_sessions(user_id, status, started_at DESC);

        CREATE TABLE IF NOT EXISTS game_reward_attempts (
            id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES game_reward_sessions(id) ON DELETE CASCADE,
            question_id TEXT NOT NULL,
            is_correct BOOLEAN NOT NULL,
            question_revision_id TEXT,
            selected_option TEXT,
            response_ms INTEGER,
            game_mode TEXT,
            attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, question_id)
        );
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS question_revision_id TEXT;
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS selected_option TEXT;
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS response_ms INTEGER;
        ALTER TABLE game_reward_attempts ADD COLUMN IF NOT EXISTS game_mode TEXT;
        CREATE INDEX IF NOT EXISTS idx_game_reward_attempts_session
            ON game_reward_attempts(session_id, id);
        CREATE INDEX IF NOT EXISTS idx_game_reward_attempts_question
            ON game_reward_attempts(question_id, attempted_at DESC);

        CREATE TABLE IF NOT EXISTS game_reward_session_questions (
            session_id TEXT NOT NULL REFERENCES game_reward_sessions(id) ON DELETE CASCADE,
            question_id TEXT NOT NULL,
            book TEXT,
            issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(session_id, question_id)
        );
        ALTER TABLE game_reward_session_questions ADD COLUMN IF NOT EXISTS book TEXT;

        CREATE TABLE IF NOT EXISTS user_game_milestones (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            milestone_level INTEGER NOT NULL,
            session_id TEXT NOT NULL REFERENCES game_reward_sessions(id) ON DELETE CASCADE,
            awarded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, milestone_level)
        );

        CREATE TABLE IF NOT EXISTS multiplayer_prize_pools (
            room_code TEXT PRIMARY KEY,
            host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            amount INTEGER NOT NULL CHECK (amount IN (20, 50, 100, 200, 500)),
            status TEXT NOT NULL DEFAULT 'reserved'
                CHECK (status IN ('reserved', 'paid', 'refunded')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            settled_at TIMESTAMPTZ
        );
    `);

    await db.exec(`
        SELECT setval(
            pg_get_serial_sequence('coin_ledger', 'id'),
            GREATEST(COALESCE((SELECT MAX(id) FROM coin_ledger), 0), 1),
            true
        );
    `);
}

/**
 * [RECONSTRUCTED] 重建遺失的 Users V2 遷移邏輯
 * 確保現有 users 表格具備 1.1 版本架構所需的全部欄位
 */
export async function migrateUsersTableV2(db) {
    console.log('🔄 [Migration] Realigning users table to V2 Sovereign standard...');
    await db.exec(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_roles JSONB DEFAULT '[]';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS total_games INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS total_correct INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS total_answered INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_auth BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pwd_warning_dismissed_count INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_warning_dismissed_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
        ALTER TABLE users ADD CONSTRAINT users_status_check
            CHECK (status IN ('pending_email', 'active', 'suspended', 'banned')) NOT VALID;
        ALTER TABLE users VALIDATE CONSTRAINT users_status_check;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized
            ON users (LOWER(email)) WHERE email IS NOT NULL;
    `);
}
