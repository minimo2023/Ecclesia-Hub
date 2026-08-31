const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function audit() {
    console.log('--- 🔎 Hardened Schema Audit Report ---');
    
    const checkColumns = [
        { table: 'users', column: 'last_active_at' },
        { table: 'users', column: 'avatar_url' },
        { table: 'users', column: 'gender' },
        { table: 'users', column: 'birth_year' },
        { table: 'users', column: 'bio' },
        { table: 'user_memberships', column: 'tier' },
        { table: 'user_memberships', column: 'payment_info' },
        { table: 'user_ai_credit_wallet', column: 'last_daily_grant_at' }
    ];

    let passed = 0;
    for (const item of checkColumns) {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
        `, [item.table, item.column]);

        if (res.rows.length > 0) {
            console.log(`✅ Table [${item.table}] has column [${item.column}]`);
            passed++;
        } else {
            console.error(`❌ Table [${item.table}] is MISSING column [${item.column}]`);
        }
    }

    if (passed === checkColumns.length) {
        console.log('✨ AUDIT PASSED: 100% Hardening Alignment.');
    } else {
        console.error(`🚨 AUDIT FAILED: ${checkColumns.length - passed} discrepancies found.`);
    }

    await pool.end();
}

audit();
