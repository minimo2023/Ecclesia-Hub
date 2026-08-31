export const SCRIPTURE_RAIN_MOTION = Object.freeze({
    version: 'motion-v10',
    spawnPointCount: 20,
    // Mobile cards are proportionally much wider than desktop cards. A fixed,
    // far-apart cycle keeps consecutive cards from entering the same corridor
    // while preserving a different starting side for every opening wave.
    compactSpawnCenters: Object.freeze([24, 76, 27, 73, 30, 70]),
    desktopSpawnCenters: Object.freeze([
        20, 80, 22, 78, 24, 76, 26, 74, 28, 72,
        30, 70, 32, 68, 34, 66, 36, 64, 38, 62
    ]),
    driftLevels: Object.freeze([-3, -2, -1, 1, 2, 3]),
    driftPercentPerLevel: 5,
    // The animation now travels only across the actual stage. These durations
    // preserve the previous visible pixel speed without an off-screen tail.
    durations: Object.freeze({ slow: 11.2, medium: 8.4, fast: 5.6 }),
    reentryGapMs: Object.freeze({ desktop: 850, compact: 1100 }),
    // The currently required fragment bypasses the normal relaunch queue. This
    // keeps a missed answer from being hidden behind a complete card cycle.
    expectedReentryDelayMs: Object.freeze({ desktop: 650, compact: 900 }),
    safeCenters: Object.freeze({
        desktop: Object.freeze({ minimum: 20, maximum: 80 }),
        compact: Object.freeze({ minimum: 22, maximum: 78 })
    })
});
export const CHALLENGE_SPEED_FACTORS = Object.freeze({
    SLOW: 0.75,
    MEDIUM: 1,
    FAST: 1.25
});

export function normalizeChallengeSpeed(value) {
    const speed = String(value || 'MEDIUM').toUpperCase();
    return CHALLENGE_SPEED_FACTORS[speed] ? speed : 'MEDIUM';
}

