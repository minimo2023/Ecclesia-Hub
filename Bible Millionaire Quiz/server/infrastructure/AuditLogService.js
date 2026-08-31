import { dbOps } from '../database/index.js';
import crypto from 'crypto';

class AuditLogService {
    /**
     * Log a sensitive action
     * @param {Object} entry
     * {
     *   userId: UUID (actor),
     *   action: string,
     *   targetType: string,
     *   targetId: string,
     *   before: Object,
     *   after: Object,
     *   reason: string,
     *   correlationId: string,
     *   ipAddress: string,
     *   userAgent: string,
     *   severity: 'info' | 'warning' | 'critical'
     * }
     */
    async log(entry) {
        try {
            const id = crypto.randomUUID();
            await dbOps.db.query(`
                INSERT INTO audit_logs (
                    id, actor_user_id, action_type, target_type, target_id,
                    before_json, after_json, reason, correlation_id,
                    ip_address, user_agent, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                id,
                entry.userId,
                entry.action,
                entry.targetType || 'system',
                entry.targetId || null,
                entry.before ? JSON.stringify(entry.before) : null,
                entry.after ? JSON.stringify(entry.after) : null,
                entry.reason || null,
                entry.correlationId || crypto.randomUUID(),
                entry.ipAddress || null,
                entry.userAgent || null
            ]);
            console.log(`[AuditLog] ${entry.action} by ${entry.userId}`);
        } catch (e) {
            console.error('Failed to write audit log:', e);
        }
    }

    // Helper for Auth actions
    async logAuth(userId, action, details = {}, req = null) {
        await this.log({
            userId,
            action,
            targetType: 'auth',
            after: details,
            ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null,
            userAgent: req ? req.headers['user-agent'] : null,
            severity: action.includes('fail') ? 'warning' : 'info'
        });
    }

    // Helper for Admin actions
    async logAdmin(adminId, action, targetType, targetId, details = {}, req = null) {
        await this.log({
            userId: adminId,
            action,
            targetType,
            targetId,
            after: details,
            ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null,
            userAgent: req ? req.headers['user-agent'] : null,
            severity: 'critical'
        });
    }
}

export default new AuditLogService();
