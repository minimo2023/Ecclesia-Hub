/**
 * Reference Pipeline - 共用模組
 * 提供資料庫連接和常用工具函數
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DATA_DIR = join(dirname(dirname(__dirname)), 'data');
export const CONTENT_DB_PATH = join(DATA_DIR, 'content.db');

let _db = null;
let _SQL = null;

/**
 * 取得資料庫連接（單例）
 */
export async function getDb() {
    if (_db) return _db;

    _SQL = await initSqlJs();
    const buffer = readFileSync(CONTENT_DB_PATH);
    _db = new _SQL.Database(buffer);
    console.log('✅ DB connected');
    return _db;
}

/**
 * 儲存資料庫
 */
export function saveDb() {
    if (!_db) return;
    const data = _db.export();
    writeFileSync(CONTENT_DB_PATH, Buffer.from(data));
    console.log('✅ DB saved');
}

/**
 * 執行單一查詢
 */
export function queryOne(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}

/**
 * 執行多筆查詢
 */
export function queryAll(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * 檢查檔案是否存在
 */
export function fileExists(path) {
    try {
        return existsSync(path);
    } catch {
        return false;
    }
}
