import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    const client = new pg.Client({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5433'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'bible_quiz'
    });

    try {
        await client.connect();
        const res = await client.query("SELECT identifier, is_success, attempted_at FROM user_login_attempts WHERE identifier = 'admin' ORDER BY attempted_at DESC LIMIT 10");
        console.log('--- Attempts for admin ---');
        console.table(res.rows);
        
        const throttleCount = await client.query("SELECT COUNT(*) FROM user_login_attempts WHERE identifier = 'admin' AND is_success = false AND attempted_at >= NOW() - INTERVAL '15 minutes'");
        console.log('Failures in last 15 mins:', throttleCount.rows[0].count);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
