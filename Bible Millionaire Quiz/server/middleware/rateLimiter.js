import rateLimit from 'express-rate-limit';

// General API Limiter (Basic DDoS protection)
// 15 minutes, 1000 requests per IP (increased for expedition feature heavy polling)
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    }
});

// Authentication Limiter (Brute-force protection)
// 15 minutes, 20 failed requests per IP.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many login attempts, please try again after 15 minutes.'
    }
});

// AI generation has separate IP and authenticated-user budgets.
export const aiIpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.AI_RATE_LIMIT_IP_PER_MINUTE || '20', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'AI_IP_RATE_LIMITED'
    }
});

export const aiUserLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.AI_RATE_LIMIT_USER_PER_MINUTE || '10', 10),
    skip: (req) => !req.user?.userId,
    keyGenerator: (req) => `user:${req.user.userId}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'AI_USER_RATE_LIMITED'
    }
});

// Expert lifelines are intentionally available to guests. Keep a tighter
// per-IP budget on this single AI endpoint to prevent anonymous abuse.
export const aiExpertIpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.AI_EXPERT_RATE_LIMIT_IP_PER_MINUTE || '6', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'EXPERT_IP_RATE_LIMITED'
    }
});

// Backward-compatible export for modules not yet migrated to the two-layer policy.
export const aiLimiter = aiIpLimiter;
