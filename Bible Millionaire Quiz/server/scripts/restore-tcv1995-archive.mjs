import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const apply = process.argv.includes('--apply');
const archiveFlag = process.argv.indexOf('--archive-dir');
const archiveInput = archiveFlag >= 0 ? process.argv[archiveFlag + 1] : null;
if (!archiveInput) throw new Error('--archive-dir is required');

const archiveDir = path.resolve(archiveInput);
const parsed = path.parse(archiveDir);
if (archiveDir === parsed.root || archiveDir.length < parsed.root.length + 8) throw new Error('Archive directory is too broad');

const manifest = JSON.parse(await fs.readFile(path.join(archiveDir, 'manifest.json'), 'utf8'));
if (manifest.archiveType !== 'TCV1995_RETIREMENT_V1') throw new Error('UNSUPPORTED_ARCHIVE_TYPE');

const archiveRows = {};
for (const [table, entry] of Object.entries(manifest.tables || {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error(`INVALID_TABLE_NAME:${table}`);
    const payload = await fs.readFile(path.join(archiveDir, entry.file), 'utf8');
    const checksum = crypto.createHash('sha256').update(payload).digest('hex');
    if (checksum !== entry.sha256) throw new Error(`ARCHIVE_CHECKSUM_MISMATCH:${table}`);
    const rows = payload.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    if (rows.length !== Number(entry.rows)) throw new Error(`ARCHIVE_ROW_COUNT_MISMATCH:${table}`);
    archiveRows[table] = rows;
}

console.log(JSON.stringify({
    mode: apply ? 'apply' : 'verify-only',
    archiveType: manifest.archiveType,
    createdAt: manifest.createdAt,
    rows: Object.fromEntries(Object.entries(archiveRows).map(([table, rows]) => [table, rows.length]))
}, null, 2));

if (!apply) process.exit(0);

const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

function quoteIdentifier(value) {
    if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`INVALID_IDENTIFIER:${value}`);
    return `"${value}"`;
}

async function restoreRows(table, rows, { upsertId = false, transform = null } = {}) {
    for (const source of rows || []) {
        const row = transform ? transform(source) : source;
        const columns = Object.keys(row);
        if (!columns.length) continue;
        const columnSql = columns.map(quoteIdentifier).join(',');
        const valueSql = columns.map((_, index) => `$${index + 1}`).join(',');
        const conflictSql = upsertId
            ? `ON CONFLICT (id) DO UPDATE SET ${columns.filter(column => column !== 'id').map(column => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(',')}`
            : 'ON CONFLICT DO NOTHING';
        await client.query(
            `INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${valueSql}) ${conflictSql}`,
            columns.map(column => row[column])
        );
    }
}

await client.connect();
await client.query('BEGIN');
try {
    await restoreRows('bible_verses', archiveRows.bible_verses);
    await restoreRows('bible_source_sync_runs', archiveRows.bible_source_sync_runs);
    await restoreRows('questions', archiveRows.questions, {
        transform: row => ({ ...row, active_revision_id: null })
    });
    await restoreRows('question_revisions', archiveRows.question_revisions);
    await restoreRows('question_quality_audits', archiveRows.question_quality_audits);
    await restoreRows('question_quality_jobs', archiveRows.question_quality_jobs);
    await restoreRows('question_checks', archiveRows.question_checks);
    await restoreRows('question_corpus_reaudit_items', archiveRows.question_corpus_reaudit_items);

    for (const question of archiveRows.questions || []) {
        if (question.active_revision_id) {
            await client.query('UPDATE questions SET active_revision_id = $1 WHERE id = $2', [question.active_revision_id, question.id]);
        }
    }

    await restoreRows('attempts', archiveRows.attempts, { upsertId: true });
    await restoreRows('game_reward_attempts', archiveRows.game_reward_attempts, { upsertId: true });
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    await client.end();
}

console.log(JSON.stringify({ success: true, restoredFrom: archiveDir }, null, 2));
