import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { FHL_BOOK_CATALOG, getFhlBook } from './fhlCatalog.js';
import { normalizeFhlMarkupText, splitFhlBibleMarkup } from './BibleTextPresentation.js';

export const FHL_API_BASE = 'https://bible.fhl.net/json/qb.php';
export const FHL_FIXED_VERSION_MAP = Object.freeze({
    CUV_TRAD: 'unv',
    LCC_TRAD: 'lcc',
    CNV_TRAD: 'ncv',
    TCV1995_TRAD: 'tcv95',
    // Historical storage name retained for compatibility; audited upstream is 2019.
    TCV2010_TRAD: 'tcv2019'
});
export const FHL_TCV_CANDIDATES = Object.freeze(['tcv2019']);
export const FHL_MERGED_VERSE_PLACEHOLDER = 'a';
export const FHL_MERGED_VERSE_SOURCE_VERSIONS = Object.freeze(['unv', 'lcc', 'ncv', 'tcv2019']);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const normalizeFhlText = normalizeFhlMarkupText;

export function isFhlNonScriptureArtifact(text, sourceVersion) {
    if (!FHL_MERGED_VERSE_SOURCE_VERSIONS.includes(sourceVersion)) return false;
    const value = String(text || '').trim();
    const footnotePattern = /(?:【|［|\[)\s*\d+\s*(?:】|］|\])/gu;
    if (!footnotePattern.test(value)) return false;
    const withoutFootnotes = value
        .replace(/(?:【|［|\[)\s*\d+\s*(?:】|］|\])/gu, '')
        .replace(/[\p{P}\p{S}\s]/gu, '');
    return withoutFootnotes === '';
}

function isFhlMergedVersePlaceholder(text, sourceVersion) {
    return FHL_MERGED_VERSE_SOURCE_VERSIONS.includes(sourceVersion)
        && String(text || '').trim().toLowerCase() === FHL_MERGED_VERSE_PLACEHOLDER;
}

/**
 * FHL 的中文譯本以單一字元 `a` 或空白列保留已併入前一節的節號。
 * 原文不在此拆回各節；只補上可驗證、可呈現的合併範圍資訊。
 */
export function annotateFhlMergedVerses(verses, { book, chapter, sourceVersion } = {}) {
    if (!FHL_MERGED_VERSE_SOURCE_VERSIONS.includes(sourceVersion)) return verses;

    let anchor = null;
    let previousVerse = null;
    for (const item of verses) {
        if (['SOURCE_TEXT_UNAVAILABLE', 'NON_SCRIPTURE_ARTIFACT'].includes(item.verseStatus)) {
            anchor = null;
            previousVerse = item.verse;
            continue;
        }
        if (item.verseStatus !== 'MERGED_WITH_PREVIOUS'
            && !isFhlMergedVersePlaceholder(item.text, sourceVersion)) {
            anchor = item;
            previousVerse = item.verse;
            continue;
        }
        if (!anchor) {
            throw new Error(`FHL_ORPHAN_MERGED_VERSE:${book || 'unknown'}:${chapter || 'unknown'}:${item.verse}`);
        }
        if (previousVerse !== item.verse - 1) {
            throw new Error(`FHL_NONCONTIGUOUS_MERGED_VERSE:${book || 'unknown'}:${chapter || 'unknown'}:${item.verse}`);
        }

        item.verseStatus = 'MERGED_WITH_PREVIOUS';
        item.mergedIntoVerse = anchor.verse;
        anchor.verseStatus = 'MERGED_RANGE_ANCHOR';
        anchor.mergedVerseEnd = item.verse;
        previousVerse = item.verse;
    }
    return verses;
}

