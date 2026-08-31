import argon2 from 'argon2';

class SecurityService {
    constructor() {
        // Argon2id default settings (OWASP recommended)
        this.hashOptions = {
            type: argon2.argon2id,
            memoryCost: 65536, // 64 MB
            timeCost: 3,
            parallelism: 4
        };

        // Password Policy Constants
        this.MIN_LENGTH = 8;
        console.log(`🛡️ [SecurityService] Initialized with MIN_LENGTH: ${this.MIN_LENGTH}`);
        this.MAX_LENGTH = 128;
        this.WEAK_PASSWORDS = ['password', '12345678', 'biblequiz', 'welcome123'];
    }

    /**
     * Hash a password using Argon2id
     * @param {string} password
     * @returns {Promise<string>}
     */
    async hashPassword(password) {
        return await argon2.hash(password, this.hashOptions);
    }

    /**
     * Verify a password against a hash
     * @param {string} hash
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async verifyPassword(hash, password) {
        try {
            return await argon2.verify(hash, password);
        } catch (e) {
            console.error('Password verification error:', e);
            return false;
        }
    }

    /**
     * Check if a password meets the strength requirements
     * @param {string} password
     * @param {Object} userData { username, email, displayName }
     * @returns {Object} { isValid, reason }
     */
    validatePasswordStrength(password, userData = {}) {
        if (!password || password.length < this.MIN_LENGTH) {
            return { isValid: false, reason: `密碼長度至少需要 ${this.MIN_LENGTH} 位字元` };
        }
        if (password.length > this.MAX_LENGTH) {
            return { isValid: false, reason: '密碼過長' };
        }

        const lowerPass = password.toLowerCase();

        // Check common weak passwords
        if (this.WEAK_PASSWORDS.includes(lowerPass)) {
            return { isValid: false, reason: '此密碼過於簡單，請更換' };
        }

        // Check relationship with username/email
        if (userData.username && lowerPass.includes(userData.username.toLowerCase())) {
            return { isValid: false, reason: '密碼不得包含用戶名' };
        }
        if (userData.email && lowerPass.includes(userData.email.split('@')[0].toLowerCase())) {
            return { isValid: false, reason: '密碼不得包含 Email 帳號部分' };
        }

        // Check complexity (must have at least 3: Uppercase, Lowercase, Number, Symbol)
        let complexityScore = 0;
        if (/[a-z]/.test(password)) complexityScore++;
        if (/[A-Z]/.test(password)) complexityScore++;
        if (/[0-9]/.test(password)) complexityScore++;
        if (/[^a-zA-Z0-9]/.test(password)) complexityScore++;

        if (complexityScore < 3) {
            return { isValid: false, reason: '密碼複雜度不足（需包含大小寫字母、數字或符號中的至少三類）' };
        }

        return { isValid: true };
    }
}

export default new SecurityService();
