/**
 * 維護與審計 Schema (maintenance)
 * [V3 Sovereign Proxy]
 */

/**
 * 管理員審計日誌資料表 (PostgreSQL)
 */
export async function createAuditTables(db) {
    // 1. Ensure Table exists (Minimum skeleton)
    // [SOVEREIGN 1.2] Force UUID compatibility for ID
    await db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY
        );
        -- 如果先前是 INTEGER 則強制轉換型別以支援 UUID
        DO $$ 
        BEGIN 
            IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'id' AND table_schema = current_schema()) = 'integer' THEN
                ALTER TABLE audit_logs ALTER COLUMN id TYPE TEXT;
            END IF;
        END $$;
    `);

    // 2. [SOVEREIGN BACKFILL] Ensure all columns exist (Idempotent)
    await db.exec(`
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'unknown';
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_json JSONB;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_json JSONB;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // 3. Create Indexes (Safe now that columns exist)
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(actor_user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    `);
}

/**
 * 建立系統配置資料表 (PostgreSQL)
 * 用於儲存全域變數、巡航指針等設定
 */
export async function createSystemTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS app_diagnostics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            installation_id VARCHAR(128),
            app_platform VARCHAR(16) NOT NULL,
            app_version VARCHAR(32),
            category VARCHAR(32) NOT NULL,
            event_code VARCHAR(80) NOT NULL,
            message VARCHAR(240),
            context JSONB NOT NULL DEFAULT '{}',
            occurred_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_app_diagnostics_created ON app_diagnostics(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_app_diagnostics_code ON app_diagnostics(event_code, created_at DESC);
    `);
}
