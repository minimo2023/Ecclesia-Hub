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
    const res = await client.query(`SELECT id, name_zh, description FROM lexicons WHERE category = ${cat} LIMIT 5`);
    console.log(res.rows);
  }
  
  await client.end();
}

run().catch(console.error);
