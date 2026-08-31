/**
 * Database Collections Configuration
 * 
 * Centralized management of all database collection names.
 * This ensures consistency across the application and makes
 * schema changes easier to manage.
 * 
 * Environment-based Configuration:
 * - Use VITE_COLLECTION_PREFIX to add a prefix to all collections
 * - Useful for multi-environment deployments (dev, staging, prod)
 * - Example: VITE_COLLECTION_PREFIX=dev_ → dev_questions, dev_leaderboard
 */

// Get collection prefix from environment (default: no prefix)
const COLLECTION_PREFIX = import.meta.env.VITE_COLLECTION_PREFIX || '';

/**
 * Helper function to create collection name with optional prefix
 * @param {string} name - Base collection name
 * @returns {string} Prefixed collection name
 */
const withPrefix = (name) => `${COLLECTION_PREFIX}${name}`;

// Collection names as constants to avoid typos and enable refactoring
export const COLLECTIONS = {
    // Game Data
    QUESTIONS: withPrefix('questions'),
    EXPERTS: withPrefix('experts'),

    // User Data
    LEADERBOARD: withPrefix('leaderboard'),
    ATTEMPTS: withPrefix('attempts'),

    // System Data
    REPORTS: withPrefix('reports'),
    AI_LOGS: withPrefix('ai_logs'),
    AI_USAGE: withPrefix('ai_usage'),  // 追踪 AI 使用量
    QUESTION_STATS: withPrefix('question_stats'),
    SYSTEM: withPrefix('system'),
};

/**
 * Collection 元數據
 * 用於未來的數據遷移、備份等功能
 */
export const COLLECTION_METADATA = {
    [COLLECTIONS.QUESTIONS]: {
        description: '題目庫',
        primaryKey: 'id',
        indexes: ['book', 'difficulty', 'chapter']
    },
    [COLLECTIONS.LEADERBOARD]: {
        description: '排行榜',
        primaryKey: 'id',
        indexes: ['timestamp', 'score']
    },
    [COLLECTIONS.REPORTS]: {
        description: '題目回報',
        primaryKey: 'id',
        indexes: ['questionId', 'status']
    },
    [COLLECTIONS.AI_LOGS]: {
        description: 'AI 生成日誌',
        primaryKey: 'id',
        indexes: ['type', 'timestamp']
    },
    [COLLECTIONS.EXPERTS]: {
        description: 'Phone-a-Friend 專家統計',
        primaryKey: 'id',
        indexes: ['totalCalls']
    }
};

/**
 * 獲取所有 Collection 名稱
 */
export function getAllCollections() {
    return Object.values(COLLECTIONS);
}

/**
 * 驗證 Collection 是否存在
 */
export function isValidCollection(name) {
    return getAllCollections().includes(name);
}
