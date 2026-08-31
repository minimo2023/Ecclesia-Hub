import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import { hubRoot, serverRoot } from '../utils/paths.js';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'dev',
    password: 'dev123',
    database: 'bible_quiz_v3'
});

async function restore() {
    try {
        console.log("1. Preparing schema for old backup...");
        await pool.query(`
            ALTER TABLE questions RENAME COLUMN question TO question_text;
            ALTER TABLE questions RENAME COLUMN answer TO correct_answer;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_detected TEXT;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS chapter_start INTEGER;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS chapter_end INTEGER;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS stem TEXT;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS anchors JSONB;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS keywords JSONB;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality TEXT;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS stats_shown INTEGER;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS stats_correct INTEGER;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS stats_wrong INTEGER;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS verse INTEGER;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_type TEXT;
            ALTER TABLE questions ADD COLUMN IF NOT EXISTS sig_semantic TEXT;
        `);

        console.log("2. Inserting data from questions_final.sql...");
        const sql = fs.readFileSync(path.join(hubRoot, 'backups', 'questions_final.sql'), 'utf8');
        await pool.query(sql);

        console.log("3. Applying migration to bring schema back to V3...");
        const migrateSql = fs.readFileSync(
            path.join(serverRoot, 'database', 'migrations', 'migrate_questions_v2.sql'),
            'utf8'
        );
        await pool.query(migrateSql);

        const count = await pool.query('SELECT count(*) FROM questions');
        console.log("✅ Successfully restored questions! Total count:", count.rows[0].count);
    } catch (e) {
        console.error("❌ Failed:", e);
    } finally {
        await pool.end();
    }
}

restore();
