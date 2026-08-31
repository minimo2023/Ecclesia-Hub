import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import pg from 'pg';

import {
    FhlBibleSyncService,
    normalizeFhlText
} from '../server/domains/content/bible/FhlBibleSyncService.js';
import { FHL_BOOK_CATALOG, getFhlBook } from '../server/domains/content/bible/fhlCatalog.js';

dotenv.config();

const { Pool } = pg;
const FHL_OFFLINE_BASE = 'https://ftp.fhl.net/FHL/COBS/data';
const FHL_VERSION_API = 'https://bible.fhl.net/json/abv.php';

export const OFFLINE_VERSION_MANIFEST = Object.freeze({
    unv: Object.freeze({
        sourceVersion: 'unv',
        versionId: 'CUV_TRAD',
        displayName: '和合本',
        packageName: 'bible_little.zip',
        databaseName: 'bible_little.db',
        tableName: 'nstrunv',
        expected: Object.freeze({ books: 66, chapters: 1189, verses: 31103, blanks: 0 })
    }),
    lcc: Object.freeze({
        sourceVersion: 'lcc',
        versionId: 'LCC_TRAD',
        displayName: '呂振中譯本',
        packageName: 'bible_lcc.zip',
        databaseName: 'bible_lcc.db',
        tableName: 'lcc',
        expected: Object.freeze({ books: 66, chapters: 1189, verses: 31103, blanks: 0 })
    })
});

function parseArgs(argv) {
    const options = {
        versions: ['unv', 'lcc'],
        apply: false,
        auditApi: false,
        preferLiveApi: false
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--versions' || arg === '--version') {
            const value = argv[++index];
            if (!value) throw new Error(`Missing value for ${arg}`);
            options.versions = value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
        } else if (arg === '--apply') options.apply = true;
        else if (arg === '--dry-run') options.apply = false;
        else if (arg === '--audit-api') options.auditApi = true;
        else if (arg === '--prefer-live-api') options.preferLiveApi = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }

    if (new Set(options.versions).size !== options.versions.length) {
        throw new Error('Duplicate source versions are not allowed');
    }
    for (const version of options.versions) {
        if (!OFFLINE_VERSION_MANIFEST[version]) throw new Error(`Unsupported offline version: ${version}`);
    }
    if (options.preferLiveApi && !options.auditApi) {
        throw new Error('--prefer-live-api requires --audit-api');
    }
    return options;
}

function printHelp() {
    console.log(`
Usage:
  node "Bible Millionaire Quiz/scripts/fhl_import_offline_bible.js" [options]

Options:
  --versions unv,lcc    FHL versions from the audited offline allowlist
  --dry-run             Download, parse and validate without database writes (default)
  --apply               Insert a new immutable staging run
  --audit-api           Compare every offline verse with the current FHL chapter API
  --prefer-live-api     Apply audited live-API corrections to staging (requires --audit-api)
`);
}

function sha256(bufferOrText) {
    return crypto.createHash('sha256').update(bufferOrText).digest('hex');
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Ecclesia-Hub-FHL-Offline-Audit/4.0' },
        signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`FHL_HTTP_${response.status}:${url}`);
    return response.json();
}

async function fetchBuffer(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Ecclesia-Hub-FHL-Offline-Audit/4.0' },
        signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) throw new Error(`FHL_HTTP_${response.status}:${url}`);
    return Buffer.from(await response.arrayBuffer());
}

/**
 * Extract one regular file from a non-Zip64 archive using only Node built-ins.
 * FHL's audited offline packages contain ordinary stored/deflated SQLite files,
 * so bringing a general-purpose archive dependency into production is unnecessary.
 */
