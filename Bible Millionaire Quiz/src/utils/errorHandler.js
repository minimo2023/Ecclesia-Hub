/**
 * Unified Error Handling
 */

export class AppError extends Error {
    constructor(message, code = 'UNKNOWN', details = {}) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp
        };
    }
}

export const ERROR_CODES = {
    // AI 相關
    AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
    AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
    AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',

    // 數據庫相關
    DATABASE_ERROR: 'DATABASE_ERROR',
    COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
    DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',

    // API 相關
    API_ERROR: 'API_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',

    // 業務邏輯
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    PERMISSION_DENIED: 'PERMISSION_DENIED'
};

/**
 * 錯誤處理器
 */
export function handleError(error, context = '') {
    const prefix = context ? `[${context}]` : '';

    // 記錄到控制台
    console.error(prefix, error);

    // 如果是 AppError，返回友好訊息
    if (error instanceof AppError) {
        return error.message;
    }

    // 處理常見錯誤類型
    if (error.message?.includes('API Key')) {
        return 'AI 服務未配置，請檢查設置';
    }

    if (error.message?.includes('network') || error.message?.includes('fetch')) {
        return '網絡連接失敗，請檢查網絡設置';
    }

    // 默認訊息
    return `發生錯誤: ${error.message || '未知錯誤'}`;
}

/**
 * 安全執行（帶錯誤處理）
 */
export async function safeExecute(fn, errorHandler = handleError) {
    try {
        return await fn();
    } catch (error) {
        const message = errorHandler(error);
        throw new AppError(message, ERROR_CODES.UNKNOWN, { originalError: error });
    }
}
