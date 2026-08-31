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

async function auditContent() {
  await client.connect();
  
  console.log('--- LEXICON CONTENT QUALITY AUDIT (723 Rows) ---');

  // 1. Overall Statistics
  const statsRes = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(description) as has_description,
      COUNT(content_ai) as has_content_ai,
      COUNT(distilled_json) as has_distilled_json,
      COUNT(is_distilled) FILTER (WHERE is_distilled = true) as is_distilled_true
    FROM lexicons
  `);
  const stats = statsRes.rows[0];
  console.log(`Total Rows: ${stats.total}`);
  console.log(`Has Description: ${stats.has_description} (${Math.round(stats.has_description/stats.total*100)}%)`);
  console.log(`Has Content AI: ${stats.has_content_ai} (${Math.round(stats.has_content_ai/stats.total*100)}%)`);
  console.log(`Has Distilled JSON: ${stats.has_distilled_json} (${Math.round(stats.has_distilled_json/stats.total*100)}%)`);
  console.log(`is_distilled = true: ${stats.is_distilled_true} (${Math.round(stats.is_distilled_true/stats.total*100)}%)`);

  // 2. Sample data from each category (focused on Items, Animals, Plants)
  // Category 0: Items/Plants, Category 1: Animals, Category 2: General
  const categories = [0, 1, 2];
  for (const cat of categories) {
    console.log(`\n--- Category ${cat} Samples ---`);
    const samples = await client.query(`
      SELECT name_zh, description, content_ai, distilled_json
      FROM lexicons
      WHERE category = ${cat}
      LIMIT 2
    `);
    samples.rows.forEach(r => {
      console.log(`[${r.name_zh}]`);
      console.log(`  Description: ${r.description ? (r.description.substring(0, 80) + '...') : 'MISSING'}`);
      console.log(`  Content AI: ${r.content_ai ? 'YES' : 'NO'}`);
      console.log(`  Distilled JSON: ${r.distilled_json ? 'YES' : 'NO'}`);
    });
  }

  await client.end();
}

auditContent().catch(console.error);