export function extractZipEntry(zipBuffer, requestedBaseName) {
    const endSignature = 0x06054b50;
    const centralSignature = 0x02014b50;
    const localSignature = 0x04034b50;
    const searchStart = Math.max(0, zipBuffer.length - 65_557);
    let endOffset = -1;
    for (let offset = zipBuffer.length - 22; offset >= searchStart; offset--) {
        if (zipBuffer.readUInt32LE(offset) === endSignature) {
            endOffset = offset;
            break;
        }
    }
    if (endOffset < 0) throw new Error('FHL_ZIP_END_RECORD_MISSING');

    const entryCount = zipBuffer.readUInt16LE(endOffset + 10);
    let centralOffset = zipBuffer.readUInt32LE(endOffset + 16);
    for (let index = 0; index < entryCount; index++) {
        if (zipBuffer.readUInt32LE(centralOffset) !== centralSignature) {
            throw new Error(`FHL_ZIP_CENTRAL_RECORD_INVALID:${index}`);
        }
        const flags = zipBuffer.readUInt16LE(centralOffset + 8);
        const method = zipBuffer.readUInt16LE(centralOffset + 10);
        const compressedSize = zipBuffer.readUInt32LE(centralOffset + 20);
        const uncompressedSize = zipBuffer.readUInt32LE(centralOffset + 24);
        const fileNameLength = zipBuffer.readUInt16LE(centralOffset + 28);
        const extraLength = zipBuffer.readUInt16LE(centralOffset + 30);
        const commentLength = zipBuffer.readUInt16LE(centralOffset + 32);
        const localOffset = zipBuffer.readUInt32LE(centralOffset + 42);
        const fileName = zipBuffer.subarray(
            centralOffset + 46,
            centralOffset + 46 + fileNameLength
        ).toString((flags & 0x0800) !== 0 ? 'utf8' : 'latin1');

        if (path.basename(fileName).toLowerCase() === requestedBaseName.toLowerCase()) {
            if ((flags & 0x0001) !== 0) throw new Error('FHL_ZIP_ENCRYPTED_ENTRY');
            if (zipBuffer.readUInt32LE(localOffset) !== localSignature) {
                throw new Error('FHL_ZIP_LOCAL_RECORD_INVALID');
            }
            const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
            const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);
            const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
            const compressed = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);
            const extracted = method === 0
                ? Buffer.from(compressed)
                : method === 8
                    ? inflateRawSync(compressed)
                    : null;
            if (!extracted) throw new Error(`FHL_ZIP_UNSUPPORTED_COMPRESSION:${method}`);
            if (extracted.length !== uncompressedSize) {
                throw new Error(`FHL_ZIP_SIZE_MISMATCH:${extracted.length}/${uncompressedSize}`);
            }
            return extracted;
        }

        centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }
    throw new Error(`FHL_DATABASE_FILE_MISSING:${requestedBaseName}`);
}

export function inspectOfflineDatabase(databasePath, manifest) {
    const database = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
        const tableExists = database.prepare(`
            SELECT 1 AS found
            FROM sqlite_master
            WHERE type = 'table' AND name = ?
        `).get(manifest.tableName);
        if (!tableExists) throw new Error(`FHL_TABLE_MISSING:${manifest.tableName}`);

        const bookRows = database.prepare('SELECT engs, chineses, chinesef FROM main').all();
        const booksBySourceCode = new Map(bookRows.map(row => [String(row.engs).trim(), row]));
        const sourceRows = database.prepare(`
            SELECT id, engs, chap, sec, txt
            FROM ${manifest.tableName}
            ORDER BY engs, chap, sec
        `).all();

        const seen = new Set();
        const books = new Set();
        const chapters = new Set();
        const blankReferences = [];
        const rows = sourceRows.map(sourceRow => {
            const sourceBook = booksBySourceCode.get(String(sourceRow.engs).trim());
            const book = getFhlBook(sourceBook?.chineses);
            if (!sourceBook || !book) throw new Error(`FHL_UNKNOWN_BOOK:${sourceRow.engs}`);

            const chapter = Number(sourceRow.chap);
            const verse = Number(sourceRow.sec);
            if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
                throw new Error(`FHL_INVALID_CHAPTER:${book.english}:${chapter}`);
            }
            if (!Number.isInteger(verse) || verse < 1) {
                throw new Error(`FHL_INVALID_VERSE:${book.english}:${chapter}:${verse}`);
            }

            const key = `${book.english}:${chapter}:${verse}`;
            if (seen.has(key)) throw new Error(`FHL_DUPLICATE_VERSE:${key}`);
            seen.add(key);

            const text = normalizeFhlText(sourceRow.txt);
            if (!text) blankReferences.push(key);
            books.add(book.english);
            chapters.add(`${book.english}:${chapter}`);

            return {
                sourceRowId: Number(sourceRow.id),
                book: book.english,
                bookName: book.chinese,
                chapter,
                verse,
                text,
                verseStatus: text ? 'TEXT' : 'BLANK_UPSTREAM',
                sourceSha256: sha256(text),
                sourceKind: 'FHL_OFFLINE_SQLITE'
            };
        });

        return {
            rows,
            stats: {
                books: books.size,
                chapters: chapters.size,
                verses: rows.length,
                blanks: blankReferences.length,
                duplicates: sourceRows.length - seen.size
            },
            blankReferences
        };
    } finally {
        database.close();
    }
}

