/**
 * Migration: Add columns and missing tables
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bible_quiz'
});

async function migrate() {
    console.log('🔧 Running migration: Add columns and missing tables...');

    try {
        // 1. Add columns to expedition_questions
        const checkEvidence = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'expedition_questions' AND column_name = 'evidence'
        `);

        if (checkEvidence.rows.length === 0) {
            await pool.query('ALTER TABLE expedition_questions ADD COLUMN evidence TEXT');
            console.log('✅ Added column: evidence');
        } else {
            console.log('ℹ️ Column evidence already exists');
        }

        const checkExplanation = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'expedition_questions' AND column_name = 'explanation'
        `);

        if (checkExplanation.rows.length === 0) {
            await pool.query('ALTER TABLE expedition_questions ADD COLUMN explanation TEXT');
            console.log('✅ Added column: explanation');
        } else {
            console.log('ℹ️ Column explanation already exists');
        }

        // 2. Create daily_devotionals table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_devotionals (
                date TEXT PRIMARY KEY,
                content TEXT,
                metadata JSONB,
                generated_at BIGINT
            );
        `);
        console.log('✅ Ensured table: daily_devotionals');

        // 3. Create note_drafts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS note_drafts (
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                content TEXT,
                updated_at BIGINT,
                PRIMARY KEY (user_id, date)
            );
        `);
        console.log('✅ Ensured table: note_drafts');

        // 4. Create commentaries table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS commentaries (
                id SERIAL PRIMARY KEY,
                book TEXT,
                title TEXT,
                category TEXT,
                source_path TEXT,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Ensured table: commentaries');

        // 5. Fix devotional_notes table (drop and recreate if wrong structure)
        const checkNotes = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'devotional_notes' AND column_name = 'book'
        `);

        if (checkNotes.rows.length > 0) {
            console.log('🔄 Fixing devotional_notes table structure...');
            await pool.query('DROP TABLE IF EXISTS devotional_notes CASCADE');
            await pool.query(`
                CREATE TABLE devotional_notes (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    note TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, date)
                )
            `);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_notes_user ON devotional_notes(user_id)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_notes_date ON devotional_notes(date)');
            console.log('✅ Recreated table: devotional_notes');
        } else {
            // Table might not exist at all
            await pool.query(`
                CREATE TABLE IF NOT EXISTS devotional_notes (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    note TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, date)
                )
            `);
            console.log('✅ Ensured table: devotional_notes');
        }

        console.log('✅ Migration complete!');
    } catch (error) {
        console.error('❌ Migration error:', error.message);
    } finally {
        await pool.end();
    }
}

migrate();
