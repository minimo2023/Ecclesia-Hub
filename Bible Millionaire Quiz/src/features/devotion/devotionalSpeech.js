import { formatDevotionalMarkdown } from '../../utils/devotionText.js';

const PARAGRAPH_PAUSE_MS = 320;
const SECTION_PAUSE_MS = 760;
const DEFAULT_SPEECH_CHUNK_LENGTH = 88;
const MIN_SPEECH_CHUNK_LENGTH = 28;
const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function numberToChinese(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) return String(value);
    if (number < 10) return CHINESE_DIGITS[number];
    if (number < 100) {
        const tens = Math.floor(number / 10);
        const ones = number % 10;
        return `${tens === 1 ? '' : CHINESE_DIGITS[tens]}十${ones ? CHINESE_DIGITS[ones] : ''}`;
    }
    if (number < 1000) {
        const hundreds = Math.floor(number / 100);
        const remainder = number % 100;
        if (!remainder) return `${CHINESE_DIGITS[hundreds]}百`;
        return `${CHINESE_DIGITS[hundreds]}百${remainder < 10 ? '零' : ''}${numberToChinese(remainder)}`;
    }
    return String(value);
}

export function formatScriptureReferenceForSpeech(value) {
    const reference = markdownToSpeechText(value)
        .replace(/[：﹕]/gu, ':')
        .replace(/[－–—﹣]/gu, '-')
        .trim();
    if (!reference) return '';

    const crossChapter = reference.match(/^(.+?)\s*(\d+)\s*:\s*(\d+)\s*-\s*(\d+)\s*:\s*(\d+)$/u);
    if (crossChapter) {
        const [, book, startChapter, startVerse, endChapter, endVerse] = crossChapter;
        const unit = book.trim().includes('詩篇') ? '篇' : '章';
        return `${book.trim()}第${numberToChinese(startChapter)}${unit}第${numberToChinese(startVerse)}節至第${numberToChinese(endChapter)}${unit}第${numberToChinese(endVerse)}節`;
    }

    const sameChapter = reference.match(/^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/u);
    if (sameChapter) {
        const [, book, chapter, startVerse, endVerse] = sameChapter;
        const unit = book.trim().includes('詩篇') ? '篇' : '章';
        const verseRange = endVerse
            ? `第${numberToChinese(startVerse)}至第${numberToChinese(endVerse)}節`
            : `第${numberToChinese(startVerse)}節`;
        return `${book.trim()}第${numberToChinese(chapter)}${unit}${verseRange}`;
    }

    const chapterOnly = reference.match(/^(.+?)\s+(\d+)$/u);
    if (chapterOnly) {
        const [, book, chapter] = chapterOnly;
        const unit = book.trim().includes('詩篇') ? '篇' : '章';
        return `${book.trim()}第${numberToChinese(chapter)}${unit}`;
    }

    return reference;
}

function markdownToSpeechText(value) {
    return String(value || '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
        .replace(/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/gmu, '')
        .replace(/[*_~`]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
}

/**
 * Browser speech engines can truncate long Chinese utterances. Keep the
 * visual paragraph intact, but feed it to speech synthesis in natural,
 * bounded chunks. The returned chunks preserve every non-edge character.
 */
export function splitDevotionalSpeechText(value, maxLength = DEFAULT_SPEECH_CHUNK_LENGTH) {
    const text = String(value || '').trim();
    if (!text) return [];

    const requestedLength = Number(maxLength);
    const limit = Number.isFinite(requestedLength)
        ? Math.max(MIN_SPEECH_CHUNK_LENGTH, Math.floor(requestedLength))
        : DEFAULT_SPEECH_CHUNK_LENGTH;
    if (text.length <= limit) return [text];

    const strongBoundaries = new Set();
    const softBoundaries = new Set();
    for (let index = 0; index < text.length; index += 1) {
        if ('。！？；'.includes(text[index])) strongBoundaries.add(index + 1);
        else if ('，：、'.includes(text[index])) softBoundaries.add(index + 1);
    }

    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const remaining = text.length - start;
        if (remaining <= limit) {
            chunks.push(text.slice(start));
            break;
        }

        const strictUpper = Math.min(text.length, start + limit);
        // Keep a punctuation mark immediately after the length boundary with
        // its sentence instead of leaving a one-character final utterance.
        const upper = strictUpper < text.length && '。！？；，：、'.includes(text[strictUpper])
            ? strictUpper + 1
            : strictUpper;
        const lower = Math.min(upper, start + MIN_SPEECH_CHUNK_LENGTH);
        const chooseBoundary = boundaries => {
            let selected = -1;
            for (const point of boundaries) {
                if (point >= lower && point <= upper) selected = Math.max(selected, point);
            }
            return selected;
        };

        let end = chooseBoundary(strongBoundaries);
        if (end < 0) end = chooseBoundary(softBoundaries);
        if (end <= start) end = upper;

        chunks.push(text.slice(start, end));
        start = end;
    }

    return chunks.filter(Boolean);
}

export function devotionalParagraphs(value) {
    const formatted = formatDevotionalMarkdown(value);
    if (!formatted) return [];

    return formatted
        .split(/\n{2,}/u)
        .map(markdownToSpeechText)
        .filter(Boolean);
}

function appendSection(segments, { key, label, value, spokenLead = '' }) {
    const paragraphs = devotionalParagraphs(value);

    paragraphs.forEach((paragraph, index) => {
        const isLast = index === paragraphs.length - 1;
        const positionLabel = paragraphs.length > 1 ? `・第 ${index + 1}/${paragraphs.length} 段` : '';
        const prefix = index === 0 ? `${label}。${spokenLead}` : '';

        segments.push({
            id: `${key}-${index}`,
            section: key,
            sectionLabel: label,
            paragraphIndex: index + 1,
            paragraphCount: paragraphs.length,
            statusLabel: `${label}${positionLabel}`,
            speechText: `${prefix}${paragraph}`,
            pauseAfterMs: isLast ? SECTION_PAUSE_MS : PARAGRAPH_PAUSE_MS
        });
    });
}

export function buildDevotionalSpeechSegments(content) {
    if (!content || typeof content !== 'object') return [];

    const segments = [];
    const reference = content.scriptureReference || content.verse_ref || content.reference || '';

    if (content.title) {
        segments.push({
            id: 'title-0',
            section: 'title',
            sectionLabel: '文章標題',
            paragraphIndex: 1,
            paragraphCount: 1,
            statusLabel: '文章標題',
            speechText: `今日靈修。${markdownToSpeechText(content.title)}`,
            pauseAfterMs: SECTION_PAUSE_MS
        });
    }

    appendSection(segments, {
        key: 'scripture',
        label: '今日經文',
        value: content.scripture,
        spokenLead: reference ? `${formatScriptureReferenceForSpeech(reference)}。` : ''
    });
    appendSection(segments, { key: 'understanding', label: '經文小理解', value: content.understanding });
    appendSection(segments, { key: 'meditation', label: '今日默想', value: content.meditation });
    appendSection(segments, { key: 'prayer', label: '今日禱告', value: content.prayer });
    appendSection(segments, { key: 'closing', label: '今日省思', value: content.closingWord });

    return segments;
}
