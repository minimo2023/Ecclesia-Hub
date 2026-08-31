import pg from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pgConfig = {
  connectionString: process.env.DATABASE_URL
};

async function auditEncyclopedia() {
  console.log('--- ENCYCLOPEDIA DATA AUDIT ---');

  // 1. Check PostgreSQL lexicons breakdown
  console.log('\n[PostgreSQL: lexicons]');
  const pgClient = new pg.Client(pgConfig);
  try {
    await pgClient.connect();
    const catRes = await pgClient.query('SELECT category, COUNT(*) FROM lexicons GROUP BY category');
    console.log('Categories:', catRes.rows);
    
    const sampleRes = await pgClient.query('SELECT name_zh, description FROM lexicons LIMIT 5');
    console.log('Samples:', sampleRes.rows.map(r => r.name_zh));
    
    // Check if snh_definitions is really empty
    const snhRes = await pgClient.query('SELECT count(*) FROM snh_definitions');
    console.log('Strong\'s Definitions (SNH) count:', snhRes.rows[0].count);
    
    await pgClient.end();
  } catch (err) {
    console.error('PostgreSQL error:', err.message);
  }

  // 2. Check SQLite content.db resources for keywords
  console.log('\n[SQLite: content.db resources]');
  const dbPath = path.join(__dirname, '../../data/content.db');
  try {
    const db = new Database(dbPath);
    const keywords = ['百科', '辭典', 'Dictionary', 'Encyclopedia', 'Topic', 'Lexicon'];
    for (const kw of keywords) {
      const count = db.prepare(`SELECT count(*) as c FROM resources WHERE title LIKE '%${kw}%' OR category_id LIKE '%${kw}%'`).get();
      console.log(`Keyword "${kw}": ${count.c} matches`);
    }
    
    const catTotal = db.prepare('SELECT category_id, COUNT(*) as c FROM resources GROUP BY category_id ORDER BY c DESC LIMIT 20').all();
    console.log('Top Categories in Resources:', catTotal);
    
    db.close();
  } catch (err) {
    console.error('SQLite error:', err.message);
  }
}

auditEncyclopedia().catch(console.error);
