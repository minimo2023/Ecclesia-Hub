import test from 'node:test';
import assert from 'node:assert/strict';
import {
    presentBibleChapterVerses,
    presentBibleVerse,
    splitFhlBibleMarkup
} from '../domains/content/bible/BibleTextPresentation.js';
import { validateFhlChapterPayload } from '../domains/content/bible/FhlBibleSyncService.js';

test('collapses an intentional literal-a merged-verse placeholder into one labelled display row', () => {
    const verses = presentBibleChapterVerses([
        { book: '1 Thessalonians', chapter: 2, verse: 6, text: '第六至七節的合併正文', metadata: { original: '第六至七節的合併正文' } },
        { book: '1 Thessalonians', chapter: 2, verse: 7, text: 'a', metadata: { verse_status: 'MERGED_WITH_PREVIOUS', merged_into_verse: 6 } },
        { book: '1 Thessalonians', chapter: 2, verse: 8, text: '第八節正文', metadata: { original: '第八節正文' } }
    ]);

    assert.equal(verses.length, 2);
    assert.deepEqual(verses[0], {
        book: '1 Thessalonians',
        chapter: 2,
        verse: 6,
        text: '第六至七節的合併正文',
        sectionHeadings: [],
        lineBreakAfter: false,
        paragraphBreakAfter: false,
        verseStart: 6,
        verseEnd: 7,
        verseLabel: '6–7',
        coveredVerses: [6, 7],
        isMergedVerse: true
    });
    assert.equal(verses[1].verseLabel, '8');
    assert.deepEqual(verses[1].coveredVerses, [8]);
});

test('does not hide an empty verse unless explicit merge metadata is valid', () => {
    const verses = presentBibleChapterVerses([
        { verse: 1, text: '正文' },
        { verse: 2, text: '' }
    ]);

    assert.equal(verses.length, 2);
    assert.equal(verses[1].verseLabel, '2');
    assert.equal(verses[1].isMergedVerse, false);
});

test('separates an FHL heading from CNV verse text without guessing words', () => {
    const original = '<h3>耶和華是好牧人 （大衛的詩。）</h3>耶和華是我的牧人，我必不會缺乏。（本節在《馬索拉抄本》包括細字標題）';
    const presented = presentBibleVerse({
        text: '耶和華是好牧人 （大衛的詩。）耶和華是我的牧人，我必不會缺乏。（本節在《馬索拉抄本》包括細字標題）',
        metadata: { original }
    });

    assert.deepEqual(presented.sectionHeadings, ['耶和華是好牧人 （大衛的詩。）']);
    assert.equal(presented.text, '耶和華是我的牧人，我必不會缺乏。');
});

test('keeps TCV line breaks in the verse body while removing the heading from the verse', () => {
    const original = '<h2>上主是我的牧者<br/>\n</h2> 上主是我的牧者；\n<br/>我一無缺乏。\n<br/>';
    const split = splitFhlBibleMarkup(original);

    assert.deepEqual(split.sectionHeadings, ['上主是我的牧者']);
    assert.equal(split.text, '上主是我的牧者；\n我一無缺乏。');
    assert.equal(split.lineBreakAfter, true);
    assert.equal(split.paragraphBreakAfter, false);
});

test('preserves a real double-br paragraph without treating source formatting newlines as paragraphs', () => {
    const split = splitFhlBibleMarkup('第一行，\n<br/>第二行。\n<br/>\n<br/>');

    assert.equal(split.text, '第一行，\n第二行。');
    assert.equal(split.lineBreakAfter, true);
    assert.equal(split.paragraphBreakAfter, true);
});

test('moves a leading FHL collection label out of canonical verse text', () => {
    const presented = presentBibleVerse({
        text: '第一卷真正有福的人不聽從惡人的計謀',
        metadata: { original: '<b>第一卷</b><br/><h2>真正有福的人</h2>不聽從惡人的計謀。<br/>' }
    });

    assert.deepEqual(presented.sectionHeadings, ['第一卷', '真正有福的人']);
    assert.equal(presented.text, '不聽從惡人的計謀。');
    assert.equal(presented.lineBreakAfter, true);
});

test('does not alter ordinary scripture that has no heading markup', () => {
    const presented = presentBibleVerse({
        text: '耶和華是我的牧者，我必不致缺乏。',
        metadata: { original: '耶和華是我的牧者，我必不致缺乏。' }
    });

    assert.deepEqual(presented.sectionHeadings, []);
    assert.equal(presented.text, '耶和華是我的牧者，我必不致缺乏。');
});

test('new FHL sync payload stores the heading separately from canonical verse text', () => {
    const verses = validateFhlChapterPayload({
        status: 'success',
        record: [{
            sec: 1,
            bible_text: '<h2>上主是我的牧者</h2>上主是我的牧者；<br/>我一無缺乏。'
        }]
    }, { book: 'Psalms', chapter: 23, sourceVersion: 'tcv2019' });

    assert.deepEqual(verses, [{
        verse: 1,
        text: '上主是我的牧者；\n我一無缺乏。',
        sectionHeadings: ['上主是我的牧者'],
        lineBreakAfter: false,
        paragraphBreakAfter: false
    }]);
});

