const { Pool } = require('pg');
const Database = require('better-sqlite3');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function audit() {
    const sqlite = new Database('data/users.db');
    const sqRows = sqlite.prepare("SELECT id, username FROM users ORDER BY username").all();
    
    const pgRes = await pool.query("SELECT id, username FROM users ORDER BY username");
    const pgRows = pgRes.rows;

    console.log('--- 🔎 User Account Audit Report ---');
    console.log(`📊 SQLite Count: ${sqRows.length}`);
    console.log(`📊 Postgres Count: ${pgRows.length}`);

    let mismatch = 0;
    sqRows.forEach((sr, idx) => {
        const pr = pgRows.find(p => p.username === sr.username);
        if (!pr) {
            console.error(`❌ User [${sr.username}] missing in Postgres.`);
            mismatch++;
        } else if (pr.id !== sr.id.trim()) {
            console.error(`❌ ID Mismatch for [${sr.username}]: SQ=${sr.id.trim()}, PG=${pr.id}`);
            mismatch++;
        } else {
            console.log(`✅ User [${sr.username}] matches perfectly.`);
        }
    });

    if (mismatch === 0 && sqRows.length === pgRows.length) {
        console.log('✨ AUDIT PASSED: 100% Alignment.');
    } else {
        console.error(`🚨 AUDIT FAILED: ${mismatch} discrepancies found.`);
    }

    sqlite.close();
    await pool.end();
}

audit();
