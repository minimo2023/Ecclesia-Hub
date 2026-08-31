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

async function audit() {
  await client.connect();
  console.log('--- POSTGRES LEXICON AUDIT (723 ROWS) ---');
  const res = await client.query('SELECT * FROM lexicons LIMIT 20');
  console.log(JSON.stringify(res.rows, null, 2));

  // Count by category or type in Postgres if exists
  const countRes = await client.query('SELECT count(*) FROM lexicons');
  console.log(`Total Lexicons: ${countRes.rows[0].count}`);

  await client.end();
}

audit().catch(err => {
    console.error('Audit Error:', err);
    process.exit(1);
});
