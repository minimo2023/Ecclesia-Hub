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

async function auditColumns() {
  await client.connect();
  console.log('--- LEXICONS TABLE COLUMNS ---');
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'lexicons'
  `);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\n--- SAMPLE ROW ---');
  const sample = await client.query('SELECT * FROM lexicons LIMIT 1');
  console.log(JSON.stringify(sample.rows[0], null, 2));

  await client.end();
}

auditColumns().catch(err => {
    console.error('Audit Error:', err);
    process.exit(1);
});
