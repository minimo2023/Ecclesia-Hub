import { dbOps } from '../../../database/index.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { getBibleCorpusPolicy } from '../../content/bible/BibleCorpusPolicy.js';
import { presentBibleChapterVerses } from '../../content/bible/BibleTextPresentation.js';
import { QUESTION_VERSION_ALIASES, resolveBibleVersion } from '../../content/bible/BibleVersionRegistry.js';

export const SUPPORTED_QUESTION_VERSIONS = QUESTION_VERSION_ALIASES;

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

/**
 * 題目品質稽核的經文證據只查指定譯本，刻意不經過 BibleProvider fallback/healing。
 */
export async function getExactQuestionEvidence(question, db = dbOps.contentDb) {
    const version = String(question?.version || '').trim();
    const resolvedVersion = resolveBibleVersion(version);
    if (!resolvedVersion) {
        return { available: false, reason: 'UNSUPPORTED_VERSION', version, verses: [] };
    }

    const corpusPolicy = await getBibleCorpusPolicy(version, db);
    if (!corpusPolicy.evidenceEligible) {
        return {
            available: false,
            reason: corpusPolicy.reason,
            version,
            canonicalVersion: resolvedVersion.canonicalVersion,
            storageVersion: resolvedVersion.storageVersion,
            sourceVersion: resolvedVersion.sourceVersion,
            verses: []
        };
    }

    const book = bibleTranslator.toEnglish(question?.book);
    const chapter = Number(question?.chapter);
    const verseStart = Number(readField(question, 'verseStart', 'verse_start'));
    const rawEnd = readField(question, 'verseEnd', 'verse_end');
    const verseEnd = rawEnd == null ? verseStart : Number(rawEnd);

    if (!bibleTranslator.isKnownBook(question?.book) || !Number.isInteger(chapter) || chapter < 1) {
        return { available: false, reason: 'INVALID_REFERENCE', version, book, chapter, verses: [] };
    }
    if (!Number.isInteger(verseStart) || verseStart < 1 || !Number.isInteger(verseEnd) || verseEnd < verseStart) {
        return { available: false, reason: 'MISSING_VERSE_RANGE', version, book, chapter, verses: [] };
    }

    const chapterVerses = await db.query(`
        SELECT book, chapter, verse, text, version, source, metadata
        FROM bible_verses
        WHERE version = $1
          AND book = $2
          AND chapter = $3
        ORDER BY verse
    `, [resolvedVersion.storageVersion, book, chapter]);

    const normalized = presentBibleChapterVerses(Array.isArray(chapterVerses) ? chapterVerses : [])
        .filter(item => (
            Number(item.verseEnd ?? item.verse) >= verseStart
            && Number(item.verseStart ?? item.verse) <= verseEnd
        ));
    const coveredVerses = new Set(normalized.flatMap(item => item.coveredVerses || [item.verse]));
    const hasStart = coveredVerses.has(verseStart);
    const hasEnd = coveredVerses.has(verseEnd);
    const hasBlank = normalized.some(item => !String(item.text || '').trim());
    const hasSourcePlaceholder = normalized.some(item => String(item.text || '').trim().toLowerCase() === 'a');

    if (normalized.length === 0 || !hasStart || !hasEnd || hasBlank || hasSourcePlaceholder) {
        return {
            available: false,
            reason: hasSourcePlaceholder
                ? 'SOURCE_PLACEHOLDER_NOT_REPAIRED'
                : hasBlank
                    ? 'BLANK_EVIDENCE_TEXT'
                    : 'EXACT_VERSION_EVIDENCE_MISSING',
            version,
            canonicalVersion: resolvedVersion.canonicalVersion,
            storageVersion: resolvedVersion.storageVersion,
            sourceVersion: resolvedVersion.sourceVersion,
            book,
            chapter,
            verseStart,
            verseEnd,
            verses: normalized
        };
    }

    return {
        available: true,
        reason: 'PASS',
        version,
        canonicalVersion: resolvedVersion.canonicalVersion,
        storageVersion: resolvedVersion.storageVersion,
        sourceVersion: resolvedVersion.sourceVersion,
        activeSyncRunId: corpusPolicy.activeSyncRunId,
        activePromotionId: corpusPolicy.activePromotionId,
        book,
        chapter,
        verseStart,
        verseEnd,
        verses: normalized.map(item => ({
            verse: Number(item.verse),
            verseStart: Number(item.verseStart ?? item.verse),
            verseEnd: Number(item.verseEnd ?? item.verse),
            verseLabel: item.verseLabel || String(item.verse),
            coveredVerses: item.coveredVerses || [Number(item.verse)],
            text: item.text,
            version: item.version,
            source: item.source,
            sourceVersion: item.metadata?.source_version || resolvedVersion.sourceVersion
        }))
    };
}

export default { getExactQuestionEvidence, SUPPORTED_QUESTION_VERSIONS };
