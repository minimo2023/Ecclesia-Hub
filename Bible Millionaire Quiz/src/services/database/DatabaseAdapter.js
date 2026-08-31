/**
 * DatabaseAdapter.js
 * 資料庫抽象層 - HTTP API 專用
 * 
 * 使用方式：
 * import { database } from './DatabaseAdapter';
 * await database.save('collection', 'docId', data);
 */

/**
 * API 適配器（通過 HTTP 呼叫後端）
 */
// Use environment variable or default to relative path (empty string) for Single Entry Point
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class APIAdapter {
    constructor() {
        // 使用統一的 API 設定
        this.apiBase = API_BASE_URL;

        console.log(`📡 API Adapter initialized with base URL: ${this.apiBase}`);
    }

    async save(collectionPath, docId, data) {
        // Use absolute path when apiBase is empty to ensure Vite proxy works
        const url = this.apiBase ? `${this.apiBase}/api/${collectionPath}/${docId}` : `/api/${collectionPath}/${docId}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`API save failed: ${response.status}`);
        }

        const result = await response.json();
        return result.id;
    }

    async get(collectionPath, docId) {
        const response = await fetch(`${this.apiBase}/api/${collectionPath}/${docId}`);

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`API get failed: ${response.status}`);
        }

        return await response.json();
    }

    async query(collectionPath, conditions = {}) {
        const params = new URLSearchParams(conditions);
        const response = await fetch(`${this.apiBase}/api/${collectionPath}?${params}`);

        if (!response.ok) {
            throw new Error(`API query failed: ${response.status}`);
        }

        return await response.json();
    }

    async delete(collectionPath, docId) {
        const response = await fetch(`${this.apiBase}/api/${collectionPath}/${docId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`API delete failed: ${response.status}`);
        }

        return true;
    }

    async add(collectionPath, data) {
        const response = await fetch(`${this.apiBase}/api/${collectionPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`API add failed: ${response.status}`);
        }

        const result = await response.json();
        return result.id;
    }

    async count(collectionPath, conditions = {}) {
        const params = new URLSearchParams(conditions);
        const response = await fetch(`${this.apiBase}/api/${collectionPath}/_count?${params}`);

        if (!response.ok) {
            throw new Error(`API count failed: ${response.status}`);
        }

        const result = await response.json();
        return result.count;
    }

    async batchSave(collectionPath, items) {
        const response = await fetch(`${this.apiBase}/api/${collectionPath}/_batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });

        if (!response.ok) {
            throw new Error(`API batch save failed: ${response.status}`);
        }

        const result = await response.json();
        return result.results;
    }
}

/**
 * 統一的資料庫適配器（僅 API 模式）
 */
export class DatabaseAdapter {
    constructor() {
        this.adapter = new APIAdapter();
        this.type = 'api';
        console.log(`✅ Database adapter initialized: HTTP API mode`);
    }

    /**
     * 保存文檔
     */
    async save(collectionPath, docId, data) {
        return await this.adapter.save(collectionPath, docId, data);
    }

    /**
     * 獲取文檔
     */
    async get(collectionPath, docId) {
        return await this.adapter.get(collectionPath, docId);
    }

    /**
     * 新增文檔 (自動 ID)
     */
    async add(collectionPath, data) {
        return await this.adapter.add(collectionPath, data);
    }

    /**
     * 查詢
     */
    async query(collectionPath, conditions = {}) {
        return await this.adapter.query(collectionPath, conditions);
    }

    /**
     * 計算數量
     */
    async count(collectionPath, conditions = {}) {
        return await this.adapter.count(collectionPath, conditions);
    }

    /**
     * 刪除
     */
    async delete(collectionPath, docId) {
        return await this.adapter.delete(collectionPath, docId);
    }

    /**
     * 批量保存
     */
    async batchSave(collectionPath, items) {
        return await this.adapter.batchSave(collectionPath, items);
    }

    /**
     * 獲取適配器類型
     */
    getType() {
        return this.type;
    }
}

/**
 * 創建資料庫實例
 */
export function createDatabase() {
    return new DatabaseAdapter();
}

// 導出單例
export const database = createDatabase();
