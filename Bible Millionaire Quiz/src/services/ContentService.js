/**
 * ContentService
 * 前端內容服務層，封裝對 /api/content 的請求
 */
import ApiClient from './ApiClient';

const ContentService = {
    // --- 地理資訊 (Geography) ---
    geography: {
        /**
         * 取得所有地點
         */
        async getAllLocations() {
            return await ApiClient.get('/content/geography/locations');
        },

        /**
         * 根據經文取得地點
         */
        async getLocationsByVerse(book, chapter, verse = null) {
            const params = { book, chapter };
            if (verse) params.verse = verse;
            return await ApiClient.get('/content/geography/locations/verse', { params });
        },

        /**
         * 搜尋地點
         */
        async searchLocations(query) {
            return await ApiClient.get('/content/geography/search', { params: { q: query } });
        }
    },

    // --- 資源管理 (Resources) ---
    resources: {
        /**
         * 取得所有分類
         */
        async getCategories() {
            return await ApiClient.get('/content/categories');
        },

        /**
         * 查詢資源列表
         */
        async query(filters = {}) {
            return await ApiClient.get('/content/resources', { params: filters });
        },

        /**
         * 取得資源詳情（包含內容）
         */
        async getById(id) {
            return await ApiClient.get(`/content/resources/${id}`);
        }
    },

    // --- 搜尋 (Search) ---
    search: {
        /**
         * 全文搜尋資源庫
         */
        async searchLibrary(query, book = null, chapter = null, limit = 20) {
            const params = { q: query, limit };
            if (book) params.book = book;
            if (chapter) params.chapter = chapter;
            return await ApiClient.get('/content/search', { params });
        }
    },

    // --- 書卷 (Bible Books) ---
    bible: {
        /**
         * 取得所有書卷元數據
         */
        async getAllBooks() {
            return await ApiClient.get('/content/bible/books');
        }
    }
};

export default ContentService;
