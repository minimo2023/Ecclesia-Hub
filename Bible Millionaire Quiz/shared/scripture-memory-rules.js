export const SCRIPTURE_MEMORY_DIFFICULTIES = Object.freeze(['SIMPLE', 'MEDIUM', 'HARD']);
export const SCRIPTURE_MEMORY_GRIDS = Object.freeze([4, 9]);
export const SCRIPTURE_MEMORY_CHALLENGE_SPEEDS = Object.freeze(['SLOW', 'MEDIUM', 'FAST']);
export const SCRIPTURE_MEMORY_CHALLENGE_SPEED_FACTORS = Object.freeze({
    SLOW: 0.75,
    MEDIUM: 1,
    FAST: 1.25
});
export const SCRIPTURE_MEMORY_SPEED_COIN_FACTORS = Object.freeze({
    SLOW: 1,
    MEDIUM: 1,
    FAST: 1.2
});

const EXTERNAL_DISTRACTORS = Object.freeze({
    4: Object.freeze({ SIMPLE: 0, MEDIUM: 1, HARD: 2 }),
    9: Object.freeze({ SIMPLE: 0, MEDIUM: 4, HARD: 6 }),
    rain: Object.freeze({ SIMPLE: 0, MEDIUM: 1, HARD: 2 })
});

export function normalizeMemoryDifficulty(value) {
    const difficulty = String(value || 'SIMPLE').toUpperCase();
    return SCRIPTURE_MEMORY_DIFFICULTIES.includes(difficulty) ? difficulty : null;
}

export function normalizeMemoryGrid(value) {
    const grid = Number(value || 4);
    return SCRIPTURE_MEMORY_GRIDS.includes(grid) ? grid : null;
}

export function normalizeChallengeSpeed(value) {
    const speed = String(value || 'MEDIUM').toUpperCase();
    return SCRIPTURE_MEMORY_CHALLENGE_SPEEDS.includes(speed) ? speed : null;
}

export function externalDistractorCount({ game = 'order', gridSize = 4, difficulty = 'SIMPLE' } = {}) {
    const key = game === 'rain' ? 'rain' : String(normalizeMemoryGrid(gridSize) || 4);
    return EXTERNAL_DISTRACTORS[key]?.[normalizeMemoryDifficulty(difficulty) || 'SIMPLE'] || 0;
}

export function validateMemoryLayout({ gridSize = 4, fragmentCount = 0 } = {}) {
    const grid = normalizeMemoryGrid(gridSize);
    if (!grid) return { valid: false, code: 'INVALID_GRID_SIZE', message: '請選擇四宮格或九宮格' };
    if (grid === 4 && Number(fragmentCount) < 4) {
        return { valid: false, code: 'FOUR_GRID_REQUIRES_4_FRAGMENTS', message: '四宮格至少需要 4 個健康片段' };
    }
    if (grid === 9 && Number(fragmentCount) < 12) {
        return { valid: false, code: 'NINE_GRID_REQUIRES_12_FRAGMENTS', message: '九宮格至少需要 12 個健康片段' };
    }
    return {
        valid: true,
        gridSize: grid,
        ideal: grid === 4 || Number(fragmentCount) >= 15,
        message: grid === 9 && Number(fragmentCount) < 15 ? '目前可玩；15 片以上的九宮格體驗更完整' : ''
    };
}

export function scriptureRangeKey({ version = 'CUV_TRAD', book, chapter, verseStart, verseEnd } = {}) {
    return [version, String(book || ''), Number(chapter), Number(verseStart), Number(verseEnd)].join(':');
}

export function scriptureMemoryCoinRewardBreakdown({
    elapsedMs,
    fragmentCount,
    correctCoins,
    mistakes = 0,
    challengeSpeed = 'MEDIUM',
    game = 'order'
} = {}) {
    const count = Math.max(1, Number(fragmentCount) || 1);
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const fastMs = count * (game === 'rain' ? 4200 : 3000);
    const steadyMs = count * (game === 'rain' ? 7200 : 6000);
    const timeBonus = elapsed <= fastMs ? 2 : elapsed <= steadyMs ? 1 : 0;
    const uninterruptedBonus = Number(mistakes || 0) === 0 ? 1 : 0;
    const earnedCorrectCoins = Math.max(0, Number.isSafeInteger(Number(correctCoins))
        ? Number(correctCoins)
        : 0);
    const completionCoins = 1;
    const baseCoins = earnedCorrectCoins + completionCoins + timeBonus + uninterruptedBonus;
    const multiplier = SCRIPTURE_MEMORY_SPEED_COIN_FACTORS[normalizeChallengeSpeed(challengeSpeed) || 'MEDIUM'];
    const coins = Math.max(baseCoins, Math.ceil(baseCoins * multiplier));
    return {
        correctCoins: earnedCorrectCoins,
        completionCoins,
        timeBonus,
        uninterruptedBonus,
        baseCoins,
        speedMultiplier: multiplier,
        speedBonus: Math.max(0, coins - baseCoins),
        rounding: 'CEIL',
        coins
    };
}

export function scriptureMemoryCoinReward(input = {}) {
    return scriptureMemoryCoinRewardBreakdown(input).coins;
}

export default {
    SCRIPTURE_MEMORY_DIFFICULTIES,
    SCRIPTURE_MEMORY_GRIDS,
    normalizeMemoryDifficulty,
    normalizeMemoryGrid,
    normalizeChallengeSpeed,
    externalDistractorCount,
    validateMemoryLayout,
    scriptureRangeKey,
    scriptureMemoryCoinRewardBreakdown,
    scriptureMemoryCoinReward,
    SCRIPTURE_MEMORY_CHALLENGE_SPEEDS,
    SCRIPTURE_MEMORY_CHALLENGE_SPEED_FACTORS,
    SCRIPTURE_MEMORY_SPEED_COIN_FACTORS
};