function assertExpectedStats(manifest, inspection) {
    for (const field of ['books', 'chapters', 'verses', 'blanks']) {
        if (inspection.stats[field] !== manifest.expected[field]) {
            throw new Error(
                `FHL_EXPECTED_${field.toUpperCase()}_MISMATCH:`
                + `${manifest.sourceVersion}:${inspection.stats[field]}/${manifest.expected[field]}`
            );
        }
    }
    if (inspection.stats.duplicates !== 0) {
        throw new Error(`FHL_DUPLICATE_KEYS:${manifest.sourceVersion}:${inspection.stats.duplicates}`);
    }
}

async function downloadAndInspect(manifest, versionRecord) {
    if (!versionRecord || Number(versionRecord.candownload) !== 1) {
        throw new Error(`FHL_OFFLINE_DOWNLOAD_NOT_ALLOWED:${manifest.sourceVersion}`);
    }

    const packageUrl = `${FHL_OFFLINE_BASE}/${manifest.packageName}`;
    const packageBuffer = await fetchBuffer(packageUrl);
    const packageSha256 = sha256(packageBuffer);
    const databaseBuffer = extractZipEntry(packageBuffer, manifest.databaseName);
    const databaseSha256 = sha256(databaseBuffer);
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), `ecclesia-fhl-${manifest.sourceVersion}-`));
    const databasePath = path.join(tempDirectory, manifest.databaseName);
    try {
        await fs.writeFile(databasePath, databaseBuffer);
        const inspection = inspectOfflineDatabase(databasePath, manifest);
        assertExpectedStats(manifest, inspection);
        return {
            ...inspection,
            packageUrl,
            packageBytes: packageBuffer.length,
            packageSha256,
            databaseBytes: databaseBuffer.length,
            databaseSha256,
            upstreamUpdatedAt: versionRecord.version || null,
            upstreamName: versionRecord.cname || manifest.displayName
        };
    } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
    }
}

function compactComparisonText(text) {
    return normalizeFhlText(text).replace(/\s+/gu, '');
}

