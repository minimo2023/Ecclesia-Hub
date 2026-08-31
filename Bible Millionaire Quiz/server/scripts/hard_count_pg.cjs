const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function count() {
    const tables = ['bible_verses', 'bible_books', 'locations', 'verse_locations', 'resources', 'extracted_text'];
    for (const t of tables) {
        const res = await pool.query(`SELECT count(*) as c FROM ${t}`);
        console.log(`📊 ${t.padEnd(16)} | Count: ${res.rows[0].c}`);
    }
    await pool.end();
}

count();
