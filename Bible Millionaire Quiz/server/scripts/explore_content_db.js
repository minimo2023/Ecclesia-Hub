import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/content.db');
const db = new Database(dbPath);

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name));

    // If lexicons exists, check types
    const hasLexicons = tables.some(t => t.name === 'lexicons');
    if (hasLexicons) {
        const types = db.prepare('SELECT type, COUNT(*) as count FROM lexicons GROUP BY type').all();
        console.log('Lexicon Types:', types);
        const columns = db.prepare('PRAGMA table_info(lexicons)').all();
        console.log('Lexicon Columns:', columns.map(c => c.name));
        
        // Show some samples of "Items, Animals, Plants"
        // Common type names might be 'item', 'animal', 'plant', 'creature', etc.
        const samples = db.prepare('SELECT id, name, type, description FROM lexicons LIMIT 20').all();
        console.log('Sample Data:', samples);
    } else {
        console.log('Table "lexicons" not found!');
    }
} catch (err) {
    console.error(err);
} finally {
    db.close();
}