export async function auditOfflineAgainstLiveApi(manifest, download, { concurrency = 4 } = {}) {
    const offline = new Map(download.rows.map(row => [
        `${row.book}:${row.chapter}:${row.verse}`,
        row.text
    ]));
    const tasks = FHL_BOOK_CATALOG.flatMap(book =>
        Array.from({ length: book.chapters }, (_, index) => ({ book, chapter: index + 1 }))
    );
    const service = new FhlBibleSyncService({ retryDelayMs: 300, maxRetries: 3 });
    let taskIndex = 0;
    let exact = 0;
    let whitespaceEquivalent = 0;
    let contentDifferent = 0;
    let missingOffline = 0;
    let compared = 0;
    const seen = new Set();
    const differences = [];
    const corrections = [];

    async function worker() {
        while (taskIndex < tasks.length) {
            const task = tasks[taskIndex++];
            const result = await service.fetchChapter({
                book: task.book.english,
                chapter: task.chapter,
                sourceVersion: manifest.sourceVersion
            });
            for (const liveVerse of result.verses) {
                const key = `${task.book.english}:${task.chapter}:${liveVerse.verse}`;
                const offlineText = offline.get(key);
                compared++;
                seen.add(key);
                if (offlineText === undefined) {
                    missingOffline++;
                    if (differences.length < 20) differences.push({ reference: key, kind: 'MISSING_OFFLINE' });
                } else if (offlineText === liveVerse.text) {
                    exact++;
                } else if (compactComparisonText(offlineText) === compactComparisonText(liveVerse.text)) {
                    whitespaceEquivalent++;
                } else {
                    contentDifferent++;
                    corrections.push({
                        reference: key,
                        book: task.book.english,
                        chapter: task.chapter,
                        verse: liveVerse.verse,
                        offlineSha256: sha256(offlineText),
                        liveSha256: sha256(liveVerse.text),
                        liveText: liveVerse.text
                    });
                    if (differences.length < 20) {
                        differences.push({
                            reference: key,
                            kind: 'CONTENT_DIFFERENT',
                            offline: offlineText.slice(0, 160),
                            live: liveVerse.text.slice(0, 160)
                        });
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const extraOffline = [...offline.keys()].filter(key => !seen.has(key));
    return {
        report: {
            chapters: tasks.length,
            compared,
            exact,
            whitespaceEquivalent,
            contentDifferent,
            missingOffline,
            extraOffline: extraOffline.length,
            differences: [
                ...differences,
                ...extraOffline.slice(0, Math.max(0, 20 - differences.length))
                    .map(reference => ({ reference, kind: 'EXTRA_OFFLINE' }))
            ]
        },
        corrections
    };
}

export function applyLiveApiCorrections(download, corrections) {
    const rows = new Map(download.rows.map(row => [
        `${row.book}:${row.chapter}:${row.verse}`,
        row
    ]));
    for (const correction of corrections) {
        const row = rows.get(correction.reference);
        if (!row) throw new Error(`FHL_API_CORRECTION_TARGET_MISSING:${correction.reference}`);
        row.text = correction.liveText;
        row.sourceSha256 = correction.liveSha256;
        row.sourceKind = 'FHL_LIVE_API_CORRECTION';
    }
    return corrections.length;
}

async function insertStagingRows(client, runId, manifest, download) {
    const batchSize = 400;
    for (let offset = 0; offset < download.rows.length; offset += batchSize) {
        const batch = download.rows.slice(offset, offset + batchSize);
        const values = [];
        const placeholders = batch.map((row, index) => {
            const base = index * 12;
            values.push(
                runId,
                manifest.versionId,
                manifest.sourceVersion,
                row.book,
                row.bookName,
                row.chapter,
                row.verse,
                row.text,
                row.verseStatus,
                row.sourceSha256,
                JSON.stringify({ source_row_id: row.sourceRowId, source_kind: row.sourceKind }),
                new Date()
            );
            return `(${Array.from({ length: 12 }, (_, item) => `$${base + item + 1}`).join(',')})`;
        });
        await client.query(`
            INSERT INTO bible_verse_staging (
                sync_run_id, version_id, source_version, book, book_name,
                chapter, verse, text, verse_status, source_sha256, metadata, created_at
            ) VALUES ${placeholders.join(',')}
        `, values);
    }
}

async function compareWithCompatibilityCorpus(client, runId, manifest) {
    const existing = await client.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM bible_verses
        WHERE version = $1
    `, [manifest.versionId]);
    const existingCount = Number(existing.rows[0].count);
    if (existingCount === 0) {
        return {
            existing: 0,
            exact: 0,
            normalizedEquivalent: 0,
            contentDifferent: 0,
            missing: 0,
            extra: 0
        };
    }

    const comparison = await client.query(`
        SELECT
            COUNT(*) FILTER (WHERE legacy.id IS NOT NULL AND legacy.text = staged.text)::INTEGER AS exact,
            COUNT(*) FILTER (
                WHERE legacy.id IS NOT NULL
                  AND legacy.text IS DISTINCT FROM staged.text
                  AND regexp_replace(
                        regexp_replace(legacy.text, '\\{[^}]*\\}', '', 'g'),
                        '[[:space:]]', '', 'g'
                      ) = regexp_replace(staged.text, '[[:space:]]', '', 'g')
            )::INTEGER AS normalized_equivalent,
            COUNT(*) FILTER (
                WHERE legacy.id IS NOT NULL
                  AND regexp_replace(
                        regexp_replace(legacy.text, '\\{[^}]*\\}', '', 'g'),
                        '[[:space:]]', '', 'g'
                      ) <> regexp_replace(staged.text, '[[:space:]]', '', 'g')
            )::INTEGER AS content_different,
            COUNT(*) FILTER (WHERE legacy.id IS NULL)::INTEGER AS missing
        FROM bible_verse_staging staged
        LEFT JOIN bible_verses legacy
          ON legacy.version = staged.version_id
         AND legacy.book = staged.book
         AND legacy.chapter = staged.chapter
         AND legacy.verse = staged.verse
        WHERE staged.sync_run_id = $1 AND staged.version_id = $2
    `, [runId, manifest.versionId]);
    const extras = await client.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM bible_verses legacy
        LEFT JOIN bible_verse_staging staged
          ON staged.sync_run_id = $1
         AND staged.version_id = $2
         AND staged.book = legacy.book
         AND staged.chapter = legacy.chapter
         AND staged.verse = legacy.verse
        WHERE legacy.version = $2 AND staged.book IS NULL
    `, [runId, manifest.versionId]);

    return {
        existing: existingCount,
        exact: Number(comparison.rows[0].exact),
        normalizedEquivalent: Number(comparison.rows[0].normalized_equivalent),
        contentDifferent: Number(comparison.rows[0].content_different),
        missing: Number(comparison.rows[0].missing),
        extra: Number(extras.rows[0].count)
    };
}

async function stageDownload(pool, manifest, download) {
    const runId = crypto.randomUUID();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            INSERT INTO bible_source_sync_runs (
                id, provider, source_version, target_version, book, status,
                chapter_count, fetched_verse_count, inserted_verse_count, report
            ) VALUES ($1, 'FHL_OFFLINE', $2, $3, '*', 'STARTED', $4, $5, 0, '{}'::jsonb)
        `, [runId, manifest.sourceVersion, manifest.versionId, download.stats.chapters, download.stats.verses]);

        await insertStagingRows(client, runId, manifest, download);
        const staged = await client.query(`
            SELECT
                COUNT(DISTINCT book)::INTEGER AS books,
                COUNT(DISTINCT (book, chapter))::INTEGER AS chapters,
                COUNT(*)::INTEGER AS verses,
                COUNT(*) FILTER (WHERE BTRIM(text) = '')::INTEGER AS blanks,
                COUNT(*) FILTER (WHERE verse_status <> 'TEXT')::INTEGER AS non_text
            FROM bible_verse_staging
            WHERE sync_run_id = $1 AND version_id = $2
        `, [runId, manifest.versionId]);
        const stagedStats = staged.rows[0];
        for (const field of ['books', 'chapters', 'verses', 'blanks']) {
            if (Number(stagedStats[field]) !== manifest.expected[field]) {
                throw new Error(`FHL_STAGING_${field.toUpperCase()}_MISMATCH:${manifest.sourceVersion}`);
            }
        }

        const legacyComparison = await compareWithCompatibilityCorpus(client, runId, manifest);
        const report = {
            source_version: manifest.sourceVersion,
            version_id: manifest.versionId,
            display_name: manifest.displayName,
            package_url: download.packageUrl,
            package_bytes: download.packageBytes,
            package_sha256: download.packageSha256,
            database_bytes: download.databaseBytes,
            database_sha256: download.databaseSha256,
            upstream_updated_at: download.upstreamUpdatedAt,
            stats: download.stats,
            live_api_comparison: download.apiAudit || null,
            live_api_corrections_applied: download.apiCorrectionsApplied || 0,
            legacy_comparison: legacyComparison
        };

        const unresolvedApiDifferences = Math.max(
            0,
            Number(download.apiAudit?.contentDifferent || 0) - Number(download.apiCorrectionsApplied || 0)
        );
        const coverageStatus = unresolvedApiDifferences > 0
            || download.apiAudit?.missingOffline > 0
            || download.apiAudit?.extraOffline > 0
            ? 'STAGED_API_DIFFERENCE'
            : 'STAGED_COMPLETE';
        await client.query(`
            UPDATE bible_translation_versions
            SET actual_books = $2,
                actual_chapters = $3,
                actual_verses = $4,
                blank_verses = $5,
                coverage_status = $6,
                evidence_eligible = FALSE,
                new_question_eligible = FALSE,
                metadata = metadata || $7::jsonb,
                last_verified_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE version_id = $1
        `, [
            manifest.versionId,
            download.stats.books,
            download.stats.chapters,
            download.stats.verses,
            download.stats.blanks,
            coverageStatus,
            JSON.stringify({
                latest_staging_run_id: runId,
                latest_package_sha256: download.packageSha256,
                latest_database_sha256: download.databaseSha256,
                upstream_updated_at: download.upstreamUpdatedAt,
                latest_live_api_comparison: download.apiAudit || null,
                live_api_corrections_applied: download.apiCorrectionsApplied || 0
            })
        ]);
        await client.query(`
            UPDATE bible_source_sync_runs
            SET status = 'COMPLETED',
                inserted_verse_count = $2,
                report = $3::jsonb,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [runId, download.stats.verses, JSON.stringify(report)]);
        await client.query('COMMIT');
        return { runId, ...report };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function createPool() {
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'bible_quiz'
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const versionPayload = await fetchJson(FHL_VERSION_API);
    if (versionPayload?.status !== 'success' || !Array.isArray(versionPayload.record)) {
        throw new Error('FHL_VERSION_CATALOG_UNAVAILABLE');
    }
    const versionCatalog = new Map(versionPayload.record.map(item => [item.book, item]));
    const downloads = [];
    for (const sourceVersion of options.versions) {
        const manifest = OFFLINE_VERSION_MANIFEST[sourceVersion];
        const download = await downloadAndInspect(manifest, versionCatalog.get(sourceVersion));
        if (options.auditApi) {
            const audit = await auditOfflineAgainstLiveApi(manifest, download);
            download.apiAudit = audit.report;
            download.apiCorrectionsApplied = options.preferLiveApi
                ? applyLiveApiCorrections(download, audit.corrections)
                : 0;
        }
        downloads.push({ manifest, download });
        console.log(JSON.stringify({
            sourceVersion,
            versionId: manifest.versionId,
            dryRun: !options.apply,
            packageSha256: download.packageSha256,
            databaseSha256: download.databaseSha256,
            upstreamUpdatedAt: download.upstreamUpdatedAt,
            stats: download.stats,
            liveApiComparison: download.apiAudit || null,
            liveApiCorrectionsApplied: download.apiCorrectionsApplied || 0
        }, null, 2));
    }

    if (!options.apply) {
        console.log('DRY RUN complete. No database rows were written.');
        return;
    }

    const pool = createPool();
    try {
        for (const { manifest, download } of downloads) {
            const result = await stageDownload(pool, manifest, download);
            console.log(JSON.stringify({ staged: true, ...result }, null, 2));
        }
    } finally {
        await pool.end();
    }
}

const isMainModule = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
    main().catch(error => {
        console.error(`[FHL Offline Import] ${error.message}`);
        process.exitCode = 1;
    });
}
