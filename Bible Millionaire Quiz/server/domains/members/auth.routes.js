import express from 'express';
import crypto from 'crypto';
import SecurityService from './SecurityService.js';
import AuthService from './AuthService.js';
import AuditLogService from '../../infrastructure/AuditLogService.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { dbOps } from '../../database/index.js';
// dotenv is loaded by index.js

import { authLimiter } from '../../middleware/rateLimiter.js';
import expeditionService from '../game/expedition/ExpeditionService.js';
import AuthIdentityService, { hashToken, normalizeEmail } from './AuthIdentityService.js';
import MailService from '../../infrastructure/MailService.js';

const router = express.Router();
const REFRESH_COOKIE = 'ecclesia_refresh';
const GENERIC_EMAIL_RESPONSE = '若資料符合，我們會寄出後續操作信件';

function refreshCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 30 * 24 * 60 * 60 * 1000
    };
}

function readCookie(req, name) {
    const header = String(req.headers.cookie || '');
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
}

function setRefreshCookie(res, refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

function publicUser(user) {
    if (!user) return user;
    const {
        passwordHash, securityAnswerHash, securityQuestion,
        mustResetAuth, ...safe
    } = user;
    return {
        ...safe,
        mustResetAuth: Boolean(mustResetAuth),
        needsEmailVerification: !user.emailVerifiedAt,
        hasPassword: Boolean(passwordHash)
    };
}

async function registrationBonuses() {
    let coins = 30;
    let points = 30;
    try {
        const [coinRow, pointRow] = await Promise.all([
            dbOps.gamesDb.get("SELECT value FROM expedition_config WHERE key = 'registration_bonus'"),
            dbOps.gamesDb.get("SELECT value FROM expedition_config WHERE key = 'registration_bonus_points'")
        ]);
        if (coinRow) coins = parseInt(coinRow.value, 10) || 0;
        if (pointRow) points = parseInt(pointRow.value, 10) || 0;
    } catch (error) {
        console.warn('⚠️ [Auth] Failed to load registration bonuses:', error.message);
    }
    return { coins, points };
}

async function provisionActivatedUser(userId, username, { pendingOnly = false } = {}) {
    const bonus = await registrationBonuses();
    const result = await dbOps.db.transaction(async tx => {
        const activated = pendingOnly
            ? await tx.get(`
                UPDATE users SET status = 'active', email_verified_at = CURRENT_TIMESTAMP,
                    security_question = NULL, security_answer_hash = NULL, coins = $1
                WHERE id = $2 AND status = 'pending_email'
                RETURNING id
            `, [bonus.coins, userId])
            : { id: userId };
        if (!activated) return null;

        const wallet = await tx.get(`
            INSERT INTO ai_gov.user_ai_credit_wallet
                (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
            VALUES ($1, $2, 0, 0)
            ON CONFLICT (user_id) DO NOTHING
            RETURNING user_id
        `, [userId, bonus.points]);

        await tx.run(`
            INSERT INTO coin_ledger
                (user_id, amount, reason, idempotency_key, balance_after, created_at)
            VALUES ($1, $2, 'registration_bonus', $3, $2, CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING
        `, [userId, bonus.coins, `registration_bonus:${userId}`]);

        if (wallet) {
            await tx.run(`
                INSERT INTO ai_gov.ai_credit_ledger
                    (user_id, amount, credit_pool, reason, balance_after, total_balance_after)
                VALUES ($1, $2, 'bonus', 'registration_bonus', $2, $2)
            `, [userId, bonus.points]);
        }
        return bonus;
    });
    if (result) await expeditionService.ensureUserHasTeam(userId, username);
    return result;
}

function mobileSessionContext(req) {
    const source = req.body && typeof req.body === 'object' ? req.body : {};
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return {
        deviceId: source.deviceId,
        deviceName: source.deviceName,
        platform: source.platform || req.get('X-Client-Platform'),
        appVersion: source.appVersion || req.get('X-App-Version'),
        ipAddress: forwarded || req.ip || req.socket?.remoteAddress || null,
        userAgent: req.get('User-Agent')
    };
}

async function authPayloadForUser(userId, req, extraUser = {}, sessionContext = {}) {
    const user = await dbOps.db.get('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user || user.status !== 'active') throw new Error('用戶帳號異常');
    const { accessToken, refreshToken } = await AuthService.createSession(user, sessionContext);
    const { awarded, newBalance } = await dbOps.handleDailyBonus(user.id);
    const fullUser = await dbOps.getUser(user.id);
    if (awarded > 0) fullUser.coins = newBalance;
    const wallet = await dbOps.usersDb.get(`
        SELECT * FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1
    `, [user.id]) || { bonusAiCredits: 0, exchangeAiCredits: 0, paidAiCredits: 0 };
    await dbOps.db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await expeditionService.ensureUserHasTeam(user.id, user.username);
    await AuditLogService.logAuth(user.id, 'user_login_success', { role: user.role }, req);

    const totalCredits = (wallet.bonusAiCredits || 0) + (wallet.exchangeAiCredits || 0) + (wallet.paidAiCredits || 0);
    return {
        refreshToken,
        body: {
            success: true,
            user: {
                ...publicUser(fullUser),
                ...extraUser,
                coins: Number(fullUser.coins || 0),
                ai_credits: totalCredits,
                isAdmin: Boolean(user.isAdmin || user.role === 'super_admin' || user.role === 'admin'),
                needsEmailVerification: !user.emailVerifiedAt,
                hasPassword: Boolean(user.passwordHash)
            },
            entitlements: {
                aiCredits: { bonus: wallet.bonusAiCredits || 0, exchange: wallet.exchangeAiCredits || 0, paid: wallet.paidAiCredits || 0, total: totalCredits },
                wealth: { coins: Number(fullUser.coins || 0) },
                membership: { role: user.role || 'user', label: user.role === 'super_admin' ? '最高管理員' : (user.role === 'admin' ? '管理員' : '一般會員') }
            },
            accessToken,
            token: accessToken,
            loginBonusAwarded: awarded
        }
    };
}

async function mobileGoogleLogin(req, res) {
    try {
        const profile = await AuthIdentityService.verifyGoogleCredential(req.body?.credential);
        const identity = await AuthIdentityService.findIdentity('google', profile.subject);
        if (identity) {
            if (identity.status !== 'active') return res.status(403).json({ success: false, error: '帳號目前無法登入' });
            await AuthIdentityService.touchIdentity('google', profile.subject);
            const auth = await authPayloadForUser(identity.userId, req, {}, mobileSessionContext(req));
            return res.json({ ...auth.body, refreshToken: auth.refreshToken });
        }
        const existingUser = await dbOps.db.get('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [profile.email]);
        if (existingUser) {
            const linkToken = await AuthIdentityService.createChallenge('google_link', { profile }, { provider: 'google', providerSubject: profile.subject, userId: existingUser.id });
            return res.status(409).json({ success: false, code: 'ACCOUNT_LINK_REQUIRED', linkToken, emailHint: profile.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') });
        }
        const onboardingToken = await AuthIdentityService.createChallenge('google_onboarding', { profile }, { provider: 'google', providerSubject: profile.subject });
        return res.status(409).json({ success: false, code: 'GOOGLE_ONBOARDING_REQUIRED', onboardingToken, profile: { displayName: profile.displayName, suggestedUsername: await AuthIdentityService.suggestUsername(profile) } });
    } catch (error) {
        console.error('Mobile Google login error:', error.code || error.message);
        return res.status(error.code === 'GOOGLE_NOT_CONFIGURED' ? 503 : 401).json({ success: false, error: error.message, code: error.code || 'GOOGLE_LOGIN_FAILED' });
    }
}

// Security questions for password recovery
const SECURITY_QUESTIONS = [
    '你最喜歡的聖經人物是？',
    '你受洗的教會名稱是？',
    '你最喜歡的聖經經卷是？',
    '你第一次讀完的聖經書卷是？'
];

// GET /security-questions - Get available security questions
router.get('/security-questions', (req, res) => {
    res.json({ questions: SECURITY_QUESTIONS });
});

// POST /register - Register new user
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, confirmPassword, displayName } = req.body;
        const normalizedEmail = normalizeEmail(email);

        // Validation
        if (!username || !normalizedEmail || !password) {
            return res.status(400).json({ success: false, error: 'Email、用戶名和密碼為必填', code: 'VALIDATION_ERROR' });
        }
        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ success: false, error: '兩次輸入的密碼不一致', code: 'PASSWORD_MISMATCH' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 320) {
            return res.status(400).json({ success: false, error: 'Email 格式不正確', code: 'INVALID_EMAIL' });
        }

        // Strength validation
        const strength = SecurityService.validatePasswordStrength(password, { username, email: normalizedEmail });
        if (!strength.isValid) {
            return res.status(400).json({ success: false, error: strength.reason });
        }

        // Username format: only allow letters, numbers, underscore (3-20 chars)
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({
                success: false,
                error: '用戶名只能使用英文字母、數字和底線，長度 3-20 字元'
            });
        }

        let existingUser = await dbOps.db.get(`
            SELECT id, status, created_at FROM users
            WHERE LOWER(username) = $1 OR LOWER(email) = $2
            LIMIT 1
        `, [username.toLowerCase(), normalizedEmail]);

        if (existingUser?.status === 'pending_email' && new Date(existingUser.createdAt).getTime() < Date.now() - 24 * 60 * 60 * 1000) {
            await dbOps.db.run("DELETE FROM users WHERE id = $1 AND status = 'pending_email'", [existingUser.id]);
            existingUser = null;
        }

        if (existingUser) {
            return res.status(409).json({ success: false, error: '此用戶名或 Email 已被使用', code: 'ACCOUNT_EXISTS' });
        }

        const passwordHash = await SecurityService.hashPassword(password);
        const userId = crypto.randomUUID();

        await dbOps.db.run(`
            INSERT INTO users
                (id, username, email, password_hash, display_name, coins, status, last_password_changed_at)
            VALUES ($1, $2, $3, $4, $5, 0, 'pending_email', CURRENT_TIMESTAMP)
        `, [userId, username.toLowerCase(), normalizedEmail, passwordHash, String(displayName || username).trim().slice(0, 50)]);

        const verificationToken = await AuthIdentityService.createChallenge('email_verify', {
            email: normalizedEmail,
            registration: true
        }, { userId });
        try {
            await MailService.sendVerificationEmail({ to: normalizedEmail, displayName: displayName || username, token: verificationToken });
        } catch (mailError) {
            console.error('[Auth] Verification email failed:', mailError.code || mailError.message);
            return res.status(503).json({ success: false, error: '驗證信目前無法寄出，請稍後使用重新寄送', code: 'EMAIL_DELIVERY_FAILED' });
        }

        // Audit Log
        await AuditLogService.logAuth(userId, 'user_register_pending_email', { username }, req);
        res.status(202).json({ success: true, code: 'EMAIL_VERIFICATION_REQUIRED', message: '驗證信已寄出，請完成 Email 驗證' });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /login - Login user
router.post('/mobile/login', authLimiter, async (req, res) => {
    try {
        const loginIdentifier = String(req.body?.identifier || req.body?.username || '').trim();
        if (!loginIdentifier || !req.body?.password) {
            return res.status(400).json({ success: false, error: '帳號或 Email 與密碼為必填' });
        }
        const loginResult = await AuthService.login(loginIdentifier, req.body.password, req);
        if (!loginResult.success) {
            return res.status(loginResult.throttled ? 429 : 401).json({ success: false, error: loginResult.error, code: loginResult.code, throttled: Boolean(loginResult.throttled) });
        }
        const auth = await authPayloadForUser(loginResult.user.id, req, { passwordMaturity: loginResult.user.passwordMaturity }, mobileSessionContext(req));
        return res.json({ ...auth.body, refreshToken: auth.refreshToken });
    } catch (error) {
        console.error('Mobile Login Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/mobile/refresh', async (req, res) => {
    try {
        const result = await AuthService.refreshSession(req.body?.refreshToken, mobileSessionContext(req));
        if (!result.success) return res.status(401).json(result);
        return res.json({ success: true, accessToken: result.accessToken, refreshToken: result.refreshToken });
    } catch (error) {
        console.error('Mobile Refresh Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/mobile/logout', async (req, res) => {
    await AuthService.revokeSession(req.body?.refreshToken);
    return res.json({ success: true });
});

router.post('/mobile/google', authLimiter, mobileGoogleLogin);

router.post('/login', authLimiter, async (req, res) => {
    try {
        const { username, identifier, password } = req.body;
        const loginIdentifier = String(identifier || username || '').trim();

        if (!loginIdentifier || !password) {
            return res.status(400).json({ success: false, error: '帳號或 Email 與密碼為必填' });
        }

        const loginResult = await AuthService.login(loginIdentifier, password, req);

        if (!loginResult.success) {
            // 節流攔截：使用 HTTP 429 Too Many Requests
            if (loginResult.throttled) {
                return res.status(429).json({
                    success: false,
                    error: loginResult.error,
                    throttled: true
                });
            }
            return res.status(401).json({ success: false, error: loginResult.error, code: loginResult.code });
        }

        const auth = await authPayloadForUser(loginResult.user.id, req, {
            passwordMaturity: loginResult.user.passwordMaturity
        });
        setRefreshCookie(res, auth.refreshToken);
        res.json(auth.body);
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /refresh - Refresh access token using refresh token
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = readCookie(req, REFRESH_COOKIE) || req.body?.refreshToken;

        if (!refreshToken) {
            return res.status(400).json({ success: false, error: '需要 Refresh Token' });
        }

        const result = await AuthService.refreshSession(refreshToken);

        if (!result.success) {
            return res.status(401).json(result);
        }

        setRefreshCookie(res, result.refreshToken);
        res.json({
            success: true,
            accessToken: result.accessToken
        });
    } catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/logout', async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE) || req.body?.refreshToken;
    await AuthService.revokeSession(refreshToken);
    clearRefreshCookie(res);
    res.json({ success: true });
});

router.post('/email/verify', authLimiter, async (req, res) => {
    try {
        const challenge = await AuthIdentityService.findChallenge(req.body?.token, 'email_verify');
        if (!challenge) {
            return res.status(400).json({ success: false, error: '驗證連結已失效、已使用或已過期', code: 'EMAIL_TOKEN_INVALID' });
        }
        const user = await dbOps.db.get('SELECT * FROM users WHERE id = $1', [challenge.userId]);
        if (!user) return res.status(404).json({ success: false, error: '帳號不存在' });

        const targetEmail = normalizeEmail(challenge.payload?.email || user.email);
        const emailOwner = await dbOps.db.get('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2', [targetEmail, user.id]);
        if (emailOwner) return res.status(409).json({ success: false, error: '此 Email 已被其他會員使用' });
        if (user.status === 'pending_email') {
            const activated = await provisionActivatedUser(user.id, user.username, { pendingOnly: true });
            if (!activated) return res.status(409).json({ success: false, error: '帳號已由其他驗證請求處理' });
        } else {
            await dbOps.db.run(`
                UPDATE users SET email = $1, email_verified_at = CURRENT_TIMESTAMP,
                    security_question = NULL, security_answer_hash = NULL
                WHERE id = $2
            `, [targetEmail, user.id]);
        }

        if (!await AuthIdentityService.consumeChallenge(req.body?.token, 'email_verify')) {
            return res.status(409).json({ success: false, error: '驗證連結已由其他請求使用' });
        }
        await AuditLogService.logAuth(user.id, 'email_verified', {}, req);
        const auth = await authPayloadForUser(user.id, req);
        setRefreshCookie(res, auth.refreshToken);
        res.json(auth.body);
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ success: false, error: 'Email 驗證失敗' });
    }
});

router.post('/email/request-verification', authenticateToken, authLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
            return res.status(400).json({ success: false, error: 'Email 格式不正確' });
        }
        if (await dbOps.db.get('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2', [email, req.user.userId])) {
            return res.status(409).json({ success: false, error: '此 Email 已被其他會員使用' });
        }
        const user = await dbOps.db.get('SELECT username, display_name FROM users WHERE id = $1', [req.user.userId]);
        const token = await AuthIdentityService.createChallenge('email_verify', { email, registration: false }, { userId: req.user.userId });
        await MailService.sendVerificationEmail({ to: email, displayName: user.displayName || user.username, token });
        res.json({ success: true, message: '驗證信已寄出' });
    } catch (error) {
        console.error('Authenticated email verification request failed:', error.code || error.message);
        res.status(503).json({ success: false, error: '驗證信目前無法寄出' });
    }
});

router.post('/email/resend', authLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const user = await dbOps.db.get(`
            SELECT id, username, display_name, email, email_verified_at, status
            FROM users WHERE LOWER(email) = $1 LIMIT 1
        `, [email]);
        if (user && !user.emailVerifiedAt) {
            const recent = await dbOps.db.get(`
                SELECT id FROM auth_challenges
                WHERE user_id = $1 AND purpose = 'email_verify'
                  AND created_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes'
                LIMIT 1
            `, [user.id]);
            if (!recent) {
                const token = await AuthIdentityService.createChallenge('email_verify', { email, registration: user.status === 'pending_email' }, { userId: user.id });
                await MailService.sendVerificationEmail({ to: email, displayName: user.displayName || user.username, token });
            }
        }
        res.json({ success: true, message: GENERIC_EMAIL_RESPONSE });
    } catch (error) {
        console.error('Resend verification error:', error.code || error.message);
        res.json({ success: true, message: GENERIC_EMAIL_RESPONSE });
    }
});

router.post('/password/forgot', authLimiter, async (req, res) => {
    try {
        const identifier = String(req.body?.identifier || '').trim().toLowerCase();
        const user = await dbOps.db.get(`
            SELECT id, username, display_name, email, email_verified_at
            FROM users
            WHERE (LOWER(username) = $1 OR LOWER(email) = $1) AND status = 'active'
            LIMIT 1
        `, [identifier]);
        if (user?.email && user.emailVerifiedAt) {
            const recent = await dbOps.db.get(`
                SELECT id FROM password_reset_tokens
                WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes'
                LIMIT 1
            `, [user.id]);
            if (!recent) {
                const rawToken = crypto.randomBytes(32).toString('base64url');
                await dbOps.db.run(`
                    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip)
                    VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes', $3)
                `, [user.id, hashToken(rawToken), req.ip || null]);
                await MailService.sendPasswordResetEmail({ to: user.email, displayName: user.displayName || user.username, token: rawToken });
            }
        }
    } catch (error) {
        console.error('Forgot password email error:', error.code || error.message);
    }
    res.json({ success: true, message: GENERIC_EMAIL_RESPONSE });
});

router.post('/google/nonce', authLimiter, async (req, res) => {
    try {
        res.json({ success: true, nonce: await AuthIdentityService.issueGoogleNonce() });
    } catch (error) {
        res.status(500).json({ success: false, error: '無法建立 Google 登入驗證' });
    }
});

router.post('/google', authLimiter, async (req, res) => {
    try {
        const profile = await AuthIdentityService.verifyGoogleCredential(req.body?.credential);
        const identity = await AuthIdentityService.findIdentity('google', profile.subject);
        if (identity) {
            if (identity.status !== 'active') return res.status(403).json({ success: false, error: '帳號目前無法登入' });
            await AuthIdentityService.touchIdentity('google', profile.subject);
            const auth = await authPayloadForUser(identity.userId, req);
            setRefreshCookie(res, auth.refreshToken);
            return res.json(auth.body);
        }

        const existingUser = await dbOps.db.get('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [profile.email]);
        if (existingUser) {
            const linkToken = await AuthIdentityService.createChallenge('google_link', { profile }, {
                provider: 'google', providerSubject: profile.subject, userId: existingUser.id
            });
            return res.status(409).json({ success: false, code: 'ACCOUNT_LINK_REQUIRED', linkToken, emailHint: profile.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') });
        }

        const onboardingToken = await AuthIdentityService.createChallenge('google_onboarding', { profile }, {
            provider: 'google', providerSubject: profile.subject
        });
        return res.status(409).json({
            success: false,
            code: 'GOOGLE_ONBOARDING_REQUIRED',
            onboardingToken,
            profile: { displayName: profile.displayName, suggestedUsername: await AuthIdentityService.suggestUsername(profile) }
        });
    } catch (error) {
        console.error('Google login error:', error.code || error.message);
        res.status(error.code === 'GOOGLE_NOT_CONFIGURED' ? 503 : 401).json({ success: false, error: error.message, code: error.code || 'GOOGLE_LOGIN_FAILED' });
    }
});

router.post('/google/complete', authLimiter, async (req, res) => {
    try {
        const { onboardingToken, username, displayName } = req.body || {};
        const normalizedUsername = String(username || '').trim().toLowerCase();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(normalizedUsername)) {
            return res.status(400).json({ success: false, error: '用戶名只能使用英文字母、數字和底線，長度 3-20 字元' });
        }
        const challenge = await AuthIdentityService.findChallenge(onboardingToken, 'google_onboarding');
        const profile = challenge?.payload?.profile;
        if (!challenge || !profile) return res.status(400).json({ success: false, error: '設定已失效，請重新使用 Google 登入' });
        if (await dbOps.db.get('SELECT id FROM users WHERE username = $1 OR LOWER(email) = $2', [normalizedUsername, profile.email])) {
            return res.status(409).json({ success: false, error: '用戶名或 Email 已被使用', code: 'ACCOUNT_EXISTS' });
        }
        if (!await AuthIdentityService.consumeChallenge(onboardingToken, 'google_onboarding')) {
            return res.status(409).json({ success: false, error: '設定已由其他請求完成，請重新登入' });
        }

        const userId = crypto.randomUUID();
        const bonus = await registrationBonuses();
        await dbOps.db.transaction(async tx => {
            await tx.run(`
                INSERT INTO users
                    (id, username, email, email_verified_at, password_hash, display_name, coins, status, last_password_changed_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL, $4, $5, 'active', NULL)
            `, [userId, normalizedUsername, profile.email, String(displayName || profile.displayName || normalizedUsername).trim().slice(0, 50), bonus.coins]);
            await tx.run(`
                INSERT INTO user_auth_identities
                    (user_id, provider, provider_subject, email_snapshot, email_verified, profile, last_login_at)
                VALUES ($1, 'google', $2, $3, TRUE, $4::jsonb, CURRENT_TIMESTAMP)
            `, [userId, profile.subject, profile.email, JSON.stringify({ displayName: profile.displayName, picture: profile.picture })]);
            await tx.run(`
                INSERT INTO ai_gov.user_ai_credit_wallet (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
                VALUES ($1, $2, 0, 0)
            `, [userId, bonus.points]);
            await tx.run(`
                INSERT INTO coin_ledger (user_id, amount, reason, idempotency_key, balance_after)
                VALUES ($1, $2, 'registration_bonus', $3, $2)
            `, [userId, bonus.coins, `registration_bonus:${userId}`]);
            await tx.run(`
                INSERT INTO ai_gov.ai_credit_ledger (user_id, amount, credit_pool, reason, balance_after, total_balance_after)
                VALUES ($1, $2, 'bonus', 'registration_bonus', $2, $2)
            `, [userId, bonus.points]);
        });
        await expeditionService.ensureUserHasTeam(userId, normalizedUsername);
        await AuditLogService.logAuth(userId, 'user_register_google', {}, req);
        const auth = await authPayloadForUser(userId, req);
        setRefreshCookie(res, auth.refreshToken);
        res.json(auth.body);
    } catch (error) {
        console.error('Google onboarding error:', error);
        res.status(500).json({ success: false, error: 'Google 帳號建立失敗' });
    }
});

router.post('/google/link', authLimiter, async (req, res) => {
    try {
        const { linkToken, identifier, password } = req.body || {};
        const challenge = await AuthIdentityService.findChallenge(linkToken, 'google_link');
        const profile = challenge?.payload?.profile;
        if (!challenge || !profile) return res.status(400).json({ success: false, error: '綁定要求已失效，請重新操作' });
        const loginResult = await AuthService.login(String(identifier || ''), String(password || ''), req);
        if (!loginResult.success || loginResult.user.id !== challenge.userId) {
            return res.status(401).json({ success: false, error: '原帳號或密碼錯誤' });
        }
        if (!await AuthIdentityService.consumeChallenge(linkToken, 'google_link')) {
            return res.status(409).json({ success: false, error: '綁定要求已由其他請求完成' });
        }
        await AuthIdentityService.linkGoogleIdentity({ userId: challenge.userId, profile });
        const auth = await authPayloadForUser(challenge.userId, req);
        setRefreshCookie(res, auth.refreshToken);
        res.json(auth.body);
    } catch (error) {
        const conflict = error.code === '23505';
        res.status(conflict ? 409 : 500).json({ success: false, error: conflict ? '此 Google 帳號已綁定其他會員' : 'Google 帳號綁定失敗' });
    }
});

router.get('/identities', authenticateToken, async (req, res) => {
    res.json({ success: true, identities: await AuthIdentityService.listIdentities(req.user.userId) });
});

router.post('/identities/google', authenticateToken, authLimiter, async (req, res) => {
    try {
        const profile = await AuthIdentityService.verifyGoogleCredential(req.body?.credential);
        await AuthIdentityService.linkGoogleIdentity({ userId: req.user.userId, profile });
        res.json({ success: true, identities: await AuthIdentityService.listIdentities(req.user.userId) });
    } catch (error) {
        res.status(error.code === '23505' ? 409 : 400).json({ success: false, error: error.code === '23505' ? '此 Google 帳號已綁定其他會員' : error.message });
    }
});

router.post('/reauth/google', authenticateToken, authLimiter, async (req, res) => {
    try {
        const profile = await AuthIdentityService.verifyGoogleCredential(req.body?.credential);
        const identity = await AuthIdentityService.findIdentity('google', profile.subject);
        if (!identity || identity.userId !== req.user.userId) {
            return res.status(401).json({ success: false, error: 'Google 帳號與目前會員不符' });
        }
        const reauthToken = await AuthIdentityService.createChallenge('google_reauth', {}, {
            userId: req.user.userId, provider: 'google', providerSubject: profile.subject
        });
        res.json({ success: true, reauthToken });
    } catch (error) {
        res.status(401).json({ success: false, error: error.message || 'Google 重新驗證失敗' });
    }
});

router.delete('/identities/google', authenticateToken, authLimiter, async (req, res) => {
    try {
        const user = await dbOps.db.get('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
        if (!await SecurityService.verifyPassword(user?.passwordHash, req.body?.currentPassword)) {
            return res.status(401).json({ success: false, error: '目前密碼錯誤' });
        }
        const removed = await AuthIdentityService.unlinkGoogleIdentity(req.user.userId);
        res.json({ success: true, removed });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message, code: error.code });
    }
});

// GET /me - Get current user (requires token)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get user using helper service
        const user = await dbOps.getUser(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: '用戶不存在' });
        }

        // Get AI Credit Wallet for Entitlements
        const wallet = await dbOps.usersDb.get('SELECT * FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1', [userId]) || { bonusAiCredits: 0, exchangeAiCredits: 0, paidAiCredits: 0 };

        res.json({
            success: true,
            user: {
                ...publicUser(user),
                // PostgresAdapter now correctly provides displayName, totalGames, etc.
                isAdmin: Boolean(user.isAdmin || user.role === 'super_admin' || user.role === 'admin'),
                ai_credits: (wallet.bonusAiCredits || 0) + (wallet.exchangeAiCredits || 0) + (wallet.paidAiCredits || 0),
                settings: (() => {
                    if (!user.settings) return {};
                    if (typeof user.settings === 'string') {
                        try { return JSON.parse(user.settings); } catch (e) { return {}; }
                    }
                    return user.settings;
                })()
            },
            entitlements: {
                aiCredits: {
                    bonus: wallet.bonusAiCredits,
                    exchange: wallet.exchangeAiCredits,
                    paid: wallet.paidAiCredits,
                    total: (wallet.bonusAiCredits || 0) + (wallet.exchangeAiCredits || 0) + (wallet.paidAiCredits || 0)
                },
                wealth: {
                    coins: user.coins
                },
                membership: {
                    role: user.role || (user.isAdmin ? 'super_admin' : 'user'),
                    adminRoles: user.adminRoles || [],
                    label: user.role === 'super_admin' ? '最高管理員' : (user.role === 'admin' ? '管理員' : '一般會員')
                }
            }
        });
    } catch (error) {
        console.error('Auth/Me Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /change-password - Change password (requires token)
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { oldPassword, newPassword } = req.body;

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: '新密碼至少需要 8 個字元' });
        }

        // Get user using helper service
        const user = await dbOps.getUser(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: '用戶不存在' });
        }

        // Verify old password using SecurityService (Argon2id)
        const isValid = await SecurityService.verifyPassword(user.passwordHash, oldPassword);
        if (!isValid) {
            return res.status(401).json({ success: false, error: '目前密碼錯誤' });
        }

        // Hash new password using SecurityService (Argon2id)
        const newPasswordHash = await SecurityService.hashPassword(newPassword);

        // Update password & update last_password_changed_at
        await dbOps.db.run(
            'UPDATE users SET password_hash = $1, last_password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, userId]
        );

        // Audit log (security trail)
        await AuditLogService.logAuth(userId, 'user_password_changed', { username: user.username }, req);

        res.json({ success: true, message: '密碼已成功修改' });
    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ success: false, error: '修改密碼失敗' });
    }
});

