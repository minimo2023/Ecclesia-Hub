import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();
  
  for (let cat of [0, 1, 2]) {
    console.log(`\n--- Category ${cat} Samples ---`);
    const res = await client.query(`SELECT id, name_zh, description FROM lexicons WHERE category = ${cat} LIMIT 10`);
    res.rows.forEach(r => console.log(`[${r.id}] ${r.name_zh}: ${r.description?.substring(0, 100).replace(/\n/g, ' ')}...`));
  }
  
  await client.end();
}

run().catch(console.error);
