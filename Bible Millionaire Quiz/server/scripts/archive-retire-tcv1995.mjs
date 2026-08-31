import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const apply = process.argv.includes('--apply');
const archiveFlag = process.argv.indexOf('--archive-dir');
const archiveInput = archiveFlag >= 0 ? process.argv[archiveFlag + 1] : null;

if (apply && !archiveInput) {
    throw new Error('--apply requires --archive-dir pointing to a dedicated archive directory');
}

const connection = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
};

const client = new Client(connection);
await client.connect();

const aliases = ['tcv95', 'TCV95_TRAD', 'TCV1995_TRAD'];
const questions = await client.query(`
    SELECT id FROM questions
    WHERE version = ANY($1)
`, [aliases]);
const questionIds = questions.rows.map(row => row.id);

const revisions = questionIds.length
    ? await client.query('SELECT id FROM question_revisions WHERE question_id = ANY($1)', [questionIds])
    : { rows: [] };
const revisionIds = revisions.rows.map(row => row.id);

const exportQueries = {
    bible_verses: [`SELECT * FROM bible_verses WHERE version = ANY($1)`, [['tcv95', 'TCV1995_TRAD']]],
    questions: [`SELECT * FROM questions WHERE id = ANY($1)`, [questionIds]],
    question_revisions: [`SELECT * FROM question_revisions WHERE question_id = ANY($1)`, [questionIds]],
    question_quality_audits: [`SELECT * FROM question_quality_audits WHERE question_id = ANY($1)`, [questionIds]],
    question_quality_jobs: [`SELECT * FROM question_quality_jobs WHERE question_id = ANY($1)`, [questionIds]],
    question_checks: [`SELECT * FROM question_checks WHERE question_id = ANY($1)`, [questionIds]],
    question_corpus_reaudit_items: [`SELECT * FROM question_corpus_reaudit_items WHERE question_id = ANY($1)`, [questionIds]],
    attempts: [`SELECT * FROM attempts WHERE questionid = ANY($1) OR question_revision_id = ANY($2)`, [questionIds, revisionIds]],
    game_reward_attempts: [`SELECT * FROM game_reward_attempts WHERE question_id = ANY($1) OR question_revision_id = ANY($2)`, [questionIds, revisionIds]],
    bible_source_sync_runs: [`SELECT * FROM bible_source_sync_runs WHERE target_version = ANY($1) OR source_version = ANY($1)`, [['tcv95', 'TCV1995_TRAD']]]
};

const report = {};
const archiveRows = {};
for (const [name, [sql, params]] of Object.entries(exportQueries)) {
    try {
        const result = await client.query(sql, params);
        archiveRows[name] = result.rows;
        report[name] = result.rowCount;
    } catch (error) {
        if (error.code === '42P01' || error.code === '42703') {
            archiveRows[name] = [];
            report[name] = 0;
            continue;
        }
        throw error;
    }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', questionIds: questionIds.length, rows: report }, null, 2));

if (!apply) {
    await client.end();
    process.exit(0);
}

const archiveDir = path.resolve(archiveInput);
const parsed = path.parse(archiveDir);
if (archiveDir === parsed.root || archiveDir.length < parsed.root.length + 8) {
    throw new Error('Archive directory is too broad');
}
await fs.mkdir(archiveDir, { recursive: true });

const manifest = {
    archiveType: 'TCV1995_RETIREMENT_V1',
    createdAt: new Date().toISOString(),
    database: connection.database,
    aliases,
    tables: {}
};

for (const [name, rows] of Object.entries(archiveRows)) {
    const payload = rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
    const file = `${name}.jsonl`;
    await fs.writeFile(path.join(archiveDir, file), payload, 'utf8');
    manifest.tables[name] = {
        file,
        rows: rows.length,
        sha256: crypto.createHash('sha256').update(payload).digest('hex')
    };
}
await fs.writeFile(path.join(archiveDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

for (const entry of Object.values(manifest.tables)) {
    const stored = await fs.readFile(path.join(archiveDir, entry.file));
    const checksum = crypto.createHash('sha256').update(stored).digest('hex');
    if (checksum !== entry.sha256) throw new Error(`ARCHIVE_WRITE_VERIFICATION_FAILED:${entry.file}`);
}

await client.query('BEGIN');
try {
    if (questionIds.length) {
        await client.query('UPDATE attempts SET questionid = NULL, question_revision_id = NULL WHERE questionid = ANY($1) OR question_revision_id = ANY($2)', [questionIds, revisionIds]);
        await client.query('DELETE FROM question_checks WHERE question_id = ANY($1)', [questionIds]);
        await client.query('DELETE FROM question_quality_audits WHERE question_id = ANY($1)', [questionIds]);
        await client.query('DELETE FROM question_quality_jobs WHERE question_id = ANY($1)', [questionIds]);
        await client.query('DELETE FROM question_corpus_reaudit_items WHERE question_id = ANY($1)', [questionIds]);
        await client.query('UPDATE questions SET semantic_duplicate_of = NULL WHERE semantic_duplicate_of = ANY($1)', [questionIds]);
        await client.query(`
            UPDATE questions
            SET status = 'RETIRED', quality_state = 'RETIRED', active_revision_id = NULL
            WHERE id = ANY($1)
        `, [questionIds]);
        await client.query('DELETE FROM question_revisions WHERE question_id = ANY($1)', [questionIds]);
        await client.query('DELETE FROM questions WHERE id = ANY($1)', [questionIds]);
    }
    await client.query(`DELETE FROM bible_verses WHERE version = ANY($1)`, [['tcv95', 'TCV1995_TRAD']]);
    await client.query(`DELETE FROM bible_source_sync_runs WHERE target_version = ANY($1) OR source_version = ANY($1)`, [['tcv95', 'TCV1995_TRAD']]);
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    await client.end();
}

console.log(JSON.stringify({ success: true, archiveDir, manifest: path.join(archiveDir, 'manifest.json') }, null, 2));
