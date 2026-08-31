
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PostgresAdapter } from '../database/adapters/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verifyMigration() {
    console.log('🔍 Connecting to PostgreSQL to verify data migration...');
    const db = new PostgresAdapter({
        user: process.env.PG_USER || 'postgres',
        host: process.env.PG_HOST || 'localhost',
        database: process.env.PG_DATABASE || 'bibledb',
        password: process.env.PG_PASSWORD || 'password',
        port: process.env.PG_PORT || 5432,
        ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    try {
        await db.connect();

        // 1. Check Bible Verses
        const verseCount = await db.query('SELECT COUNT(*) as count FROM bible_verses');
        console.log(`📖 Bible Verses Count: ${verseCount[0].count}`);

        if (parseInt(verseCount[0].count) === 0) {
            console.error('❌ Migration Warning: bible_verses table is empty!');
        } else {
            console.log('✅ Bible verses migrated.');
        }

        // 2. Check Resources
        const resourceCount = await db.query('SELECT COUNT(*) as count FROM resources');
        console.log(`📚 Resources Count: ${resourceCount[0].count}`);

        // 3. Check Locations
        try {
            const locCount = await db.query('SELECT COUNT(*) as count FROM locations');
            console.log(`🗺️ Locations Count: ${locCount[0].count}`);
        } catch (e) { console.log('⚠️ Locations table might not exist in Postgres yet.'); }

        // 4. Sample Query
        const sample = await db.query('SELECT text FROM bible_verses LIMIT 1');
        if (sample.length > 0) {
            console.log(`📝 Sample Verse: "${sample[0].text.substring(0, 50)}..."`);
        }

    } catch (e) {
        console.error('❌ Connection or Verification failed:', e.message);
    } finally {
        // await db.end(); // Adapter missing end? It's fine for script to exit
        process.exit(0);
    }
}

verifyMigration();
