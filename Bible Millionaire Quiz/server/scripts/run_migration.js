import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import { dbOps } from '../database/index.js';

// Setup environment for standalone script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('Usage: node run_migration.js <migration_file_path>');
    process.exit(1);
}

const fullPath = path.resolve(process.cwd(), migrationFile);

if (!fs.existsSync(fullPath)) {
    console.error(`❌ Migration file not found: ${fullPath}`);
    process.exit(1);
}

const sql = fs.readFileSync(fullPath, 'utf8');

console.log(`Running migration from: ${path.basename(fullPath)}`);
console.log('Target DB: games.db (assuming game data schema)');

const db = dbOps.gamesDb;

try {
    db.exec(sql);
    console.log('✅ Migration success');
} catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
}
