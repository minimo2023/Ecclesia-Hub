import pg from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pgConfig = {
  connectionString: process.env.DATABASE_URL
};

async function auditDatabases() {
  console.log('--- DATABASE COMPREHENSIVE AUDIT ---');

  // 1. PostgreSQL Audit
  console.log('\n[PostgreSQL Audit]');
  const pgClient = new pg.Client(pgConfig);
  try {
    await pgClient.connect();
    const tablesRes = await pgClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    for (const row of tablesRes.rows) {
      const countRes = await pgClient.query(`SELECT count(*) FROM "${row.table_name}"`);
      console.log(`Table: ${row.table_name.padEnd(30)} | Rows: ${countRes.rows[0].count}`);
    }
    await pgClient.end();
  } catch (err) {
    console.error('PostgreSQL error:', err.message);
  }

  // 2. SQLite Audit (data/*.db)
  console.log('\n[SQLite Audit]');
  const dataDir = path.join(__dirname, '../../data');
  const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db'));
  
  for (const dbFile of dbFiles) {
    const dbPath = path.join(dataDir, dbFile);
    console.log(`\nDB: ${dbFile}`);
    try {
      const db = new Database(dbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      for (const t of tables) {
        const count = db.prepare(`SELECT count(*) as c FROM "${t.name}"`).get();
        console.log(`  Table: ${t.name.padEnd(28)} | Rows: ${count.c}`);
      }
      db.close();
    } catch (err) {
      console.error(`  Error reading ${dbFile}:`, err.message);
    }
  }
}

auditDatabases().catch(console.error);
