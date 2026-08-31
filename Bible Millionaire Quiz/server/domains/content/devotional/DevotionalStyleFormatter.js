import logosEngine from '../../../infrastructure/ai/LogosEngine.js';
import { MEDITATION_STYLES, selectStyle, formatForMobileReading } from './prompts/index.js';

/**
 * Devotional Style Formatter (Stage 2 - v3.2 Sovereign Sync)
 * Takes core theological content from Logos Stage 1
 * and wraps it in the selected writing style via Sovereign AI Pipeline.
 */
export async function formatDevotional(coreContent, styleId = null, dateKey = null, isPriority = false) {
    // Auto-select style if not specified
    const style = styleId
        ? (MEDITATION_STYLES[styleId] || Object.values(MEDITATION_STYLES)[0])
        : selectStyle(dateKey || new Date().toISOString().split('T')[0]);

    console.log(`🎨 [StyleFormatter] Using style via Sovereign Pipe: ${style.name} (${style.id})`);

    // [SOVEREIGN] 準備 context，交由 askBrain 進行分發與計費監控
    const contextData = {
        style_name: style.name,
        style_prompt: style.prompt,
        // 資料載合
        core_content: {
            verse: coreContent.selected_verse,
            verse_text: coreContent.verse_text,
            theological_insight: coreContent.theological_insight,
            gospel_connection: coreContent.gospel_connection,
            prayer_direction: coreContent.prayer_direction,
            life_application: coreContent.life_application
        },
        temperature: 0.8
    };

    try {
        // [SOVEREIGN] 歸一化呼叫：經由主引擎進行分發與計費分類 (devotional_service)
        const result = await logosEngine.askBrain('prose_formatter', contextData, { priority: isPriority });

        // Debug: 記錄回傳欄位
        console.log(`📋 [StyleFormatter] AI 回傳欄位:`, Object.keys(result));

        // 確保有基本欄位
        if (!result.scripture && coreContent.verse_text) {
            result.scripture = coreContent.verse_text;
        }
        if (!result.scriptureReference && coreContent.selected_verse) {
            result.scriptureReference = coreContent.selected_verse;
        }

        // [LOGIC] 移除可能的高風險字元或損壞控制符，但完整保留中英文、標點、Markdown 等
        const sanitizeChineseText = (text) => {
            if (!text || typeof text !== 'string') return text;
            // 移除非法不可見控制字元，保留絕大部分正常文本及格式字元
            return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
        };

        // 套用清理
        ['meditation', 'prayer', 'closingWord', 'understanding'].forEach(field => {
            if (result[field]) result[field] = sanitizeChineseText(result[field]);
        });

        // [SOVEREIGN RECOVERY] 若解析失敗導致核心欄位缺失，嘗試從 response 備援
        if (!result.meditation && result.response) {
            console.log('🛡️ [StyleFormatter] Detected raw response, falling back to meditation mapping.');
            result.meditation = sanitizeChineseText(result.response);
            
            // 如果連標題或經文都沒被解析出來，嘗試給予預設值
            if (!result.scripture && coreContent.verse_text) result.scripture = coreContent.verse_text;
            if (!result.scriptureReference && coreContent.selected_verse) result.scriptureReference = coreContent.selected_verse;
        }

        // 套用排版手 (Mobile optimized)
        if (result.meditation) {
            try {
                result.meditation = await formatForMobileReading(result.meditation);
            } catch (e) {
                console.warn('[StyleFormatter] Mobile formatting failed:', e.message);
            }
        }

        return result;

    } catch (error) {
        console.error('❌ [StyleFormatter] Sovereign Brain failed:', error.message);
        throw error;
    }
}

/**
 * Get available style names for admin UI
 */
export function getAvailableStyles() {
    return Object.values(MEDITATION_STYLES).map(s => ({
        id: s.id,
        name: s.name,
        description: s.prompt.substring(0, 50) + '...'
    }));
}

export default {
    formatDevotional,
    getAvailableStyles
};
