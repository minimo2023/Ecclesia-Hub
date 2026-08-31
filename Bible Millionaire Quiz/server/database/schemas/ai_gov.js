/**
 * AI 治理與經濟隔離區 Schema (ai_gov)
 * [V3 Sovereign Proxy]
 */

import {
    DEFAULT_GEMINI_MODEL,
    isAllowedGeminiModel
} from '../../infrastructure/ai/model-policy.js';

/**
 * AI 用量監測與 1000 元台幣預算看門狗 (Isolated)
 */
export async function createAIGovernanceTables(db) {
    console.log('🏛️ [Database] Ensuring ai_gov Schema...');
    await db.exec('CREATE SCHEMA IF NOT EXISTS ai_gov;');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.ai_usage_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            module_name TEXT NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_cost_twd DECIMAL(10, 5) DEFAULT 0,
            correlation_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_module ON ai_gov.ai_usage_logs(module_name);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_gov.ai_usage_logs(user_id);

        -- AI Model Config (Rates & Status)
        CREATE TABLE IF NOT EXISTS ai_gov.ai_model_config (
            model_id TEXT PRIMARY KEY,
            friendly_name TEXT,
            input_price_per_1k_points DECIMAL(10, 5) DEFAULT 0,
            output_price_per_1k_points DECIMAL(10, 5) DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- AI System Config (Budgets & Offsets)
        CREATE TABLE IF NOT EXISTS ai_gov.ai_system_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed initial budget data
        INSERT INTO ai_gov.ai_system_config (key, value) VALUES ('budget_limit_twd', '1000') ON CONFLICT DO NOTHING;
        INSERT INTO ai_gov.ai_system_config (key, value) VALUES ('initial_spent_offset_twd', '0') ON CONFLICT DO NOTHING;
    `);

    // Migration: add model_id column if missing (logAIUsage writes this field)
    await db.exec(`ALTER TABLE ai_gov.ai_usage_logs ADD COLUMN IF NOT EXISTS model_id TEXT;`);

    // 欄位名稱沿用歷史命名，實際儲存的是官方「每 1M tokens 美元費率」。
    const recommendedModels = [
        ['gemini-3.5-flash', 'Gemini 3.5 Flash', 0.75, 4.50],
        ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 0.25, 1.50],
        ['gemini-2.5-flash', 'Gemini 2.5 Flash', 0.30, 2.50],
        ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 0.10, 0.40]
    ];
    for (const model of recommendedModels) {
        await db.run(`
            INSERT INTO ai_gov.ai_model_config (
                model_id,
                friendly_name,
                input_price_per_1k_points,
                output_price_per_1k_points
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (model_id) DO UPDATE SET
                friendly_name = EXCLUDED.friendly_name,
                input_price_per_1k_points = EXCLUDED.input_price_per_1k_points,
                output_price_per_1k_points = EXCLUDED.output_price_per_1k_points,
                updated_at = CURRENT_TIMESTAMP
        `, model);
    }

    const modelConfigs = await db.query(
        'SELECT model_id, is_active FROM ai_gov.ai_model_config'
    );
    for (const modelConfig of modelConfigs) {
        const modelId = modelConfig.modelId ?? modelConfig.model_id;
        const isActive = modelConfig.isActive ?? modelConfig.is_active;
        if (isActive && !isAllowedGeminiModel(modelId)) {
            await db.run(`
                UPDATE ai_gov.ai_model_config
                SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE model_id = $1
            `, [modelId]);
        }
    }

    await db.run(`
        INSERT INTO ai_gov.ai_system_config (key, value)
        VALUES ('default_ai_model', $1)
        ON CONFLICT DO NOTHING
    `, [DEFAULT_GEMINI_MODEL]);

    const policyVersion = await db.get(`
        SELECT value
        FROM ai_gov.ai_system_config
        WHERE key = 'model_policy_version'
    `);
    if (policyVersion?.value !== 'flash-family-v1') {
        // 舊版政策曾強制把預設值鎖在 2.5；只在遷移當下解除一次。
        await db.run(`
            UPDATE ai_gov.ai_system_config
            SET value = $1, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'default_ai_model' AND value = 'gemini-2.5-flash'
        `, [DEFAULT_GEMINI_MODEL]);
        await db.run(`
            INSERT INTO ai_gov.ai_system_config (key, value)
            VALUES ('model_policy_version', 'flash-family-v1')
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        `);
    }

    const defaultConfig = await db.get(`
        SELECT value
        FROM ai_gov.ai_system_config
        WHERE key = 'default_ai_model'
    `);
    if (!isAllowedGeminiModel(defaultConfig?.value)) {
        await db.run(`
            UPDATE ai_gov.ai_system_config
            SET value = $1, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'default_ai_model'
        `, [DEFAULT_GEMINI_MODEL]);
    }
}

/**
 * AI 點數錢包與帳本 (Isolated)
 */
export async function createAICreditTables(db) {
    await db.exec('CREATE SCHEMA IF NOT EXISTS ai_gov;');

    // AI Credit Wallet
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.user_ai_credit_wallet (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            bonus_ai_credits INTEGER NOT NULL DEFAULT 0,
            exchange_ai_credits INTEGER NOT NULL DEFAULT 0,
            paid_ai_credits INTEGER NOT NULL DEFAULT 0,
            last_daily_grant_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // AI Credit Ledger
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.ai_credit_ledger (
            id SERIAL PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            credit_pool TEXT NOT NULL,
            reason TEXT,
            balance_after INTEGER NOT NULL,
            total_balance_after INTEGER,
            correlation_id TEXT,
            related_module TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_ledger_user ON ai_gov.ai_credit_ledger(user_id);
    `);
}

/**
 * 會員方案資料表 (PostgreSQL - Isolated)
 */
export async function createMembershipTables(db) {
    await db.exec('CREATE SCHEMA IF NOT EXISTS ai_gov;');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_gov.user_memberships (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tier TEXT NOT NULL DEFAULT 'free',
            status TEXT NOT NULL DEFAULT 'active',
            valid_until TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_active_unique_v3
        ON ai_gov.user_memberships(user_id)
        WHERE status = 'active';
    `);
}
