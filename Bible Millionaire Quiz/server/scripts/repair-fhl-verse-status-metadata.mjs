import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
    FhlBibleSyncService,
    isFhlNonScriptureArtifact
} from '../domains/content/bible/FhlBibleSyncService.js';
import {
    presentBibleVerse,
    splitFhlBibleMarkup
} from '../domains/content/bible/BibleTextPresentation.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const { Pool } = pg;
const apply = process.argv.includes('--apply');
const allowRemote = process.argv.includes('--allow-remote');
const targetConfigurations = Object.freeze([
    { targetVersion: 'CUV_TRAD', sourceVersion: 'unv', allowedSources: ['FHL_CORPUS_V4', 'FHL_SYNC'] },
    { targetVersion: 'LCC_TRAD', sourceVersion: 'lcc', allowedSources: ['FHL_CORPUS_V4', 'FHL_SYNC'] },
    { targetVersion: 'TCV2010_TRAD', sourceVersion: 'tcv2019', allowedSources: ['FHL_SYNC'] },
    { targetVersion: 'CNV_TRAD', sourceVersion: 'ncv', allowedSources: ['FHL_CORPUS_V4', 'FHL_SYNC'] }
]);
const requestedVersions = String(
    process.argv.find(argument => argument.startsWith('--versions='))?.split('=')[1] || ''
).split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
const selectedConfigurations = requestedVersions.length
    ? targetConfigurations.filter(item => requestedVersions.includes(item.targetVersion))
    : targetConfigurations;
let targetVersion = '';
let sourceVersion = '';
let allowedSources = [];
let repairId = '';
const databaseHost = process.env.DB_HOST || 'localhost';
const pool = new Pool({
    host: databaseHost,
    port: Number.parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'bible_quiz_v3',
    max: 4
});
const service = new FhlBibleSyncService({ retryDelayMs: 100, maxRetries: 3 });

function isLocalHost(host) {
    return ['localhost', '127.0.0.1', '::1'].includes(String(host || '').trim().toLowerCase());
}

function isPlaceholderText(text) {
    return String(text || '').trim().toLowerCase() === 'a';
}

function isDatabasePlaceholder(row) {
    const metadata = metadataObject(row?.metadata);
    return metadata.verse_status === 'MERGED_WITH_PREVIOUS'
        || isPlaceholderText(presentBibleVerse(row).text)
        || /(?:^|\n)\s*a\s*$/iu.test(String(row?.text || ''));
}

function isDatabaseSourceUnavailable(row) {
    const metadata = metadataObject(row?.metadata);
    if (metadata.verse_status === 'SOURCE_TEXT_UNAVAILABLE') return true;
    if (typeof metadata.original !== 'string') return false;
    const split = splitFhlBibleMarkup(metadata.original);
    return !split.text && split.sectionHeadings.length > 0;
}

function isDatabaseNonScriptureArtifact(row) {
    const metadata = metadataObject(row?.metadata);
    return metadata.verse_status === 'NON_SCRIPTURE_ARTIFACT'
        || isFhlNonScriptureArtifact(row?.text, sourceVersion);
}

function isAllowedSource(source) {
    return allowedSources.includes(String(source || ''));
}

