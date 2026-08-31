const { Pool } = require('pg');
const Database = require('better-sqlite3');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev',
    max: 20 // Use a pool
});

const BATCH_SIZE = 500;

async function fastSync() {
    const sqlite = new Database('data/content.db');
    const bibles = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    console.log('--- 🚀 Ultra-Fast Atomic Wave 1 Sync ---');
    
    // 1. Precise Table Reset
    console.log('🔨 Step 1: Force Resetting Core Tables...');
    const order = ['extracted_text', 'verse_locations', 'locations', 'resources', 'bible_verses', 'bible_books'];
    for (const t of order) {
        await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }

    // 2. Re-create using definitive schema (Simplified for script, but accurate)
    await pool.query(`CREATE TABLE bible_books (id TEXT PRIMARY KEY, name_zh TEXT, name_en TEXT, testament TEXT, category TEXT, chapters INTEGER, order_num INTEGER, metadata JSONB DEFAULT '{}');`);
    await pool.query(`CREATE TABLE bible_verses (id TEXT PRIMARY KEY, version TEXT, book TEXT, book_name TEXT, chapter INTEGER, verse INTEGER, text TEXT, source TEXT, metadata JSONB DEFAULT '{}', cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(version, book, chapter, verse));`);
    await pool.query(`CREATE TABLE resources (id TEXT PRIMARY KEY, title TEXT, filename TEXT, file_path TEXT, file_type TEXT, file_size INTEGER, metadata JSONB DEFAULT '{}', processed BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, source TEXT);`);
    await pool.query(`CREATE TABLE extracted_text (id TEXT PRIMARY KEY, resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE, content TEXT, word_count INTEGER, is_important BOOLEAN DEFAULT FALSE, importance_score DOUBLE PRECISION, estimated_read_time INTEGER, metadata JSONB DEFAULT '{}', extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE locations (id TEXT PRIMARY KEY, code TEXT, name_ch TEXT, name_en TEXT, type TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, metadata JSONB DEFAULT '{}', processed BOOLEAN DEFAULT FALSE, description TEXT, source TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, verse TEXT);`);
    await pool.query(`CREATE TABLE verse_locations (id TEXT PRIMARY KEY, book TEXT, chapter INTEGER, verse INTEGER, location_id TEXT REFERENCES locations(id) ON DELETE CASCADE, source TEXT);`);
    console.log('✅ Schema Ready.');

    // 3. Batch Migrate
    const tables = [
        { src: 'bible_books', dest: 'bible_books' },
        { src: 'bible_verses', dest: 'bible_verses' },
        { src: 'locations', dest: 'locations' },
        { src: 'verse_locations', dest: 'verse_locations' },
        { src: 'resources', dest: 'resources' },
        { src: 'extracted_text', dest: 'extracted_text' }
    ];

    for (const table of tables) {
        console.log(`📦 Migrating ${table.src}...`);
        const rows = sqlite.prepare(`SELECT * FROM ${table.src}`).all();
        if (rows.length === 0) continue;

        const pCols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${table.dest}'`)).rows.map(r => r.column_name);
        const common = Object.keys(rows[0]).map(k => k.toLowerCase()).filter(k => pCols.includes(k));
        
        // Use batch size 1 for debugging problematic tables
        const currentBatchSize = (table.src === 'locations' || table.src === 'verse_locations') ? 1 : BATCH_SIZE;
        
        for (let i = 0; i < rows.length; i += currentBatchSize) {
            const batch = rows.slice(i, i + currentBatchSize);
            const values = [];
            let placeholderIndex = 1;
            const rows_sql = batch.map(r => {
                const rowValues = common.map(key => {
                    let v = r[Object.keys(r).find(k => k.toLowerCase() === key)];
                    if (typeof v === 'string' && (key === 'id' || key.endsWith('_id'))) v = v.trim();
                    if (key.endsWith('_at') && typeof v === 'number') v = new Date(v * 1000).toISOString();
                    if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
                    return v;
                });
                values.push(...rowValues);
                const rowPlaceholders = rowValues.map(() => '$' + (placeholderIndex++)).join(', ');
                return `(${rowPlaceholders})`;
            }).join(', ');

            const sql = `INSERT INTO ${table.dest} (${common.join(', ')}) VALUES ${rows_sql} ON CONFLICT DO NOTHING`;
            await pool.query(sql, values);
            if (i % 5000 === 0) process.stdout.write('.');
        }
        console.log(`\n✅ ${table.src} finished.`);
    }

    // 4. Verification Check
    console.log('\n--- 💡 Final Verification Count ---');
    for (const table of tables) {
        const res = await pool.query(`SELECT count(*) as c FROM ${table.dest}`);
        console.log(`📊 ${table.dest.padEnd(16)} | Count: ${res.rows[0].c}`);
    }

    sqlite.close();
    await pool.end();
}

fastSync().catch(err => {
    console.error('💥 CRITICAL ERROR:', err);
    process.exit(1);
});
