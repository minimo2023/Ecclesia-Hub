/**
 * 資料庫健康檢查模組 (V3 Sovereign)
 * Database Health Check Module
 * 核心準則：Postgres 主權、SQLite 過時隔離
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbBackup from '../infrastructure/dbBackup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 檢查所有資料庫健康狀態
 * @returns {Object} 檢查結果
 */
export async function checkAllDatabases() {
    const dbType = process.env.DB_TYPE || 'postgres';
    
    if (dbType === 'postgres') {
        console.log('🔍 [HealthCheck] Postgres Mode: Integrity is managed by PostgreSQL server. Skipping file checks.');
        return { 
            timestamp: new Date().toISOString(),
            allHealthy: true, 
            mode: 'postgres' 
        };
    }

    // --- SQLite Legacy Logic (僅在非 Postgres 模式下執行) ---
    console.log('\n🔍 [HealthCheck] Checking SQLite database integrity...\n');

    const results = {
        timestamp: new Date().toISOString(),
        allHealthy: true,
        databases: {}
    };

    const databases = dbBackup.CONFIG?.databases || [];
    for (const dbName of databases) {
        const dbPath = path.join(dbBackup.DATA_DIR || './data', dbName);

        if (!fs.existsSync(dbPath)) {
            console.warn(`⚠️ [HealthCheck] ${dbName} not found.`);
            results.databases[dbName] = { status: 'missing', action: 'none' };
            continue;
        }

        const integrity = dbBackup.checkIntegrity(dbPath);

        if (integrity.ok) {
            console.log(`✅ [HealthCheck] ${dbName}: OK`);
            results.databases[dbName] = { status: 'healthy', action: 'none' };
        } else {
            console.error(`❌ [HealthCheck] ${dbName}: CORRUPTED - ${integrity.message}`);
            results.allHealthy = false;

            const restored = await autoRestore(dbName);
            results.databases[dbName] = {
                status: 'corrupted',
                action: restored ? 'auto_restored' : 'needs_manual_restore'
            };
        }
    }

    return results;
}

/**
 * 自動從備份還原 (SQLite Only)
 */
async function autoRestore(dbName) {
    console.log(`🔄 [HealthCheck] Attempting auto-restore for ${dbName}...`);
    try {
        const latestBackup = dbBackup.getLatestBackup(dbName);
        if (latestBackup) {
            return dbBackup.restoreDatabase(dbName, latestBackup);
        }
    } catch (e) {
        console.error(`❌ [HealthCheck] Auto-restore failed:`, e.message);
    }
    return false;
}

export function manualRestore(dbName, backupPath = null) {
    return { success: dbBackup.restoreDatabase(dbName, backupPath), database: dbName };
}

export default {
    checkAllDatabases,
    manualRestore
};