function hash(value) {
    let result = 2166136261;
    for (const character of String(value || '')) {
        result ^= character.codePointAt(0);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}

function shuffle(items, seedValue = Date.now()) {
    const result = [...items];
    let state = hash(seedValue) || 1;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
}

export function visibleRainText(value) {
    return String(value || '').replace(/[\p{P}\p{S}\s]/gu, '');
}

export function buildContinuousRainFragments(
    fragments,
    externalFragments = [],
    difficulty = 'SIMPLE',
    round = 0
) {
    const passageFragments = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
    if (!passageFragments.length) return [];
    const externalCount = difficulty === 'HARD' ? 2 : difficulty === 'MEDIUM' ? 1 : 0;
    const seen = new Set(passageFragments.map(item => visibleRainText(item.text)).filter(Boolean));
    const external = shuffle(Array.isArray(externalFragments) ? externalFragments : [], `external:${round}`)
        .filter(item => {
            const text = visibleRainText(item.text);
            if (!text || seen.has(text)) return false;
            seen.add(text);
            return true;
        })
        .slice(0, externalCount);
    return shuffle([...passageFragments, ...external], `continuous:${round}`);
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

export function rainOpeningDelayMs(
    slotIndex,
    round = 0,
    compact = false,
    challengeSpeed = 'MEDIUM',
    maximumGapMs = Number.POSITIVE_INFINITY
) {
    const count = Math.max(0, Math.floor(Number(slotIndex) || 0));
    const speedMultiplier = CHALLENGE_SPEED_FACTORS[normalizeChallengeSpeed(challengeSpeed)];
    let delay = 0;
    for (let index = 0; index < count; index += 1) {
        const baseGap = compact
            ? 1200 + (hash(`opening-gap:compact:${round}:${index}`) % 351)
            : 900 + (hash(`opening-gap:${round}:${index}`) % 351);
        delay += Math.min(Math.round(baseGap / speedMultiplier), Math.max(0, maximumGapMs));
    }
    return delay;
}

export function rainReentryGapMs(compact = false, challengeSpeed = 'MEDIUM', policy = SCRIPTURE_RAIN_MOTION) {
    const speedMultiplier = CHALLENGE_SPEED_FACTORS[normalizeChallengeSpeed(challengeSpeed)];
    const gap = compact ? policy.reentryGapMs.compact : policy.reentryGapMs.desktop;
    return Math.round(gap / speedMultiplier);
}

export function rainExpectedReentryDelayMs(compact = false, challengeSpeed = 'MEDIUM', policy = SCRIPTURE_RAIN_MOTION) {
    const speedMultiplier = CHALLENGE_SPEED_FACTORS[normalizeChallengeSpeed(challengeSpeed)];
    const configured = policy.expectedReentryDelayMs || SCRIPTURE_RAIN_MOTION.expectedReentryDelayMs;
    const delay = compact ? configured.compact : configured.desktop;
    return Math.min(1500, Math.max(0, Math.round(delay / speedMultiplier)));
}

export function rainVisibleCapacity(stageWidth, stageHeight, reservedTop = 0) {
    const width = Math.max(0, Number(stageWidth) || 0);
    const height = Math.max(0, Number(stageHeight) || 0);
    if (!width || !height) return 4;

    const compact = width <= 640;
    const minimumReservedTop = compact ? 130 : 105;
    const usableHeight = Math.max(0, height - Math.max(minimumReservedTop, Number(reservedTop) || 0));
    const cardWidth = compact
        ? (width <= 360 ? Math.min(160, width * 0.52) : Math.max(177, width * 0.58))
        : clamp(width * 0.31, 265, 367);
    const horizontalGap = compact ? 24 : 42;
    const horizontalLanes = clamp(Math.floor((width + horizontalGap) / (cardWidth + horizontalGap)), 1, 2);
    const cardHeight = compact ? 75 : 125;
    const verticalSpacing = cardHeight * (compact ? 1.7 : 1.45);
    const verticalSlots = Math.max(1, Math.floor(usableHeight / verticalSpacing));

    // Three cards keep the game usable on short screens. Larger stages earn
    // extra cards only when both their width and usable falling height allow it.
    return clamp(horizontalLanes * verticalSlots, 3, 6);
}

export function rainLaunchGapMs(
    stageHeight,
    reservedTop,
    visibleCapacity,
    compact = false,
    challengeSpeed = 'MEDIUM',
    policy = SCRIPTURE_RAIN_MOTION
) {
    const height = Math.max(1, Number(stageHeight) || 1);
    const usableHeight = Math.max(1, height - Math.max(0, Number(reservedTop) || 0));
    const capacity = clamp(Math.floor(Number(visibleCapacity) || 0), 3, 6);
    const speedMultiplier = CHALLENGE_SPEED_FACTORS[normalizeChallengeSpeed(challengeSpeed)];
    const fastestCrossingMs = (policy.durations.fast * 1000) / speedMultiplier;
    const visibleCrossingMs = fastestCrossingMs * clamp(usableHeight / height, 0.45, 1);
    const continuityLimit = Math.round(visibleCrossingMs / (capacity + 0.5));

    // Never make the established cadence slower; only tighten it when the
    // measured falling area would otherwise leave every card off screen.
    return Math.max(420, Math.min(rainReentryGapMs(compact, challengeSpeed, policy), continuityLimit));
}

export function rainCardMotion(
    fragment,
    slotIndex,
    round = 0,
    compact = false,
    challengeSpeed = 'MEDIUM',
    policy = SCRIPTURE_RAIN_MOTION
) {
    const value = hash(`${fragment?.id}:${slotIndex}:${round}`);
    const compactCenters = policy.compactSpawnCenters || SCRIPTURE_RAIN_MOTION.compactSpawnCenters;
    const desktopCenters = policy.desktopSpawnCenters || SCRIPTURE_RAIN_MOTION.desktopSpawnCenters;
    const compactStartIndex = (hash(`compact-spawn:${round}`) + slotIndex) % compactCenters.length;
    const desktopStartIndex = (hash(`desktop-spawn:${round}`) + slotIndex) % desktopCenters.length;
    const drift = policy.driftLevels[(value >>> 5) % policy.driftLevels.length];
    const tier = ['slow', 'medium', 'fast'][(value >>> 9) % 3];
    const safe = compact ? policy.safeCenters.compact : policy.safeCenters.desktop;
    const startLeft = compact
        ? compactCenters[compactStartIndex]
        : desktopCenters[desktopStartIndex];
    const requestedDrift = drift * policy.driftPercentPerLevel;
    const pathBounds = startLeft < 50
        ? { minimum: safe.minimum, maximum: 38 }
        : { minimum: 62, maximum: safe.maximum };
    let endLeft = clamp(startLeft + requestedDrift, pathBounds.minimum, pathBounds.maximum);
    // Edge spawn points turn inward so every card retains a visible diagonal
    // path while the text card itself stays level and readable.
    if (Math.abs(endLeft - startLeft) < policy.driftPercentPerLevel) {
        endLeft = clamp(startLeft - requestedDrift, pathBounds.minimum, pathBounds.maximum);
    }
    const speed = normalizeChallengeSpeed(challengeSpeed);
    const speedMultiplier = CHALLENGE_SPEED_FACTORS[speed];
    const duration = (policy.durations[tier] / speedMultiplier);
    const cycleOffset = ((value >>> 13) % 901) / 1000;
    return {
        '--rain-start-left': `${startLeft.toFixed(2)}%`,
        '--rain-end-left': `${endLeft.toFixed(2)}%`,
        '--rain-angle': '0deg',
        '--rain-duration': `${duration}s`,
        '--rain-delay': `-${(duration * cycleOffset).toFixed(2)}s`,
        '--rain-z': tier === 'fast' ? 4 : tier === 'medium' ? 3 : 2
    };
}

export default {
    SCRIPTURE_RAIN_MOTION,
    buildContinuousRainFragments,
    rainCardMotion,
    rainExpectedReentryDelayMs,
    rainLaunchGapMs,
    rainOpeningDelayMs,
    rainReentryGapMs,
    rainVisibleCapacity,
    visibleRainText
};
