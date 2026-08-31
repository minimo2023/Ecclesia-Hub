import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fixDb() {
    const client = new pg.Client({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5433'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'bible_quiz'
    });

    try {
        await client.connect();
        console.log('Connected to DB');

        // Rename column in user_login_attempts
        await client.query('ALTER TABLE user_login_attempts RENAME COLUMN email_or_username TO identifier');
        console.log('✅ Renamed email_or_username to identifier');

        // Rename column in user_sessions if needed (actually it is already correct in migration but double check)
        try {
            await client.query('ALTER TABLE user_sessions RENAME COLUMN refresh_token TO refresh_token_hash');
            console.log('✅ Renamed refresh_token to refresh_token_hash');
        } catch (e) {
            console.log('Note: refresh_token_hash already exists or rename failed (likely exists)');
        }

        process.exit(0);
    } catch (e) {
        console.error('Failed to fix DB:', e);
        process.exit(1);
    }
}

fixDb();
