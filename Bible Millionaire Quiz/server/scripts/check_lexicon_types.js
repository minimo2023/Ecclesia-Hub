import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../../data/content.db'));

try {
    const columns = db.prepare('PRAGMA table_info(lexicons)').all();
    console.log('Columns:', columns.map(c => c.name));

    const samples = db.prepare('SELECT type, COUNT(*) as count FROM lexicons GROUP BY type').all();
    console.log('Types:', samples);
} catch (err) {
    console.error(err);
} finally {
    db.close();
}
