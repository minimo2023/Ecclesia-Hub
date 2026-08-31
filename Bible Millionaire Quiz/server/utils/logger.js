/**
 * [SOVEREIGN UNIT] Logger Utility
 * v1.0 - Centralized Observability
 * Pursuing "Stable and Accurate" diagnostics.
 */

const COLORS = {
    info: '\x1b[36m%s\x1b[0m', // Cyan
    warn: '\x1b[33m%s\x1b[0m', // Yellow
    error: '\x1b[31m%s\x1b[0m', // Red
    success: '\x1b[32m%s\x1b[0m' // Green
};

export const logger = {
    info: (msg, meta = '') => {
        console.log(COLORS.info, `[INFO] ${msg}`, meta);
    },
    warn: (msg, meta = '') => {
        console.warn(COLORS.warn, `[WARN] ⚠️ ${msg}`, meta);
    },
    error: (msg, meta = '') => {
        console.error(COLORS.error, `[ERROR] ❌ ${msg}`, meta);
    },
    success: (msg, meta = '') => {
        console.log(COLORS.success, `[READY] ✨ ${msg}`, meta);
    },
    debug: (msg, meta = '') => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] 🔍 ${msg}`, meta);
        }
    }
};

export default logger;
