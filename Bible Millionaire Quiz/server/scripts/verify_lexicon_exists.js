import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/content.db');

try {
  const db = new Database(dbPath);
  const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lexicons'").get();
  console.log('Lexicons table exists:', !!info);
  
  if (info) {
    const count = db.prepare("SELECT count(*) as c FROM lexicons").get();
    console.log('Lexicons row count:', count.c);
    const sample = db.prepare("SELECT * FROM lexicons LIMIT 1").get();
    console.log('Sample:', sample);
  } else {
    // Check all tables again
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('All tables:', tables.map(t => t.name));
  }
  db.close();
} catch (e) {
  console.error('Error:', e.message);
}
