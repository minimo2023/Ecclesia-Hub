import pg from 'pg';
import SecurityService from './services/SecurityService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function rehash() {
    const client = new pg.Client({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5433'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'bible_quiz'
    });

    try {
        await client.connect();
        const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin888';
        const hash = await SecurityService.hashPassword(adminPass);
        
        await client.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, 'admin']);
        console.log('✅ Admin password updated to Argon2id');
        
        process.exit(0);
    } catch (e) {
        console.error('Failed to rehash admin:', e);
        process.exit(1);
    }
}

rehash();
