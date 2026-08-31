import { bibleTranslator } from '../../../utils/bibleTranslator.js';
import { SUPPORTED_QUESTION_VERSIONS } from './QuestionEvidenceService.js';

const REFERENCE_BOOK_ALIASES = Object.freeze({
    創: 'Genesis', 出: 'Exodus', 利: 'Leviticus', 民: 'Numbers', 申: 'Deuteronomy',
    書: 'Joshua', 士: 'Judges', 得: 'Ruth', 撒上: '1 Samuel', 撒下: '2 Samuel',
    王上: '1 Kings', 王下: '2 Kings', 代上: '1 Chronicles', 代下: '2 Chronicles',
    拉: 'Ezra', 尼: 'Nehemiah', 斯: 'Esther', 伯: 'Job', 詩: 'Psalms', 箴: 'Proverbs',
    傳: 'Ecclesiastes', 歌: 'Song of Solomon', 賽: 'Isaiah', 耶: 'Jeremiah', 哀: 'Lamentations',
    結: 'Ezekiel', 但: 'Daniel', 何: 'Hosea', 珥: 'Joel', 摩: 'Amos', 俄: 'Obadiah',
    拿: 'Jonah', 彌: 'Micah', 鴻: 'Nahum', 哈: 'Habakkuk', 番: 'Zephaniah', 該: 'Haggai',
    亞: 'Zechariah', 瑪: 'Malachi', 太: 'Matthew', 可: 'Mark', 路: 'Luke', 約: 'John',
    徒: 'Acts', 羅: 'Romans', 林前: '1 Corinthians', 林後: '2 Corinthians', 加: 'Galatians',
    弗: 'Ephesians', 腓: 'Philippians', 西: 'Colossians', 帖前: '1 Thessalonians',
    帖後: '2 Thessalonians', 提前: '1 Timothy', 提後: '2 Timothy', 多: 'Titus', 門: 'Philemon',
    來: 'Hebrews', 雅: 'James', 彼前: '1 Peter', 彼後: '2 Peter', 約一: '1 John',
    約二: '2 John', 約三: '3 John', 猶: 'Jude', 啟: 'Revelation'
});

function readField(object, camel, snake) {
    return object?.[camel] ?? object?.[snake];
}

function asPositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeReferenceText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/[：﹕]/g, ':')
        .replace(/[–—~～至]/g, '-')
        .replace(/\s+/g, ' ');
}

function canonicalBookName(value) {
    const normalized = String(value || '').replace(/[.。]$/g, '').trim();
    if (!normalized) return null;
    if (REFERENCE_BOOK_ALIASES[normalized]) return REFERENCE_BOOK_ALIASES[normalized];
    const translated = bibleTranslator.toEnglish(normalized);
    return bibleTranslator.isKnownBook(normalized) ? translated : null;
}

function referenceBookMatches(prefix, questionBook) {
    if (!prefix) return true;
    const prefixBook = canonicalBookName(prefix);
    const expectedBook = canonicalBookName(questionBook);
    return Boolean(prefixBook && expectedBook && prefixBook === expectedBook);
}

function canonicalVerseRef(chapter, verseStart, verseEnd) {
    return `${chapter}:${verseStart}${verseEnd > verseStart ? `-${verseEnd}` : ''}`;
}

