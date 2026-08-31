const { Pool } = require('pg');
const Database = require('better-sqlite3');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function wipeAndMigrate() {
    const sqlite = new Database('data/users.db');
    const rows = sqlite.prepare("SELECT * FROM users").all();
    
    console.log('🏗️ Resetting Users Table in Postgres...');
    // We use TRUNCATE CASCADE to clear everything safely
    await pool.query("TRUNCATE TABLE users CASCADE");
    console.log('✅ Users table cleared.');

    for (const r of rows) {
        const id = r.id.trim();
        console.log(`  👤 Migrating [${r.username}] (${id})...`);
        
        const toISO = (val) => {
            if (!val || typeof val !== 'number') return val;
            const isMs = val > 9999999999;
            return new Date(isMs ? val : val * 1000).toISOString();
        };

        const sql = `
            INSERT INTO users (id, username, password_hash, role, created_at, last_login)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        await pool.query(sql, [
            id, 
            r.username, 
            r.password || 'legacy_placeholder', 
            r.role || 'user', 
            toISO(r.created_at), 
            toISO(r.last_login)
        ]);
    }

    console.log(`🏁 Successfully migrated ${rows.length} users.`);
    
    // Quick Count Check
    const res = await pool.query("SELECT count(*) as c FROM users");
    console.log(`📊 Final User Count in PG: ${res.rows[0].c}`);

    sqlite.close();
    await pool.end();
}

wipeAndMigrate().catch(console.error);