export function validateFhlChapterPayload(payload, { book, chapter, sourceVersion } = {}) {
    if (payload?.status !== 'success') {
        throw new Error(`FHL_STATUS_NOT_SUCCESS:${payload?.status || 'missing'}`);
    }
    if (!Array.isArray(payload.record) || payload.record.length === 0) {
        throw new Error(`FHL_EMPTY_CHAPTER:${book || 'unknown'}:${chapter || 'unknown'}:${sourceVersion || 'unknown'}`);
    }

    const seen = new Set();
    const verses = payload.record.map(record => {
        const verse = Number(record.sec);
        const { text, sectionHeadings, lineBreakAfter, paragraphBreakAfter } = splitFhlBibleMarkup(record.bible_text);
        if (!Number.isInteger(verse) || verse < 1) {
            throw new Error(`FHL_INVALID_VERSE_NUMBER:${record.sec}`);
        }
        if (seen.has(verse)) throw new Error(`FHL_DUPLICATE_VERSE:${verse}`);
        const recognizedFhlSource = FHL_MERGED_VERSE_SOURCE_VERSIONS.includes(sourceVersion);
        const sourceTextUnavailable = !text && recognizedFhlSource && sectionHeadings.length > 0;
        const mergedPlaceholder = !text && recognizedFhlSource && sectionHeadings.length === 0;
        const nonScriptureArtifact = Boolean(text) && isFhlNonScriptureArtifact(text, sourceVersion);
        if (!text && !sourceTextUnavailable && !mergedPlaceholder) {
            throw new Error(`FHL_BLANK_VERSE:${verse}`);
        }
        seen.add(verse);
        return {
            verse,
            text,
            sectionHeadings,
            lineBreakAfter,
            paragraphBreakAfter,
            ...(sourceTextUnavailable ? { verseStatus: 'SOURCE_TEXT_UNAVAILABLE' } : {}),
            ...(mergedPlaceholder ? { verseStatus: 'MERGED_WITH_PREVIOUS' } : {}),
            ...(nonScriptureArtifact ? { verseStatus: 'NON_SCRIPTURE_ARTIFACT' } : {})
        };
    }).sort((a, b) => a.verse - b.verse);

    return annotateFhlMergedVerses(verses, { book, chapter, sourceVersion });
}

