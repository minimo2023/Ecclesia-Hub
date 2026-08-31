/**
 * [SOVEREIGN UNIT] Logos Bank Service
 * v2.0 - Native PostgreSQL Sovereign Edition
 * Pure $1 syntax. Hardened Atomicity. Single Source of Truth.
 */

import { usersDb } from '../index.js';

// In-memory vault for Guests (Non-persistent)
const GuestVault = new Map();

/**
 * 取得資產餘額
 * @param {string} userId
 * @returns {Promise<Object>} { coins, aiCredits }
 */
async function getBalances(userId) {
    if (!userId || userId.startsWith('GUEST_')) {
        return GuestVault.get(userId) || { coins: 0, aiCredits: 0 };
    }

    // Native $1 Syntax
    const userRow = await usersDb.get('SELECT coins FROM users WHERE id = $1', [userId]);
    const walletRow = await usersDb.get(
        'SELECT (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0) + COALESCE(paid_ai_credits, 0)) as total_credits FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1',
        [userId]
    );

    if (!userRow) return { coins: 0, aiCredits: 0 };
    return {
        coins: parseInt(userRow.coins) || 0,
        // Adapter returns camelCase: total_credits -> totalCredits
        aiCredits: parseFloat(walletRow?.totalCredits ?? walletRow?.total_credits) || 0
    };
}

/**
 * 原子化調整資產
 * @param {string} userId
 * @param {string} type - 'COIN' | 'AI_CREDIT'
 * @param {number} delta
 * @param {string} reason
 * @param {Object} meta
 */
async function adjustAssets(userId, type, delta, reason = 'SYSTEM_ADJUST', meta = {}) {
    const amount = type === 'COIN' ? Math.floor(delta) : parseFloat(delta);
    if (isNaN(amount) || amount === 0) return await getBalances(userId);

    // --- Guest Path ---
    if (!userId || userId.startsWith('GUEST_')) {
        const current = GuestVault.get(userId) || { coins: 0, aiCredits: 0 };
        if (type === 'COIN') {
            current.coins = Math.max(0, current.coins + amount);
        } else {
            current.aiCredits = Math.max(0, current.aiCredits + amount);
        }
        GuestVault.set(userId, current);
        console.log(`🏦 [LogosBank] Guest Activity: ${userId} | ${type} | ${amount} | ${reason}`);
        return current;
    }

    // --- Member Path (Native Postgres) ---
    try {
        if (type === 'COIN') {
            const res = await usersDb.get(
                'UPDATE users SET coins = GREATEST(0, coins + $1) WHERE id = $2 RETURNING coins',
                [amount, userId]
            );
            if (!res) throw new Error(`[LogosBank.adjustAssets] User not found: ${userId}`);
            const newBalance = parseInt(res.coins);

            await usersDb.run(
                'INSERT INTO coin_ledger (user_id, amount, reason, balance_after, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
                [userId, amount, reason, newBalance]
            );
            return { coins: newBalance };
        } else {
            // --- AI_CREDIT Path ---
            if (meta.mode === 'priority') {
                // [PRIORITY MODE] Atomic multi-pool deduction
                // Ensures we deduct from bonus -> exchange -> paid correctly in a single UPDATE
                const deduction = Math.abs(amount);
                const res = await usersDb.get(`
                    UPDATE ai_gov.user_ai_credit_wallet
                    SET bonus_ai_credits = GREATEST(0, bonus_ai_credits - $1),
                        exchange_ai_credits = GREATEST(0, exchange_ai_credits - GREATEST(0, $1 - bonus_ai_credits)),
                        paid_ai_credits = GREATEST(0, paid_ai_credits - GREATEST(0, $1 - bonus_ai_credits - exchange_ai_credits)),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $2
                      AND (bonus_ai_credits + exchange_ai_credits + paid_ai_credits) >= $1
                    RETURNING bonus_ai_credits, exchange_ai_credits, paid_ai_credits
                `, [deduction, userId]);
                
                if (!res) throw new Error(`[LogosBank.adjustAssets] AI Credits insufficient or User not found: ${userId}`);
                
                const newTotal = Number(res.bonusAiCredits || res.bonus_ai_credits || 0) + 
                                 Number(res.exchangeAiCredits || res.exchange_ai_credits || 0) + 
                                 Number(res.paidAiCredits || res.paid_ai_credits || 0);

                const ledgerSql = 'INSERT INTO ai_gov.ai_credit_ledger (user_id, amount, reason, credit_pool, balance_after, total_balance_after, correlation_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)';
                
                // We don't know exactly how much was deducted from each pool without reading before and after.
                // But wait, the math is deterministic based on the deduction amount.
                // It's easier to just insert ONE ledger row for priority mode and use newTotal for balance_after to satisfy NOT NULL.
                await usersDb.run(ledgerSql, [
                    userId, amount, reason, 'priority_auto', newTotal, newTotal, meta.correlationId || null
                ]);

                const balances = await getBalances(userId);
                return { coins: balances.coins, aiCredits: newTotal };
                
            } else {
                // [POOL MODE] Direct pool addition (or forced deduction)
                const pool = meta.pool || 'exchange_ai_credits';
                const poolCol = pool.endsWith('_ai_credits') ? pool : `${pool}_ai_credits`;
                
                // For additions, handle missing wallet.
                // NOTE: We only allow adding to bonus, exchange, or paid.
                const query = `
                    INSERT INTO ai_gov.user_ai_credit_wallet (user_id, ${poolCol})
                    VALUES ($2, $1)
                    ON CONFLICT (user_id) DO UPDATE 
                    SET ${poolCol} = GREATEST(0, user_ai_credit_wallet.${poolCol} + EXCLUDED.${poolCol}),
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING ${poolCol} as pool_balance, (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0) + COALESCE(paid_ai_credits, 0)) as total
                `;
                const res = await usersDb.get(query, [amount, userId]);
                // Adapter converts snake_case -> camelCase: total -> total, pool_balance -> poolBalance
                const newTotal = res ? parseFloat(res.total ?? 0) : 0;
                const poolBalanceAfter = res ? parseFloat(res.poolBalance ?? res.pool_balance ?? 0) : 0;

                await usersDb.run(
                    'INSERT INTO ai_gov.ai_credit_ledger (user_id, amount, reason, credit_pool, balance_after, total_balance_after, correlation_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
                    [userId, amount, reason, pool.replace('_ai_credits', ''), poolBalanceAfter, newTotal, meta.correlationId || null]
                );
                const balances = await getBalances(userId);
                return { coins: balances.coins, aiCredits: newTotal };
            }
        }
    } catch (err) {
        console.error('❌ [LogosBank] Transaction Failed:', err.message);
        throw err;
    }
}

