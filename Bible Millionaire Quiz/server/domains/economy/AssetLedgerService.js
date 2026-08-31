import { dbOps } from '../../database/index.js';

export class EconomyError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'EconomyError';
        this.code = code;
        this.status = status;
    }
}

const normalizeKey = (value, field = 'idempotencyKey') => {
    const key = String(value || '').trim();
    if (!key || key.length > 200) {
        throw new EconomyError('INVALID_IDEMPOTENCY_KEY', `${field} 格式不正確`);
    }
    return key;
};

const normalizeMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    return metadata;
};

export async function applyCoinDeltaTx(tx, {
    userId,
    delta,
    reasonCode,
    sourceId = null,
    idempotencyKey,
    metadata = {}
}) {
    const amount = Number(delta);
    if (!Number.isSafeInteger(amount) || amount === 0) {
        throw new EconomyError('INVALID_COIN_DELTA', '金幣異動必須為非零整數');
    }

    const key = normalizeKey(idempotencyKey);
    const user = await tx.get('SELECT coins FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user) throw new EconomyError('USER_NOT_FOUND', '找不到使用者', 404);

    const existing = await tx.get(`
        SELECT delta, balance_after
        FROM asset_ledger
        WHERE idempotency_key = $1 AND user_id = $2 AND asset_type = 'COIN'
    `, [key, userId]);
    if (existing) {
        return {
            duplicate: true,
            delta: Number(existing.delta),
            balance: Number(existing.balanceAfter ?? existing.balance_after)
        };
    }

    const current = Number(user.coins || 0);
    if (amount < 0 && current + amount < 0) {
        throw new EconomyError('INSUFFICIENT_COINS', '智匯金幣餘額不足', 409);
    }

    const balance = current + amount;
    await tx.run('UPDATE users SET coins = $1 WHERE id = $2', [balance, userId]);
    await tx.run(`
        INSERT INTO asset_ledger
            (user_id, asset_type, delta, reason_code, source_id, idempotency_key, balance_after, metadata)
        VALUES ($1, 'COIN', $2, $3, $4, $5, $6, $7::jsonb)
    `, [userId, amount, reasonCode, sourceId, key, balance, JSON.stringify(normalizeMetadata(metadata))]);
    await tx.run(`
        INSERT INTO coin_ledger
            (user_id, amount, reason, source_id, idempotency_key, balance_after)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, amount, reasonCode, sourceId, key, balance]);

    return { duplicate: false, delta: amount, balance };
}

export async function applyAICreditGrantTx(tx, {
    userId,
    amount,
    reasonCode,
    sourceId = null,
    idempotencyKey,
    metadata = {}
}) {
    const delta = Number(amount);
    if (!Number.isSafeInteger(delta) || delta <= 0) {
        throw new EconomyError('INVALID_AI_CREDIT_DELTA', '智匯點數獎勵必須為正整數');
    }

    const key = normalizeKey(idempotencyKey);
    await tx.run(`
        INSERT INTO ai_gov.user_ai_credit_wallet (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
    `, [userId]);
    const wallet = await tx.get(`
        SELECT bonus_ai_credits, exchange_ai_credits, paid_ai_credits
        FROM ai_gov.user_ai_credit_wallet
        WHERE user_id = $1
        FOR UPDATE
    `, [userId]);

    const existing = await tx.get(`
        SELECT delta, balance_after
        FROM asset_ledger
        WHERE idempotency_key = $1 AND user_id = $2 AND asset_type = 'AI_CREDIT'
    `, [key, userId]);
    if (existing) {
        return {
            duplicate: true,
            delta: Number(existing.delta),
            balance: Number(existing.balanceAfter ?? existing.balance_after)
        };
    }

    const bonus = Number(wallet?.bonusAiCredits ?? wallet?.bonus_ai_credits ?? 0) + delta;
    const exchange = Number(wallet?.exchangeAiCredits ?? wallet?.exchange_ai_credits ?? 0);
    const paid = Number(wallet?.paidAiCredits ?? wallet?.paid_ai_credits ?? 0);
    const total = bonus + exchange + paid;

    await tx.run(`
        UPDATE ai_gov.user_ai_credit_wallet
        SET bonus_ai_credits = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
    `, [bonus, userId]);
    await tx.run(`
        INSERT INTO asset_ledger
            (user_id, asset_type, delta, reason_code, source_id, idempotency_key, balance_after, metadata)
        VALUES ($1, 'AI_CREDIT', $2, $3, $4, $5, $6, $7::jsonb)
    `, [userId, delta, reasonCode, sourceId, key, total, JSON.stringify(normalizeMetadata(metadata))]);
    await tx.run(`
        INSERT INTO ai_gov.ai_credit_ledger
            (user_id, amount, credit_pool, reason, balance_after, total_balance_after, correlation_id, related_module, metadata)
        VALUES ($1, $2, 'bonus', $3, $4, $5, $6, 'game_reward', $7::jsonb)
    `, [userId, delta, reasonCode, bonus, total, key, JSON.stringify(normalizeMetadata(metadata))]);

    return { duplicate: false, delta, balance: total };
}

export async function applyAICreditSpendTx(tx, {
    userId,
    amount,
    reasonCode,
    sourceId = null,
    idempotencyKey,
    metadata = {}
}) {
    const cost = Number(amount);
    if (!Number.isSafeInteger(cost) || cost <= 0) {
        throw new EconomyError('INVALID_AI_CREDIT_COST', '智匯點數費用必須為正整數');
    }
    const key = normalizeKey(idempotencyKey);
    await tx.run(`
        INSERT INTO ai_gov.user_ai_credit_wallet (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
    `, [userId]);
    const wallet = await tx.get(`
        SELECT bonus_ai_credits, exchange_ai_credits, paid_ai_credits
        FROM ai_gov.user_ai_credit_wallet
        WHERE user_id = $1
        FOR UPDATE
    `, [userId]);
    const existing = await tx.get(`
        SELECT delta, balance_after
        FROM asset_ledger
        WHERE idempotency_key = $1 AND user_id = $2 AND asset_type = 'AI_CREDIT'
    `, [key, userId]);
    if (existing) {
        return {
            duplicate: true,
            delta: Number(existing.delta),
            balance: Number(existing.balanceAfter ?? existing.balance_after)
        };
    }

    let bonus = Number(wallet?.bonusAiCredits ?? wallet?.bonus_ai_credits ?? 0);
    let exchange = Number(wallet?.exchangeAiCredits ?? wallet?.exchange_ai_credits ?? 0);
    let paid = Number(wallet?.paidAiCredits ?? wallet?.paid_ai_credits ?? 0);
    if (bonus + exchange + paid < cost) {
        throw new EconomyError('INSUFFICIENT_AI_CREDITS', '智匯點數餘額不足', 409);
    }
    let remaining = cost;
    const fromBonus = Math.min(bonus, remaining);
    bonus -= fromBonus;
    remaining -= fromBonus;
    const fromExchange = Math.min(exchange, remaining);
    exchange -= fromExchange;
    remaining -= fromExchange;
    const fromPaid = Math.min(paid, remaining);
    paid -= fromPaid;
    const total = bonus + exchange + paid;

    await tx.run(`
        UPDATE ai_gov.user_ai_credit_wallet
        SET bonus_ai_credits = $1,
            exchange_ai_credits = $2,
            paid_ai_credits = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4
    `, [bonus, exchange, paid, userId]);
    await tx.run(`
        INSERT INTO asset_ledger
            (user_id, asset_type, delta, reason_code, source_id, idempotency_key, balance_after, metadata)
        VALUES ($1, 'AI_CREDIT', $2, $3, $4, $5, $6, $7::jsonb)
    `, [userId, -cost, reasonCode, sourceId, key, total, JSON.stringify(normalizeMetadata(metadata))]);
    await tx.run(`
        INSERT INTO ai_gov.ai_credit_ledger
            (user_id, amount, credit_pool, reason, balance_after, total_balance_after, correlation_id, related_module, metadata)
        VALUES ($1, $2, 'priority', $3, $4, $4, $5, 'game_lifeline', $6::jsonb)
    `, [
        userId,
        -cost,
        reasonCode,
        total,
        key,
        JSON.stringify({ ...normalizeMetadata(metadata), debited: { bonus: fromBonus, exchange: fromExchange, paid: fromPaid } })
    ]);
    return { duplicate: false, delta: -cost, balance: total };
}

export async function reserveMultiplayerPrizePool(userId, roomCode, amount) {
    const normalizedRoomCode = String(roomCode || '').trim().toUpperCase();
    const allowedAmounts = new Set([20, 50, 100, 200, 500]);
    const numericAmount = Number(amount);
    if (!/^[A-Z0-9]{4,12}$/.test(normalizedRoomCode) || !allowedAmounts.has(numericAmount)) {
        throw new EconomyError('INVALID_PRIZE_POOL', '獎金池設定不正確');
    }

    return dbOps.usersDb.transaction(async (tx) => {
        const existing = await tx.get(
            'SELECT * FROM multiplayer_prize_pools WHERE room_code = $1 FOR UPDATE',
            [normalizedRoomCode]
        );
        if (existing) {
            if (existing.hostUserId !== userId || Number(existing.amount) !== numericAmount) {
                throw new EconomyError('PRIZE_POOL_CONFLICT', '此房間已有不同的獎金池設定', 409);
            }
            return { duplicate: true, amount: Number(existing.amount), status: existing.status };
        }

        const debit = await applyCoinDeltaTx(tx, {
            userId,
            delta: -numericAmount,
            reasonCode: 'multiplayer_prize_pool_reserve',
            sourceId: normalizedRoomCode,
            idempotencyKey: `multiplayer:pool:${normalizedRoomCode}:reserve`
        });
        await tx.run(`
            INSERT INTO multiplayer_prize_pools (room_code, host_user_id, amount)
            VALUES ($1, $2, $3)
        `, [normalizedRoomCode, userId, numericAmount]);
        return { duplicate: false, amount: numericAmount, balance: debit.balance, status: 'reserved' };
    });
}

export async function settleMultiplayerPrizePool(roomCode, winnerUserIds) {
    const normalizedRoomCode = String(roomCode || '').trim().toUpperCase();
    const winners = [...new Set((winnerUserIds || []).filter(Boolean).map(String))];

    return dbOps.usersDb.transaction(async (tx) => {
        const pool = await tx.get(
            'SELECT * FROM multiplayer_prize_pools WHERE room_code = $1 FOR UPDATE',
            [normalizedRoomCode]
        );
        if (!pool) return { success: true, amount: 0, prizeShare: 0, winners: [] };
        if (pool.status !== 'reserved') {
            return {
                success: true,
                duplicate: true,
                amount: Number(pool.amount),
                prizeShare: winners.length ? Math.floor(Number(pool.amount) / winners.length) : 0,
                winners
            };
        }

        const amount = Number(pool.amount);
        const prizeShare = winners.length ? Math.floor(amount / winners.length) : 0;
        const paidWinners = [];
        for (const winnerId of winners) {
            const exists = await tx.get('SELECT id FROM users WHERE id = $1', [winnerId]);
            if (!exists || prizeShare <= 0) continue;
            await applyCoinDeltaTx(tx, {
                userId: winnerId,
                delta: prizeShare,
                reasonCode: 'multiplayer_win',
                sourceId: normalizedRoomCode,
                idempotencyKey: `multiplayer:pool:${normalizedRoomCode}:winner:${winnerId}`
            });
            paidWinners.push(winnerId);
        }

        const distributed = prizeShare * paidWinners.length;
        const refund = amount - distributed;
        if (refund > 0) {
            await applyCoinDeltaTx(tx, {
                userId: pool.hostUserId,
                delta: refund,
                reasonCode: paidWinners.length ? 'multiplayer_prize_pool_remainder' : 'multiplayer_prize_pool_refund',
                sourceId: normalizedRoomCode,
                idempotencyKey: `multiplayer:pool:${normalizedRoomCode}:refund`
            });
        }

        await tx.run(`
            UPDATE multiplayer_prize_pools
            SET status = $1, settled_at = CURRENT_TIMESTAMP
            WHERE room_code = $2
        `, [paidWinners.length ? 'paid' : 'refunded', normalizedRoomCode]);

        return { success: true, amount, prizeShare, winners: paidWinners, refund };
    });
}

export async function refundMultiplayerPrizePool(roomCode, reasonCode = 'multiplayer_room_closed') {
    const normalizedRoomCode = String(roomCode || '').trim().toUpperCase();
    return dbOps.usersDb.transaction(async (tx) => {
        const pool = await tx.get(
            'SELECT * FROM multiplayer_prize_pools WHERE room_code = $1 FOR UPDATE',
            [normalizedRoomCode]
        );
        if (!pool || pool.status !== 'reserved') {
            return { success: true, duplicate: true, amount: Number(pool?.amount || 0) };
        }

        const amount = Number(pool.amount);
        await applyCoinDeltaTx(tx, {
            userId: pool.hostUserId,
            delta: amount,
            reasonCode,
            sourceId: normalizedRoomCode,
            idempotencyKey: `multiplayer:pool:${normalizedRoomCode}:refund`
        });
        await tx.run(`
            UPDATE multiplayer_prize_pools
            SET status = 'refunded', settled_at = CURRENT_TIMESTAMP
            WHERE room_code = $1
        `, [normalizedRoomCode]);
        return { success: true, duplicate: false, amount };
    });
}
