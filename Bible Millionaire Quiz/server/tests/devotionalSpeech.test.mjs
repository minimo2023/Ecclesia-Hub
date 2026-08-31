import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildDevotionalSpeechSegments,
    formatScriptureReferenceForSpeech,
    splitDevotionalSpeechText
} from '../../src/features/devotion/devotionalSpeech.js';

test('scripture references are converted to natural spoken Chinese', () => {
    assert.equal(formatScriptureReferenceForSpeech('歌羅西書 1:3-5'), '歌羅西書第一章第三至第五節');
    assert.equal(formatScriptureReferenceForSpeech('約翰福音 3：16'), '約翰福音第三章第十六節');
    assert.equal(formatScriptureReferenceForSpeech('詩篇 23:1-3'), '詩篇第二十三篇第一至第三節');
    assert.equal(formatScriptureReferenceForSpeech('創世記 1:31-2:1'), '創世記第一章第三十一節至第二章第一節');
});

test('devotional speech preserves semantic sections and paragraph positions', () => {
    const segments = buildDevotionalSpeechSegments({
        title: '在盼望中安靜',
        scriptureReference: '歌羅西書 1:3-5',
        scripture: '我們感謝神，也因著盼望彼此相愛。',
        understanding: '這是一段簡短理解。',
        meditation: '第一段先整理生活中的焦慮。\n第二段回到福音所帶來的盼望。',
        prayer: '求祢引導我們。',
        closingWord: '今天可以安靜思想什麼？',
        author: '不應朗讀的作者',
        metadata: { authorType: 'virtual_ai' }
    });

    assert.deepEqual(
        segments.map(segment => segment.section),
        ['title', 'scripture', 'understanding', 'meditation', 'meditation', 'prayer', 'closing']
    );
    assert.equal(segments[3].statusLabel, '今日默想・第 1/2 段');
    assert.equal(segments[4].statusLabel, '今日默想・第 2/2 段');
    assert.match(segments[1].speechText, /今日經文。歌羅西書第一章第三至第五節。/u);
    assert.ok(!segments.some(segment => segment.speechText.includes('不應朗讀的作者')));
    assert.ok(segments[3].pauseAfterMs < segments[4].pauseAfterMs);
});

test('devotional speech excludes absent sections and strips markdown decoration', () => {
    const segments = buildDevotionalSpeechSegments({
        meditation: '**恩典**使人重新得力。'
    });

    assert.equal(segments.length, 1);
    assert.equal(segments[0].speechText, '今日默想。恩典使人重新得力。');
});

test('long devotional speech is divided on natural punctuation without losing its ending', () => {
    const text = '今日默想。第一句用來建立背景，也保留自然停頓。第二句繼續說明經文如何帶來盼望，並且不省略任何內容。最後一句特別重要，結尾的每一個字都必須保留下來。';
    const chunks = splitDevotionalSpeechText(text, 36);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(chunk => chunk.length <= 37));
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.at(-1).endsWith('最後一句特別重要，結尾的每一個字都必須保留下來。'));
});

test('speech chunking preserves spaces when a long sentence has no punctuation', () => {
    const text = 'This devotional sentence deliberately contains spaces and keeps every final word intact';
    const chunks = splitDevotionalSpeechText(text, 30);

    assert.ok(chunks.length > 1);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.at(-1).endsWith('intact'));
});
