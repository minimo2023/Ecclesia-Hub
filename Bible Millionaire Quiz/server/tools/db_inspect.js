import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function inspect() {
    const client = new pg.Client({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5433'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'bible_quiz'
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'user_login_attempts'
        `);
        console.log('📊 user_login_attempts:');
        console.log(JSON.stringify(res.rows, null, 2));

        const res2 = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'audit_logs'
        `);
        console.log('📊 audit_logs:');
        console.log(JSON.stringify(res2.rows, null, 2));

        process.exit(0);
    } catch (e) {
        console.error('Inspection failed:', e);
        process.exit(1);
    }
}

inspect();
