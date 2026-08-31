#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import { initializeInfrastructure, dbOps } from '../database/index.js';
import { FHL_BOOK_CATALOG } from '../domains/content/bible/fhlCatalog.js';
import { FhlBibleSyncService } from '../domains/content/bible/FhlBibleSyncService.js';

const args = process.argv.slice(2);
const writeEnabled = args.includes('--write');
const verbose = args.includes('--verbose');
const SOURCE_VERSION = 'tcv95';
const TARGET_VERSION = 'TCV1995_TRAD';

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizeRows(result) {
    if (Array.isArray(result)) return result;
    return result?.rows || [];
}

await initializeInfrastructure();

const service = new FhlBibleSyncService({ retryDelayMs: 100, maxRetries: 4 });
const rows = [];
const chapters = [];

for (const book of FHL_BOOK_CATALOG) {
    for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
        const result = await service.fetchChapter({ book: book.english, chapter, sourceVersion: SOURCE_VERSION });
        chapters.push({ book: book.english, chapter, verses: result.verses.length, url: result.url });
        for (const verse of result.verses) {
            rows.push({
                id: `${TARGET_VERSION}_${book.english}_${chapter}_${verse.verse}`,
                book: book.english,
                chapter,
                verse: verse.verse,
                text: verse.text,
                hash: sha256(verse.text)
            });
        }
        if (verbose && (chapters.length % 50 === 0 || chapters.length === 1189)) {
            console.log(`[tcv95 ${chapters.length}/1189] verses=${rows.length}`);
        }
    }
}

const summary = {
    sourceVersion: SOURCE_VERSION,
    targetVersion: TARGET_VERSION,
    books: new Set(rows.map(row => row.book)).size,
    chapters: chapters.length,
    verses: rows.length,
    blanks: rows.filter(row => !row.text.trim()).length,
    duplicateReferences: rows.length - new Set(rows.map(row => `${row.book}:${row.chapter}:${row.verse}`)).size
};
if (summary.books !== 66 || summary.chapters !== 1189 || summary.verses < 30000
    || summary.blanks !== 0 || summary.duplicateReferences !== 0) {
    throw new Error(`TCV95_CORPUS_VALIDATION_FAILED:${JSON.stringify(summary)}`);
}

const existing = await dbOps.contentDb.get(`
    SELECT COUNT(*)::INTEGER AS count FROM bible_verses WHERE version = $1
`, [TARGET_VERSION]);
summary.existing = Number(existing?.count || 0);

if (!writeEnabled) {
    console.log(`TCV95_EVIDENCE_CORPUS=${JSON.stringify({ mode: 'DRY_RUN', summary })}`);
    process.exit(0);
}

const syncRunId = crypto.randomUUID();
await dbOps.contentDb.transaction(async tx => {
    await tx.run(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`bible-corpus:${TARGET_VERSION}`]);
    const current = await tx.get(`
        SELECT COUNT(*)::INTEGER AS count FROM bible_verses WHERE version = $1
    `, [TARGET_VERSION]);
    const currentCount = Number(current?.count || 0);
    if (currentCount !== 0 && currentCount !== rows.length) {
        throw new Error(`TCV95_PARTIAL_EXISTING_CORPUS:${currentCount}/${rows.length}`);
    }

    if (currentCount === 0) {
        for (let offset = 0; offset < rows.length; offset += 250) {
            const batch = rows.slice(offset, offset + 250);
            for (const row of batch) {
                await tx.run(`
                    INSERT INTO bible_verses
                        (id, version, book, chapter, verse, text, source, metadata, cached_at)
                    VALUES ($1,$2,$3,$4,$5,$6,'FHL_EVIDENCE_SYNC',$7::jsonb,CURRENT_TIMESTAMP)
                `, [
                    row.id,
                    TARGET_VERSION,
                    row.book,
                    row.chapter,
                    row.verse,
                    row.text,
                    JSON.stringify({
                        source_version: SOURCE_VERSION,
                        upstream_sha256: row.hash,
                        api: 'https://bible.fhl.net/json/qb.php',
                        evidence_only: true
                    })
                ]);
            }
        }
    }

    const stored = await tx.get(`
        SELECT COUNT(*)::INTEGER AS verses,
               COUNT(DISTINCT book)::INTEGER AS books,
               COUNT(DISTINCT (book, chapter))::INTEGER AS chapters,
               COUNT(*) FILTER (WHERE BTRIM(COALESCE(text, '')) = '')::INTEGER AS blanks
        FROM bible_verses WHERE version = $1
    `, [TARGET_VERSION]);
    if (Number(stored?.verses || 0) !== summary.verses
        || Number(stored?.books || 0) !== 66
        || Number(stored?.chapters || 0) !== 1189
        || Number(stored?.blanks || 0) !== 0) {
        throw new Error(`TCV95_STORAGE_VERIFICATION_FAILED:${JSON.stringify(stored)}`);
    }

    await tx.run(`
        INSERT INTO bible_source_sync_runs
            (id, provider, source_version, target_version, book, status,
             chapter_count, fetched_verse_count, inserted_verse_count, report, completed_at)
        VALUES ($1,'FHL',$2,$3,'ALL','COMPLETED',$4,$5,$6,$7::jsonb,CURRENT_TIMESTAMP)
    `, [
        syncRunId,
        SOURCE_VERSION,
        TARGET_VERSION,
        summary.chapters,
        summary.verses,
        currentCount === 0 ? summary.verses : 0,
        JSON.stringify(summary)
    ]);
    await tx.run(`
        UPDATE bible_translation_versions
        SET expected_verses = $1,
            actual_books = 66,
            actual_chapters = 1189,
            actual_verses = $1,
            blank_verses = 0,
            coverage_status = 'COMPLETE',
            evidence_eligible = TRUE,
            new_question_eligible = FALSE,
            active_sync_run_id = $2,
            metadata = metadata || $3::jsonb,
            last_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE version_id = $4
    `, [summary.verses, syncRunId, JSON.stringify({ public: false, evidence_only: true }), TARGET_VERSION]);
});

const verified = normalizeRows(await dbOps.contentDb.query(`
    SELECT book, chapter, verse, text FROM bible_verses
    WHERE version = $1 ORDER BY book, chapter, verse
`, [TARGET_VERSION]));
summary.stored = verified.length;
console.log(`TCV95_EVIDENCE_CORPUS=${JSON.stringify({ mode: 'WRITE', syncRunId, summary })}`);
process.exit(0);
