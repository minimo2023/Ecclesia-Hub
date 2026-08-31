import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../../data/content.db'));

function search() {
  console.log('--- SEARCHING FOR ENCYCLOPEDIA IN 17k RESOURCES ---');
  const keywords = ['百科', '詞典', '辭典', '聖經百科', '神學詞典', 'FHL', '辭', '典'];
  const where = keywords.map(k => `title LIKE '%${k}%'`).join(' OR ');
  
  const rows = db.prepare(`SELECT r.id, r.title, r.category_id, length(et.content) as len FROM resources r JOIN extracted_text et ON r.id = et.resource_id WHERE ${where} LIMIT 50`).all();
  console.log(JSON.stringify(rows, null, 2));

  // Count by category
  const counts = db.prepare('SELECT category_id, count(*) as c FROM resources GROUP BY category_id').all();
  console.log('\n--- CATEGORY DISTRIBUTION ---');
  console.log(counts);
}

search();
db.close();
