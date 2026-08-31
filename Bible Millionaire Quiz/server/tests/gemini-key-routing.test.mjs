import assert from 'node:assert/strict';
import test from 'node:test';

import { selectGeminiKeyForPolicy } from '../infrastructure/ai/gemini-client.js';

const key = (poolType, index, overrides = {}) => ({
    key: `${poolType}-${index}`,
    poolType,
    index,
    cooldownUntil: 0,
    lastUsedAt: 0,
    ...overrides
});

test('free-preferred work uses a ready free key before a paid key', () => {
    const selected = selectGeminiKeyForPolicy([
        key('paid', 0),
        key('free', 1),
        key('free', 2)
    ], { now: 100000, priority: true, freePreferred: true });

    assert.equal(selected.poolType, 'free');
    assert.equal(selected.index, 1);
});

test('free-preferred work waits briefly for free pacing instead of spending immediately', () => {
    const selected = selectGeminiKeyForPolicy([
        key('paid', 0),
        key('free', 1, { lastUsedAt: 99000 })
    ], { now: 100000, priority: true, freePreferred: true });

    assert.equal(selected.poolType, 'free');
});

test('free-preferred work falls back to paid when free quota is unavailable for a long time', () => {
    const selected = selectGeminiKeyForPolicy([
        key('free', 1, { cooldownUntil: 200000 }),
        key('free', 2, { cooldownUntil: 220000 }),
        key('paid', 0)
    ], { now: 100000, priority: true, freePreferred: true });

    assert.equal(selected.poolType, 'paid');
});

test('paid-only review never selects a free key', () => {
    const selected = selectGeminiKeyForPolicy([
        key('free', 1),
        key('paid', 0)
    ], { now: 100000, paidOnly: true, freePreferred: true });

    assert.equal(selected.poolType, 'paid');
});

test('free-only review never selects a paid key and balances free projects by least recent use', () => {
    const selected = selectGeminiKeyForPolicy([
        key('paid', 0),
        key('free', 1, { lastUsedAt: 99000 }),
        key('free', 2, { lastUsedAt: 1000 }),
        key('free', 3, { lastUsedAt: 5000 })
    ], { now: 100000, priority: true, freeOnly: true });

    assert.equal(selected.poolType, 'free');
    assert.equal(selected.index, 2);
});

test('free-only review waits for a free project instead of falling back to paid', () => {
    const selected = selectGeminiKeyForPolicy([
        key('paid', 0),
        key('free', 1, { cooldownUntil: 200000 }),
        key('free', 2, { cooldownUntil: 220000 })
    ], { now: 100000, priority: true, freeOnly: true });

    assert.equal(selected.poolType, 'free');
    assert.equal(selected.index, 1);
});

test('conflicting strict key policies select no key', () => {
    const selected = selectGeminiKeyForPolicy([
        key('paid', 0),
        key('free', 1)
    ], { now: 100000, paidOnly: true, freeOnly: true });

    assert.equal(selected, null);
});
