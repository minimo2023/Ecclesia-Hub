/**
 * 安全性與權限 Schema (security)
 * [V3 Sovereign Proxy]
 */

/**
 * 建立安全性與基礎架構資料表 (PostgreSQL)
 * 包含登入嘗試、Session、權限角色等
 */
export async function createSecurityTables(db) {
    // 1. user_login_attempts
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_login_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email_or_username VARCHAR(320) NOT NULL,
            ip_address INET,
            user_agent TEXT,
            is_success BOOLEAN NOT NULL,
            failure_reason VARCHAR(100),
            attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_target ON user_login_attempts(email_or_username);
    `);

    // 2. password_reset_tokens
    await db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            request_ip INET
        );
    `);

    // 3. roles
    await db.exec(`
        CREATE TABLE IF NOT EXISTS roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            role_code VARCHAR(50) UNIQUE NOT NULL,
            name_zh VARCHAR(100) NOT NULL,
            description TEXT,
            is_system BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 4. user_roles
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            granted_by TEXT REFERENCES users(id),
            granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            revoked_by TEXT REFERENCES users(id),
            revoked_at TIMESTAMP,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            UNIQUE(user_id, role_id)
        );
    `);

    // 5. user_sessions (Refresh Tokens)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_token_hash TEXT NOT NULL,
            device_name VARCHAR(100),
            ip_address INET,
            user_agent TEXT,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_refresh_token_hash
            ON user_sessions(refresh_token_hash);

        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_id VARCHAR(128);
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS app_platform VARCHAR(16);
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS app_version VARCHAR(32);
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_name VARCHAR(100);
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address INET;
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
        ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;
        CREATE INDEX IF NOT EXISTS idx_user_sessions_device ON user_sessions(user_id, device_id);

        CREATE TABLE IF NOT EXISTS user_auth_identities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL,
            provider_subject TEXT NOT NULL,
            email_snapshot TEXT,
            email_verified BOOLEAN NOT NULL DEFAULT FALSE,
            profile JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at TIMESTAMPTZ,
            UNIQUE(provider, provider_subject),
            UNIQUE(user_id, provider)
        );
        CREATE INDEX IF NOT EXISTS idx_user_auth_identities_user
            ON user_auth_identities(user_id);

        CREATE TABLE IF NOT EXISTS auth_challenges (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            purpose VARCHAR(64) NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            provider VARCHAR(32),
            provider_subject TEXT,
            payload JSONB NOT NULL DEFAULT '{}',
            expires_at TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_auth_challenges_active
            ON auth_challenges(purpose, expires_at) WHERE consumed_at IS NULL;
    `);

    // 6. Seed Default Roles if empty
    try {
        const rolesCount = await db.get('SELECT COUNT(*) as count FROM roles');
        if (parseInt(rolesCount.count) === 0) {
            const roles = [
                ['super_admin', '最高管理員', '擁有全系統最高權限'],
                ['admin_ops', '營運管理員', '負責使用者與審計管理'],
                ['admin_content', '內容管理員', '負責經文與題庫管理'],
                ['admin_economy', '經濟管理員', '負責智幣與交易管理'],
                ['admin_ai', 'AI 治理員', '負責模型配置與成本管理'],
                ['admin_support', '客服管理員', '負責使用者支援與密碼重設']
            ];
            for (const [code, name, desc] of roles) {
                await db.run(`
                    INSERT INTO roles (role_code, name_zh, description)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (role_code) DO NOTHING
                `, [code, name, desc]);
            }
            console.log('🌱 Seeded default system roles');
        }
    } catch (e) {
        console.error('Error seeding roles:', e.message);
    }
}