function metadataObject(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function reference(book, chapter, verse) {
    return `${book} ${chapter}:${verse}`;
}

function coordinateList(rows) {
    return rows.map(row => Number(row.verse)).sort((a, b) => a - b);
}

function sameNumbers(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function inspectChapter({ book, chapter }) {
    const [{ rows: databaseRows }, upstream] = await Promise.all([
        pool.query(`
            SELECT verse, text, source, metadata
            FROM bible_verses
            WHERE version = $1 AND book = $2 AND chapter = $3
            ORDER BY verse
        `, [targetVersion, book, chapter]),
        service.fetchChapter({ book, chapter: Number(chapter), sourceVersion })
    ]);

    const databaseByVerse = new Map(databaseRows.map(row => [Number(row.verse), row]));
    if (databaseByVerse.size !== upstream.verses.length) {
        throw new Error(`CHAPTER_VERSE_COUNT_MISMATCH:${book}:${chapter}:db=${databaseByVerse.size}:upstream=${upstream.verses.length}`);
    }
    const databasePlaceholders = databaseRows.filter(isDatabasePlaceholder);
    const upstreamPlaceholders = upstream.verses.filter(row => row.verseStatus === 'MERGED_WITH_PREVIOUS');
    const databaseCoordinates = coordinateList(databasePlaceholders);
    const upstreamCoordinates = coordinateList(upstreamPlaceholders);

    if (!sameNumbers(databaseCoordinates, upstreamCoordinates)) {
        throw new Error(`PLACEHOLDER_COORDINATE_MISMATCH:${book}:${chapter}:db=${databaseCoordinates.join(',')}:upstream=${upstreamCoordinates.join(',')}`);
    }

    const databaseUnavailable = databaseRows.filter(isDatabaseSourceUnavailable);
    const upstreamUnavailable = upstream.verses.filter(row => row.verseStatus === 'SOURCE_TEXT_UNAVAILABLE');
    const databaseUnavailableCoordinates = coordinateList(databaseUnavailable);
    const upstreamUnavailableCoordinates = coordinateList(upstreamUnavailable);
    if (!sameNumbers(databaseUnavailableCoordinates, upstreamUnavailableCoordinates)) {
        throw new Error(`SOURCE_UNAVAILABLE_COORDINATE_MISMATCH:${book}:${chapter}:db=${databaseUnavailableCoordinates.join(',')}:upstream=${upstreamUnavailableCoordinates.join(',')}`);
    }
    const databaseArtifacts = databaseRows.filter(isDatabaseNonScriptureArtifact);
    const upstreamArtifacts = upstream.verses.filter(row => row.verseStatus === 'NON_SCRIPTURE_ARTIFACT');
    const databaseArtifactCoordinates = coordinateList(databaseArtifacts);
    const upstreamArtifactCoordinates = coordinateList(upstreamArtifacts);
    if (!sameNumbers(databaseArtifactCoordinates, upstreamArtifactCoordinates)) {
        throw new Error(`NON_SCRIPTURE_ARTIFACT_COORDINATE_MISMATCH:${book}:${chapter}:db=${databaseArtifactCoordinates.join(',')}:upstream=${upstreamArtifactCoordinates.join(',')}`);
    }

    const placeholders = [];
    const anchors = new Map();
    const unavailable = [];
    const artifacts = [];
    for (const item of upstreamPlaceholders) {
        const databaseRow = databaseByVerse.get(item.verse);
        const anchorRow = databaseByVerse.get(item.mergedIntoVerse);
        if (!databaseRow || !isAllowedSource(databaseRow.source)) {
            throw new Error(`PLACEHOLDER_SOURCE_MISMATCH:${reference(book, chapter, item.verse)}`);
        }
        if (!anchorRow || !isAllowedSource(anchorRow.source) || isDatabasePlaceholder(anchorRow)) {
            throw new Error(`MERGED_ANCHOR_MISSING:${reference(book, chapter, item.mergedIntoVerse)}`);
        }
        const placeholderMetadata = metadataObject(databaseRow.metadata);
        if (placeholderMetadata.verse_status
            && placeholderMetadata.verse_status !== 'TEXT'
            && (placeholderMetadata.verse_status !== 'MERGED_WITH_PREVIOUS'
                || Number(placeholderMetadata.merged_into_verse) !== item.mergedIntoVerse)) {
            throw new Error(`PLACEHOLDER_METADATA_CONFLICT:${reference(book, chapter, item.verse)}`);
        }

        const upstreamAnchor = upstream.verses.find(row => row.verse === item.mergedIntoVerse);
        const anchorMetadata = metadataObject(anchorRow.metadata);
        if (anchorMetadata.verse_status
            && anchorMetadata.verse_status !== 'TEXT'
            && (anchorMetadata.verse_status !== 'MERGED_RANGE_ANCHOR'
                || Number(anchorMetadata.merged_verse_end) !== upstreamAnchor?.mergedVerseEnd)) {
            throw new Error(`ANCHOR_METADATA_CONFLICT:${reference(book, chapter, item.mergedIntoVerse)}`);
        }

        placeholders.push({
            book,
            chapter: Number(chapter),
            verse: item.verse,
            merged_into_verse: item.mergedIntoVerse,
            source_text: item.text,
            section_headings: item.sectionHeadings || [],
            canonical_text_already: String(databaseRow.text || '') === String(item.text || '')
        });

        anchors.set(item.mergedIntoVerse, {
            book,
            chapter: Number(chapter),
            verse: item.mergedIntoVerse,
            merged_verse_end: upstreamAnchor?.mergedVerseEnd || item.verse
        });
    }

    for (const item of upstreamUnavailable) {
        const databaseRow = databaseByVerse.get(item.verse);
        const metadata = metadataObject(databaseRow?.metadata);
        if (!databaseRow || !isAllowedSource(databaseRow.source)) {
            throw new Error(`SOURCE_UNAVAILABLE_SOURCE_MISMATCH:${reference(book, chapter, item.verse)}`);
        }
        if (metadata.verse_status
            && metadata.verse_status !== 'TEXT'
            && metadata.verse_status !== 'SOURCE_TEXT_UNAVAILABLE') {
            throw new Error(`SOURCE_UNAVAILABLE_METADATA_CONFLICT:${reference(book, chapter, item.verse)}`);
        }
        unavailable.push({ book, chapter: Number(chapter), verse: item.verse });
    }

    for (const item of upstreamArtifacts) {
        const databaseRow = databaseByVerse.get(item.verse);
        const metadata = metadataObject(databaseRow?.metadata);
        if (!databaseRow || !isAllowedSource(databaseRow.source)) {
            throw new Error(`NON_SCRIPTURE_ARTIFACT_SOURCE_MISMATCH:${reference(book, chapter, item.verse)}`);
        }
        if (metadata.verse_status
            && metadata.verse_status !== 'TEXT'
            && metadata.verse_status !== 'NON_SCRIPTURE_ARTIFACT') {
            throw new Error(`NON_SCRIPTURE_ARTIFACT_METADATA_CONFLICT:${reference(book, chapter, item.verse)}`);
        }
        artifacts.push({ book, chapter: Number(chapter), verse: item.verse });
    }

    return { placeholders, anchors: [...anchors.values()], unavailable, artifacts };
}

async function inspectAllChapters(chapters) {
    const placeholders = [];
    const anchors = [];
    const unavailable = [];
    const artifacts = [];
    const concurrency = 4;
    for (let offset = 0; offset < chapters.length; offset += concurrency) {
        const batch = chapters.slice(offset, offset + concurrency);
        const results = await Promise.all(batch.map(inspectChapter));
        for (const result of results) {
            placeholders.push(...result.placeholders);
            anchors.push(...result.anchors);
            unavailable.push(...result.unavailable);
            artifacts.push(...result.artifacts);
        }
        if ((offset + batch.length) % 40 === 0 || offset + batch.length === chapters.length) {
            console.error(`${targetVersion}: verified ${offset + batch.length}/${chapters.length} chapters`);
        }
    }
    placeholders.sort((a, b) => a.book.localeCompare(b.book) || a.chapter - b.chapter || a.verse - b.verse);
    anchors.sort((a, b) => a.book.localeCompare(b.book) || a.chapter - b.chapter || a.verse - b.verse);
    unavailable.sort((a, b) => a.book.localeCompare(b.book) || a.chapter - b.chapter || a.verse - b.verse);
    artifacts.sort((a, b) => a.book.localeCompare(b.book) || a.chapter - b.chapter || a.verse - b.verse);
    return { placeholders, anchors, unavailable, artifacts };
}

async function applyRepairs(plan) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const placeholderUpdate = await client.query(`
            WITH repairs AS (
                SELECT *
                FROM jsonb_to_recordset($2::jsonb) AS item(
                    book TEXT,
                    chapter INTEGER,
                    verse INTEGER,
                    merged_into_verse INTEGER,
                    source_text TEXT,
                    section_headings JSONB
                )
            )
            UPDATE bible_verses AS verse
            SET text = repairs.source_text,
                metadata = COALESCE(verse.metadata, '{}'::jsonb) || jsonb_build_object(
                    'verse_status', 'MERGED_WITH_PREVIOUS',
                    'merged_into_verse', repairs.merged_into_verse,
                    'section_headings', repairs.section_headings,
                    'source_version', $3::TEXT,
                    'verse_status_repair', $4::TEXT,
                    'verse_status_verified_at', CURRENT_TIMESTAMP
                )
            FROM repairs
            WHERE verse.version = $1
              AND verse.book = repairs.book
              AND verse.chapter = repairs.chapter
              AND verse.verse = repairs.verse
              AND verse.source = ANY($5::TEXT[])
        `, [targetVersion, JSON.stringify(plan.placeholders), sourceVersion, repairId, allowedSources]);

        const anchorUpdate = await client.query(`
            WITH repairs AS (
                SELECT *
                FROM jsonb_to_recordset($2::jsonb) AS item(
                    book TEXT,
                    chapter INTEGER,
                    verse INTEGER,
                    merged_verse_end INTEGER
                )
            )
            UPDATE bible_verses AS verse
            SET metadata = COALESCE(verse.metadata, '{}'::jsonb) || jsonb_build_object(
                    'verse_status', 'MERGED_RANGE_ANCHOR',
                    'merged_verse_end', repairs.merged_verse_end,
                    'source_version', $3::TEXT,
                    'verse_status_repair', $4::TEXT,
                    'verse_status_verified_at', CURRENT_TIMESTAMP
                )
            FROM repairs
            WHERE verse.version = $1
              AND verse.book = repairs.book
              AND verse.chapter = repairs.chapter
              AND verse.verse = repairs.verse
              AND verse.source = ANY($5::TEXT[])
              AND LOWER(BTRIM(verse.text)) NOT IN ('', 'a')
        `, [targetVersion, JSON.stringify(plan.anchors), sourceVersion, repairId, allowedSources]);

        const unavailableUpdate = await client.query(`
            WITH repairs AS (
                SELECT *
                FROM jsonb_to_recordset($2::jsonb) AS item(
                    book TEXT,
                    chapter INTEGER,
                    verse INTEGER
                )
            )
            UPDATE bible_verses AS verse
            SET text = '',
                metadata = COALESCE(verse.metadata, '{}'::jsonb) || jsonb_build_object(
                    'verse_status', 'SOURCE_TEXT_UNAVAILABLE',
                    'source_version', $3::TEXT,
                    'verse_status_repair', $4::TEXT,
                    'verse_status_verified_at', CURRENT_TIMESTAMP
                )
            FROM repairs
            WHERE verse.version = $1
              AND verse.book = repairs.book
              AND verse.chapter = repairs.chapter
              AND verse.verse = repairs.verse
              AND verse.source = ANY($5::TEXT[])
        `, [targetVersion, JSON.stringify(plan.unavailable), sourceVersion, repairId, allowedSources]);

        const artifactUpdate = await client.query(`
            WITH repairs AS (
                SELECT *
                FROM jsonb_to_recordset($2::jsonb) AS item(
                    book TEXT,
                    chapter INTEGER,
                    verse INTEGER
                )
            )
            UPDATE bible_verses AS verse
            SET metadata = COALESCE(verse.metadata, '{}'::jsonb) || jsonb_build_object(
                    'verse_status', 'NON_SCRIPTURE_ARTIFACT',
                    'source_version', $3::TEXT,
                    'verse_status_repair', $4::TEXT,
                    'verse_status_verified_at', CURRENT_TIMESTAMP
                )
            FROM repairs
            WHERE verse.version = $1
              AND verse.book = repairs.book
              AND verse.chapter = repairs.chapter
              AND verse.verse = repairs.verse
              AND verse.source = ANY($5::TEXT[])
        `, [targetVersion, JSON.stringify(plan.artifacts), sourceVersion, repairId, allowedSources]);

        if (placeholderUpdate.rowCount !== plan.placeholders.length) {
            throw new Error(`PLACEHOLDER_UPDATE_COUNT_MISMATCH:${placeholderUpdate.rowCount}/${plan.placeholders.length}`);
        }
        if (anchorUpdate.rowCount !== plan.anchors.length) {
            throw new Error(`ANCHOR_UPDATE_COUNT_MISMATCH:${anchorUpdate.rowCount}/${plan.anchors.length}`);
        }
        if (unavailableUpdate.rowCount !== plan.unavailable.length) {
            throw new Error(`SOURCE_UNAVAILABLE_UPDATE_COUNT_MISMATCH:${unavailableUpdate.rowCount}/${plan.unavailable.length}`);
        }
        if (artifactUpdate.rowCount !== plan.artifacts.length) {
            throw new Error(`NON_SCRIPTURE_ARTIFACT_UPDATE_COUNT_MISMATCH:${artifactUpdate.rowCount}/${plan.artifacts.length}`);
        }

        const verification = await client.query(`
            SELECT
                COUNT(*) FILTER (
                    WHERE metadata->>'verse_status' = 'MERGED_WITH_PREVIOUS'
                )::INTEGER AS placeholders,
                COUNT(*) FILTER (
                    WHERE LOWER(BTRIM(text)) IN ('', 'a')
                      AND metadata->>'verse_status' = 'MERGED_WITH_PREVIOUS'
                      AND (metadata->>'merged_into_verse') ~ '^[1-9][0-9]*$'
                )::INTEGER AS annotated_placeholders,
                COUNT(*) FILTER (
                    WHERE metadata->>'verse_status' = 'MERGED_RANGE_ANCHOR'
                      AND (metadata->>'merged_verse_end') ~ '^[1-9][0-9]*$'
                )::INTEGER AS annotated_anchors,
                COUNT(*) FILTER (
                    WHERE BTRIM(text) = ''
                      AND metadata->>'verse_status' = 'SOURCE_TEXT_UNAVAILABLE'
                )::INTEGER AS source_unavailable,
                COUNT(*) FILTER (
                    WHERE metadata->>'verse_status' = 'NON_SCRIPTURE_ARTIFACT'
                )::INTEGER AS non_scripture_artifacts
            FROM bible_verses
            WHERE version = $1
        `, [targetVersion]);
        const counts = verification.rows[0];
        if (Number(counts.placeholders) !== plan.placeholders.length
            || Number(counts.annotated_placeholders) !== plan.placeholders.length
            || Number(counts.annotated_anchors) !== plan.anchors.length
            || Number(counts.source_unavailable) !== plan.unavailable.length
            || Number(counts.non_scripture_artifacts) !== plan.artifacts.length) {
            throw new Error(`POST_REPAIR_VERIFICATION_FAILED:${JSON.stringify(counts)}`);
        }

        await client.query('COMMIT');
        return {
            updatedPlaceholders: placeholderUpdate.rowCount,
            updatedAnchors: anchorUpdate.rowCount,
            updatedSourceUnavailable: unavailableUpdate.rowCount,
            updatedNonScriptureArtifacts: artifactUpdate.rowCount,
            verified: counts
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

try {
    if (apply && !allowRemote && !isLocalHost(databaseHost)) {
        throw new Error(`REMOTE_APPLY_REQUIRES_ALLOW_REMOTE:${databaseHost}`);
    }
    if (selectedConfigurations.length === 0) {
        throw new Error(`NO_SUPPORTED_TARGET_VERSION:${requestedVersions.join(',')}`);
    }

    const identity = await pool.query(`
        SELECT CURRENT_DATABASE() AS database, INET_SERVER_ADDR()::TEXT AS server_address
    `);
    const reports = [];
    for (const configuration of selectedConfigurations) {
        targetVersion = configuration.targetVersion;
        sourceVersion = configuration.sourceVersion;
        allowedSources = configuration.allowedSources;
        repairId = `fhl-${sourceVersion}-verse-status-v1`;

        const { rows: sourceRows } = await pool.query(`
            SELECT book, chapter, verse, text, source, metadata
            FROM bible_verses
            WHERE version = $1
            ORDER BY book, chapter, verse
        `, [targetVersion]);
        const chapterMap = new Map();
        for (const row of sourceRows) {
            chapterMap.set(`${row.book}\u0000${row.chapter}`, { book: row.book, chapter: Number(row.chapter) });
        }
        const chapters = [...chapterMap.values()].sort((a, b) => (
            a.book.localeCompare(b.book) || a.chapter - b.chapter
        ));
        const plan = await inspectAllChapters(chapters);
        reports.push({
            targetVersion,
            sourceVersion,
            scannedChapters: chapters.length,
            affectedChapters: new Set(plan.placeholders.map(item => `${item.book}\u0000${item.chapter}`)).size,
            verifiedPlaceholders: plan.placeholders.length,
            normalizedSourcePlaceholderText: plan.placeholders.filter(item => !item.canonical_text_already).length,
            verifiedAnchors: plan.anchors.length,
            verifiedSourceUnavailable: plan.unavailable.length,
            verifiedNonScriptureArtifacts: plan.artifacts.length,
            repair: apply ? await applyRepairs(plan) : null
        });
    }
    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        database: identity.rows[0],
        reports
    }, null, 2));
} finally {
    await pool.end();
}
