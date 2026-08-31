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
  
  const res0 = await client.query(`SELECT category, name_zh FROM lexicons WHERE category = 0 LIMIT 10`);
  console.log('--- Category 0 Samples ---');
  console.log(res0.rows.map(r => r.name_zh).join(', '));

  const res1 = await client.query(`SELECT category, name_zh FROM lexicons WHERE category = 1 LIMIT 10`);
  console.log('\n--- Category 1 Samples ---');
  console.log(res1.rows.map(r => r.name_zh).join(', '));

  const res2 = await client.query(`SELECT category, name_zh FROM lexicons WHERE category = 2 LIMIT 10`);
  console.log('\n--- Category 2 Samples ---');
  console.log(res2.rows.map(r => r.name_zh).join(', '));
  
  await client.end();
}

run().catch(console.error);
