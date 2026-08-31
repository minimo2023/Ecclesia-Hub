import pg from 'pg';
import dotenv from 'dotenv';
import path from 'url';
import { fileURLToPath } from 'url';
import nodePath from 'path';

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: nodePath.join(__dirname, '../../.env') });

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, name_zh, description FROM lexicons WHERE category = 1 LIMIT 10`);
  console.log('--- Category 1 Samples ---');
  res.rows.forEach(r => console.log(`[${r.id}] ${r.name_zh}: ${r.description?.substring(0, 50).replace(/\n/g, ' ')}...`));
  
  const res2 = await client.query(`SELECT id, name_zh, description FROM lexicons WHERE category = 2 LIMIT 10`);
  console.log('\n--- Category 2 Samples ---');
  res2.rows.forEach(r => console.log(`[${r.id}] ${r.name_zh}: ${r.description?.substring(0, 50).replace(/\n/g, ' ')}...`));
  
  await client.end();
}

run().catch(console.error);