function normalizeForComparison(text) {
    return normalizeFhlText(text).replace(/\s+/g, ' ').trim();
}

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export class FhlBibleSyncService {
    constructor({ fetchImpl = fetch, apiBase = FHL_API_BASE, retryDelayMs = 300, maxRetries = 3 } = {}) {
        this.fetchImpl = fetchImpl;
        this.apiBase = apiBase;
        this.retryDelayMs = retryDelayMs;
        this.maxRetries = maxRetries;
    }

    buildChapterUrl({ book, chapter, sourceVersion }) {
        const entry = getFhlBook(book);
        if (!entry) throw new Error(`UNKNOWN_FHL_BOOK:${book}`);
        const url = new URL(this.apiBase);
        url.searchParams.set('chineses', entry.code);
        url.searchParams.set('chap', String(chapter));
        url.searchParams.set('version', sourceVersion);
        url.searchParams.set('strong', '0');
        return url.toString();
    }

    async fetchChapter({ book, chapter, sourceVersion }) {
        const url = this.buildChapterUrl({ book, chapter, sourceVersion });
        let lastError;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await this.fetchImpl(url, {
                    headers: { 'Accept': 'application/json', 'User-Agent': 'Ecclesia-Hub-FHL-Sync/4.0' }
                });
                if (!response.ok) throw new Error(`FHL_HTTP_${response.status}`);
                const payload = await response.json();
                const verses = validateFhlChapterPayload(payload, { book, chapter, sourceVersion });
                return { url, verses };
            } catch (error) {
                lastError = error;
                if (attempt + 1 < this.maxRetries) {
                    await sleep(this.retryDelayMs * (2 ** attempt));
                }
            }
        }

        throw new Error(`FHL_FETCH_FAILED:${book}:${chapter}:${sourceVersion}:${lastError?.message || 'unknown'}`);
    }

    async resolveSourceVersion(pool, targetVersion, { sampleSize = 30 } = {}) {
        if (FHL_FIXED_VERSION_MAP[targetVersion]) return FHL_FIXED_VERSION_MAP[targetVersion];
        if (targetVersion !== 'TCV2010_TRAD') throw new Error(`UNSUPPORTED_TARGET_VERSION:${targetVersion}`);
        if (!pool) throw new Error('TCV_SOURCE_RESOLUTION_REQUIRES_DATABASE');

        const sampleResult = await pool.query(`
            SELECT book, chapter
            FROM bible_verses
            WHERE version = $1 AND book <> 'Hebrews'
            GROUP BY book, chapter
            ORDER BY MD5(book || ':' || chapter::TEXT)
        `, [targetVersion]);
        const availableChapters = sampleResult.rows || sampleResult;
        const oldTestamentBooks = new Set(FHL_BOOK_CATALOG.slice(0, 39).map(item => item.english));
        const oldTarget = Math.floor(sampleSize / 2);
        const newTarget = sampleSize - oldTarget;
        const chapters = [
            ...availableChapters.filter(item => oldTestamentBooks.has(item.book)).slice(0, oldTarget),
            ...availableChapters.filter(item => !oldTestamentBooks.has(item.book)).slice(0, newTarget)
        ];
        if (!Array.isArray(chapters) || chapters.length < sampleSize) {
            throw new Error(`TCV_SOURCE_SAMPLE_TOO_SMALL:${chapters?.length || 0}/${sampleSize}`);
        }

        const comparisons = [];
        for (const sourceVersion of FHL_TCV_CANDIDATES) {
            let matched = 0;
            let compared = 0;
            let complete = true;
            const mismatches = [];

            for (const sample of chapters) {
                const dbResult = await pool.query(`
                    SELECT verse, text
                    FROM bible_verses
                    WHERE version = $1 AND book = $2 AND chapter = $3
                    ORDER BY verse
                `, [targetVersion, sample.book, sample.chapter]);
                const dbRows = dbResult.rows || dbResult;
                const api = await this.fetchChapter({
                    book: sample.book,
                    chapter: sample.chapter,
                    sourceVersion
                });
                const dbByVerse = new Map(dbRows.map(row => [Number(row.verse), normalizeForComparison(row.text)]));

                if (dbByVerse.size !== api.verses.length) complete = false;
                for (const verse of api.verses) {
                    compared++;
                    const databaseText = dbByVerse.get(verse.verse);
                    const upstreamText = normalizeForComparison(verse.text);
                    if (databaseText === upstreamText) matched++;
                    else {
                        complete = false;
                        if (mismatches.length < 5) {
                            mismatches.push({
                                book: sample.book,
                                chapter: Number(sample.chapter),
                                verse: verse.verse,
                                databaseText,
                                upstreamText
                            });
                        }
                    }
                }
                if (this.retryDelayMs > 0) await sleep(this.retryDelayMs);
            }
            comparisons.push({
                sourceVersion,
                matched,
                compared,
                complete: complete && matched === compared,
                mismatches
            });
        }

        const exact = comparisons.filter(item => item.complete);
        if (exact.length === 0) {
            const summary = comparisons.map(item => {
                const references = item.mismatches
                    .map(mismatch => `${mismatch.book}.${mismatch.chapter}.${mismatch.verse}`)
                    .join('|');
                return `${item.sourceVersion}:${item.matched}/${item.compared}${references ? `[${references}]` : ''}`;
            }).join(',');
            throw new Error(`TCV_SOURCE_MISMATCH:${summary}`);
        }
        const selected = exact[0];
        return selected.sourceVersion;
    }

    async downloadBook({ pool = null, book = 'Hebrews', targetVersion, sourceVersion = null, chapter = null }) {
        const entry = getFhlBook(book);
        if (!entry) throw new Error(`UNKNOWN_FHL_BOOK:${book}`);
        const resolvedSource = sourceVersion || await this.resolveSourceVersion(pool, targetVersion);
        const fixedSource = FHL_FIXED_VERSION_MAP[targetVersion];
        if (fixedSource && resolvedSource !== fixedSource) {
            throw new Error(`SOURCE_VERSION_MISMATCH:${targetVersion}:${resolvedSource}:${fixedSource}`);
        }
        if (targetVersion === 'TCV2010_TRAD' && !FHL_TCV_CANDIDATES.includes(resolvedSource)) {
            throw new Error(`SOURCE_VERSION_MISMATCH:${targetVersion}:${resolvedSource}:tcv2019`);
        }
        const chapters = chapter ? [Number(chapter)] : Array.from({ length: entry.chapters }, (_, index) => index + 1);
        const rows = [];
        const chapterReport = [];

        for (const chapterNumber of chapters) {
            if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > entry.chapters) {
                throw new Error(`INVALID_CHAPTER:${book}:${chapterNumber}`);
            }
            const result = await this.fetchChapter({ book: entry.english, chapter: chapterNumber, sourceVersion: resolvedSource });
            chapterReport.push({ chapter: chapterNumber, verses: result.verses.length, url: result.url });
            for (const item of result.verses) {
                rows.push({
                    id: `${targetVersion}_${entry.english}_${chapterNumber}_${item.verse}`,
                    version: targetVersion,
                    sourceVersion: resolvedSource,
                    book: entry.english,
                    chapter: chapterNumber,
                    verse: item.verse,
                    text: item.text,
                    sectionHeadings: item.sectionHeadings,
                    lineBreakAfter: item.lineBreakAfter,
                    paragraphBreakAfter: item.paragraphBreakAfter,
                    verseStatus: item.verseStatus || null,
                    mergedIntoVerse: item.mergedIntoVerse || null,
                    mergedVerseEnd: item.mergedVerseEnd || null,
                    hash: sha256(item.text)
                });
            }
            if (this.retryDelayMs > 0) await sleep(this.retryDelayMs);
        }

        return {
            book: entry.english,
            targetVersion,
            sourceVersion: resolvedSource,
            chapters: chapterReport,
            verseCount: rows.length,
            rows
        };
    }

    async syncBook(pool, {
        book = 'Hebrews',
        targetVersions = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD'],
        explicitSources = {},
        chapter = null,
        dryRun = true
    } = {}) {
        if (!pool) throw new Error('DATABASE_POOL_REQUIRED');
        const downloads = [];
        for (const targetVersion of targetVersions) {
            downloads.push(await this.downloadBook({
                pool,
                book,
                targetVersion,
                sourceVersion: explicitSources[targetVersion] || null,
                chapter
            }));
        }

        const reports = [];
        for (const download of downloads) {
            const existingResult = await pool.query(`
                SELECT COUNT(*)::INTEGER AS count
                FROM bible_verses
                WHERE version = $1 AND book = $2
            `, [download.targetVersion, download.book]);
            reports.push({
                book: download.book,
                targetVersion: download.targetVersion,
                sourceVersion: download.sourceVersion,
                fetched: download.verseCount,
                existing: Number(existingResult.rows?.[0]?.count ?? existingResult[0]?.count ?? 0),
                inserted: 0,
                chapters: download.chapters
            });
        }

        if (dryRun) return { dryRun: true, reports };

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
                CREATE TEMP TABLE bible_verses_v4_staging (
                    id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    source_version TEXT NOT NULL,
                    book TEXT NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    section_headings JSONB NOT NULL DEFAULT '[]'::jsonb,
                    line_break_after BOOLEAN NOT NULL DEFAULT FALSE,
                    paragraph_break_after BOOLEAN NOT NULL DEFAULT FALSE,
                    verse_status TEXT,
                    merged_into_verse INTEGER,
                    merged_verse_end INTEGER,
                    upstream_sha256 TEXT NOT NULL,
                    PRIMARY KEY (version, book, chapter, verse)
                ) ON COMMIT DROP
            `);

            for (const download of downloads) {
                for (const row of download.rows) {
                    await client.query(`
                        INSERT INTO bible_verses_v4_staging
                            (id, version, source_version, book, chapter, verse, text, section_headings,
                             line_break_after, paragraph_break_after, verse_status,
                             merged_into_verse, merged_verse_end, upstream_sha256)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)
                    `, [
                        row.id, row.version, row.sourceVersion, row.book, row.chapter, row.verse,
                        row.text, JSON.stringify(row.sectionHeadings || []), row.lineBreakAfter,
                        row.paragraphBreakAfter, row.verseStatus, row.mergedIntoVerse,
                        row.mergedVerseEnd, row.hash
                    ]);
                }
            }

            const invalid = await client.query(`
                SELECT COUNT(*)::INTEGER AS count
                FROM bible_verses_v4_staging
                WHERE (BTRIM(text) = ''
                       AND COALESCE(verse_status, '') NOT IN (
                           'SOURCE_TEXT_UNAVAILABLE',
                           'MERGED_WITH_PREVIOUS'
                       ))
                   OR chapter < 1
                   OR verse < 1
                   OR (verse_status = 'SOURCE_TEXT_UNAVAILABLE'
                       AND (BTRIM(text) <> ''
                            OR JSONB_ARRAY_LENGTH(section_headings) = 0
                            OR merged_into_verse IS NOT NULL
                            OR merged_verse_end IS NOT NULL))
                   OR (verse_status = 'NON_SCRIPTURE_ARTIFACT'
                       AND (BTRIM(text) = ''
                            OR merged_into_verse IS NOT NULL
                            OR merged_verse_end IS NOT NULL))
                   OR (verse_status = 'MERGED_WITH_PREVIOUS'
                       AND (LOWER(BTRIM(text)) NOT IN ('', 'a')
                            OR merged_into_verse IS NULL
                            OR merged_into_verse >= verse))
                   OR (verse_status = 'MERGED_RANGE_ANCHOR'
                       AND (LOWER(BTRIM(text)) IN ('', 'a')
                            OR merged_verse_end IS NULL
                            OR merged_verse_end <= verse))
            `);
            if (Number(invalid.rows[0].count) !== 0) throw new Error('STAGING_VALIDATION_FAILED');

            for (const report of reports) {
                const inserted = await client.query(`
                    INSERT INTO bible_verses (id, version, book, chapter, verse, text, source, metadata, cached_at)
                    SELECT
                        id,
                        version,
                        book,
                        chapter,
                        verse,
                        text,
                        'FHL_SYNC',
                        jsonb_strip_nulls(jsonb_build_object(
                            'source_version', source_version,
                            'upstream_sha256', upstream_sha256,
                            'api', 'https://bible.fhl.net/json/qb.php',
                            'section_headings', section_headings,
                            'line_break_after', line_break_after,
                            'paragraph_break_after', paragraph_break_after,
                            'verse_status', verse_status,
                            'merged_into_verse', merged_into_verse,
                            'merged_verse_end', merged_verse_end,
                            'fetched_at', CURRENT_TIMESTAMP
                        )),
                        CURRENT_TIMESTAMP
                    FROM bible_verses_v4_staging
                    WHERE version = $1 AND book = $2
                    ON CONFLICT (version, book, chapter, verse) DO NOTHING
                    RETURNING id
                `, [report.targetVersion, report.book]);
                report.inserted = inserted.rowCount;

                const syncRunId = crypto.randomUUID();
                await client.query(`
                    INSERT INTO bible_source_sync_runs
                        (id, provider, source_version, target_version, book, status,
                         chapter_count, fetched_verse_count, inserted_verse_count, report, completed_at)
                    VALUES ($1, 'FHL', $2, $3, $4, 'COMPLETED', $5, $6, $7, $8::jsonb, CURRENT_TIMESTAMP)
                `, [
                    syncRunId,
                    report.sourceVersion,
                    report.targetVersion,
                    report.book,
                    report.chapters.length,
                    report.fetched,
                    report.inserted,
                    JSON.stringify(report)
                ]);

                const registryVersion = report.targetVersion === 'TCV2010_TRAD'
                    ? 'TCV2019_TRAD'
                    : report.targetVersion;
                await client.query(`
                    WITH corpus_stats AS (
                        SELECT
                            COUNT(DISTINCT book)::INTEGER AS books,
                            COUNT(DISTINCT (book, chapter))::INTEGER AS chapters,
                            COUNT(*)::INTEGER AS verses,
                            COUNT(*) FILTER (
                                WHERE BTRIM(COALESCE(text, '')) = ''
                                  AND COALESCE(metadata->>'verse_status', '') NOT IN (
                                      'SOURCE_TEXT_UNAVAILABLE',
                                      'MERGED_WITH_PREVIOUS'
                                  )
                            )::INTEGER AS blanks
                        FROM bible_verses
                        WHERE version = $1
                    )
                    UPDATE bible_translation_versions registry
                    SET actual_books = stats.books,
                        actual_chapters = stats.chapters,
                        actual_verses = stats.verses,
                        blank_verses = stats.blanks,
                        coverage_status = CASE
                            WHEN stats.books = registry.expected_books
                             AND stats.chapters = registry.expected_chapters
                             AND stats.verses = registry.expected_verses
                             AND stats.blanks = 0
                            THEN 'COMPLETE'
                            ELSE registry.coverage_status
                        END,
                        metadata = CASE
                            WHEN stats.books = registry.expected_books
                             AND stats.chapters = registry.expected_chapters
                             AND stats.verses = registry.expected_verses
                             AND stats.blanks = 0
                            THEN (registry.metadata - 'missing_books') || jsonb_build_object(
                                'completed_book', $3::TEXT,
                                'completed_source_version', $4::TEXT,
                                'completed_sync_run_id', $5::TEXT,
                                'completed_at', CURRENT_TIMESTAMP
                            )
                            ELSE registry.metadata
                        END,
                        last_verified_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    FROM corpus_stats stats
                    WHERE registry.version_id = $2
                `, [report.targetVersion, registryVersion, report.book, report.sourceVersion, syncRunId]);
            }
            await client.query('COMMIT');
            return { dryRun: false, reports };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

export default FhlBibleSyncService;
