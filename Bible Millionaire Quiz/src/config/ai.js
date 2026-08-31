/**
 * AI Configuration (Stub)
 * 
 * 此檔案已被重構。前端不再直接使用 Gemini SDK。
 * 所有 AI 呼叫應透過後端 API (`/api/ai/*`, `/api/generate/*`)。
 * 
 * 此檔案僅為了向後兼容，提供空的 exports 以避免 import 錯誤。
 * AIServiceManager.js 的功能已由 src/services/AIService.js (透過 fetch) 取代。
 */

// 提供向後兼容的 exports (空操作或拋錯)
export const AI_USE_CASES = {
    QUESTION_GENERATION: 'QUESTION_GENERATION',
    QUALITY_CHECK: 'QUALITY_CHECK',
    DEVOTIONAL: 'DEVOTIONAL',
    MAP_DATA: 'MAP_DATA',
    TRIVIA: 'TRIVIA',
    EXPERT: 'EXPERT'
};

/**
 * 檢查 AI 是否可用
 * @returns {boolean} 永遠返回 true，因為 AI 由後端處理
 */
export function isAIAvailable() {
    // AI is always "available" from frontend perspective since backend handles it
    return true;
}

/**
 * @deprecated 前端不應直接呼叫 AI Model。請使用 `src/services/AIService.js` 或直接 fetch 後端 API。
 */
export function getAIModel(useCase) {
    console.error(`[AI Config] getAIModel('${useCase}') 被呼叫，但前端不應直接使用 AI SDK。請改用後端 API。`);
    throw new Error('前端 AI SDK 已停用。請使用後端 API (/api/ai/*, /api/generate/*)。');
}

// Default export for legacy code
export default {
    AI_USE_CASES,
    isAIAvailable,
    getAIModel
};
