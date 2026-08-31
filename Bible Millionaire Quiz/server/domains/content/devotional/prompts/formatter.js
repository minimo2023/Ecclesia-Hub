/**
 * 靈修排版手模組
 *
 * 此模組提供 AI 輔助的文字排版功能，
 * 可對「今日默想」等長文進行手機閱讀優化。
 *
 * 注意：此功能目前停用，因 AI 模型行為變化導致過度換行問題。
 * 保留模組以便日後調整 prompt 後重新啟用。
 */

import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';

// ========== 排版手狀態 ==========
let isFormatterEnabled = false; // [RECOVERY] 預設關閉排版手，防止 AI 縮短/截斷內容

/**
 * 啟用/停用排版手
 * @param {boolean} enabled
 */
export function setFormatterEnabled(enabled) {
    isFormatterEnabled = enabled;
    console.log(`[排版手] 狀態：${enabled ? '啟用' : '停用'}`);
}

/**
 * 檢查排版手是否啟用
 */
export function isEnabled() {
    return isFormatterEnabled;
}

// 排版手 Prompt 已遷移至 layout_formatter.md（透過 LogosEngine 載入）

// ========== 排版功能 ==========

/**
 * 對文字進行手機閱讀優化排版
 *
 * @param {string} text - 原始靈修文字
 * @returns {Promise<string>} 排版後的文字（若停用或失敗則返回原文）
 */
export async function formatForMobileReading(text) {
    // 若排版手停用，直接返回原文
    if (!isFormatterEnabled) {
        console.log('[排版手] 已停用，返回原始文字');
        return text;
    }

    try {
        // [SOVEREIGN] 透過 LogosEngine 載入 layout_formatter.md 進行排版
        const formatted = await LogosEngine.askBrain('layout_formatter', {
            text,
            temperature: 0.5
        });

        // layout_formatter 可能回傳字串或含 text 欄位的物件
        const resultText = (typeof formatted === 'string' ? formatted : formatted?.text || formatted?.formatted_text || '').trim();

        if (!resultText) return text;

        // 驗證：確保排版後的文字沒有明顯縮短（防止 AI 刪減內容）
        if (resultText.length < text.length * 0.8) {
            console.warn('[排版手] 排版後文字過短，可能有刪減，使用原始文字');
            return text;
        }

        console.log('[排版手] 排版完成');
        return resultText;
    } catch (error) {
        console.error('[排版手] 排版失敗:', error.message);
        return text; // 失敗時返回原始文字
    }
}

export default {
    setFormatterEnabled,
    isEnabled,
    formatForMobileReading
};
