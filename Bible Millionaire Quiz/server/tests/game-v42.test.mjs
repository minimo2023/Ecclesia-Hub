import test from 'node:test';
import assert from 'node:assert/strict';

import { generateAnswerToken, verifyAnswerToken } from '../utils/tokenHandler.js';
import { selectBalancedDifficultyHand } from '../domains/game/engine/QuizEngine.js';
import roomManager from '../socket/roomManager.js';

test('answer token is opaque, authenticated and rejects the old JWT shape', () => {
    const payload = { id: 'q-1', revisionId: 'rev-1', answer: '耶穌', correctIndex: 2 };
    const token = generateAnswerToken(payload);
    assert.match(token, /^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(token.split('.').length, 4);
    assert.equal(token.includes('耶穌'), false);
    assert.equal(verifyAnswerToken(token).answer, '耶穌');

    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    assert.equal(verifyAnswerToken(tampered), null);
    assert.equal(verifyAnswerToken('eyJhbGciOiJIUzI1NiJ9.eyJhbnN3ZXIiOiJhIn0.signature'), null);
});

const makePool = (bookCount) => {
    const bands = { EASY: 8, MEDIUM: 8, HARD: 5, VERY_HARD: 4 };
    const scores = { EASY: 20, MEDIUM: 50, HARD: 75, VERY_HARD: 95 };
    const pool = [];
    for (let bookIndex = 0; bookIndex < bookCount; bookIndex += 1) {
        for (const [band, perBook] of Object.entries(bands)) {
            for (let index = 0; index < perBook; index += 1) {
                pool.push({
                    id: `${bookIndex}-${band}-${index}`,
                    book: `書卷${bookIndex}`,
                    question: `題目${bookIndex}-${band}-${index}`,
                    answer: `答案${index}`,
                    semantic_group_key: `semantic-${bookIndex}-${band}-${index}`,
                    _jitScore: scores[band]
                });
            }
        }
    }
    return pool;
};

for (const bookCount of [2, 27, 39, 66]) {
    test(`${bookCount} books produce an exact 5/7/3 balanced hand without difficulty substitution`, () => {
        const result = selectBalancedDifficultyHand(makePool(bookCount), 15, items => items, () => 0);
        assert.deepEqual(result.shortages, {});
        assert.deepEqual(result.substitutions, {});
        assert.deepEqual(result.targets, { EASY: 5, MEDIUM: 7, HIGH: 3 });
        assert.deepEqual(result.highDifficultyMix, { HARD: 3, VERY_HARD: 0 });
        const scores = result.questions.map(question => question._jitScore);
        assert.deepEqual(scores, [20, 20, 20, 20, 20, 50, 50, 50, 50, 50, 50, 50, 75, 75, 75]);
        assert.equal(new Set(result.questions.map(question => question.semantic_group_key)).size, 15);
    });
}

test('a missing VERY_HARD band falls back to HARD within the shared HIGH target', () => {
    const pool = makePool(2).filter(question => question._jitScore !== 95);
    const result = selectBalancedDifficultyHand(pool, 15, items => items, () => 0.99);
    assert.deepEqual(result.shortages, {});
    assert.deepEqual(result.substitutions, {});
    assert.deepEqual(result.highDifficultyMix, { HARD: 3, VERY_HARD: 0 });
    assert.equal(result.questions.length, 15);
});

test('a genuinely undersized pool reports the unfilled HIGH target', () => {
    const pool = makePool(2)
        .filter(question => question._jitScore <= 50)
        .slice(0, 12);
    const result = selectBalancedDifficultyHand(pool, 15, items => items, () => 0);
    assert.equal(result.shortages.HIGH.missing, 3);
    assert.equal(result.questions.length, 12);
});

test('host can resume before 90 seconds and the room expires at the deadline', () => {
    const created = roomManager.createRoom('host-old', { books: [] });
    const paused = roomManager.handlePlayerDisconnect('host-old');
    assert.equal(paused.hostGrace, true);
    assert.equal(roomManager.expireDisconnectedHost(created.code, paused.expiresAt - 1), false);
    const resumed = roomManager.resumeHost(created.code, created.hostResumeToken, 'host-new');
    assert.equal(resumed.success, true);
    assert.equal(resumed.room.hostConnected, true);
    assert.equal(roomManager.expireDisconnectedHost(created.code, paused.expiresAt), false);
    roomManager.closeRoom(created.code);

    const expiring = roomManager.createRoom('host-expire', { books: [] });
    const expiringPause = roomManager.handlePlayerDisconnect('host-expire');
    assert.equal(roomManager.expireDisconnectedHost(expiring.code, expiringPause.expiresAt), true);
    assert.equal(roomManager.getRoom(expiring.code), undefined);
});
