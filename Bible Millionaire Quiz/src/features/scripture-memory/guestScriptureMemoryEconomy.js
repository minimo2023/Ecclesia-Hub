import {
    scriptureMemoryCoinRewardBreakdown,
    scriptureRangeKey
} from '../../../shared/scripture-memory-rules.js';

export const GUEST_SCRIPTURE_MEMORY_REWARDS_KEY = 'scripture_memory_guest_daily_rewards_v1';

function taipeiDate(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
}

function readClaims(storage) {
    try {
        const value = JSON.parse(storage?.getItem(GUEST_SCRIPTURE_MEMORY_REWARDS_KEY) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function writeClaims(storage, claims) {
    storage?.setItem(GUEST_SCRIPTURE_MEMORY_REWARDS_KEY, JSON.stringify(claims));
}

function noReward(reason, extra = {}) {
    return {
        eligible: true,
        awarded: false,
        awardedNow: false,
        awardedCoins: 0,
        coins: 0,
        localOnly: true,
        reason,
        ...extra
    };
}

function correctCountFor(session, game) {
    return Math.max(0, Number(game === 'rain' ? session?.currentIndex : session?.fragmentIndex) || 0);
}

function elapsedFor(session, elapsedMs) {
    return Math.max(0, Number(
        session?.lastStageResult?.durationMs
        ?? session?.elapsedMs
        ?? elapsedMs
        ?? 0
    ) || 0);
}

export function recordGuestScriptureMemoryReward({
    session,
    game = 'order',
    elapsedMs = 0,
    balance = 0,
    storage = globalThis.sessionStorage,
    now = new Date()
} = {}) {
    const sessionId = String(session?.id || '');
    const passage = session?.passage || {};
    const correctCount = correctCountFor(session, game);
    const fragmentCount = Math.max(0, Number(session?.fragmentCount || session?.fragments?.length) || 0);
    const completed = session?.status === 'completed';
    const elapsed = elapsedFor(session, elapsedMs);
    const rewardDate = taipeiDate(now);
    const rangeKey = scriptureRangeKey({ version: passage.version || 'CUV_TRAD', ...passage });

    if (!sessionId || !passage.book || !passage.chapter || !passage.verseStart || !passage.verseEnd) {
        return noReward('INVALID_PASSAGE');
    }
    if (correctCount <= 0) return noReward('NO_CORRECT_FRAGMENT', { rewardDate, rangeKey });

    const claims = readClaims(storage);
    const claimKey = `${rewardDate}|${rangeKey}`;
    const existing = claims[claimKey];

    if (existing && existing.sessionId !== sessionId) {
        const previousBest = Math.max(0, Number(existing.bestDurationMs) || 0);
        const newBest = completed && elapsed > 0 && (previousBest <= 0 || elapsed < previousBest);
        if (newBest) {
            claims[claimKey] = { ...existing, bestDurationMs: elapsed };
            writeClaims(storage, claims);
        }
        return noReward('RANGE_ALREADY_REWARDED_TODAY', {
            rewardDate,
            rangeKey,
            bestDurationMs: newBest ? elapsed : previousBest,
            newBest
        });
    }

    const previous = existing || {
        sessionId,
        correctCount: 0,
        coins: 0,
        completed: false,
        bestDurationMs: 0
    };
    const breakdown = completed
        ? scriptureMemoryCoinRewardBreakdown({
            elapsedMs: elapsed,
            fragmentCount,
            correctCoins: correctCount,
            mistakes: session?.mistakes || 0,
            challengeSpeed: session?.challengeSpeed || 'MEDIUM',
            game
        })
        : {
            correctCoins: correctCount,
            completionCoins: 0,
            timeBonus: 0,
            uninterruptedBonus: 0,
            baseCoins: correctCount,
            speedMultiplier: 1,
            speedBonus: 0,
            rounding: 'CEIL',
            coins: correctCount
        };
    const targetCoins = Math.max(Number(previous.coins) || 0, Number(breakdown.coins) || 0);
    const awardedCoins = Math.max(0, targetCoins - (Number(previous.coins) || 0));
    const previousBest = Math.max(0, Number(previous.bestDurationMs) || 0);
    const newBest = completed && elapsed > 0 && (previousBest <= 0 || elapsed < previousBest);

    claims[claimKey] = {
        ...previous,
        sessionId,
        correctCount: Math.max(Number(previous.correctCount) || 0, correctCount),
        coins: targetCoins,
        completed: Boolean(previous.completed || completed),
        bestDurationMs: newBest ? elapsed : previousBest,
        game
    };
    writeClaims(storage, claims);

    return {
        eligible: true,
        awarded: targetCoins > 0,
        awardedNow: awardedCoins > 0,
        awardedCoins,
        coins: targetCoins,
        balance: Math.max(0, Number(balance) || 0) + awardedCoins,
        breakdown,
        rewardDate,
        rangeKey,
        bestDurationMs: newBest ? elapsed : previousBest,
        newBest,
        localOnly: true,
        reason: completed ? 'FIRST_RANGE_SESSION_COMPLETED' : awardedCoins > 0
            ? 'CORRECT_FRAGMENT_REWARDED'
            : 'PROGRESS_ALREADY_REWARDED'
    };
}

export default recordGuestScriptureMemoryReward;
