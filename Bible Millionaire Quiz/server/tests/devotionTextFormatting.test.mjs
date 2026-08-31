import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDevotionalMarkdown } from '../../src/utils/devotionText.js';

test('long devotional prose receives readable paragraphs without changing its words', () => {
    const source = '第一句說明今天所讀經文中的處境，也保留足夠長度讓顯示規則判斷。第二句繼續整理經文帶出的張力，並且沒有預先提供任何換行。第三句將焦點帶回福音的盼望，讓前面的觀察逐步收束。第四句邀請讀者安靜思想，但不替讀者決定應該採取什麼行動。第五句作為最後提醒，使整段文字具有完整而清楚的結尾。';
    const formatted = formatDevotionalMarkdown(source, { targetLength: 70, minimumLength: 30 });

    assert.match(formatted, /\n\n/u);
    assert.equal(formatted.replace(/\n/gu, ''), source);
});

test('single explicit newlines become paragraph boundaries for plain prose', () => {
    const source = '這是第一個既有段落。\n這是第二個既有段落。';
    assert.equal(formatDevotionalMarkdown(source), '這是第一個既有段落。\n\n這是第二個既有段落。');
});

test('markdown lists and short prose keep their original structure', () => {
    const list = '- 第一項\n- 第二項';
    assert.equal(formatDevotionalMarkdown(list), list);
    assert.equal(formatDevotionalMarkdown('這是一段簡短默想。'), '這是一段簡短默想。');
});

