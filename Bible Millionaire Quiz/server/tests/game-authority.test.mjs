import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyCoinDeltaTx, EconomyError } from '../domains/economy/AssetLedgerService.js';
import { isVerifiedAnswerCorrect } from '../utils/answerVerification.js';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

class FakeTransaction {
    constructor(balance = 10) {
        this.balance = balance;
        this.assets = new Map();
    }

    async get(sql, params) {
        if (sql.includes('SELECT coins FROM users')) return { coins: this.balance };
        if (sql.includes('FROM asset_ledger')) {
            const row = this.assets.get(params[0]);
            return row ? { delta: row.delta, balanceAfter: row.balance } : undefined;
        }
        return undefined;
    }

    async run(sql, params) {
        if (sql.startsWith('UPDATE users SET coins')) this.balance = Number(params[0]);
        if (sql.includes('INSERT INTO asset_ledger')) {
            this.assets.set(params[4], { delta: Number(params[1]), balance: Number(params[5]) });
        }
        return { rowCount: 1, changes: 1 };
    }
}

test('answer verification handles text, index, letters, and timeout safely', () => {
    const decoded = { answer: '摩西', correctIndex: 2 };
    assert.equal(isVerifiedAnswerCorrect(decoded, '摩西'), true);
    assert.equal(isVerifiedAnswerCorrect(decoded, 2), true);
    assert.equal(isVerifiedAnswerCorrect(decoded, 'C'), true);
    assert.equal(isVerifiedAnswerCorrect(decoded, 'A'), false);
    assert.equal(isVerifiedAnswerCorrect(decoded, null), false);
});

test('ten repeated asset writes with one idempotency key credit only once', async () => {
    const tx = new FakeTransaction(10);
    const results = [];
    for (let index = 0; index < 10; index += 1) {
        results.push(await applyCoinDeltaTx(tx, {
            userId: 'member-1',
            delta: 5,
            reasonCode: 'test_reward',
            sourceId: 'session-1',
            idempotencyKey: 'game:session:session-1:coins'
        }));
    }
    assert.equal(tx.balance, 15);
    assert.equal(results.filter((result) => !result.duplicate).length, 1);
    assert.equal(results.filter((result) => result.duplicate).length, 9);
});

test('a spend cannot make the balance negative', async () => {
    const tx = new FakeTransaction(3);
    await assert.rejects(
        () => applyCoinDeltaTx(tx, {
            userId: 'member-1',
            delta: -4,
            reasonCode: 'test_spend',
            idempotencyKey: 'spend:test-1'
        }),
        (error) => error instanceof EconomyError && error.code === 'INSUFFICIENT_COINS'
    );
    assert.equal(tx.balance, 3);
});

test('server-owned game schema and routes enforce the trust boundary', () => {
    const schema = read('../database/schemas/users_core.js');
    const gameRoutes = read('../domains/game/game.routes.js');
    const achievements = read('../domains/members/achievements.routes.js');
    const rewards = read('../domains/game/rewards/GameRewardService.js');
    const socket = read('../socket/index.js');
    const quizRoutes = read('../domains/game/quiz.routes.js');
    const questionService = read('../../src/features/game/services/questions/QuestionService.js');

    ['asset_ledger', 'game_reward_sessions', 'game_reward_attempts', 'multiplayer_prize_pools']
        .forEach((table) => assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)));
    assert.ok(schema.includes('UNIQUE(user_id, client_session_key)'));
    assert.ok(schema.includes('idempotency_key TEXT NOT NULL UNIQUE'));
    assert.ok(rewards.includes('FOR UPDATE'));
    assert.ok(rewards.includes('SELECT id, user_id, status, expires_at, mode'));
    assert.ok(rewards.includes('QUESTION_NOT_ISSUED'));
    assert.ok(gameRoutes.includes("router.put('/users/coins', authenticateToken, retiredClientAuthority)"));
    assert.ok(gameRoutes.includes("router.put('/users/stats', authenticateToken, retiredClientAuthority)"));
    assert.ok(gameRoutes.includes("router.post('/users/merge', authenticateToken, retiredClientAuthority)"));
    assert.ok(achievements.includes("router.post('/unlock', authenticateToken, retiredClientAchievementWrite)"));
    assert.ok(socket.includes('socket.authUser?.userId'));
    assert.equal(socket.includes('const { roomCode, playerName, userId } = data'), false);
    [
        'originalCorrectIndex', 'original_correctIndex', 'original_correct_index',
        'semanticGroupKey', 'semantic_group_key', 'distractorsPool', 'distractors_pool'
    ].forEach((field) => assert.ok(quizRoutes.includes(`'${field}'`)));
    assert.ok(questionService.includes('isInfiniteMode: Boolean(options.isInfiniteMode)'));
    assert.ok(quizRoutes.includes('isInfiniteMode: normalizedInfiniteMode'));
});
