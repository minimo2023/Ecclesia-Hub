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
  
  // Search for keywords in names to identify categories
  const keywords = {
    animals: ['羊', '獅', '驢', '駱駝', '鷹', '蛇', '蟲', '魚'],
    plants: ['草', '木', '花', '樹', '果', '芥菜', '合歡', '棕樹'],
    items: ['杖', '器', '杯', '盤', '石', '金', '銀', '披肩']
  };

  for (const [type, keys] of Object.entries(keywords)) {
    console.log(`\n--- Searching for ${type} ---`);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
    const query = `
      SELECT category, COUNT(*) as count 
      FROM lexicons 
      WHERE ${keys.map(k => `name_zh LIKE '%${k}%'`).join(' OR ')}
      GROUP BY category
    `;
    const res = await client.query(query);
    console.log(`${type} distribution:`, res.rows);
  }

  // Get sample for EACH category to be absolutely sure
  const cats = await client.query('SELECT DISTINCT category FROM lexicons ORDER BY category');
  for (const row of cats.rows) {
      const cat = row.category;
      console.log(`\n--- Category ${cat} Top 10 Names ---`);
      const samples = await client.query(`SELECT name_zh FROM lexicons WHERE category = ${cat} LIMIT 10`);
      console.log(samples.rows.map(r => r.name_zh).join(', '));
  }

  await client.end();
}

run().catch(console.error);
