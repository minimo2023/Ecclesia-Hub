import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new pg.Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5433'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bible_quiz'
});

await client.connect();
const r = await client.query("DELETE FROM user_login_attempts WHERE identifier = 'admin' AND is_success = false");
console.log(`✅ Cleared ${r.rowCount} failed attempts for admin`);
process.exit(0);
