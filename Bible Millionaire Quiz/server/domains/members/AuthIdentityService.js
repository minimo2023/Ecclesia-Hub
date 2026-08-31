import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { dbOps } from '../../database/index.js';

const PURPOSE_TTL_MINUTES = {
    google_nonce: 10,
    google_onboarding: 10,
    google_link: 10,
    email_verify: 24 * 60,
    google_reauth: 10
};

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

class AuthIdentityService {
    constructor() {
        this.googleClient = new OAuth2Client();
    }

    googleAudiences() {
        return String(process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);
    }

    async createChallenge(purpose, payload = {}, options = {}) {
        const rawToken = crypto.randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + (options.ttlMinutes || PURPOSE_TTL_MINUTES[purpose] || 10) * 60 * 1000);
        await dbOps.db.run(`
            INSERT INTO auth_challenges
                (purpose, token_hash, user_id, provider, provider_subject, payload, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `, [
            purpose,
            hashToken(rawToken),
            options.userId || null,
            options.provider || null,
            options.providerSubject || null,
            JSON.stringify(payload || {}),
            expiresAt
        ]);
        return rawToken;
    }

    async consumeChallenge(rawToken, purpose) {
        if (!rawToken) return null;
        return dbOps.db.get(`
            UPDATE auth_challenges
            SET consumed_at = CURRENT_TIMESTAMP
            WHERE token_hash = $1
              AND purpose = $2
              AND consumed_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
            RETURNING *
        `, [hashToken(rawToken), purpose]);
    }

    async findChallenge(rawToken, purpose) {
        if (!rawToken) return null;
        return dbOps.db.get(`
            SELECT * FROM auth_challenges
            WHERE token_hash = $1 AND purpose = $2
              AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        `, [hashToken(rawToken), purpose]);
    }

    async issueGoogleNonce() {
        return this.createChallenge('google_nonce');
    }

    async verifyGoogleCredential(credential) {
        const audiences = this.googleAudiences();
        if (audiences.length === 0) {
            const error = new Error('Google 登入尚未完成伺服器設定');
            error.code = 'GOOGLE_NOT_CONFIGURED';
            throw error;
        }
        if (!credential) {
            const error = new Error('缺少 Google 登入憑證');
            error.code = 'GOOGLE_CREDENTIAL_REQUIRED';
            throw error;
        }

        const ticket = await this.googleClient.verifyIdToken({ idToken: credential, audience: audiences });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload?.email || payload.email_verified !== true) {
            const error = new Error('Google 帳號缺少已驗證的 Email');
            error.code = 'GOOGLE_EMAIL_NOT_VERIFIED';
            throw error;
        }
        if (!payload.nonce || !await this.consumeChallenge(payload.nonce, 'google_nonce')) {
            const error = new Error('Google 登入驗證已失效，請重新嘗試');
            error.code = 'GOOGLE_NONCE_INVALID';
            throw error;
        }

        return {
            subject: payload.sub,
            email: normalizeEmail(payload.email),
            displayName: String(payload.name || '').trim(),
            picture: String(payload.picture || '').trim()
        };
    }

    async findIdentity(provider, providerSubject) {
        return dbOps.db.get(`
            SELECT i.*, u.status
            FROM user_auth_identities i
            JOIN users u ON u.id = i.user_id
            WHERE i.provider = $1 AND i.provider_subject = $2
        `, [provider, providerSubject]);
    }

    async touchIdentity(provider, providerSubject) {
        await dbOps.db.run(`
            UPDATE user_auth_identities SET last_login_at = CURRENT_TIMESTAMP
            WHERE provider = $1 AND provider_subject = $2
        `, [provider, providerSubject]);
    }

    async listIdentities(userId) {
        return dbOps.db.query(`
            SELECT provider, email_snapshot, email_verified, created_at, last_login_at
            FROM user_auth_identities WHERE user_id = $1 ORDER BY created_at
        `, [userId]);
    }

    async linkGoogleIdentity({ userId, profile }) {
        await dbOps.db.transaction(async tx => {
            await tx.run(`
                INSERT INTO user_auth_identities
                    (user_id, provider, provider_subject, email_snapshot, email_verified, profile, last_login_at)
                VALUES ($1, 'google', $2, $3, TRUE, $4::jsonb, CURRENT_TIMESTAMP)
            `, [userId, profile.subject, profile.email, JSON.stringify({ displayName: profile.displayName, picture: profile.picture })]);

            const current = await tx.get('SELECT email FROM users WHERE id = $1', [userId]);
            if (!current?.email) {
                await tx.run(`
                    UPDATE users SET email = $1, email_verified_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [profile.email, userId]);
            }
        });
    }

    async unlinkGoogleIdentity(userId) {
        const user = await dbOps.db.get(`
            SELECT password_hash, email_verified_at FROM users WHERE id = $1
        `, [userId]);
        if (!user?.passwordHash || !user?.emailVerifiedAt) {
            const error = new Error('解除 Google 前，請先驗證 Email 並設定本機密碼');
            error.code = 'LOCAL_LOGIN_REQUIRED';
            throw error;
        }
        const result = await dbOps.db.run(`
            DELETE FROM user_auth_identities WHERE user_id = $1 AND provider = 'google'
        `, [userId]);
        return result.changes > 0;
    }

    async suggestUsername(profile) {
        const base = (profile.displayName || profile.email.split('@')[0] || 'member')
            .normalize('NFKD')
            .replace(/[^a-zA-Z0-9_]/g, '')
            .slice(0, 14) || 'member';
        for (let index = 0; index < 20; index += 1) {
            const suffix = index === 0 ? '' : String(crypto.randomInt(1000, 9999));
            const candidate = `${base}${suffix}`.slice(0, 20);
            if (candidate.length >= 3 && !await dbOps.db.get('SELECT id FROM users WHERE username = $1', [candidate.toLowerCase()])) {
                return candidate;
            }
        }
        return `member${crypto.randomInt(100000, 999999)}`;
    }
}

export { hashToken, normalizeEmail };
export default new AuthIdentityService();
