/**
 * Feature Flags Configuration
 * 
 * 用途：
 * - 控制功能的啟用/禁用
 * - A/B 測試
 * - 逐步發布新功能
 */

export const FEATURES = {
    // AI 功能
    AI_DEVOTIONAL: true,           // 靈修短文生成
    AI_QUESTION_GEN: true,          // AI 題目生成
    AI_EXPERT: true,                // Phone-a-Friend AI
    AI_REPORT_ANALYSIS: true,       // 題目回報 AI 分析

    // 知識庫（目前禁用）
    KNOWLEDGE_GRAPH: false,
    ENCYCLOPEDIA: false,

    // 遊戲模式
    CASUAL_MODE: true,
    CHALLENGE_MODE: true,

    // 社交功能（預留）
    SOCIAL_SHARING: false,
    MULTIPLAYER: false,

    // 實驗性功能
    OFFLINE_MODE: false,
    PWA_INSTALL: false
};

/**
 * 檢查功能是否啟用
 */
export function isFeatureEnabled(feature) {
    return FEATURES[feature] === true;
}

/**
 * 條件性執行（僅當功能啟用時）
 */
export function withFeature(feature, callback) {
    if (isFeatureEnabled(feature)) {
        return callback();
    }
    return null;
}
