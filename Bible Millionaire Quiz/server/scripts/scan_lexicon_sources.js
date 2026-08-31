import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/content.db');

async function checkResources() {
  console.log('--- SCANNING RESOURCES FOR ENCYCLOPEDIA CONTENT ---');
  const db = new Database(dbPath);
  
  const keywords = ['百科', '辭典', 'Dictionary', 'Encyclopedia', 'Topic', 'Lexicon', '物品', '動物', '植物'];
  
  for (const kw of keywords) {
    const row = db.prepare(`SELECT count(*) as c FROM resources WHERE title LIKE '%${kw}%' OR category_id LIKE '%${kw}%'`).get();
    console.log(`Keyword "${kw}": ${row.c} matches`);
    
    if (row.c > 0) {
      const samples = db.prepare(`SELECT title, category_id, source FROM resources WHERE title LIKE '%${kw}%' OR category_id LIKE '%${kw}%' LIMIT 5`).all();
      console.log('Samples:', JSON.stringify(samples, null, 2));
    }
  }
  
  // Also check fhl_bible.db
  const fhlPath = path.join(__dirname, '../../data/fhl_bible.db');
  if (require('fs').existsSync(fhlPath)) {
    console.log('\n--- SCANNING fhl_bible.db ---');
    const fhlDb = new Database(fhlPath);
    const tables = fhlDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('FHL Tables:', tables.map(t => t.name));
    fhlDb.close();
  }

  db.close();
}

checkResources().catch(console.error);
