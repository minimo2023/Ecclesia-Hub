import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { scoreQuestionDifficulty } from '../domains/game/difficulty/DifficultyScorer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
let limit = null;
let isDryRun = true;
let writeDb = false;
let onlyMissing = false;
let targetStatus = 'PASS';

for (const arg of args) {
  if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1], 10);
  if (arg.startsWith('--write=true')) { writeDb = true; isDryRun = false; }
  if (arg.startsWith('--only-missing=true')) onlyMissing = true;
  if (arg.startsWith('--status=')) targetStatus = arg.split('=')[1];
  if (arg.startsWith('--dry-run=')) isDryRun = arg.split('=')[1] === 'true';
}

// Parse arguments for custom DB URL
let dbUrl = process.env.DATABASE_URL || null;
for (const arg of args) {
  if (arg.startsWith('--db-url=')) dbUrl = arg.split('=')[1];
}

const poolConfig = dbUrl 
  ? { connectionString: dbUrl, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'dev',
      password: process.env.DB_PASSWORD || 'dev123',
      database: process.env.DB_NAME || 'bible_quiz_v3'
    };

const pool = new Pool(poolConfig);

async function queryAll(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function runDb(sql, params = []) {
  const res = await pool.query(sql, params);
  return res;
}

async function main() {
  console.log('=== Bible Millionaire Quiz: Existing Questions Difficulty Scorer ===');
  console.log(`- Dry Run: ${isDryRun}`);
  console.log(`- Write to DB: ${writeDb}`);
  console.log(`- Target Status: ${targetStatus}`);
  console.log(`- Only Missing Scores: ${onlyMissing}`);
  console.log(`- Limit: ${limit ? limit : 'ALL'}`);
  console.log('------------------------------------------------------------------');

  let query = `SELECT * FROM questions WHERE status = $1`;
  const params = [targetStatus];

  if (onlyMissing) {
    query += ` AND rule_difficulty_score IS NULL`;
  }

  if (limit) {
    query += ` LIMIT $2`;
    params.push(limit);
  }

  const questions = await queryAll(query, params);
  console.log(`Found ${questions.length} questions to process.`);

  const previewResults = [];
  const startTimer = Date.now();
  let successCount = 0;

  for (const q of questions) {
    // Some logic extracts options
    try {
      if (typeof q.options === 'string') {
        q.options = JSON.parse(q.options);
      }
    } catch(e) {}

    const difficultyData = scoreQuestionDifficulty(q);

    previewResults.push({
      id: q.id,
      category: q.category,
      original_difficulty: q.difficulty,
      question: q.question || q.stem,
      answer: q.answer,
      new_rule_score: difficultyData.rule_difficulty_score,
      new_band: difficultyData.difficulty_band,
      flags: difficultyData.difficulty_flags
    });

    if (writeDb) {
      await runDb(`
        UPDATE questions 
        SET rule_difficulty_score = $1,
            difficulty_band = $2,
            difficulty_flags = $3,
            difficulty_breakdown = $4,
            difficulty_score_source = $5,
            difficulty_scored_at = to_timestamp($6),
            final_difficulty_score = $7,
            final_difficulty_source = $8,
            final_difficulty_confidence = $9
        WHERE id = $10
      `, [
        difficultyData.rule_difficulty_score,
        difficultyData.difficulty_band,
        JSON.stringify(difficultyData.difficulty_flags),
        JSON.stringify(difficultyData.difficulty_breakdown),
        difficultyData.difficulty_score_source,
        Math.floor(new Date(difficultyData.difficulty_scored_at).getTime() / 1000),
        difficultyData.final_difficulty_score,
        difficultyData.final_difficulty_source,
        difficultyData.final_difficulty_confidence,
        q.id
      ]);
    }
    successCount++;
  }

  const duration = ((Date.now() - startTimer) / 1000).toFixed(2);
  console.log(`Processed ${successCount} questions in ${duration}s.`);

  if (isDryRun || previewResults.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    const reportDir = path.resolve(__dirname, `../../reports/difficulty-scoring/${todayStr}`);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const previewPath = path.join(reportDir, 'preview.json');
    fs.writeFileSync(previewPath, JSON.stringify(previewResults, null, 2));

    const bandCounts = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
    previewResults.forEach(r => {
      if (bandCounts[r.new_band] !== undefined) bandCounts[r.new_band]++;
    });

    const mdContent = `
# Difficulty Scoring Batch Report
- **Date**: ${new Date().toISOString()}
- **Total Processed**: ${successCount}
- **Dry Run**: ${isDryRun}
- **Write DB**: ${writeDb}

## Distribution (New Band)
- EASY: ${bandCounts.EASY}
- MEDIUM: ${bandCounts.MEDIUM}
- HARD: ${bandCounts.HARD}
- VERY_HARD: ${bandCounts.VERY_HARD}

## Flagged Items (Preview 10)
${previewResults.filter(r => r.flags.length > 0).slice(0, 10).map(r => `- [${r.id}] ${r.question} (Score: ${r.new_rule_score}, Band: ${r.new_band}) - Flags: ${r.flags.join(',')}`).join('\n')}
    `;

    const summaryPath = path.join(reportDir, 'summary.md');
    fs.writeFileSync(summaryPath, mdContent);

    console.log(`Dry-run report saved to ${reportDir}`);
  }

  pool.end();
}

main().catch(err => {
  console.error('Fatal error during scoring batch:', err);
  process.exit(1);
});