// POST /admin-reset-password - Emergency reset (using SecurityService)
router.post('/admin-reset-password', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { targetUserId, newPassword } = req.body;
        const passwordHash = await SecurityService.hashPassword(newPassword);
        await dbOps.db.run('UPDATE users SET password_hash = $1, last_password_changed_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, targetUserId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /security-question/:username - Get user's security question for reset
router.get('/security-question/:username', async (req, res) => {
    try {
        const username = decodeURIComponent(req.params.username);
        const question = await AuthService.getSecurityQuestion(username);

        if (!question) {
            return res.status(404).json({ success: false, error: '用戶不存在或未設定安全問題' });
        }

        res.json({ success: true, securityQuestion: question });
    } catch (error) {
        console.error('Get Security Question Error:', error);
        res.status(500).json({ success: false, error: '系統錯誤' });
    }
});

// POST /verify-security-answer - Verify answer and get reset token
router.post('/verify-security-answer', async (req, res) => {
    try {
        const { username, securityAnswer } = req.body;
        const result = await AuthService.verifySecurityAnswer(username, securityAnswer, req);

        if (!result.success) {
            return res.status(401).json({ success: false, error: result.error });
        }

        // Audit Log
        await AuditLogService.logAuth(null, 'password_reset_verify_success', { username }, req);

        res.json({ success: true, resetToken: result.resetToken });
    } catch (error) {
        console.error('Verify Security Answer Error:', error);
        res.status(500).json({ success: false, error: '驗證失敗' });
    }
});

// POST /reset-password - Use token to set new password
router.post('/reset-password', authLimiter, async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;

        const strength = SecurityService.validatePasswordStrength(newPassword);
        if (!strength.isValid) return res.status(400).json({ success: false, error: strength.reason });

        const result = await AuthService.resetPasswordWithToken(resetToken, newPassword);

        if (!result.success) {
            return res.status(400).json({ success: false, error: result.error });
        }

        // Audit Log
        await AuditLogService.logAuth(result.userId, 'password_reset_complete', {}, req);

        res.json({ success: true, message: '密碼已成功重設' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, error: '重設失敗' });
    }
});

export default router;
