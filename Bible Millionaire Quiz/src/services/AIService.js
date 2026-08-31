/**
 * AIService - 靈修短文生成服務
 * 
 * 透過後端 API 調用 Gemini，確保 API Key 安全
 */

import { aiServiceManager } from './ai';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 使用 AIServiceManager 的 quota 檢查
export async function checkQuotaAvailability() {
    return await aiServiceManager.checkQuota();
}

/**
 * 獲取已快取的靈修內容（唯讀）
 * 前端一般使用此函式，不會觸發生成
 */
export async function fetchDevotionalText() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/ai/devotional`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            } else {
                throw new Error(`HTTP ${response.status} (系統忙碌中，請稍後再試)`);
            }
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '內容尚未生成');
        }

        return result.data;
    } catch (error) {
        console.error("Devotional Fetch Failed:", error);
        throw new Error(`靈修內容載入失敗。(${error.message})`);
    }
}

/**
 * 管理員專用：生成新的靈修內容
 * 只有管理員刷新按鈕才會調用此函式
 */
export async function generateDevotionalText(liturgicalInfo, forceRefresh = false) {
    try {
        // [V3 ALIGNMENT] 使用 Scheduler API 路徑
        const response = await fetch(`${API_BASE_URL}/api/admin/scheduler/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                date: liturgicalInfo?.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }),
                forceRefresh 
            })
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            } else {
                throw new Error(`伺服器回傳錯誤 (${response.status})，請檢查管理權限。`);
            }
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '生成失敗');
        }

        return result.data;
    } catch (error) {
        console.error("Devotional Generation Failed:", error);
        throw new Error(`靈修內容生成失敗。(${error.message})`);
    }
}

