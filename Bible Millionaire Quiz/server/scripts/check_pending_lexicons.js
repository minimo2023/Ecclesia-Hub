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

async function checkPending() {
  await client.connect();
  const res = await client.query('SELECT count(*) FROM lexicons WHERE distilled_json IS NULL');
  console.log('Pending lexicons (distilled_json IS NULL):', res.rows[0].count);

  const res2 = await client.query('SELECT count(*) FROM lexicons WHERE is_distilled = false');
  console.log('Pending lexicons (is_distilled = false):', res2.rows[0].count);
  await client.end();
}

checkPending().catch(console.error);
