import pg from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const postgresClient = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log('--- DATABASE AUDIT ---');

  // 1. Audit PostgreSQL
  await postgresClient.connect();
  const pgTables = ['lexicons', 'bible_objects', 'bible_geography', 'snh_definitions', 'bible_trivia', 'commentaries', 'questions'];
  console.log('\n[PostgreSQL Row Counts]');
  for (const table of pgTables) {
    try {
      const res = await postgresClient.query(`SELECT count(*) FROM "${table}"`);
      console.log(`${table}: ${res.rows[0].count}`);
    } catch (e) {
      console.log(`${table}: NOT FOUND`);
    }
  }
  await postgresClient.end();

  // 2. Audit SQLite (data/content.db)
  console.log('\n[SQLite: data/content.db]');
  const dbPath = path.join(__dirname, '../../data/content.db');
  try {
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const t of tables) {
      const count = db.prepare(`SELECT count(*) as c FROM "${t.name}"`).get();
      console.log(`${t.name}: ${count.c}`);
    }
    db.close();
  } catch (e) {
    console.error(`Error reading SQLite: ${e.message}`);
  }

  // 3. Audit other DBs
  const files = ['fhl_bible.db', 'games.db', 'users.db', 'questions.db'];
  for (const f of files) {
    const p = path.join(__dirname, `../../data/${f}`);
    try {
      const db = new Database(p);
      const rowCount = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get();
      console.log(`\n[SQLite: ${f}] Tables: ${rowCount.c}`);
      db.close();
    } catch (e) {}
  }
}

run().catch(console.error);
