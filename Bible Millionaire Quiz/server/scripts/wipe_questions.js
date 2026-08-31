
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PostgresAdapter } from '../database/adapters/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function wipeQuestions() {
    console.log('⚠️  [DANGER] Wiping ALL Questions from PostgreSQL...');

    if (process.env.DB_TYPE !== 'postgres') {
        console.error('❌ Error: DB_TYPE is not postgres. Aborting.');
        process.exit(1);
    }

    const db = new PostgresAdapter({
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: process.env.PG_DATABASE,
        password: process.env.PG_PASSWORD,
        port: process.env.PG_PORT,
        ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    try {
        await db.connect();

        // Count before
        const before = await db.query('SELECT COUNT(*) as count FROM questions');
        console.log(`📊 Current Questions: ${before[0].count}`);

        console.log('🗑️  Truncating questions table...');

        // TRUNCATE is faster and resets auto-increment (if any), CASCADE handles fk
        await db.query('TRUNCATE TABLE questions CASCADE');

        console.log('✅ WIPE COMPLETE. All questions deleted.');

    } catch (e) {
        console.error('❌ Wipe failed:', e.message);
    } finally {
        process.exit(0);
    }
}

wipeQuestions();
