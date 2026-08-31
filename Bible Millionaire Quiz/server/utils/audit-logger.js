import { dbOps } from '../database/index.js';

/**
 * Admin Audit Logger - v1.5 治理核心
 * 負責記錄所有敏感的管理行為，包含資料的前後對照。
 */
export const AuditLogger = {
    /**
     * 記錄一筆審計日誌
     * @param {string} adminId 管理員 ID
     * @param {string} actionType 操作類型 (如 'UPDATE_USER', 'ADAPT_CREDITS')
     * @param {string} targetType 目標類型 (如 'user', 'ai_wallet')
     * @param {string} targetId 目標 ID
     * @param {Object} options 額外選項 { before, after, reason, ip }
     */
    async log(adminId, actionType, targetType, targetId, { before, after, reason, ip } = {}) {
        try {
            // PostgresAdapter uses run() for EXEC commands
            await dbOps.db.prepare(`
                INSERT INTO admin_audit_logs 
                (admin_user_id, action_type, target_type, target_id, before_json, after_json, reason, ip_address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                adminId,
                actionType,
                targetType,
                targetId,
                before ? JSON.stringify(before) : null,
                after ? JSON.stringify(after) : null,
                reason || null,
                ip || null
            );
            
            console.log(`📝 [Audit] ${adminId} | ${actionType} on ${targetType}:${targetId}`);
        } catch (error) {
            // 審計失敗不應中斷主業務流，但應在伺服器端留下警報
            console.error('❌ [Audit] CRITICAL: Failed to write audit log:', error);
        }
    }
};

export default AuditLogger;
