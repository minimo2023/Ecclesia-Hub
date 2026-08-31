import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/secrets.js';
import { dbOps } from '../database/index.js';
import SecurityService from './SecurityService.js';
import crypto from 'crypto';

// Throttle configuration constants
const THROTTLE = {
    ACCOUNT_WINDOW_MINUTES: 15,   // 觀察時間窗口
    ACCOUNT_MAX_FAILURES: 5,      // 帳號層：5次失敗即鎖定
    IP_MAX_FAILURES: 10,          // IP層：10次失敗即鎖定（防範帳號輪替攻擊）
};

class AuthService {
    constructor() {
        this.ACCESS_TOKEN_EXPIRE = '15m';
        this.REFRESH_TOKEN_EXPIRE = '7d';
        this.JWT_SECRET = getJwtSecret();
    }

    /**
     * [P1-2] 登入節流：雙層防護（帳號層 + IP 層）
     * 在密碼驗證前執行，避免暴力破解。
     * @param {string} identifier  登入識別碼（帳號名）
     * @param {string|null} ipAddress  來源 IP
     * @returns {{ blocked: boolean, reason: string|null, retryAfterMinutes: number|null }}
     */
    async checkLoginThrottle(identifier, ipAddress) {
        const windowStart = new Date(Date.now() - THROTTLE.ACCOUNT_WINDOW_MINUTES * 60 * 1000);

        // --- 帳號層檢查 ---
        const accountRow = await dbOps.db.get(`
            SELECT COUNT(*) as cnt
            FROM user_login_attempts
            WHERE email_or_username = $1
              AND is_success = false
              AND attempted_at >= $2
        `, [identifier, windowStart]);

        const accountFailures = parseInt(accountRow?.cnt || 0);

        if (accountFailures >= THROTTLE.ACCOUNT_MAX_FAILURES) {
            // 計算最早失敗記錄，推算解鎖時間
            const earliest = await dbOps.db.get(`
                SELECT MIN(attempted_at) as first_fail
                FROM user_login_attempts
                WHERE email_or_username = $1
                  AND is_success = false
                  AND attempted_at >= $2
            `, [identifier, windowStart]);

            const unlockAt = new Date(new Date(earliest.first_fail).getTime() + THROTTLE.ACCOUNT_WINDOW_MINUTES * 60 * 1000);
            const retryAfterMinutes = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));

