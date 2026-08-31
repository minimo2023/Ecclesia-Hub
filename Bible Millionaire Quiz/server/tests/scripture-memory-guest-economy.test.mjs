import test from 'node:test';
import assert from 'node:assert/strict';
import {
    GUEST_SCRIPTURE_MEMORY_REWARDS_KEY,
    recordGuestScriptureMemoryReward
} from '../../src/features/scripture-memory/guestScriptureMemoryEconomy.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

function orderSession(overrides = {}) {
    return {
        id: 'order-session-1',
        status: 'active',
        fragmentIndex: 1,
        fragmentCount: 4,
        mistakes: 0,
        passage: {
            version: 'CUV_TRAD',
            book: 'Psalms',
            chapter: 23,
            verseStart: 1,
            verseEnd: 1
        },
        ...overrides
    };
}

const today = new Date('2026-08-29T02:00:00+08:00');

test('guest memory rewards one coin per verified fragment and remains idempotent', () => {
    const storage = memoryStorage();
    const first = recordGuestScriptureMemoryReward({ session: orderSession(), storage, now: today, balance: 3 });
    assert.equal(first.awardedCoins, 1);
    assert.equal(first.balance, 4);
    assert.equal(first.localOnly, true);

    const duplicate = recordGuestScriptureMemoryReward({ session: orderSession(), storage, now: today, balance: 4 });
    assert.equal(duplicate.awardedCoins, 0);

    const second = recordGuestScriptureMemoryReward({
        session: orderSession({ fragmentIndex: 2 }), storage, now: today, balance: 4
    });
    assert.equal(second.awardedCoins, 1);
    assert.equal(second.coins, 2);
});

test('guest completion uses the exact shared reward formula including bonuses', () => {
    const storage = memoryStorage();
    recordGuestScriptureMemoryReward({
        session: orderSession({ fragmentIndex: 2 }), storage, now: today
    });
    const completed = recordGuestScriptureMemoryReward({
        session: orderSession({
            status: 'completed',
            fragmentIndex: 4,
            lastStageResult: { durationMs: 10_000 }
        }),
        storage,
        now: today,
        balance: 2
    });
    assert.equal(completed.breakdown.correctCoins, 4);
    assert.equal(completed.breakdown.completionCoins, 1);
    assert.equal(completed.breakdown.timeBonus, 2);
    assert.equal(completed.breakdown.uninterruptedBonus, 1);
    assert.equal(completed.coins, 8);
    assert.equal(completed.awardedCoins, 6);
    assert.equal(completed.balance, 8);
});

test('the first guest session owns the exact range across both memory games for the Taipei day', () => {
    const storage = memoryStorage();
    recordGuestScriptureMemoryReward({ session: orderSession(), storage, now: today });

    const replay = recordGuestScriptureMemoryReward({
        session: orderSession({ id: 'rain-session-2', currentIndex: 1, fragmentIndex: undefined }),
        game: 'rain',
        storage,
        now: today
    });
    assert.equal(replay.awarded, false);
    assert.equal(replay.awardedCoins, 0);
    assert.equal(replay.reason, 'RANGE_ALREADY_REWARDED_TODAY');
});

test('a different range remains eligible and claims are session scoped', () => {
    const storage = memoryStorage();
    recordGuestScriptureMemoryReward({ session: orderSession(), storage, now: today });
    const other = recordGuestScriptureMemoryReward({
        session: orderSession({
            id: 'order-session-2',
            passage: { ...orderSession().passage, verseEnd: 2 }
        }),
        storage,
        now: today
    });
    assert.equal(other.awardedCoins, 1);
    const claims = JSON.parse(storage.getItem(GUEST_SCRIPTURE_MEMORY_REWARDS_KEY));
    assert.equal(Object.keys(claims).length, 2);
});
