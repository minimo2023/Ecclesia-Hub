export { SCRIPTURE_SEGMENTATION_RULE_VERSION } from './healthy-segmentation-engine.js';
export const SCRIPTURE_SEGMENTATION_REVIEW_VERSION = 'semantic-review-v1';

const DEFAULTS = Object.freeze({
    maxReviewVerses: 5,
    maxInputTokens: 1200,
    softDeadlineMs: 4000,
    hardTimeoutMs: 7000,
    quotaShare: 0.20,
    fallbackDailyRequestCap: 20,
    model: 'gemini-3.1-flash-lite'
});

function integer(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function ratio(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback;
}

export function scriptureSegmentationReviewConfig(env = process.env) {
    const quotaShare = ratio(env.SCRIPTURE_SEGMENTATION_AI_FREE_QUOTA_SHARE, DEFAULTS.quotaShare);
    const configuredFreeDailyLimit = integer(env.GEMINI_FREE_DAILY_REQUEST_LIMIT, 0, 0);
    const fallbackDailyRequestCap = integer(
        env.SCRIPTURE_SEGMENTATION_AI_FALLBACK_DAILY_CAP,
        DEFAULTS.fallbackDailyRequestCap,
        0
    );
    const shareCap = configuredFreeDailyLimit > 0
        ? Math.floor(configuredFreeDailyLimit * quotaShare)
        : fallbackDailyRequestCap;
    const explicitCap = integer(env.SCRIPTURE_SEGMENTATION_AI_DAILY_REQUEST_CAP, shareCap, 0);

    return Object.freeze({
        enabled: String(env.SCRIPTURE_SEGMENTATION_AI_ENABLED ?? 'true').toLowerCase() !== 'false',
        maxReviewVerses: integer(env.SCRIPTURE_SEGMENTATION_AI_MAX_REVIEW_VERSES, DEFAULTS.maxReviewVerses, 1, 20),
        maxInputTokens: integer(env.SCRIPTURE_SEGMENTATION_AI_MAX_INPUT_TOKENS, DEFAULTS.maxInputTokens, 100, 10000),
        softDeadlineMs: integer(env.SCRIPTURE_SEGMENTATION_AI_SOFT_DEADLINE_MS, DEFAULTS.softDeadlineMs, 250, 30000),
        hardTimeoutMs: integer(env.SCRIPTURE_SEGMENTATION_AI_HARD_TIMEOUT_MS, DEFAULTS.hardTimeoutMs, 500, 60000),
        quotaShare,
        configuredFreeDailyLimit,
        dailyRequestCap: configuredFreeDailyLimit > 0 ? Math.min(explicitCap, shareCap) : explicitCap,
        model: String(env.SCRIPTURE_SEGMENTATION_AI_MODEL || DEFAULTS.model).trim() || DEFAULTS.model
    });
}

export function estimateSegmentationInputTokens(value) {
    const text = String(value || '');
    const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
    const remaining = Math.max(0, text.length - cjk);
    return Math.ceil((cjk * 1.1) + (remaining / 4));
}

export function decideSegmentationAiReview({
    lowConfidenceVerses = [],
    estimatedInputTokens = 0,
    dailyRequestCount = 0,
    config = scriptureSegmentationReviewConfig()
} = {}) {
    const count = Array.isArray(lowConfidenceVerses) ? lowConfidenceVerses.length : 0;
    if (!config.enabled) return { allowed: false, reason: 'AI_REVIEW_DISABLED' };
    if (count === 0) return { allowed: false, reason: 'NO_UNCACHED_LOW_CONFIDENCE_VERSES' };
    if (count > config.maxReviewVerses) return { allowed: false, reason: 'REVIEW_VERSE_LIMIT_EXCEEDED' };
    if (Number(estimatedInputTokens) > config.maxInputTokens) {
        return { allowed: false, reason: 'REVIEW_TOKEN_LIMIT_EXCEEDED' };
    }
    if (config.hardTimeoutMs <= config.softDeadlineMs) {
        return { allowed: false, reason: 'INVALID_REVIEW_DEADLINES' };
    }
    if (config.dailyRequestCap <= 0 || Number(dailyRequestCount) >= config.dailyRequestCap) {
        return { allowed: false, reason: 'REVIEW_DAILY_QUOTA_REACHED' };
    }
    return {
        allowed: true,
        reason: 'AI_REVIEW_ALLOWED',
        remainingDailyRequests: Math.max(0, config.dailyRequestCap - Number(dailyRequestCount))
    };
}

export function withSoftDeadline(promise, milliseconds) {
    let timeoutId;
    const timeout = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve({ completed: false, reason: 'SOFT_DEADLINE_REACHED' }), milliseconds);
    });
    return Promise.race([
        Promise.resolve(promise).then(value => ({ completed: true, value })),
        timeout
    ]).finally(() => clearTimeout(timeoutId));
}

export const SCRIPTURE_SEGMENTATION_REVIEW_DEFAULTS = DEFAULTS;
