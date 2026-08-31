import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    summarizeVerseSelection,
    toggleVerseGroupSelection
} from '../../mobile-app/src/utils/verseSelection.js';

test('a merged verse row selects and clears every covered verse as one unit', () => {
    const selected = toggleVerseGroupSelection([], [6, 7]);
    assert.deepEqual(selected, [6, 7]);
    assert.deepEqual(summarizeVerseSelection(selected), {
        start: 6,
        end: 7,
        count: 2,
        verses: [6, 7],
        isContiguous: true
    });
    assert.deepEqual(toggleVerseGroupSelection(selected, [6, 7]), []);
});

test('a partially selected merged verse row becomes fully selected', () => {
    assert.deepEqual(toggleVerseGroupSelection([6], [6, 7]), [6, 7]);
});

test('desktop scripture reader supports click, shift and pointer-drag verse selection', async () => {
    const source = await readFile(new URL('../../src/features/member/ScriptureReader.jsx', import.meta.url), 'utf8');
    assert.match(source, /event\?\.shiftKey/);
    assert.match(source, /onPointerDown=\{event => startSelectionGesture\(v, event\)\}/);
    assert.match(source, /onPointerMove=\{moveSelectionGesture\}/);
    assert.match(source, /data-verse-end=\{v\.verseEnd \?\? verseNumber\}/);
    assert.match(source, /拖曳可連續選取/);
});
