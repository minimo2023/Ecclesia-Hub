#!/usr/bin/env node
/**
 * Backfill distractors_pool for PASS questions.
 *
 * Default mode is dry-run:
 *   node server/scripts/distractor_backfill.js --limit=30
 *
 * Write mode:
 *   node server/scripts/distractor_backfill.js --limit=20 --write
 *   node server/scripts/distractor_backfill.js --book=羅馬書 --limit=20 --write
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { pipelineForGame } from '../domains/game/engine/QuestionPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const getArg = (key) => (argv.find(a => a.startsWith(`--${key}=`)) || '').split('=')[1] || null;
const hasFlag = (key) => argv.includes(`--${key}`);

const WRITE = hasFlag('write');
const LIMIT = Math.max(1, parseInt(getArg('limit') || '30', 10));
const FILTER_BOOK = getArg('book') || null;
const CONCURRENCY = Math.max(1, Math.min(4, parseInt(getArg('concurrency') || '2', 10)));

console.log('=== Bible Millionaire Quiz: Distractor Pool Backfill ===');
console.log(`- Mode: ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
console.log(`- Limit: ${LIMIT}`);
console.log(`- Book: ${FILTER_BOOK || 'ALL'}`);
console.log(`- Concurrency: ${CONCURRENCY}`);
console.log('------------------------------------------------------------------');

await initializeInfrastructure();

const params = [];
let whereClause = `
  status = 'PASS'
  AND (distractors_pool IS NULL OR distractors_pool::text = 'null')
`;

if (FILTER_BOOK) {
  params.push(FILTER_BOOK);
  whereClause += ` AND book = $${params.length}`;
}

params.push(LIMIT);
const candidates = await dbOps.gamesDb.query(
  `SELECT id, question, answer, book, chapter, verse_ref, category, version, options, correct_index
   FROM questions
   WHERE ${whereClause}
   ORDER BY RANDOM()
   LIMIT $${params.length}`,
  params
);

const rows = candidates?.rows ?? candidates ?? [];
console.log(`Found ${rows.length} candidate question(s).`);

const withOptions = rows.filter(q => q.options != null && JSON.stringify(q.options) !== '[]').length;
console.log(`Candidates with legacy options: ${withOptions}`);

if (!WRITE || rows.length === 0) {
  console.log(WRITE ? 'Nothing to backfill.' : 'Dry-run only. Add --write to update DB.');
  process.exit(0);
}

const stats = { total: rows.length, success: 0, freeze: 0, failed: 0 };
const errors = [];
const startTime = Date.now();

for (let i = 0; i < rows.length; i += CONCURRENCY) {
  const batch = rows.slice(i, i + CONCURRENCY);

  await Promise.all(batch.map(async (q) => {
    const label = `${q.book || 'unknown'} ${q.chapter || '?'} | ${q.answer || q.id}`;
    try {
      const result = await pipelineForGame(
        { ...q, options: null, correctIndex: null, correct_index: null },
        []
      );

      if (!result?.distractors_pool || result.distractors_pool.length < 2) {
        stats.freeze++;
        console.log(`FREEZE ${label}: insufficient distractor sets`);
        return;
      }

      await dbOps.updateQuestionDistractors(
        q.id,
        result.distractors_pool,
        result.options,
        result.correctIndex
      );
      stats.success++;
      console.log(`OK ${label}: ${result.distractors_pool.length} set(s)`);
    } catch (e) {
      stats.failed++;
      errors.push({ id: q.id, answer: q.answer, error: e.message });
      console.log(`ERR ${label}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 400));
  }));

  const done = Math.min(i + CONCURRENCY, rows.length);
  const pct = ((done / rows.length) * 100).toFixed(0);
  console.log(`Progress: ${done}/${rows.length} (${pct}%)`);
}

const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('------------------------------------------------------------------');
console.log(`Done in ${totalSec}s`);
console.log(JSON.stringify(stats, null, 2));

const reportDir = path.resolve(__dirname, '../../reports/distractor-backfill');
mkdirSync(reportDir, { recursive: true });
const reportDate = new Date().toISOString().slice(0, 10);
const reportPath = path.join(reportDir, `${reportDate}-result.json`);
writeFileSync(reportPath, JSON.stringify({ date: new Date().toISOString(), stats, errors }, null, 2));
console.log(`Report saved to ${reportPath}`);

process.exit(stats.failed > 0 ? 1 : 0);
