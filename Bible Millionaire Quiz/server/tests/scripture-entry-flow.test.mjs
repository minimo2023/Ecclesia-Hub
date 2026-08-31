import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const selectorSource = readFileSync(
    new URL('../../src/features/scripture-reading/ScriptureBookChapterSelector.jsx', import.meta.url),
    'utf8'
);
const desktopSource = readFileSync(
    new URL('../../src/features/member/ScriptureReader.jsx', import.meta.url),
    'utf8'
);
const mobileSource = readFileSync(
    new URL('../../mobile-app/src/pages/BiblePage.jsx', import.meta.url),
    'utf8'
);

test('desktop and mobile scripture entry share one book and chapter selection flow', () => {
    assert.match(selectorSource, /舊約聖經/);
    assert.match(selectorSource, /新約聖經/);
    assert.match(selectorSource, /onBookToggle\(book\)/);
    assert.match(selectorSource, /onChapterSelect\(expandedInRow, chapter\)/);
    assert.match(desktopSource, /<ScriptureBookChapterSelector[\s\S]*?variant="desktop"/);
    assert.match(mobileSource, /<ScriptureBookChapterSelector[\s\S]*?variant="mobile"/);
});

test('desktop book choices show full names while mobile keeps compact codes', () => {
    assert.match(selectorSource, /const booksPerRow = desktop \? 4 : 5/);
    assert.match(selectorSource, /desktop \? book\.name : book\.code/);
    assert.match(selectorSource, /desktop \? 'whitespace-nowrap' : 'truncate'/);
});

test('plain scripture entry starts at the selector but explicit passage links remain direct', () => {
    assert.match(desktopSource, /useState\(!initialPassage\.book\)/);
    assert.match(mobileSource, /const book = allBooks\.find\([\s\S]*?\|\| null/);
    assert.match(mobileSource, /useState\(!readingPlanScheduleId && !initialSelection\.current\.book\)/);
    assert.match(desktopSource, /handleSelectBookChapter[\s\S]*?setShowBookSelector\(false\)/);
    assert.match(mobileSource, /handleChapterSelect[\s\S]*?setShowSelector\(false\)/);
});

test('reading-plan sessions bypass the selector and retain their assigned passage', () => {
    assert.match(mobileSource, /if \(!readingPlan\.enabled\) return;[\s\S]*?setShowSelector\(false\)/);
    assert.match(mobileSource, /showSelector && !readingPlan\.enabled/);
    assert.match(desktopSource, /if \(!readingPlan\.enabled\) return;[\s\S]*?setShowBookSelector\(false\)/);
});
