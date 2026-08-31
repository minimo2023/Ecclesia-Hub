const Database = require('better-sqlite3');
const { Pool } = require('pg');
require('dotenv').config();

const sqlite = new Database('data/content.db');
const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1', port: 5433,
    user: process.env.DB_USER || 'dev', password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_dev'
});

async function audit() {
    console.log('--- Double-Ended Column Audit ---');
    const tables = ['bible_verses', 'resources', 'locations', 'verse_locations'];
    
    for (const t of tables) {
        console.log(`\n📋 Table: ${t}`);
        
        // SQLite
        try {
            const sCols = sqlite.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name.toLowerCase());
            console.log(`  [SQLite] Columns: ${sCols.join(', ')}`);
            
            // Postgres
            const pRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${t}'`);
            const pCols = pRes.rows.map(r => r.column_name.toLowerCase());
            console.log(`  [Postgres] Columns: ${pCols.join(', ')}`);
            
            // Diff
            const missingInPg = sCols.filter(c => !pCols.includes(c));
            const extraInPg = pCols.filter(c => !sCols.includes(c));
            
            if (missingInPg.length > 0) console.warn(`  ⚠️ MISSING in Postgres: ${missingInPg.join(', ')}`);
            if (extraInPg.length > 0) console.log(`  ℹ️ EXTRA in Postgres: ${extraInPg.join(', ')} (OK if nullable)`);
            
            if (missingInPg.length === 0) console.log('  ✅ Schema Alignment: PASS');
            else console.error('  ❌ Schema Alignment: FAIL');
            
        } catch (e) {
            console.error(`  ❌ Error auditing ${t}:`, e.message);
        }
    }
    
    sqlite.close();
    await pool.end();
}

audit();
