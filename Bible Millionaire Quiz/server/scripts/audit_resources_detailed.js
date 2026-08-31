import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/content.db');

async function auditResources() {
  console.log('--- SCANNING RESOURCES TABLE ---');
  const db = new Database(dbPath);
  
  // Count by category_id
  const categories = db.prepare('SELECT category_id, COUNT(*) as count FROM resources GROUP BY category_id ORDER BY count DESC').all();
  console.log('Categories in resources:', JSON.stringify(categories, null, 2));

  // Check for encyclopedia-like keywords in titles
  const keywords = ['百科', '辭典', 'Dictionary', 'Encyclopedia', 'Topic', 'Lexicon'];
  for (const kw of keywords) {
    const matches = db.prepare(`SELECT count(*) as count FROM resources WHERE title LIKE '%${kw}%'`).get();
    console.log(`Keyword "${kw}" matches: ${matches.count}`);
    if (matches.count > 0) {
        const samples = db.prepare(`SELECT title FROM resources WHERE title LIKE '%${kw}%' LIMIT 3`).all();
        console.log(`  Samples: ${samples.map(s => s.title).join(', ')}`);
    }
  }

  // Check fhl_bible.db tables
  const fhlPath = path.join(__dirname, '../../data/fhl_bible.db');
  console.log('\n--- SCANNING fhl_bible.db ---');
  try {
    const fhlDb = new Database(fhlPath);
    const tables = fhlDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const t of tables) {
      const count = fhlDb.prepare(`SELECT count(*) as count FROM ${t.name}`).get();
      console.log(`Table: ${t.name} | Rows: ${count.count}`);
    }
    fhlDb.close();
  } catch (err) {
    console.log('fhl_bible.db error:', err.message);
  }

  db.close();
}

auditResources().catch(console.error);
