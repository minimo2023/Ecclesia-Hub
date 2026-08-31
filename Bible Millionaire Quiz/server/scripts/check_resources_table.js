import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/content.db');

try {
  const db = new Database(dbPath);
  const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resources'").get();
  console.log('Resources table exists:', !!info);
  
  if (info) {
    const count = db.prepare("SELECT count(*) as c FROM resources").get();
    console.log('Resources row count:', count.c);
    const sample = db.prepare("SELECT * FROM resources LIMIT 5").all();
    console.log('Samples:', sample);
    
    // Check distribution of resources
    try {
      const types = db.prepare("SELECT type, COUNT(*) as count FROM resources GROUP BY type").all();
      console.log('Resource Types:', types);
    } catch (e) {
      console.log('No type column in resources');
    }
  }
  db.close();
} catch (e) {
  console.error('Error:', e.message);
}
