/**
 * 資料庫備份服務
 * Database Backup Service
 *
 * 功能：
 * - 定時備份所有資料庫
 * - 備份輪替（保留指定數量）
 * - 健康檢查（integrity_check）
 * - 從備份還原
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 路徑配置
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUP_DIR = 'D:\\backup\\database';  // 備份到獨立資料夾，更安全
const DOCKER_DATA_DIR = 'D:\\DockerApps\\BibleQuiz\\data';

// 備份配置
const CONFIG = {
    maxHourlyBackups: 24,      // 保留 24 份小時備份
    maxDailyBackups: 7,        // 保留 7 份每日備份
    databases: ['games.db', 'users.db', 'content.db', 'notes.db', 'fhl_bible.db']
};

/**
 * 確保備份目錄存在
 */
function ensureBackupDirs() {
    const dirs = [
        BACKUP_DIR,
        path.join(BACKUP_DIR, 'hourly'),
        path.join(BACKUP_DIR, 'daily'),
        path.join(BACKUP_DIR, 'pre-sync'),
        path.join(BACKUP_DIR, 'manual')
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created backup directory: ${dir}`);
        }
    });
}

/**
 * 檢查資料庫完整性
 * @param {string} dbPath - 資料庫路徑
 * @returns {Object} { ok: boolean, message: string }
 */
export function checkIntegrity(dbPath) {
    try {
        const db = new Database(dbPath, { readonly: true });
        const result = db.pragma('integrity_check');
        db.close();

        const isOk = result.length === 1 && result[0].integrity_check === 'ok';
        return {
            ok: isOk,
            message: isOk ? 'OK' : result.map(r => r.integrity_check).join(', ')
        };
    } catch (error) {
        return {
            ok: false,
            message: error.message
        };
    }
}

/**
 * 備份單一資料庫
 * @param {string} dbName - 資料庫名稱
 * @param {string} targetDir - 目標目錄
 * @returns {boolean} 是否成功
 */
export function backupDatabase(dbName, targetDir) {
    const srcPath = path.join(DATA_DIR, dbName);
    const destPath = path.join(targetDir, dbName);

    if (!fs.existsSync(srcPath)) {
        console.warn(`⚠️ [Backup] Source not found: ${srcPath}`);
        return false;
    }

    try {
        // 先做 WAL checkpoint 確保資料寫入主檔案
        try {
            const srcDb = new Database(srcPath);
            srcDb.pragma('wal_checkpoint(TRUNCATE)');
            srcDb.close();
        } catch (e) {
            // Ignore if not in WAL mode or can't open
        }

        // 使用檔案複製
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ [Backup] ${dbName} → ${targetDir}`);
        return true;
    } catch (error) {
        console.error(`❌ [Backup] Failed to backup ${dbName}:`, error.message);
        return false;
    }
}

/**
 * 備份所有資料庫
 * @param {string} type - 備份類型 ('hourly', 'daily', 'manual', 'pre-sync')
 * @returns {Object} 備份結果
 */
export function backupAll(type = 'hourly') {
    ensureBackupDirs();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const targetDir = path.join(BACKUP_DIR, type, timestamp);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    console.log(`\n📦 [Backup] Starting ${type} backup...`);

    const results = {
        timestamp,
        type,
        path: targetDir,
        databases: {}
    };

    for (const dbName of CONFIG.databases) {
        // 先檢查完整性
        const srcPath = path.join(DATA_DIR, dbName);
        if (fs.existsSync(srcPath)) {
            const integrity = checkIntegrity(srcPath);
            if (!integrity.ok) {
                console.warn(`⚠️ [Backup] ${dbName} integrity check failed: ${integrity.message}`);
                results.databases[dbName] = { success: false, reason: 'integrity_failed' };
                continue;
            }
        }

        const success = backupDatabase(dbName, targetDir);
        results.databases[dbName] = { success };
    }

    // 清理舊備份
    cleanupOldBackups(type);

    console.log(`📦 [Backup] ${type} backup completed.\n`);
    return results;
}

/**
 * 清理舊備份
 * @param {string} type - 備份類型
 */
function cleanupOldBackups(type) {
    const maxCount = type === 'hourly' ? CONFIG.maxHourlyBackups : CONFIG.maxDailyBackups;
    const backupTypeDir = path.join(BACKUP_DIR, type);

    if (!fs.existsSync(backupTypeDir)) return;

    const backups = fs.readdirSync(backupTypeDir)
        .filter(f => fs.statSync(path.join(backupTypeDir, f)).isDirectory())
        .sort()
        .reverse();

    if (backups.length > maxCount) {
        const toDelete = backups.slice(maxCount);
        toDelete.forEach(backup => {
            const backupPath = path.join(backupTypeDir, backup);
            fs.rmSync(backupPath, { recursive: true, force: true });
            console.log(`🗑️ [Backup] Deleted old backup: ${backup}`);
        });
    }
}

