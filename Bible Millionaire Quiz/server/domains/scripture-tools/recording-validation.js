import crypto from 'crypto';
import { fileTypeFromBuffer } from 'file-type';
import { parseBuffer } from 'music-metadata';
import { resolveBibleVersion } from '../content/bible/BibleVersionRegistry.js';
import { bibleTranslator } from '../../utils/bibleTranslator.js';

export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;
export const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;
export const MAX_RECORDING_VERSES = 30;

const ACCEPTED_FILE_TYPES = Object.freeze({
    'audio/webm': { mimeType: 'audio/webm', extension: 'webm' },
    'video/webm': { mimeType: 'audio/webm', extension: 'webm' },
    'audio/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
    'application/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
    'audio/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
    'video/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
    'audio/x-m4a': { mimeType: 'audio/mp4', extension: 'm4a' },
    'audio/mpeg': { mimeType: 'audio/mpeg', extension: 'mp3' },
    'audio/mp3': { mimeType: 'audio/mpeg', extension: 'mp3' },
    'audio/wav': { mimeType: 'audio/wav', extension: 'wav' },
    'audio/x-wav': { mimeType: 'audio/wav', extension: 'wav' },
    'audio/vnd.wave': { mimeType: 'audio/wav', extension: 'wav' }
});

export function recordingError(code, message, status = 400) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

export function normalizePassageInput(input = {}) {
    const resolvedVersion = resolveBibleVersion(input.version || 'CUV_TRAD');
    if (!resolvedVersion || resolvedVersion.public === false) {
        throw recordingError('UNSUPPORTED_BIBLE_VERSION', '不支援這個公開譯本');
    }

    const book = bibleTranslator.toEnglish(String(input.book || '').trim());
    if (!bibleTranslator.isKnownBook(book)) {
        throw recordingError('INVALID_BIBLE_BOOK', '書卷名稱無效');
    }

    const chapter = Number.parseInt(input.chapter, 10);
    const verseStart = Number.parseInt(input.verseStart, 10);
    const verseEnd = Number.parseInt(input.verseEnd, 10);
    if (![chapter, verseStart, verseEnd].every(Number.isInteger)
        || chapter < 1 || verseStart < 1 || verseEnd < verseStart) {
        throw recordingError('INVALID_PASSAGE_RANGE', '經文範圍無效');
    }
    if (verseEnd - verseStart + 1 > MAX_RECORDING_VERSES) {
        throw recordingError('PASSAGE_TOO_LONG', `一次最多錄製 ${MAX_RECORDING_VERSES} 節`);
    }

    return {
        version: resolvedVersion.canonicalVersion,
        storageVersion: resolvedVersion.storageVersion,
        versionName: resolvedVersion.displayName,
        book,
        bookName: bibleTranslator.toChinese(book),
        chapter,
        verseStart,
        verseEnd
    };
}

export async function inspectAudioBuffer(buffer, { clientDurationMs } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw recordingError('EMPTY_AUDIO', '錄音檔為空白');
    }
    if (buffer.length > MAX_RECORDING_BYTES) {
        throw recordingError('AUDIO_TOO_LARGE', '錄音檔不可超過 5MB', 413);
    }

    const detected = await fileTypeFromBuffer(buffer);
    const accepted = detected && ACCEPTED_FILE_TYPES[detected.mime];
    if (!accepted) {
        throw recordingError('UNSUPPORTED_AUDIO_FORMAT', '只接受 WebM、Ogg、M4A、MP3 或 WAV 音檔');
    }

    let metadata;
    try {
        metadata = await parseBuffer(buffer, { mimeType: accepted.mimeType }, {
            duration: true,
            skipCovers: true
        });
    } catch {
        throw recordingError('INVALID_AUDIO_CONTENT', '無法讀取這段錄音');
    }

    const declared = Number(clientDurationMs || 0);
    const parsedDurationMs = Math.round(Number(metadata?.format?.duration || 0) * 1000);
    const hasParsedDuration = Number.isFinite(parsedDurationMs) && parsedDurationMs > 0;
    const hasSafeDeclaredDuration = Number.isFinite(declared)
        && declared >= 1000
        && declared <= MAX_RECORDING_DURATION_MS;

    if (!hasParsedDuration && !hasSafeDeclaredDuration) {
        throw recordingError('AUDIO_DURATION_UNREADABLE', '無法確認錄音長度，請重新錄製');
    }

    const verifiedDurationMs = hasParsedDuration ? parsedDurationMs : Math.round(declared);
    if (verifiedDurationMs > MAX_RECORDING_DURATION_MS) {
        throw recordingError('AUDIO_TOO_LONG', '錄音不可超過 5 分鐘', 413);
    }

    if (hasParsedDuration && declared > 0 && Math.abs(declared - parsedDurationMs) > 15000) {
        throw recordingError('AUDIO_DURATION_MISMATCH', '錄音長度驗證不一致，請重新錄製');
    }

    return {
        ...accepted,
        byteSize: buffer.length,
        durationMs: verifiedDurationMs,
        durationSource: hasParsedDuration ? 'SERVER_METADATA' : 'CLIENT_TIMER',
        sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    };
}

const LINK_OR_MARKUP = /(?:https?:\/\/|www\.|<[^>]+>|\[[^\]]+\]\([^)]*\)|\b[\w.-]+\.(?:com|net|org|tw|io)\b)/iu;

export function validateCommentContent(value) {
    const content = String(value || '').trim();
    const length = Array.from(content).length;
    if (length < 1 || length > 300) {
        throw recordingError('INVALID_COMMENT_LENGTH', '留言須為 1 至 300 個字');
    }
    if (LINK_OR_MARKUP.test(content)) {
        throw recordingError('COMMENT_LINKS_NOT_ALLOWED', '留言不能包含網址或標記語法');
    }
    return content;
}

export function hashPassageRows(rows) {
    const canonical = rows
        .map(row => `${Number(row.verse)}:${String(row.text || '').trim()}`)
        .join('\n');
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export default {
    normalizePassageInput,
    inspectAudioBuffer,
    validateCommentContent,
    hashPassageRows
};
