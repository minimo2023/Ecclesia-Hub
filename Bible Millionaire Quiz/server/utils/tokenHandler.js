import crypto from 'crypto';
import { getAnswerTokenSecret } from './secrets.js';

const ANSWER_TOKEN_SECRET = getAnswerTokenSecret();
const KEY = crypto.createHash('sha256').update(ANSWER_TOKEN_SECRET, 'utf8').digest();
const AAD = Buffer.from('bible-quiz-answer:v2', 'utf8');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 以 AES-256-GCM 加密答案資料。格式不是 JWT，客戶端無法直接讀取內容。
 * @param {object} payload - The payload to encrypt (e.g. { answer, correctIndex })
 * @returns {string} - The generated JWT token
 */
export function generateAnswerToken(payload) {
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
        cipher.setAAD(AAD);
        const plaintext = Buffer.from(JSON.stringify({
            ...payload,
            expiresAt: Date.now() + TOKEN_TTL_MS
        }), 'utf8');
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v2.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
    } catch (error) {
        console.error('[TokenHandler] Error generating token:', error);
        return null;
    }
}

/**
 * Decrypts and verifies the answer token.
 * @param {string} token - The JWT token to decode
 * @returns {object|null} - The decoded payload, or null if invalid
 */
export function verifyAnswerToken(token) {
    if (!token || typeof token !== 'string') return null;
    
    try {
        const parts = token.split('.');
        if (parts.length !== 4 || parts[0] !== 'v2') return null;
        const decodeCanonical = value => {
            const decoded = Buffer.from(value, 'base64url');
            if (decoded.toString('base64url') !== value) throw new Error('NON_CANONICAL_TOKEN');
            return decoded;
        };
        const iv = decodeCanonical(parts[1]);
        const ciphertext = decodeCanonical(parts[2]);
        const tag = decodeCanonical(parts[3]);
        if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
        decipher.setAAD(AAD);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const payload = JSON.parse(plaintext.toString('utf8'));
        if (!payload || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return null;
        return payload;
    } catch (error) {
        console.warn('[TokenHandler] Invalid or expired answer token');
        return null;
    }
}
