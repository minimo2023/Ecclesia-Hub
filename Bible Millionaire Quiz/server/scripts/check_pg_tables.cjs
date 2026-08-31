const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5433,
    user: process.env.DB_USER || 'dev',
    password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_dev'
});

async function check() {
    console.log(`🔍 Checking tables in ${process.env.DB_NAME || 'bible_quiz_dev'}...`);
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        console.log('Tables found:', res.rows.map(r => r.table_name).join(', '));
        
        console.log('\n🔍 Columns in "resources":');
        const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='resources'");
        console.table(cols.rows);
    } catch (e) {
        console.error('Error:', e.message);
    }
    await pool.end();
}

check();
