const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function pureReset() {
    const username = 'minimo2000';
    const password = 'Pi50881212';
    const userId = 'minimo2000';

    console.log('🏗️ Performing Pure Reset...');
    
    // 1. Clear tables (Cascade ensures FK safety)
    await pool.query("TRUNCATE TABLE users CASCADE");
    console.log('✅ Users table truncated.');

    // 2. Hash Password
    const hash = await bcrypt.hash(password, 10);

    // 3. Create Admin
    await pool.query(`
        INSERT INTO users (id, username, password_hash, display_name, is_admin, role, created_at)
        VALUES ($1, $2, $3, $4, TRUE, 'admin', NOW())
    `, [userId, username, hash, 'Administrator']);
    console.log(`✅ User [${username}] created.`);

    // 4. Initialize AI Credit Wallet (30 points bonus)
    await pool.query(`
        INSERT INTO user_ai_credit_wallet (user_id, bonus_ai_credits, updated_at)
        VALUES ($1, 30, NOW())
        ON CONFLICT (user_id) DO UPDATE SET bonus_ai_credits = 30
    `, [userId]);
    console.log('✅ AI Credit Wallet initialized with 30 bonus points.');

    // 5. Log to Ledger
    await pool.query(`
        INSERT INTO ai_credit_ledger (user_id, amount, credit_pool, reason, balance_after, total_balance_after)
        VALUES ($1, 30, 'bonus', 'Registration Gift (Pure Reset)', 30, 30)
    `, [userId]);
    console.log('✅ AI Credit Ledger entry recorded.');

    // 6. Final Count Check
    const res = await pool.query("SELECT count(*) as c FROM users");
    console.log(`📊 Final User Count in PG: ${res.rows[0].c}`);

    await pool.end();
}

pureReset().catch(console.error);