            return {
                blocked: true,
                reason: 'ACCOUNT_THROTTLE',
                error: `登入嘗試次數過多，請 ${retryAfterMinutes} 分鐘後再試`,
                retryAfterMinutes
            };
        }

        // --- IP 層檢查（防範帳號輪替攻擊）---
        if (ipAddress) {
            const ipRow = await dbOps.db.get(`
                SELECT COUNT(*) as cnt
                FROM user_login_attempts
                WHERE ip_address = $1
                  AND is_success = false
                  AND attempted_at >= $2
            `, [ipAddress, windowStart]);

            const ipFailures = parseInt(ipRow?.cnt || 0);

            if (ipFailures >= THROTTLE.IP_MAX_FAILURES) {
                return {
                    blocked: true,
                    reason: 'IP_THROTTLE',
                    error: '來自此位置的登入嘗試過於頻繁，請稍後再試',
                    retryAfterMinutes: THROTTLE.ACCOUNT_WINDOW_MINUTES
                };
            }
        }

        return { blocked: false };
    }

    /**
     * Generate Access and Refresh tokens
     */
    async createSession(user) {
        const userId = user.id;
        const accessToken = jwt.sign(
            {
                userId,
                username: user.username,
                role: user.role || 'user',
                adminRoles: user.adminRoles || []
            },
            this.JWT_SECRET,
            { expiresIn: this.ACCESS_TOKEN_EXPIRE }
        );

        const refreshToken = crypto.randomBytes(40).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await dbOps.db.run(`
            INSERT INTO user_sessions (id, user_id, refresh_token_hash, expires_at, created_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [crypto.randomUUID(), userId, refreshToken, expiresAt]);

        return { accessToken, refreshToken };
    }

    /**
     * Standard Login Flow (with Throttle)
     */
    async login(username, password, req = null) {
        const identifier = username.toLowerCase();
        const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;

        // [Step 1] 節流檢查（在查詢使用者前執行，避免洩露帳號是否存在）
        const throttle = await this.checkLoginThrottle(identifier, ipAddress);
        if (throttle.blocked) {
            return { success: false, error: throttle.error, throttled: true };
        }

        // [Step 2] 查詢帳號
        const user = await dbOps.db.get('SELECT * FROM users WHERE username = $1', [identifier]);

        if (!user) {
            // 即使帳號不存在，也記錄一筆失敗（防止帳號枚舉攻擊的計數旁路）
            await this.recordLoginAttempt(identifier, false, req);
            return { success: false, error: '用戶名或密碼錯誤' };
        }

        // [Step 3] 帳號狀態檢查
        if (user.status !== 'active') {
            const statusMap = {
                'suspended': '帳號已被暫停使用',
                'banned': '帳號已被永久封鎖'
            };
            return { success: false, error: statusMap[user.status] || '帳號目前無法登入' };
        }

        // [Step 4] 密碼驗證
        const isValid = await SecurityService.verifyPassword(user.passwordHash, password);

        if (!isValid) {
            await this.recordLoginAttempt(identifier, false, req);
            return { success: false, error: '用戶名或密碼錯誤' };
        }

        // [Step 5] 登入成功：計算密碼時效性階段 (Password Maturity)
        const now = new Date();
        const lastPwdChange = user.lastPasswordChangedAt ? new Date(user.lastPasswordChangedAt) : (user.createdAt ? new Date(user.createdAt) : now);
        const daysSinceChange = Math.floor((now - lastPwdChange) / (1000 * 60 * 60 * 24));
        const dismissedCount = user.pwdWarningDismissedCount || 0;
        const lastDismissed = user.lastWarningDismissedAt ? new Date(user.lastWarningDismissedAt) : null;

        let maturityStage = 'ok';
        if (user.role !== 'super_admin') {
            if (dismissedCount === 0) {
                if (daysSinceChange >= 90) maturityStage = 'warn1';
            } else if (dismissedCount === 1) {
                if (lastDismissed) {
                    const daysSinceDismiss = Math.floor((now - lastDismissed) / (1000 * 60 * 60 * 24));
                    if (daysSinceDismiss >= 90) maturityStage = 'warn2';
                } else if (daysSinceChange >= 90) {
                    maturityStage = 'warn2'; // Fallback
                }
            } else if (dismissedCount >= 2) {
                if (lastDismissed) {
                    const daysSinceDismiss = Math.floor((now - lastDismissed) / (1000 * 60 * 60 * 24));
                    if (daysSinceDismiss >= 30) maturityStage = 'force';
                } else {
                    maturityStage = 'force';
                }
            }
            // 絕對限制：超過 180 天強制重新設定
            if (daysSinceChange >= 180) maturityStage = 'force';
        }

        await this.recordLoginAttempt(identifier, true, req);

        // [SOVEREIGN] 每次成功登入，主動清空該使用者的靈修筆記草稿，保障隱私與乾淨無殘留的體驗
        try {
            await dbOps.db.run('DELETE FROM public.note_drafts WHERE user_id = $1', [user.id]);
        } catch (e) {
            console.error('⚠️ [AuthService] Failed to clear user drafts on login:', e.message);
        }

        const { accessToken, refreshToken } = await this.createSession(user);

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role || 'user',
                adminRoles: user.adminRoles || [],
                coins: user.coins,
                passwordMaturity: {
                    stage: maturityStage,
                    daysSinceChange,
                    dismissedCount,
                    lastPasswordChangedAt: user.lastPasswordChangedAt
                }
            },
            accessToken,
            refreshToken
        };
    }

    /**
     * Record a login attempt (success or failure)
     */
    async recordLoginAttempt(identifier, isSuccess, req = null) {
        const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
        const userAgent = req ? req.headers['user-agent'] : null;

        await dbOps.db.run(`
            INSERT INTO user_login_attempts (id, email_or_username, is_success, ip_address, user_agent, attempted_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [crypto.randomUUID(), identifier, isSuccess, ipAddress, userAgent]);
    }

    /**
     * [P1-2] 忘記密碼 - 第一步：獲取安全問題
     */
    async getSecurityQuestion(username) {
        const user = await dbOps.db.get('SELECT security_question FROM users WHERE username = $1', [username.toLowerCase()]);
        if (!user) return null;
        return user.securityQuestion;
    }

    /**
     * [P1-2] 忘記密碼 - 第二步：驗證答案並發放一次性 Reset Token
     */
    async verifySecurityAnswer(username, answer, req = null) {
        const user = await dbOps.db.get('SELECT id, security_answer_hash FROM users WHERE username = $1', [username.toLowerCase()]);
        if (!user || !user.securityAnswerHash) return { success: false, error: '帳號未設定安全問題' };

        const isValid = await SecurityService.verifyPassword(user.securityAnswerHash, answer);
        if (!isValid) return { success: false, error: '安全問題答案不正確' };

        // 生成 15 分鐘有效的一次性 Token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await dbOps.db.run(`
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at, request_ip)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        `, [user.id, tokenHash, expiresAt, req ? req.ip : null]);

        return { success: true, resetToken: rawToken };
    }

    /**
     * [P1-2] 忘記密碼 - 第三步：憑 Token 重設密碼
     */
    async resetPasswordWithToken(rawToken, newPassword) {
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        // 查找有效權杖 (未過期且未被使用)
        const tokenRow = await dbOps.db.get(`
            SELECT * FROM password_reset_tokens
            WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        `, [tokenHash]);

        if (!tokenRow) {
            return { success: false, error: '此連結已失效、已使用或已過期' };
        }

        const newHash = await SecurityService.hashPassword(newPassword);
        const userId = tokenRow.userId;
        const tokenId = tokenRow.id;

        await dbOps.db.transaction(async (tx) => {
            await tx.run('UPDATE users SET password_hash = $1, last_password_changed_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, userId]);
            await tx.run('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [tokenId]);
        });

        return { success: true, userId };
    }

    async revokeSession(refreshToken) {
        await dbOps.db.run('DELETE FROM user_sessions WHERE refresh_token_hash = $1', [refreshToken]);
    }
}

export default new AuthService();
