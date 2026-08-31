import Database from 'better-sqlite3';
import path from 'path';
import { dataRoot } from '../utils/paths.js';

const dbPath = path.join(dataRoot, 'content.db');
console.log(`Checking DB at: ${dbPath}`);

try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables found:', tables.map(t => t.name).join(', '));
} catch (e) {
    console.error('Error:', e.message);
}
