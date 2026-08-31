import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const PRIVATE_KEY = process.env.STOCKAI_PRIVATE_KEY?.replace(/\\n/g, '\n');
const ADMIN_KEY = process.env.STOCKAI_ADMIN_KEY;

/**
 * 簽署授權資料 (Ed25519)
 * @param {Object} data - { license_key, machine_id, tier, expires_at }
 * @returns {string} Base64 簽章
 */
export function signLicense(data) {
    if (!PRIVATE_KEY) {
        throw new Error('STOCKAI_PRIVATE_KEY is not set in .env');
    }

    const message = JSON.stringify(data);
    const signature = crypto.sign(null, Buffer.from(message), PRIVATE_KEY);
    return signature.toString('base64');
}

/**
 * 驗證管理員 Token (Bearer Token)
 * @param {string} authHeader 
 * @returns {boolean}
 */
export function verifyAdminToken(authHeader) {
    if (!ADMIN_KEY) return false;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    
    const token = authHeader.split(' ')[1];
    return token === ADMIN_KEY;
}
