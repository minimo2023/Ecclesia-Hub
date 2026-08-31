import crypto from 'crypto';
import { getJwtSecret } from '../../utils/secrets.js';

const secret = () => getJwtSecret();
const hash = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const deterministicShareSignature = tokenId => crypto.createHmac('sha256', secret())
    .update(`scripture-share:${tokenId}`)
    .digest();

export function createLegacyShareToken(tokenId) {
    const token = `${tokenId}.${deterministicShareSignature(tokenId).toString('base64url')}`;
    return { token, tokenHash: hash(token) };
}

export function createShareToken(tokenId = null) {
    const token = tokenId
        ? deterministicShareSignature(tokenId).subarray(0, 16).toString('base64url')
        : crypto.randomBytes(16).toString('base64url');
    return { token, tokenHash: hash(token) };
}

export function recoverShareToken(tokenId, expectedHash) {
    const shortToken = createShareToken(tokenId);
    if (shortToken.tokenHash === expectedHash) return shortToken;
    const legacyToken = createLegacyShareToken(tokenId);
    if (legacyToken.tokenHash === expectedHash) return legacyToken;
    return null;
}

export function hashShareToken(token) {
    return hash(String(token || ''));
}

export function createPlaybackTicket(payload, ttlSeconds = 300) {
    const encoded = Buffer.from(JSON.stringify({
        ...payload,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret())
        .update(`scripture-audio:${encoded}`)
        .digest('base64url');
    return `${encoded}.${signature}`;
}

export function verifyPlaybackTicket(ticket) {
    const [encoded, signature] = String(ticket || '').split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', secret())
        .update(`scripture-audio:${encoded}`)
        .digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

export default { createShareToken, createLegacyShareToken, recoverShareToken, hashShareToken, createPlaybackTicket, verifyPlaybackTicket };
