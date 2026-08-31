/**
 * Bible Service - 聖經經文服務
 * 
 * V3 Refactor:
 * 此服務現在是 "Thin Client"，主要負責呼叫後端 API。
 * 所有的快取、外部 API 備援、資料庫存取都已移至後端 (ContentManager)。
 */
import { BIBLE_VERSIONS } from '../../config/bible';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class BibleService {

    /**
     * 取得單節經文
     * @param {string} book - 書卷名 (First order: English, e.g., 'Genesis' or Chinese '創世記')
     * @param {number} chapter - 章
     * @param {number} verse - 節
     * @param {string} version - 版本 (optional)
     * @param {string} locale - 語言環境 ('zh-TW' | 'en')
     */
    async getVerse(book, chapter, verse, version = BIBLE_VERSIONS.CUV, locale = 'zh-TW') {
        try {
            const queryParams = new URLSearchParams({
                locale: locale,
                version: version
            });

            const response = await fetch(`${API_BASE_URL}/bible/verse/${book}/${chapter}/${verse}?${queryParams.toString()}`);

            if (!response.ok) {
                // Return null instead of throwing to allow UI to handle empty states gracefully
                console.warn(`[BibleService] Failed to fetch verse: ${response.status}`);
                return null;
            }

            const result = await response.json();
            if (result.success) {
                return result.data;
            } else {
                return null;
            }
        } catch (error) {
            console.error('BibleService.getVerse error:', error);
            return null;
        }
    }

    /**
     * 取得整章經文
     */
    async getChapter(book, chapter, version = BIBLE_VERSIONS.CUV, locale = 'zh-TW') {
        try {
            const queryParams = new URLSearchParams({
                locale: locale,
                version: version
            });

            const response = await fetch(`${API_BASE_URL}/bible/chapter/${book}/${chapter}?${queryParams.toString()}`);

            if (!response.ok) {
                console.warn(`[BibleService] Failed to fetch chapter: ${response.status}`);
                return [];
            }

            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                return result.data;
            }
            return [];
        } catch (error) {
            console.error('BibleService.getChapter error:', error);
            return [];
        }
    }

    /**
     * 取得可用書卷列表 (從後端 DB 統計)
     */
    async getAvailableBooks(locale = 'zh-TW') {
        try {
            const response = await fetch(`${API_BASE_URL}/bible/available-books?locale=${locale}`);
            if (response.ok) {
                const result = await response.json();
                return result.data || [];
            }
            return [];
        } catch (error) {
            console.error('BibleService.getAvailableBooks error:', error);
            return [];
        }
    }
}

export const bibleService = new BibleService();
export default bibleService;