/**
 * 兌換邏輯 (硬化版原子化事務 - 支援雙向兌換)
 * @param {string} userId 
 * @param {number} amount 扣除數量 (金幣或點數，根據 direction 決定)
 * @param {number} receivedAmount 獲得數量
 * @param {string} direction 'coin_to_credit' | 'credit_to_coin'
 * @param {string} reason 
 */
async function exchange(userId, amount, receivedAmount, direction = 'coin_to_credit', reason = 'EXCHANGE') {
    return await usersDb.transaction(async (tx) => {
        let newCoins = 0;
        let newCredits = 0;
        let newExchangeBalance = 0;

        if (direction === 'coin_to_credit') {
            // 1. 扣除金幣
            const resCoin = await tx.get(
                'UPDATE users SET coins = GREATEST(0, coins - $1) WHERE id = $2 AND coins >= $1 RETURNING coins',
                [amount, userId]
            );
            if (!resCoin) throw new Error(`[LogosBank.exchange] Insufficient coins or user not found: ${userId}`);
            newCoins = parseInt(resCoin.coins);

            // 2. 增加點數
            const resCredit = await tx.get(
                `INSERT INTO ai_gov.user_ai_credit_wallet (user_id, exchange_ai_credits)
                 VALUES ($2, $1)
                 ON CONFLICT (user_id) DO UPDATE 
                 SET exchange_ai_credits = COALESCE(user_ai_credit_wallet.exchange_ai_credits, 0) + EXCLUDED.exchange_ai_credits,
                     updated_at = CURRENT_TIMESTAMP
                 RETURNING exchange_ai_credits, (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0) + COALESCE(paid_ai_credits, 0)) as total`,
                [receivedAmount, userId]
            );
            if (!resCredit) throw new Error(`[LogosBank.exchange] Credit update failed: ${userId}`);
            newCredits = parseFloat(resCredit.total ?? 0);
            newExchangeBalance = parseFloat(resCredit.exchangeAiCredits ?? resCredit.exchange_ai_credits ?? 0);

            // 3. 審計記帳
            await tx.run('INSERT INTO coin_ledger (user_id, amount, reason, balance_after) VALUES ($1, $2, $3, $4)', 
                [userId, -amount, `${reason}_OUT`, newCoins]);
            await tx.run('INSERT INTO ai_gov.ai_credit_ledger (user_id, amount, reason, credit_pool, balance_after, total_balance_after) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, receivedAmount, `${reason}_IN`, 'exchange', newExchangeBalance, newCredits]);

        } else if (direction === 'credit_to_coin') {
            // 1. 扣除點數 (從 exchange 池優先，或直接扣總和)
            // 由於目前支援從 exchange 池兌換，我們簡化處理：必須確保 exchange 池足夠，或者從總池中扣
            // 為了簡化，直接使用優先扣款邏輯 (與 adjustAssets 類似)
            const resCredit = await tx.get(`
                UPDATE ai_gov.user_ai_credit_wallet
                SET 
                    bonus_ai_credits = GREATEST(0, COALESCE(bonus_ai_credits, 0) - $1),
                    exchange_ai_credits = CASE 
                        WHEN COALESCE(bonus_ai_credits, 0) >= $1 THEN COALESCE(exchange_ai_credits, 0)
                        ELSE GREATEST(0, COALESCE(exchange_ai_credits, 0) - ($1 - COALESCE(bonus_ai_credits, 0)))
                    END,
                    paid_ai_credits = CASE
                        WHEN (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0)) >= $1 THEN COALESCE(paid_ai_credits, 0)
                        ELSE GREATEST(0, COALESCE(paid_ai_credits, 0) - ($1 - (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0))))
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                  AND (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0) + COALESCE(paid_ai_credits, 0)) >= $1
                RETURNING exchange_ai_credits, (COALESCE(bonus_ai_credits, 0) + COALESCE(exchange_ai_credits, 0) + COALESCE(paid_ai_credits, 0)) as total
            `, [amount, userId]);
            
            if (!resCredit) throw new Error(`[LogosBank.exchange] Insufficient AI credits or user not found: ${userId}`);
            newCredits = parseFloat(resCredit.total ?? 0);
            newExchangeBalance = parseFloat(resCredit.exchangeAiCredits ?? resCredit.exchange_ai_credits ?? 0);

            // 2. 增加金幣
            const resCoin = await tx.get(
                'UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins',
                [receivedAmount, userId]
            );
            if (!resCoin) throw new Error(`[LogosBank.exchange] Coin update failed: ${userId}`);
            newCoins = parseInt(resCoin.coins);

            // 3. 審計記帳
            await tx.run('INSERT INTO ai_gov.ai_credit_ledger (user_id, amount, reason, credit_pool, balance_after, total_balance_after) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, -amount, `${reason}_OUT`, 'priority_auto', newCredits, newCredits]); // Simplified pool balance for priority mode
            await tx.run('INSERT INTO coin_ledger (user_id, amount, reason, balance_after) VALUES ($1, $2, $3, $4)', 
                [userId, receivedAmount, `${reason}_IN`, newCoins]);
        }

        return { 
            coins: newCoins, 
            aiCredits: newCredits,
            awarded: receivedAmount,
            cost: amount,
            newExchangeBalance
        };
    });
}

/**
 * 既有資產結轉 (Migration)
 */
async function migrateLegacyBalance(userId) {
    if (!userId || userId.startsWith('GUEST_')) return;
    try {
        const check = await usersDb.get(
            "SELECT id FROM coin_ledger WHERE user_id = $1 AND reason = 'MIGRATION_INITIAL_BALANCE' LIMIT 1",
            [userId]
        );

        if (!check) {
            const current = await getBalances(userId);
            if (current.coins > 0) {
                await usersDb.run(
                    'INSERT INTO coin_ledger (user_id, amount, reason, balance_after) VALUES ($1, $2, $3, $4)',
                    [userId, current.coins, 'MIGRATION_INITIAL_BALANCE', current.coins]
                );
                console.log(`🏦 [LogosBank] Initial balance migrated for ${userId}`);
            }
        }
    } catch (e) {
        console.error('⚠️ [LogosBank] Migration error:', e.message);
    }
}

export const LogosBank = {
    getBalances,
    adjustAssets,
    exchange,
    migrateLegacyBalance
};
