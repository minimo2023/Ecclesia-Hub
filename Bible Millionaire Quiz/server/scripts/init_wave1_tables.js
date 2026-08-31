import { PostgresAdapter } from '../database/adapters/postgres.js';
import { createContentTables } from '../database/schemas_pg.js';
import dotenv from 'dotenv';
dotenv.config();

const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5433,
    user: process.env.DB_USER || 'dev',
    password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_dev'
};

async function init() {
    const db = new PostgresAdapter(config);
    await db.connect();
    console.log('🏗️ Resetting and Initializing Wave 1 tables (Content)...');
    try {
        // Drop to ensure columns added to schemas_pg.js are applied
        const tablesToReset = ['resources', 'extracted_text', 'locations', 'verse_locations', 'bible_verses', 'bible_books'];
        for (const t of tablesToReset) {
            await db.exec(`DROP TABLE IF EXISTS ${t} CASCADE`);
        }
        
        await createContentTables(db);
        console.log('✅ Content tables initialized.');
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
    await db.close();
}

init().catch(console.error);
