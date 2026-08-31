/**
 * 資料庫核心模組 - 初始化與匯出
 * Database Core - Initialization & Exports
 * 
 * V2: Supports both SQLite and PostgreSQL via DatabaseFactory
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseFactory } from './adapters/factory.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// === DATABASE PATHS (SQLite Legacy) ===
const DATA_DIR = join(dirname(dirname(__dirname)), 'data');
const USERS_DB_PATH = join(DATA_DIR, 'users.db');
const CONTENT_DB_PATH = join(DATA_DIR, 'content.db');
const NOTES_DB_PATH = join(DATA_DIR, 'notes.db');
const GAMES_DB_PATH = join(DATA_DIR, 'games.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        // Ignored in non-fs environments
    }
}

// Database wrapper instances
// Note: These will be Adapter instances, not raw better-sqlite3 instances
export let usersDb, contentDb, notesDb, gamesDb;

/**
 * 初始化所有資料庫連線
 */
export async function initializeDatabases() {
    try {
        const dbType = process.env.DB_TYPE || 'postgres';
        const isPostgres = dbType === 'postgres';

        console.log(`🔌 Initializing databases (Type: ${dbType.toUpperCase()})...`);

        if (isPostgres) {
            const pgConfig = {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'postgres',
                database: process.env.DB_NAME || 'bible_quiz_v3' // Updated to V3.0 Unified
            };

            // In Postgres, we typically share one connection pool for all logic modules
            // or separate schemas. For simplified migration, we'll return the same adapter instance
            // for all "virtual" DBs, but they all point to the same physical Postgres DB.
            const sharedAdapter = DatabaseFactory.createAdapter('postgres', pgConfig);
            await sharedAdapter.connect();

            usersDb = sharedAdapter;
            contentDb = sharedAdapter;
            notesDb = sharedAdapter;
            gamesDb = sharedAdapter;
        } else {
            console.error('❌ Unsupported DB_TYPE. Only "postgres" is supported.');
            process.exit(1);
        }

        console.log('✅ All database connections established');
        return { usersDb, contentDb, notesDb, gamesDb };
    } catch (err) {
        console.error('❌ Database initialization failed:', err);
        process.exit(1);
    }
}

// Export crypto for modules that need it
export { crypto };