export function parseLegacyVerseReference(value, questionBook) {
    const normalized = normalizeReferenceText(value);
    if (!normalized || /^(?:N\/?A|無|未知)$/i.test(normalized)) {
        return { ok: false, reason: 'REFERENCE_MISSING', normalized };
    }

    const explicit = normalized.match(/^(.*?)(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (explicit) {
        const prefix = explicit[1].trim();
        if (!referenceBookMatches(prefix, questionBook)) {
            return { ok: false, reason: 'REFERENCE_BOOK_MISMATCH', normalized, prefix };
        }
        const chapter = asPositiveInteger(explicit[2]);
        const verseStart = asPositiveInteger(explicit[3]);
        const verseEnd = asPositiveInteger(explicit[4] || explicit[3]);
        if (!chapter || !verseStart || !verseEnd || verseEnd < verseStart) {
            return { ok: false, reason: 'REFERENCE_RANGE_INVALID', normalized };
        }
        return {
            ok: true,
            source: prefix ? 'PREFIXED_REFERENCE' : 'EXPLICIT_REFERENCE',
            chapter,
            verseStart,
            verseEnd,
            verseRef: canonicalVerseRef(chapter, verseStart, verseEnd),
            normalized
        };
    }

    if (/^\d+$/.test(normalized)) {
        return {
            ok: false,
            reason: 'VERSE_ONLY_REFERENCE',
            verseOnly: asPositiveInteger(normalized),
            normalized
        };
    }

    const chapterOnly = normalized.match(/^(.*?)(\d+)$/);
    if (chapterOnly && chapterOnly[1].trim()) {
        const prefix = chapterOnly[1].trim();
        if (!referenceBookMatches(prefix, questionBook)) {
            return { ok: false, reason: 'REFERENCE_BOOK_MISMATCH', normalized, prefix };
        }
        return {
            ok: false,
            reason: 'CHAPTER_ONLY_REFERENCE',
            chapterOnly: asPositiveInteger(chapterOnly[2]),
            normalized
        };
    }

    return { ok: false, reason: 'REFERENCE_FORMAT_UNSUPPORTED', normalized };
}

export function proposeQuestionLocationRepair(question, { evidenceExists = () => false } = {}) {
    const version = String(question?.version || '').trim();
    const book = String(question?.book || '').trim();
    const canonicalBook = canonicalBookName(book);
    if (!SUPPORTED_QUESTION_VERSIONS.includes(version)) {
        return { repairable: false, reason: 'UNSUPPORTED_VERSION' };
    }
    if (!canonicalBook) return { repairable: false, reason: 'UNKNOWN_BOOK' };

    const currentChapter = asPositiveInteger(question?.chapter);
    const currentStart = asPositiveInteger(readField(question, 'verseStart', 'verse_start'));
    const currentEnd = asPositiveInteger(readField(question, 'verseEnd', 'verse_end')) || currentStart;
    const parsed = parseLegacyVerseReference(readField(question, 'verseRef', 'verse_ref'), book);

    let target;
    if (parsed.ok) {
        const fieldsConflict = (currentStart && currentStart !== parsed.verseStart)
            || (currentEnd && currentEnd !== parsed.verseEnd);
        if (fieldsConflict) return { repairable: false, reason: 'REFERENCE_VERSE_FIELDS_CONFLICT', parsed };
        target = parsed;
    } else if (parsed.reason === 'VERSE_ONLY_REFERENCE'
        && currentChapter && currentStart && currentEnd
        && parsed.verseOnly === currentStart) {
        target = {
            source: 'VERSE_ONLY_REFERENCE',
            chapter: currentChapter,
            verseStart: currentStart,
            verseEnd: currentEnd,
            verseRef: canonicalVerseRef(currentChapter, currentStart, currentEnd)
        };
    } else if ((parsed.reason === 'REFERENCE_MISSING' || parsed.reason === 'CHAPTER_ONLY_REFERENCE')
        && currentChapter && currentStart && currentEnd
        && (!parsed.chapterOnly || parsed.chapterOnly === currentChapter)) {
        target = {
            source: parsed.reason,
            chapter: currentChapter,
            verseStart: currentStart,
            verseEnd: currentEnd,
            verseRef: canonicalVerseRef(currentChapter, currentStart, currentEnd)
        };
    } else {
        return { repairable: false, reason: parsed.reason, parsed };
    }

    if (!evidenceExists({
        version,
        book: canonicalBook,
        chapter: target.chapter,
        verseStart: target.verseStart,
        verseEnd: target.verseEnd
    })) {
        return { repairable: false, reason: 'EXACT_VERSION_EVIDENCE_MISSING', target };
    }

    const currentRef = normalizeReferenceText(readField(question, 'verseRef', 'verse_ref'));
    const changes = {};
    if (currentChapter !== target.chapter) changes.chapter = { from: currentChapter, to: target.chapter };
    if (currentStart !== target.verseStart) changes.verse_start = { from: currentStart, to: target.verseStart };
    if (currentEnd !== target.verseEnd) changes.verse_end = { from: currentEnd, to: target.verseEnd };
    if (currentRef !== target.verseRef) changes.verse_ref = { from: currentRef || null, to: target.verseRef };

    if (Object.keys(changes).length === 0) {
        return { repairable: false, reason: 'LOCATION_ALREADY_CANONICAL', target };
    }

    return {
        repairable: true,
        reason: target.source,
        target: {
            chapter: target.chapter,
            verse_start: target.verseStart,
            verse_end: target.verseEnd,
            verse_ref: target.verseRef
        },
        evidence: {
            available: true,
            version,
            book: canonicalBook,
            chapter: target.chapter,
            verseStart: target.verseStart,
            verseEnd: target.verseEnd
        },
        changes
    };
}

export function hasOnlyLocationChanges(previousPayload, candidatePayload) {
    const allowed = new Set(['chapter', 'verse_start', 'verse_end', 'verse_ref']);
    const keys = new Set([
        ...Object.keys(previousPayload || {}),
        ...Object.keys(candidatePayload || {})
    ]);
    for (const key of keys) {
        if (allowed.has(key)) continue;
        if (JSON.stringify(previousPayload?.[key] ?? null) !== JSON.stringify(candidatePayload?.[key] ?? null)) {
            return false;
        }
    }
    return true;
}

export default {
    parseLegacyVerseReference,
    proposeQuestionLocationRepair,
    hasOnlyLocationChanges
};
