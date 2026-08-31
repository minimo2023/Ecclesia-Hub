function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

export function normalizeFhlMarkupText(rawText) {
    if (typeof rawText !== 'string') return '';
    return decodeHtmlEntities(rawText)
        // FHL 原始 JSON 內的換行多為 HTML 排版空白；<br> 才是譯本的內容換行。
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]*\n[ \t]*/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        // 單換行是詩行，雙換行是原始譯本的段落，不將兩者混在一起。
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function splitFhlBibleMarkup(rawText) {
    if (typeof rawText !== 'string') {
        return { text: '', sectionHeadings: [], lineBreakAfter: false, paragraphBreakAfter: false };
    }
    const sectionHeadings = [];
    let bodyMarkup = rawText.replace(/^\s*<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)\s*>\s*(?:<br\s*\/?>\s*)?/i, (_match, headingMarkup) => {
        const heading = normalizeFhlMarkupText(headingMarkup).replace(/\s*\n\s*/g, ' ').trim();
        if (heading) sectionHeadings.push(heading);
        return '';
    });
    bodyMarkup = bodyMarkup.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_match, _level, headingMarkup) => {
        const heading = normalizeFhlMarkupText(headingMarkup).replace(/\s*\n\s*/g, ' ').trim();
        if (heading) sectionHeadings.push(heading);
        return '';
    });
    const trailingBreakMarkup = bodyMarkup.match(/((?:<br\s*\/?>\s*)+)$/i)?.[1] || '';
    const trailingBreakCount = trailingBreakMarkup.match(/<br\s*\/?>/gi)?.length || 0;
    return {
        text: normalizeFhlMarkupText(bodyMarkup),
        sectionHeadings,
        lineBreakAfter: trailingBreakCount >= 1,
        paragraphBreakAfter: trailingBreakCount >= 2
    };
}

export function cleanBibleDisplayText(text) {
    if (!text) return '';
    return String(text)
        .replace(/\{[^}]*\}/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/（[^）]*）/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/［[^］]*］/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();
}

function parseMetadata(metadata) {
    if (!metadata) return {};
    if (typeof metadata === 'object') return metadata;
    try { return JSON.parse(metadata); } catch { return {}; }
}

function positiveVerseNumber(value) {
    const verse = Number(value);
    return Number.isInteger(verse) && verse > 0 ? verse : null;
}

export function presentBibleVerse({ text, metadata } = {}) {
    const parsedMetadata = parseMetadata(metadata);
    let bodyText = String(text || '');
    let sectionHeadings = Array.isArray(parsedMetadata.section_headings)
        ? parsedMetadata.section_headings.map(normalizeFhlMarkupText).filter(Boolean)
        : [];
    let lineBreakAfter = parsedMetadata.line_break_after === true;
    let paragraphBreakAfter = parsedMetadata.paragraph_break_after === true;

    if (typeof parsedMetadata.original === 'string') {
        const split = splitFhlBibleMarkup(parsedMetadata.original);
        if (split.text) bodyText = split.text;
        if (split.sectionHeadings.length) sectionHeadings = split.sectionHeadings;
        lineBreakAfter = split.lineBreakAfter;
        paragraphBreakAfter = split.paragraphBreakAfter;
    }

    return {
        text: cleanBibleDisplayText(bodyText),
        sectionHeadings: [...new Set(sectionHeadings)],
        lineBreakAfter,
        paragraphBreakAfter
    };
}

/**
 * 將上游以空白節保留的「合併節」轉成單一可呈現列。
 *
 * 原始資料仍保留每個正典節號；公開呈現則以 6–7 這類標籤顯示，
 * 避免畫面產生空白節，也讓選取、朗讀與分享能知道實際涵蓋範圍。
 */
export function presentBibleChapterVerses(rows = []) {
    const presentedRows = (Array.isArray(rows) ? rows : []).map(row => {
        const verse = positiveVerseNumber(row?.verse);
        const metadata = parseMetadata(row?.metadata);
        const presentation = presentBibleVerse(row);
        const { metadata: _metadata, ...publicRow } = row || {};
        return {
            ...publicRow,
            ...presentation,
            verse,
            verseStart: verse,
            verseEnd: verse,
            verseLabel: verse ? String(verse) : '',
            coveredVerses: verse ? [verse] : [],
            isMergedVerse: false,
            _mergeStatus: metadata.verse_status,
            _mergedIntoVerse: positiveVerseNumber(metadata.merged_into_verse)
        };
    });

    const rowsByVerse = new Map(
        presentedRows
            .filter(row => row.verse)
            .map(row => [row.verse, row])
    );
    const hiddenPlaceholders = new Set();

    for (const row of presentedRows) {
        if (row._mergeStatus !== 'MERGED_WITH_PREVIOUS' || !row._mergedIntoVerse) continue;
        const target = rowsByVerse.get(row._mergedIntoVerse);
        if (!target || !row.verse || row.verse <= target.verseStart) continue;

        target.verseEnd = Math.max(target.verseEnd, row.verse);
        target.coveredVerses = [...new Set([...target.coveredVerses, row.verse])].sort((a, b) => a - b);
        target.verseLabel = `${target.verseStart}–${target.verseEnd}`;
        target.isMergedVerse = true;
        target.lineBreakAfter = target.lineBreakAfter || row.lineBreakAfter;
        target.paragraphBreakAfter = target.paragraphBreakAfter || row.paragraphBreakAfter;
        hiddenPlaceholders.add(row.verse);
    }

    return presentedRows
        .filter(row => !hiddenPlaceholders.has(row.verse))
        .map(({ _mergeStatus, _mergedIntoVerse, ...row }) => row);
}

export default {
    normalizeFhlMarkupText,
    splitFhlBibleMarkup,
    cleanBibleDisplayText,
    presentBibleVerse,
    presentBibleChapterVerses
};
