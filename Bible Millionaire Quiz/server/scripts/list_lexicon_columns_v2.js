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

async function listColumns() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'lexicons'
  `);
  console.log('Columns in lexicons:', res.rows.map(r => r.column_name));
  
  const sampleRes = await client.query('SELECT * FROM lexicons LIMIT 1');
  if (sampleRes.rows.length > 0) {
    console.log('Sample keys:', Object.keys(sampleRes.rows[0]));
  }
  
  await client.end();
}

listColumns().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
