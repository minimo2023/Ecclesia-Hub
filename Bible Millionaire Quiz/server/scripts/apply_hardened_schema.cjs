const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function harden() {
    console.log('🏗️ Hardening Postgres Schema...');

    const commands = [
        // Users
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year INTEGER",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        
        // Memberships
        "ALTER TABLE user_memberships ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard'",
        "ALTER TABLE user_memberships ADD COLUMN IF NOT EXISTS payment_info JSONB",
        
        // AI Wallet
        "ALTER TABLE user_ai_credit_wallet ADD COLUMN IF NOT EXISTS last_daily_grant_at TIMESTAMP"
    ];

    for (const cmd of commands) {
        try {
            await pool.query(cmd);
            console.log(`✅ Executed: ${cmd}`);
        } catch (e) {
            console.error(`❌ Failed: ${cmd} - ${e.message}`);
        }
    }

    console.log('🏁 Schema hardening applied successfully.');
    await pool.end();
}

harden().catch(console.error);
