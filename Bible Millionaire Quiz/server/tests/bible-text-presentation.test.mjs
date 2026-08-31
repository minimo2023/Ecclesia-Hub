import test from 'node:test';
import assert from 'node:assert/strict';
import {
    presentBibleChapterVerses,
    presentBibleVerse,
    splitFhlBibleMarkup
} from '../domains/content/bible/BibleTextPresentation.js';
import { validateFhlChapterPayload } from '../domains/content/bible/FhlBibleSyncService.js';

test('collapses an intentional merged-verse placeholder into one labelled display row', () => {
    const verses = presentBibleChapterVerses([
        { book: '1 Thessalonians', chapter: 2, verse: 6, text: '第六至七節的合併正文', metadata: { original: '第六至七節的合併正文' } },
        { book: '1 Thessalonians', chapter: 2, verse: 7, text: '', metadata: { verse_status: 'MERGED_WITH_PREVIOUS', merged_into_verse: 6, original: '' } },
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
