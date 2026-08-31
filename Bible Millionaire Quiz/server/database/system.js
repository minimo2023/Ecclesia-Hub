/**
 * 系統級資料庫操作 (System & Auditing)
 * System Database Operations (stats, info, cleanup)
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { dataRoot } from '../utils/paths.js';

/**
 * 建立系統操作模組
 * @param {Object} dbs - { usersDb, contentDb, notesDb, gamesDb }
 */
export function createSystemOps(dbs) {
    const { usersDb, contentDb, notesDb, gamesDb } = dbs;

    const countOptionalTable = async (db, qualifiedTableName) => {
        const relation = await db.get('SELECT to_regclass($1) AS relation', [qualifiedTableName]);
        if (!relation?.relation) {
            return { count: 0 };
        }

        // The table name is supplied only by this module, never by a request.
        return db.get(`SELECT COUNT(*) as count FROM ${qualifiedTableName}`);
    };

    return {
        /**
         * 取得全系統統計資料 (用於管理後台首頁)
         */
        async getStats() {
            try {
                // 並行執行所有計數查詢以求精準與速度
                const queries = [
                    contentDb.get('SELECT COUNT(*) as count FROM public.bible_verses'),
                    contentDb.get('SELECT COUNT(*) as count FROM public.locations'),
                    usersDb.get('SELECT COUNT(*) as count FROM public.users'),
                    contentDb.get('SELECT COUNT(*) as count FROM public.bible_objects'),
                    countOptionalTable(contentDb, 'public.commentaries'),
                    gamesDb.get('SELECT COUNT(*) as count FROM public.questions'),
                    contentDb.get('SELECT COUNT(*) as count FROM public.lexicons'),
                    gamesDb.get("SELECT COUNT(*) as count FROM public.questions WHERE status = 'flagged'")
                ];
                
                const results = await Promise.allSettled(queries);
                
                const safeGet = (index) => {
                    if (results[index].status === 'fulfilled' && results[index].value) {
                        return parseInt(results[index].value.count || 0);
                    }
                    return 0;
                };

                const questionsCount = safeGet(5);
                const flaggedCount = safeGet(7);

                return {
                    verses: safeGet(0),
                    locations: safeGet(1),
                    users: safeGet(2),
                    objects: safeGet(3),
                    commentaries: safeGet(4),
                    questions: questionsCount,
                    lexicons: safeGet(6),
                    total: questionsCount,
                    flagged: flaggedCount,
                    byCategory: {
                        pending: flaggedCount
                    },
                    people: 0,
                    events: 0
                };
            } catch (error) {
                console.error('[SystemOps] getStats error:', error.message);
                return { verses: 0, locations: 0, users: 0, questions: 0, people: 0, events: 0, commentaries: 0, lexicons: 0, objects: 0 };
            }
        },

        /**
         * 取得系統運作資訊
         */
        async getSystemInfo() {
            try {
                const dataDir = dataRoot;
                const dbFiles = ['users.db', 'content.db', 'notes.db', 'games.db'];
                const dbSizes = {};
                let totalSize = 0;

                for (const file of dbFiles) {
                    const filePath = path.join(dataDir, file);
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        dbSizes[file] = stats.size;
                        totalSize += stats.size;
                    }
                }

                return {
                    platform: os.platform(),
                    arch: os.arch(),
                    nodeVersion: process.version,
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    dbSizes,
                    totalDbSize: totalSize,
                    osRelease: os.release(),
                    loadAvg: os.loadavg ? os.loadavg() : [0, 0, 0]
                };
            } catch (error) {
                console.error('[SystemOps] getSystemInfo error:', error.message);
                return { error: error.message };
            }
        },

        /**
         * 取得系統審計日誌
         */
        async getAuditLogs({ page = 1, limit = 50 } = {}) {
            try {
                const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
                const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
                const offset = (safePage - 1) * safeLimit;
                const [rows, totalRow] = await Promise.all([
                    usersDb.query(`
                        SELECT al.id,
                               al.created_at,
                               COALESCE(u.username, 'system') AS admin_username,
                               COALESCE(u.display_name, u.username, '系統') AS admin_display_name,
                               COALESCE(al.action_type, al.action, 'UNKNOWN') AS action,
                               COALESCE(al.target_type, '') AS target_table,
                               al.target_id,
                               al.ip_address,
                               jsonb_build_object(
                                   'before', al.before_json,
                                   'after', al.after_json,
                                   'reason', al.reason,
                                   'correlationId', al.correlation_id
                               ) AS changes
                        FROM public.audit_logs al
                        LEFT JOIN public.users u
                          ON u.id::text = COALESCE(al.actor_user_id::text, al.user_id::text)
                        ORDER BY al.created_at DESC
                        LIMIT $1 OFFSET $2
                    `, [safeLimit, offset]),
                    usersDb.get('SELECT COUNT(*) AS count FROM public.audit_logs')
                ]);
                const total = Number.parseInt(totalRow?.count || 0, 10);

                return {
                    data: rows,
                    pagination: {
                        page: safePage,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / safeLimit)
                    }
                };
            } catch (error) {
                console.error('[SystemOps] getAuditLogs error:', error);
                throw error;
            }
        },

        /**
         * 取得系統設定
         */
        async getSetting(key, defaultValue = null) {
            try {
                const row = await usersDb.get('SELECT value FROM system_settings WHERE key = $1', [key]);
                return row ? row.value : defaultValue;
            } catch (error) {
                console.error(`[SystemOps] getSetting(${key}) error:`, error.message);
                return defaultValue;
            }
        },

        /**
         * 儲存系統設定
         */
        async saveSetting(key, value, description = null) {
            try {
                await usersDb.run(`
                    INSERT INTO system_settings (key, value, description, updated_at)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) DO UPDATE SET
                        value = EXCLUDED.value,
                        description = COALESCE(EXCLUDED.description, system_settings.description),
                        updated_at = EXCLUDED.updated_at
                `, [key, value, description]);
                return true;
            } catch (error) {
                console.error(`[SystemOps] saveSetting(${key}) error:`, error.message);
                return false;
            }
        }
    };
}
