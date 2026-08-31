const { Pool } = require('pg');
const Database = require('better-sqlite3');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function migrateUsers() {
    const sqlite = new Database('data/users.db');
    const rows = sqlite.prepare("SELECT * FROM users").all();
    console.log(`📦 Found ${rows.length} users in SQLite.`);

    for (const r of rows) {
        const id = r.id.trim();
        console.log(`  👤 Migrating [${r.username}] (${id})...`);
        
        // Map password to password_hash if necessary (Assuming legacy uses 'password')
        const passwordHash = r.password || 'legacy_temp_reset';
        
        const sql = `
            INSERT INTO users (id, username, password_hash, role, created_at, last_login)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                username = EXCLUDED.username,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                last_login = EXCLUDED.last_login
        `;

        const toISO = (val) => {
            if (typeof val !== 'number') return val;
            // 13 digits = ms, 10 digits = seconds
            const isMs = val > 9999999999;
            return new Date(isMs ? val : val * 1000).toISOString();
        };

        const createdAt = toISO(r.created_at);
        const lastLogin = toISO(r.last_login);

        await pool.query(sql, [id, r.username, passwordHash, r.role || 'user', createdAt, lastLogin]);
    }

    console.log('✅ Users migration finished.');
    sqlite.close();
    await pool.end();
}

migrateUsers().catch(console.error);
