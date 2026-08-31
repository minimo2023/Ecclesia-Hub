import crypto from 'crypto';

const runtimeSecrets = new Map();

function getRuntimeSecret(name) {
    if (!runtimeSecrets.has(name)) {
        runtimeSecrets.set(name, crypto.randomBytes(48).toString('base64url'));
        console.warn(`[Security] ${name} is not configured; using an ephemeral development secret.`);
    }
    return runtimeSecrets.get(name);
}

export function requireSecret(name) {
    const configured = process.env[name]?.trim();
    if (configured) return configured;

    if (process.env.NODE_ENV === 'production') {
        throw new Error(`${name} must be configured in production`);
    }

    return getRuntimeSecret(name);
}

export function getJwtSecret() {
    return requireSecret('JWT_SECRET');
}

export function getAnswerTokenSecret() {
    const dedicated = process.env.ANSWER_TOKEN_SECRET?.trim();
    if (dedicated) return dedicated;

    // 相容既有單人維護部署：沒有額外答案密鑰時沿用已明確設定的 JWT_SECRET。
    // 不產生新的生產密鑰；日後只要加入 ANSWER_TOKEN_SECRET 即可無痛拆分。
    const sharedJwtSecret = process.env.JWT_SECRET?.trim();
    if (sharedJwtSecret) {
        console.warn('[Security] ANSWER_TOKEN_SECRET is not configured; reusing the configured JWT_SECRET.');
        return sharedJwtSecret;
    }

    return requireSecret('ANSWER_TOKEN_SECRET');
}
