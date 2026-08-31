import { randomUUID } from 'node:crypto';
import { applyCoinDeltaTx } from '../economy/AssetLedgerService.js';
import {
    scriptureMemoryCoinRewardBreakdown,
    scriptureRangeKey
} from './scripture-memory-rules.js';

function rewardDate(now = new Date()) {
    return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function normalizedGame(game) {
    return game === 'rain' || game === 'scripture_rain'
        ? { key: 'rain', type: 'scripture_rain' }
        : { key: 'order', type: 'scripture_order' };
}

function rangeIdentity(passage = {}) {
    return scriptureRangeKey({
        version: passage.version || 'CUV_TRAD',
        book: passage.book,
        chapter: passage.chapter,
        verseStart: passage.verseStart,
        verseEnd: passage.verseEnd
    });
}

function noReward(reason, extra = {}) {
    return {
        eligible: reason !== 'MEMBER_REQUIRED',
        awarded: false,
        awardedNow: false,
        coins: 0,
        reason,
        ...extra
    };
}

function progressBreakdown(correctCoins = 0) {
    const coins = Math.max(0, Number(correctCoins) || 0);
    return {
        correctCoins: coins,
        completionCoins: 0,
        timeBonus: 0,
        uninterruptedBonus: 0,
        baseCoins: coins,
        speedMultiplier: 1,
        speedBonus: 0,
        rounding: 'CEIL',
        coins
    };
}

async function claimedReward(tx, { userId, date, rangeKey }) {
    return tx.get(`
        SELECT * FROM scripture_memory_daily_rewards
        WHERE user_id = $1 AND reward_date = $2 AND range_key = $3
        FOR UPDATE
    `, [userId, date, rangeKey]);
}

async function updateBestDuration(tx, row, elapsedMs) {
    const duration = Math.max(0, Number(elapsedMs) || 0);
    const previousBest = Math.max(0, Number(row?.durationMs || 0));
    const newBest = duration > 0 && (previousBest <= 0 || duration < previousBest);
    if (newBest && row?.id) {
        await tx.run(`UPDATE scripture_memory_daily_rewards
            SET duration_ms = $1 WHERE id = $2`, [duration, row.id]);
    }
    return {
        bestDurationMs: newBest ? duration : previousBest,
        newBest
    };
}

/**
 * Award one base coin for each verified correct fragment. The first session
 * that creates a ledger-backed claim owns this exact range for the Taipei day;
 * later sessions may record results but cannot create another reward.
 */
export async function awardScriptureMemoryProgress(tx, {
    userId,
    sessionId,
    game = 'order',
    passage,
    correctCount,
    fragmentCount,
    now = new Date()
} = {}) {
    if (!userId) return noReward('MEMBER_REQUIRED');

    const count = Math.max(0, Number(correctCount) || 0);
    if (count <= 0) return noReward('NO_CORRECT_FRAGMENT');

    const gameInfo = normalizedGame(game);
    const rangeKey = rangeIdentity(passage);
    const date = rewardDate(now);
    const inserted = await tx.get(`
        INSERT INTO scripture_memory_daily_rewards
            (id, user_id, reward_date, range_key, game_type, session_id, coins,
             correct_count, base_coins, bonus_coins, completed, duration_ms, fragment_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7,0,FALSE,0,$8)
        ON CONFLICT (user_id, reward_date, range_key) DO NOTHING
        RETURNING *
    `, [randomUUID(), userId, date, rangeKey, gameInfo.type, sessionId, count, Number(fragmentCount || 0)]);

    let claim = inserted || await claimedReward(tx, { userId, date, rangeKey });
    if (!claim || claim.sessionId !== sessionId) {
        return noReward('RANGE_ALREADY_REWARDED_TODAY', {
            rewardDate: date,
            rangeKey,
            bestDurationMs: Math.max(0, Number(claim?.durationMs || 0)),
            newBest: false
        });
    }

    const previousCorrect = Math.max(0, Number(claim.correctCount || 0));
    const delta = inserted ? count : Math.max(0, count - previousCorrect);
    let balance;
    let ledgerDuplicate = false;
    if (delta > 0) {
        const ledger = await applyCoinDeltaTx(tx, {
            userId,
            delta,
            reasonCode: 'earn_scripture_memory_correct_fragment',
            sourceId: sessionId,
            idempotencyKey: `scripture-memory:progress:${userId}:${date}:${rangeKey}:${count}`,
            metadata: {
                game: gameInfo.type,
                rewardKind: 'correct_fragment',
                sessionId,
                rangeKey,
                rewardDate: date,
                correctCount: count,
                fragmentCount: Number(fragmentCount || 0)
            }
        });
        balance = ledger.balance;
        ledgerDuplicate = ledger.duplicate;
        if (!inserted && !ledger.duplicate) {
            await tx.run(`UPDATE scripture_memory_daily_rewards SET
                correct_count = GREATEST(correct_count, $1),
                base_coins = base_coins + $2,
                coins = coins + $2,
                fragment_count = GREATEST(fragment_count, $3)
                WHERE id = $4`, [count, delta, Number(fragmentCount || 0), claim.id]);
        }
        claim = await claimedReward(tx, { userId, date, rangeKey });
    }

    const sessionCoins = Math.max(0, Number(claim?.coins || 0));
    return {
        eligible: true,
        awarded: sessionCoins > 0,
        awardedNow: delta > 0 && !ledgerDuplicate,
        awardedCoins: delta > 0 && !ledgerDuplicate ? delta : 0,
        coins: sessionCoins,
        balance,
        breakdown: progressBreakdown(Number(claim?.baseCoins || 0)),
        rewardDate: date,
        rangeKey,
        reason: delta > 0 && !ledgerDuplicate ? 'CORRECT_FRAGMENT_REWARDED' : 'PROGRESS_ALREADY_REWARDED'
    };
}

/** Apply all bonuses only after the whole range is successfully completed. */
export async function settleScriptureMemoryCompletion(tx, {
    userId,
    sessionId,
    game = 'order',
    passage,
    correctCount,
    fragmentCount,
    elapsedMs,
    mistakes = 0,
    challengeSpeed = 'MEDIUM',
    now = new Date()
} = {}) {
    if (!userId) return noReward('MEMBER_REQUIRED');

    const progress = await awardScriptureMemoryProgress(tx, {
        userId, sessionId, game, passage, correctCount, fragmentCount, now
    });
    const gameInfo = normalizedGame(game);
    const rangeKey = rangeIdentity(passage);
    const date = rewardDate(now);
    const claim = await claimedReward(tx, { userId, date, rangeKey });
    if (!claim || claim.sessionId !== sessionId) {
        const best = await updateBestDuration(tx, claim, elapsedMs);
        return noReward('RANGE_ALREADY_REWARDED_TODAY', {
            rewardDate: date,
            rangeKey,
            ...best
        });
    }

    const correctCoins = Math.max(0, Number(claim.baseCoins || 0));
    const breakdown = scriptureMemoryCoinRewardBreakdown({
        elapsedMs,
        fragmentCount,
        correctCoins,
        mistakes,
        challengeSpeed,
        game: gameInfo.key
    });
    const best = await updateBestDuration(tx, claim, elapsedMs);
    if (claim.completed) {
        return {
            eligible: true,
            awarded: true,
            awardedNow: false,
            awardedCoins: 0,
            coins: Math.max(0, Number(claim.coins || 0)),
            breakdown,
            rewardDate: date,
            rangeKey,
            ...best,
            reason: 'COMPLETION_ALREADY_SETTLED'
        };
    }

    const currentCoins = Math.max(0, Number(claim.coins || 0));
    const bonusCoins = Math.max(0, breakdown.coins - currentCoins);
    let balance = progress.balance;
    let awardedNow = false;
    if (bonusCoins > 0) {
        const ledger = await applyCoinDeltaTx(tx, {
            userId,
            delta: bonusCoins,
            reasonCode: 'earn_scripture_memory_completion_bonus',
            sourceId: sessionId,
            idempotencyKey: `scripture-memory:completion:${userId}:${date}:${rangeKey}`,
            metadata: {
                game: gameInfo.type,
                rewardKind: 'completion_bonus',
                sessionId,
                rangeKey,
                rewardDate: date,
                elapsedMs: Math.max(0, Number(elapsedMs) || 0),
                breakdown
            }
        });
        balance = ledger.balance;
        awardedNow = !ledger.duplicate;
    }
    await tx.run(`UPDATE scripture_memory_daily_rewards SET
        coins = $1,
        bonus_coins = $2,
        completed = TRUE,
        duration_ms = CASE WHEN duration_ms <= 0 OR $3 < duration_ms THEN $3 ELSE duration_ms END,
        fragment_count = GREATEST(fragment_count, $4)
        WHERE id = $5`, [breakdown.coins, bonusCoins, Math.max(0, Number(elapsedMs) || 0), Number(fragmentCount || 0), claim.id]);

    return {
        eligible: true,
        awarded: true,
        awardedNow,
        awardedCoins: bonusCoins,
        coins: breakdown.coins,
        balance,
        breakdown,
        rewardDate: date,
        rangeKey,
        bestDurationMs: best.bestDurationMs || Math.max(0, Number(elapsedMs) || 0),
        newBest: best.newBest || Number(claim.durationMs || 0) <= 0,
        reason: 'FIRST_RANGE_SESSION_COMPLETED'
    };
}

export default {
    awardScriptureMemoryProgress,
    settleScriptureMemoryCompletion
};
