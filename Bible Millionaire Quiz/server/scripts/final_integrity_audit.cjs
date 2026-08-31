const { Pool } = require('pg');
const Database = require('better-sqlite3');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function finalAudit() {
    const dbUsers = new Database('data/users.db');
    const dbContent = new Database('data/content.db');
    
    console.log('--- 🔎 Final Unified Integrity Audit ---');

    const pairs = [
        { label: 'Bible Verses', sqDb: dbContent, sqTable: 'bible_verses', pgTable: 'bible_verses' },
        { label: 'Locations', sqDb: dbContent, sqTable: 'locations', pgTable: 'locations' },
        { label: 'Resources', sqDb: dbContent, sqTable: 'resources', pgTable: 'resources' },
        { label: 'Verse Locs', sqDb: dbContent, sqTable: 'verse_locations', pgTable: 'verse_locations' },
        { label: 'Extracted Text', sqDb: dbContent, sqTable: 'extracted_text', pgTable: 'extracted_text' }
    ];

    let totalMismatch = 0;

    for (const pair of pairs) {
        const sqCount = pair.sqDb.prepare(`SELECT count(*) as c FROM ${pair.sqTable}`).get().c;
        const pgRes = await pool.query(`SELECT count(*) as c FROM ${pair.pgTable}`);
        const pgCount = parseInt(pgRes.rows[0].c);

        if (sqCount === pgCount) {
            console.log(`✅ [${pair.label}] Alignment Match: ${pgCount}`);
        } else {
            console.error(`❌ [${pair.label}] MISMATCH! SQLite: ${sqCount}, Postgres: ${pgCount}`);
            totalMismatch++;
        }
    }

    // Single User Check
    const userRes = await pool.query("SELECT count(*) as c FROM users");
    console.log(`👤 Current User Count (Postgres): ${userRes.rows[0].c}`);

    if (totalMismatch === 0) {
        console.log('\n✨ FINAL INTEGRITY AUDIT PASSED: 100% ALIGNMENT.');
    } else {
        console.error(`\n🚨 FINAL INTEGRITY AUDIT FAILED: ${totalMismatch} discrepancies found.`);
    }

    dbUsers.close(); dbContent.close();
    await pool.end();
}

finalAudit().catch(console.error);