/**
 * 列出所有備份
 * @returns {Object} 備份清單
 */
export function listBackups() {
    ensureBackupDirs();

    const result = {};
    const types = ['hourly', 'daily', 'manual', 'pre-sync'];

    types.forEach(type => {
        const typeDir = path.join(BACKUP_DIR, type);
        if (fs.existsSync(typeDir)) {
            result[type] = fs.readdirSync(typeDir)
                .filter(f => fs.statSync(path.join(typeDir, f)).isDirectory())
                .sort()
                .reverse();
        } else {
            result[type] = [];
        }
    });

    return result;
}

/**
 * 從備份還原資料庫
 * @param {string} dbName - 資料庫名稱
 * @param {string} backupPath - 備份路徑 (完整路徑或相對於 BACKUP_DIR)
 * @returns {boolean} 是否成功
 */
export function restoreDatabase(dbName, backupPath) {
    // 解析備份路徑
    let srcPath = backupPath;
    if (!path.isAbsolute(backupPath)) {
        srcPath = path.join(BACKUP_DIR, backupPath, dbName);
    }

    if (!fs.existsSync(srcPath)) {
        console.error(`❌ [Restore] Backup not found: ${srcPath}`);
        return false;
    }

    const destPath = path.join(DATA_DIR, dbName);

    // 先驗證備份完整性
    const integrity = checkIntegrity(srcPath);
    if (!integrity.ok) {
        console.error(`❌ [Restore] Backup integrity failed: ${integrity.message}`);
        return false;
    }

    try {
        // 刪除現有的 WAL 檔案
        const walPath = destPath + '-wal';
        const shmPath = destPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        // 複製備份
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ [Restore] ${dbName} restored from ${backupPath}`);
        return true;
    } catch (error) {
        console.error(`❌ [Restore] Failed:`, error.message);
        return false;
    }
}

/**
 * 從 Docker 同步資料庫
 * @returns {Object} 同步結果
 */
export function syncFromDocker() {
    console.log(`\n🔄 [Sync] Starting sync from Docker...`);

    if (!fs.existsSync(DOCKER_DATA_DIR)) {
        console.error(`❌ [Sync] Docker data directory not found: ${DOCKER_DATA_DIR}`);
        return { success: false, reason: 'docker_dir_not_found' };
    }

    // 先備份現有資料
    console.log(`📦 [Sync] Backing up current data before sync...`);
    backupAll('pre-sync');

    const results = { success: true, databases: {} };

    for (const dbName of CONFIG.databases) {
        const srcPath = path.join(DOCKER_DATA_DIR, dbName);
        const destPath = path.join(DATA_DIR, dbName);

        if (!fs.existsSync(srcPath)) {
            console.warn(`⚠️ [Sync] ${dbName} not found in Docker`);
            results.databases[dbName] = { success: false, reason: 'not_found' };
            continue;
        }

        // 檢查來源完整性
        const integrity = checkIntegrity(srcPath);
        if (!integrity.ok) {
            console.warn(`⚠️ [Sync] ${dbName} integrity failed in Docker: ${integrity.message}`);
            results.databases[dbName] = { success: false, reason: 'integrity_failed' };
            continue;
        }

        try {
            // 刪除 WAL 檔案
            const walPath = destPath + '-wal';
            const shmPath = destPath + '-shm';
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

            // 複製
            fs.copyFileSync(srcPath, destPath);
            console.log(`✅ [Sync] ${dbName} synced from Docker`);
            results.databases[dbName] = { success: true };
        } catch (error) {
            console.error(`❌ [Sync] Failed to sync ${dbName}:`, error.message);
            results.databases[dbName] = { success: false, reason: error.message };
            results.success = false;
        }
    }

    console.log(`🔄 [Sync] Sync completed.\n`);
    return results;
}

/**
 * 獲取最新可用備份
 * @param {string} dbName - 資料庫名稱
 * @returns {string|null} 備份路徑
 */
export function getLatestBackup(dbName) {
    const types = ['hourly', 'daily', 'manual', 'pre-sync'];

    for (const type of types) {
        const typeDir = path.join(BACKUP_DIR, type);
        if (!fs.existsSync(typeDir)) continue;

        const backups = fs.readdirSync(typeDir)
            .filter(f => fs.statSync(path.join(typeDir, f)).isDirectory())
            .sort()
            .reverse();

        for (const backup of backups) {
            const backupDbPath = path.join(typeDir, backup, dbName);
            if (fs.existsSync(backupDbPath)) {
                const integrity = checkIntegrity(backupDbPath);
                if (integrity.ok) {
                    return path.join(type, backup);
                }
            }
        }
    }

    return null;
}

// 匯出預設物件
export default {
    checkIntegrity,
    backupDatabase,
    backupAll,
    listBackups,
    restoreDatabase,
    syncFromDocker,
    getLatestBackup,
    CONFIG,
    BACKUP_DIR,
    DATA_DIR,
    DOCKER_DATA_DIR
};
