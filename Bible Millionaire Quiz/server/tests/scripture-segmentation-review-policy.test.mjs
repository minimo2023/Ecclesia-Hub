import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { splitVerseForOrder, splitVersesForOrder, verifyFragments } from '../domains/scripture-tools/order-engine.js';
import {
    decideSegmentationAiReview,
    scriptureSegmentationReviewConfig,
    withSoftDeadline
} from '../domains/scripture-tools/segmentation-review-policy.js';

function config(overrides = {}) {
    return {
        enabled: true,
        maxReviewVerses: 5,
        maxInputTokens: 1200,
        softDeadlineMs: 4000,
        hardTimeoutMs: 7000,
        dailyRequestCap: 20,
        ...overrides
    };
}

test('R1 only uncached low-confidence verses are eligible for AI review', () => {
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: [], estimatedInputTokens: 100, dailyRequestCount: 0, config: config()
    }).reason, 'NO_UNCACHED_LOW_CONFIDENCE_VERSES');
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: [{ verse: 1 }], estimatedInputTokens: 100, dailyRequestCount: 0, config: config()
    }).allowed, true);
});

test('R2 allows five low-confidence verses but rejects six', () => {
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: Array.from({ length: 5 }), estimatedInputTokens: 100,
        dailyRequestCount: 0, config: config()
    }).allowed, true);
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: Array.from({ length: 6 }), estimatedInputTokens: 100,
        dailyRequestCount: 0, config: config()
    }).reason, 'REVIEW_VERSE_LIMIT_EXCEEDED');
});

test('R3 allows exactly 1200 estimated tokens but rejects 1201', () => {
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: [{}], estimatedInputTokens: 1200,
        dailyRequestCount: 0, config: config()
    }).allowed, true);
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: [{}], estimatedInputTokens: 1201,
        dailyRequestCount: 0, config: config()
    }).reason, 'REVIEW_TOKEN_LIMIT_EXCEEDED');
});

test('R4 soft deadline returns control while the underlying review can continue', async () => {
    const delayed = new Promise(resolve => setTimeout(() => resolve('done'), 30));
    const immediate = await withSoftDeadline(delayed, 5);
    assert.deepEqual(immediate, { completed: false, reason: 'SOFT_DEADLINE_REACHED' });
    assert.equal(await delayed, 'done');

    const service = await readFile(new URL('../domains/scripture-tools/segmentation-review-service.js', import.meta.url), 'utf8');
    assert.match(service, /maxQueueWaitMs: config\.softDeadlineMs/u);
    assert.match(service, /requestTimeoutMs: config\.hardTimeoutMs/u);
    assert.match(service, /AI_TIMEOUT_FALLBACK/u);
});

test('R5 daily quota stops at the configured 20 percent-derived cap', () => {
    const derived = scriptureSegmentationReviewConfig({
        GEMINI_FREE_DAILY_REQUEST_LIMIT: '100',
        SCRIPTURE_SEGMENTATION_AI_FREE_QUOTA_SHARE: '0.20'
    });
    assert.equal(derived.dailyRequestCap, 20);
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: [{}], estimatedInputTokens: 100,
        dailyRequestCount: 19, config: derived
    }).allowed, true);
    assert.equal(decideSegmentationAiReview({
        lowConfidenceVerses: [{}], estimatedInputTokens: 100,
        dailyRequestCount: 20, config: derived
    }).reason, 'REVIEW_DAILY_QUOTA_REACHED');
});

test('R6 machine segmentation is exact per verse and short Amen is attached backward', () => {
    const source = '因為國度、權柄、榮耀，全是你的，直到永遠。阿們。';
    const result = splitVerseForOrder(source);
    assert.equal(result.fragments.join(''), source);
    assert.match(result.fragments.at(-1), /阿們。$/u);

    const verses = [
        { verse: 1, text: '耶和華是我的牧者，我必不致缺乏。' },
        { verse: 2, text: '他使我躺臥在青草地上，領我在可安歇的水邊。' }
    ];
    const passage = splitVersesForOrder(verses);
    assert.equal(verifyFragments(verses.map(verse => verse.text).join(''), passage.fragments), true);
    assert.deepEqual(passage.perVerse.map(verse => verse.fragments.join('')), verses.map(verse => verse.text));
});

test('segmentation storage includes per-verse cache and persistent daily request accounting', async () => {
    const schema = await readFile(new URL('../database/schemas/scripture_order_lab.js', import.meta.url), 'utf8');
    assert.match(schema, /scripture_order_segmentation_cache/u);
    assert.match(schema, /source_hash TEXT NOT NULL/u);
    assert.match(schema, /rule_version TEXT NOT NULL/u);
    assert.match(schema, /scripture_order_segmentation_ai_usage/u);
    assert.match(schema, /scripture_order_segmentation_ai_requests/u);
});
