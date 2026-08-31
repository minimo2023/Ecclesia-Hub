/**
 * StockAI 授權與 BMQ 跨產品紅利 Schema
 * [Sovereign Isolation] - 確保與 BMQ 核心資料絕對隔離
 */

export async function createStockAILicenseTables(db) {
    console.log('🛡️ [Database] Ensuring StockAI License Schema...');

    // 1. StockAI 授權表 (獨立儲存機器碼與方案)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS stockai_licenses (
            license_key TEXT PRIMARY KEY,
            tier TEXT NOT NULL DEFAULT 'free',          -- free, pro, lifetime
            status TEXT NOT NULL DEFAULT 'active',      -- active, revoked, expired
            machine_ids JSONB DEFAULT '[]',             -- 儲存已綁定的 HWID 陣列
            max_devices INTEGER DEFAULT 1,              -- 允許的最大綁定數
            expires_at TIMESTAMP,                       -- 針對到期版 (pro) 的有效期限
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_stockai_license_status ON stockai_licenses(status);
    `);

    // 2. BMQ 屬性化兌換碼表 (Redemption Codes)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bmq_redemption_codes (
            code TEXT PRIMARY KEY,
            rewards JSONB NOT NULL,                     -- 存儲屬性：{ coins: 500, credits: 100, role: 'gold' }
            status TEXT NOT NULL DEFAULT 'available',   -- available, used, expired
            used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            used_at TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bmq_redeem_status ON bmq_redemption_codes(status);
    `);

    console.log('✅ [Database] StockAI License Tables Initialized.');
}
