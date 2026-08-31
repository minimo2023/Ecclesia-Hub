import { dbOps } from '../index.js';

export async function setupEconomyConfig() {
    console.log('🔄 [Migration] Setting up ai_gov.economy_config...');
    const usersDb = dbOps.usersDb;
    
    // 1. Ensure ai_gov schema exists
    await usersDb.run('CREATE SCHEMA IF NOT EXISTS ai_gov');

    // 2. Create economy_config table
    await usersDb.run(`
        CREATE TABLE IF NOT EXISTS ai_gov.economy_config (
            config_key VARCHAR(50) PRIMARY KEY,
            config_value NUMERIC NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 3. Insert default values if not exists
    await usersDb.run(`
        INSERT INTO ai_gov.economy_config (config_key, config_value, description)
        VALUES 
            ('rate_coin_to_credit', 50, '金幣換點數的匯率 (X 金幣 = 1 點數)'),
            ('rate_credit_to_coin', 45, '點數換金幣的匯率 (1 點數 = X 金幣)')
        ON CONFLICT (config_key) DO NOTHING
    `);

    console.log('✅ [Migration] ai_gov.economy_config initialized.');
}
