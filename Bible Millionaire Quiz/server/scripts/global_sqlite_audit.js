import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

function fullAudit() {
  console.log('--- GLOBAL SQLITE AUDIT ---');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.db'));
  
  for (const file of files) {
    const dbPath = path.join(dataDir, file);
    console.log(`\n[DB: ${file}]`);
    try {
      const db = new Database(dbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      for (const t of tables) {
        const count = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get();
        console.log(`  - ${t.name}: ${count.c} rows`);
        
        // If the table looks like a lexicon, show samples
        if (t.name.toLowerCase().includes('lexicon') || t.name.toLowerCase().includes('encyclopedia') || t.name.toLowerCase().includes('dictionary')) {
            const samples = db.prepare(`SELECT * FROM ${t.name} LIMIT 5`).all();
            console.log(`    SAMPLES:`, samples.map(s => s.name || s.title || s.word || s.id));
        }
      }
      db.close();
    } catch (err) {
      console.log(`  Error reading ${file}: ${err.message}`);
    }
  }
}

fullAudit();
