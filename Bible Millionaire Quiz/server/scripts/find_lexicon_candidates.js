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

async function findCandidates() {
  await client.connect();
  const res = await client.query('SELECT name_zh FROM lexicons LIMIT 50');
  console.log(JSON.stringify(res.rows.map(r => r.name_zh)));

  // Try finding some specifically
  const targetRes = await client.query(`
    SELECT name_zh FROM lexicons WHERE name_zh LIKE '%羊%' OR name_zh LIKE '%木%' OR name_zh LIKE '%金%' OR name_zh LIKE '%祭%' LIMIT 5
  `);
  console.log("Specific candidates:", targetRes.rows.map(r => r.name_zh));

  await client.end();
}

findCandidates().catch(console.error);
