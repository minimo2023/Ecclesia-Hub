import test from 'node:test';
import assert from 'node:assert/strict';
import { formatScriptureMemoryCardText } from '../../src/features/scripture-memory/scriptureMemoryCardText.js';

test('memory cards retain visible separators between names', () => {
    assert.equal(formatScriptureMemoryCardText('何弗尼、非尼哈，亞里達古；'), '何弗尼、\u2009非尼哈，\u2009亞里達古');
});

test('memory cards normalize name dots without changing stored Scripture', () => {
    assert.equal(formatScriptureMemoryCardText('提革拉．毘列色。'), '提革拉·毘列色');
});
