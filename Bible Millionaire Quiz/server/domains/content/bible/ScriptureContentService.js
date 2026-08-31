import { dbOps } from '../../../database/index.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { presentBibleVerse } from './BibleTextPresentation.js';
import { resolveBibleVersion } from './BibleVersionRegistry.js';

const MAX_SEARCH_RESULTS = 50;

function escapeLike(value) {
    return value.replace(/[\\%_]/g, character => `\\${character}`);
}

export function buildScriptureSearchQuery({ query, version, book, limit }) {
    const resolvedVersion = resolveBibleVersion(version || 'CUV_TRAD');
    if (!resolvedVersion || resolvedVersion.public === false) {
        const error = new Error('不支援這個公開譯本');
        error.code = 'UNSUPPORTED_BIBLE_VERSION';
        throw error;
    }

    const trimmedQuery = String(query || '').trim();
    const characterCount = Array.from(trimmedQuery).length;
    if (characterCount < 2 || characterCount > 100) {
        const error = new Error('搜尋文字須為 2 至 100 個字');
        error.code = 'INVALID_SEARCH_QUERY';
        throw error;
    }

    const normalizedLimit = Math.min(
        MAX_SEARCH_RESULTS,
        Math.max(1, Number.parseInt(limit || '30', 10) || 30)
    );
    const params = [resolvedVersion.storageVersion, `%${escapeLike(trimmedQuery)}%`];
    let sql = `
        SELECT id, book, chapter, verse, text, version, metadata
        FROM bible_verses
        WHERE version = $1
          AND text ILIKE $2 ESCAPE '\\'
    `;

    if (book) {
        const englishBook = bibleTranslator.toEnglish(book);
        if (!bibleTranslator.isKnownBook(englishBook)) {
            const error = new Error('書卷名稱無效');
            error.code = 'INVALID_BIBLE_BOOK';
            throw error;
        }
        params.push(englishBook);
        sql += ` AND book = $${params.length}`;
    }

    params.push(normalizedLimit);
    sql += ` ORDER BY book, chapter, verse LIMIT $${params.length}`;

    return { sql, params, resolvedVersion, normalizedLimit };
}

export async function searchScripture(options) {
    const { sql, params, resolvedVersion, normalizedLimit } = buildScriptureSearchQuery(options);
    const rawRows = await dbOps.contentDb.query(sql, params);
    const rows = rawRows?.rows || rawRows || [];

    return {
        count: rows.length,
        limit: normalizedLimit,
        version: {
            canonical: resolvedVersion.canonicalVersion,
            displayName: resolvedVersion.displayName
        },
        results: rows.map(row => {
            const presentation = presentBibleVerse(row);
            return {
                id: row.id,
                book: row.book,
                bookName: bibleTranslator.toChinese(row.book),
                chapter: Number(row.chapter),
                verse: Number(row.verse),
                text: presentation.text,
                sectionHeadings: presentation.sectionHeadings,
                lineBreakAfter: presentation.lineBreakAfter,
                paragraphBreakAfter: presentation.paragraphBreakAfter,
                version: row.version,
                versionName: resolvedVersion.displayName
            };
        })
    };
}

export async function listPublicBibleVersions() {
    const result = await dbOps.contentDb.query(`
        SELECT version_id, source_version, display_name_zh,
               legacy_storage_version, actual_verses, coverage_status
        FROM bible_translation_versions
        WHERE evidence_eligible = TRUE
          AND coverage_status IN ('COMPLETE', 'COMPLETE_WITH_MERGED_VERSES')
          AND COALESCE((metadata->>'public')::BOOLEAN, TRUE) = TRUE
        ORDER BY CASE version_id
            WHEN 'CUV_TRAD' THEN 1
            WHEN 'CNV_TRAD' THEN 2
            WHEN 'TCV2019_TRAD' THEN 3
            WHEN 'LCC_TRAD' THEN 4
            ELSE 99
        END
    `);

    return (result.rows || result || [])
        .map(row => {
            const resolved = resolveBibleVersion(row.version_id || row.versionId);
            if (!resolved || resolved.public === false) return null;
            return {
                id: resolved.canonicalVersion,
                name: row.display_name_zh || row.displayNameZh || resolved.displayName,
                sourceVersion: row.source_version || row.sourceVersion || resolved.sourceVersion,
                storageVersion: resolved.storageVersion,
                verseCount: Number(row.actual_verses || row.actualVerses || 0),
                coverageStatus: row.coverage_status || row.coverageStatus
            };
        })
        .filter(Boolean);
}

export function sendScriptureSearchError(res, error) {
    const clientError = [
        'INVALID_SEARCH_QUERY',
        'INVALID_BIBLE_BOOK',
        'UNSUPPORTED_BIBLE_VERSION'
    ].includes(error.code);
    return res.status(clientError ? 400 : 500).json({
        success: false,
        error: error.code || 'SCRIPTURE_SEARCH_FAILED',
        message: clientError ? error.message : '經文搜尋暫時無法使用'
    });
}