test('marks a contiguous tcv2019 placeholder run as one merged verse range', () => {
    const verses = validateFhlChapterPayload({
        status: 'success',
        record: [
            { sec: 38, bible_text: '第三十八至四十節的合併正文' },
            { sec: 39, bible_text: 'a' },
            { sec: 40, bible_text: 'a' },
            { sec: 41, bible_text: '第四十一節正文' }
        ]
    }, { book: '1 Chronicles', chapter: 1, sourceVersion: 'tcv2019' });

    assert.equal(verses[0].verseStatus, 'MERGED_RANGE_ANCHOR');
    assert.equal(verses[0].mergedVerseEnd, 40);
    assert.equal(verses[1].verseStatus, 'MERGED_WITH_PREVIOUS');
    assert.equal(verses[1].mergedIntoVerse, 38);
    assert.equal(verses[2].verseStatus, 'MERGED_WITH_PREVIOUS');
    assert.equal(verses[2].mergedIntoVerse, 38);
    assert.equal(verses[3].verseStatus, undefined);
});

test('rejects a tcv2019 placeholder that has no preceding anchor', () => {
    assert.throws(
        () => validateFhlChapterPayload({
            status: 'success',
            record: [
                { sec: 1, bible_text: 'a' },
                { sec: 2, bible_text: '第二節正文' }
            ]
        }, { book: 'Example', chapter: 1, sourceVersion: 'tcv2019' }),
        /FHL_ORPHAN_MERGED_VERSE:Example:1:1/
    );
});

test('does not reinterpret literal a in an unsupported FHL source version', () => {
    const verses = validateFhlChapterPayload({
        status: 'success',
        record: [{ sec: 1, bible_text: 'a' }]
    }, { book: 'Example', chapter: 1, sourceVersion: 'kjv' });

    assert.equal(verses[0].text, 'a');
    assert.equal(verses[0].verseStatus, undefined);
});

test('recognizes literal-a merged verses in unv and lcc sources', () => {
    for (const sourceVersion of ['unv', 'lcc']) {
        const verses = validateFhlChapterPayload({
            status: 'success',
            record: [
                { sec: 17, bible_text: '第十七至十八節的合併正文' },
                { sec: 18, bible_text: 'a' }
            ]
        }, { book: '1 Chronicles', chapter: 4, sourceVersion });

        assert.equal(verses[0].verseStatus, 'MERGED_RANGE_ANCHOR');
        assert.equal(verses[0].mergedVerseEnd, 18);
        assert.equal(verses[1].verseStatus, 'MERGED_WITH_PREVIOUS');
        assert.equal(verses[1].mergedIntoVerse, 17);
    }
});

test('recognizes an empty ncv merged verse without treating it as an arbitrary blank', () => {
    const verses = validateFhlChapterPayload({
        status: 'success',
        record: [
            { sec: 6, bible_text: '第六至七節的合併正文' },
            { sec: 7, bible_text: '' },
            { sec: 8, bible_text: '第八節正文' }
        ]
    }, { book: '1 Thessalonians', chapter: 2, sourceVersion: 'ncv' });

    assert.equal(verses[0].verseStatus, 'MERGED_RANGE_ANCHOR');
    assert.equal(verses[1].verseStatus, 'MERGED_WITH_PREVIOUS');
    assert.equal(verses[1].mergedIntoVerse, 6);
});

test('keeps a tcv2019 heading-only source omission separate from merged verses', () => {
    const verses = validateFhlChapterPayload({
        status: 'success',
        record: [
            { sec: 1, bible_text: '<h2>抵抗非利士人</h2>' },
            { sec: 2, bible_text: '第二節正文' }
        ]
    }, { book: '1 Samuel', chapter: 13, sourceVersion: 'tcv2019' });

    assert.equal(verses[0].verseStatus, 'SOURCE_TEXT_UNAVAILABLE');
    assert.equal(verses[0].text, '');
    assert.deepEqual(verses[0].sectionHeadings, ['抵抗非利士人']);
    assert.equal(verses[1].verseStatus, undefined);
});

test('moves a source-unavailable verse heading to the next readable verse', () => {
    const verses = presentBibleChapterVerses([
        {
            verse: 1,
            text: '',
            metadata: {
                verse_status: 'SOURCE_TEXT_UNAVAILABLE',
                section_headings: ['抵抗非利士人']
            }
        },
        { verse: 2, text: '第二節正文' }
    ]);

    assert.equal(verses.length, 1);
    assert.equal(verses[0].verse, 2);
    assert.equal(verses[0].text, '第二節正文');
    assert.deepEqual(verses[0].sectionHeadings, ['抵抗非利士人']);
});

test('moves a merged-placeholder heading to the following readable verse', () => {
    const verses = presentBibleChapterVerses([
        { verse: 20, text: '第二十至二十一節合併正文' },
        {
            verse: 21,
            text: 'a',
            metadata: {
                verse_status: 'MERGED_WITH_PREVIOUS',
                merged_into_verse: 20,
                section_headings: ['最後的話']
            }
        },
        { verse: 22, text: '第二十二節正文' }
    ]);

    assert.equal(verses.length, 2);
    assert.equal(verses[0].verseLabel, '20–21');
    assert.deepEqual(verses[1].sectionHeadings, ['最後的話']);
});

test('marks and hides an FHL footnote-only source artifact', () => {
    const synced = validateFhlChapterPayload({
        status: 'success',
        record: [
            { sec: 35, bible_text: '第三十五節正文' },
            { sec: 36, bible_text: '【3】』' },
            { sec: 37, bible_text: '第三十七節正文' }
        ]
    }, { book: 'Luke', chapter: 17, sourceVersion: 'lcc' });
    assert.equal(synced[1].verseStatus, 'NON_SCRIPTURE_ARTIFACT');

    const presented = presentBibleChapterVerses(synced.map(item => ({
        verse: item.verse,
        text: item.text,
        metadata: { verse_status: item.verseStatus }
    })));
    assert.deepEqual(presented.map(item => item.verse), [35, 37]);
});
