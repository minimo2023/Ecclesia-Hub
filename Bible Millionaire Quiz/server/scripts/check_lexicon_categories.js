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
  
  console.log('--- Table: lexicons ---');
  const lexCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='lexicons'");
  console.log('Columns:', lexCols.rows.map(r => r.column_name));
  const lexTypes = await client.query("SELECT category, COUNT(*) FROM lexicons GROUP BY category");
  console.log('Categories:', lexTypes.rows);

  console.log('\n--- Table: bible_objects ---');
  const objCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='bible_objects'");
  console.log('Columns:', objCols.rows.map(r => r.column_name));
  const objTypes = await client.query("SELECT category, COUNT(*) FROM bible_objects GROUP BY category");
  console.log('Categories:', objTypes.rows);
  
  await client.end();
}

run().catch(console.error);
