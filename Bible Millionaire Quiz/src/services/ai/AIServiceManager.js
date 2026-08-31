/**
 * AI Service Manager
 * 
 * 統一管理所有 AI 相關服務
 * - 提供商選擇
 * - 錯誤處理
 * - 使用量追踪
 */

import { getAIModel, AI_USE_CASES } from '../../config/ai';
import { database } from '../database/DatabaseAdapter';
import { COLLECTIONS } from '../../config/collections';

class AIServiceManager {
    /**
     * 生成內容（通用方法）
     * @param {string} useCase - 使用場景（來自 AI_USE_CASES）
     * @param {string} prompt - 提示詞
     * @param {Object} options - 選項
     * @param {boolean} options.trackUsage - 是否追踪使用量（默認 true）
     * @param {string} options.responseFormat - 響應格式（'json' 或 'text'）
     */
    async generate(useCase, prompt, options = {}) {
        try {
            const model = getAIModel(useCase);

            // 設置生成配置
            const generationConfig = {};
            if (options.responseFormat === 'json') {
                generationConfig.responseMimeType = 'application/json';
            }

            const result = await model.generateContent(prompt);
            const response = await result.response;

            // 追踪使用量
            if (options.trackUsage !== false) {
                await this.trackUsage(useCase, result);
            }

            return response;
        } catch (error) {
            console.error(`[AI ${useCase}] 生成失敗:`, error);
            throw new Error(`AI 生成失敗: ${error.message}`);
        }
    }

    /**
     * 生成 JSON 格式內容的便捷方法
     */
    async generateJSON(useCase, prompt, options = {}) {
        const response = await this.generate(useCase, prompt, {
            ...options,
            responseFormat: 'json'
        });

        try {
            const rawText = response.text();

            // 嘗試直接解析
            try {
                return JSON.parse(rawText);
            } catch (e) {
                // 如果失敗，移除 markdown code block 標記後再試
                console.warn(`[${useCase}] Direct JSON parse failed, extracting from markdown...`);
                const cleaned = rawText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                return JSON.parse(cleaned);
            }
        } catch (error) {
            console.error(`[${useCase}] JSON 解析失敗:`, error);
            throw new Error(`無法解析 AI 響應為 JSON: ${error.message}`);
        }
    }

    /**
     * 追踪 AI 使用量
     */
    async trackUsage(useCase, result) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const docId = `usage_${today}`;

            const existing = await database.get(COLLECTIONS.AI_USAGE, docId);
            const tokens = result.response.usageMetadata?.totalTokenCount || 0;

            const updatedData = {
                date: today,
                totalCalls: (existing?.totalCalls || 0) + 1,
                totalTokens: (existing?.totalTokens || 0) + tokens,
                byUseCase: {
                    ...(existing?.byUseCase || {}),
                    [useCase]: {
                        calls: ((existing?.byUseCase?.[useCase]?.calls) || 0) + 1,
                        tokens: ((existing?.byUseCase?.[useCase]?.tokens) || 0) + tokens
                    }
                },
                lastUpdated: Date.now()
            };

            await database.save(COLLECTIONS.AI_USAGE, docId, updatedData);
        } catch (error) {
            console.warn('使用量追踪失敗:', error);
            // 不影響主流程
        }
    }

    /**
     * 檢查 quota 是否可用
     */
    async checkQuota(limit = 4000000, reserve = 5000) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const usage = await database.get(COLLECTIONS.AI_USAGE, `usage_${today}`);

            if (usage) {
                const remaining = limit - (usage.totalTokens || 0);
                return remaining > reserve;
            }

            return true;
        } catch {
            return true; // Fail open
        }
    }

    /**
     * 獲取今日使用統計
     */
    async getTodayUsage() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const usage = await database.get(COLLECTIONS.AI_USAGE, `usage_${today}`);
            return usage || { totalCalls: 0, totalTokens: 0, byUseCase: {} };
        } catch {
            return { totalCalls: 0, totalTokens: 0, byUseCase: {} };
        }
    }
}

export const aiServiceManager = new AIServiceManager();
