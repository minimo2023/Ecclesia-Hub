import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken } from '../../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import decode from 'heic-decode';
import SecurityService from './SecurityService.js';
import AuthIdentityService from './AuthIdentityService.js';
import AuditLogService from '../../infrastructure/AuditLogService.js';
import { LogosBank } from '../../database/services/LogosBankService.js';
import { uploadsRoot } from '../../utils/paths.js';

const router = express.Router();

// DEBUG LOG
router.use((req, res, next) => {
    console.log(`👤 [user.js Router] ${req.method} ${req.url}`);
    next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Multer for processing (Memory Storage for Sharp processing)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB Limit
});

/**
 * [V8.7 Flagship Fix] getSharpInstance
 * Hybrid HEIC/HEIF Decoder using WASM heic-decode
 */
const getSharpInstance = async (buffer) => {
    try {
        // Detect if it's HEIC/HEIF by checking magic numbers
        // ftypeheic, ftypheix, ftypmif1, ftypmsf1
        const header = buffer.toString('hex', 4, 12);
        const isHEIC = header.includes('6674797068656963') || // ftypheic
            header.includes('6674797068656978') || // ftypheix
            header.includes('667479706d696631') || // ftypmif1
            header.includes('667479706d736631');   // ftypmsf1

        if (isHEIC) {
            console.log('📱 [HEIC Engine] High-Resolution iPhone Media Detected. Decoding via WASM...');
            const { data, width, height } = await decode({ buffer });
            console.log(`✅ [HEIC Engine] Decoded successfully: ${width}x${height}`);
            return sharp(data, { raw: { width, height, channels: 4 } });
        }
        return sharp(buffer);
    } catch (err) {
        console.error('❌ [HEIC Engine] Decoding Failure:', err.message);
        return sharp(buffer); // Fallback to sharp
    }
};

// GET /ai-wallet - Get user AI credits wallet
router.get('/ai-wallet', authenticateToken, async (req, res) => {
    console.log('✨ [AI Wallet] GET Request for user:', req.user?.userId);
    try {
        const userId = req.user.userId;
        const balances = await LogosBank.getBalances(userId);
        
        // Try to fetch pool details for UI, fallback to 0 if not found (since LogosBank just returns total by default)
        const wallet = await dbOps.db.get('SELECT * FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1', [userId]);

        return res.json({
            success: true,
            data: {
                totalCredits: balances.aiCredits,
                pools: {
                    bonus: wallet?.bonus_ai_credits || wallet?.bonusAiCredits || 0,
                    exchange: wallet?.exchange_ai_credits || wallet?.exchangeAiCredits || 0,
                    paid: wallet?.paid_ai_credits || wallet?.paidAiCredits || 0
                },
                deductionOrder: ["bonus", "exchange", "paid"],
                lastUpdatedAt: wallet?.updated_at || wallet?.updatedAt || new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Get AI Wallet Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch AI wallet' });
    }
});

// GET /ai-ledger - Get user AI credits ledger
router.get('/ai-ledger', authenticateToken, async (req, res) => {
    console.log('📜 [AI Ledger] GET Request for user:', req.user?.userId);
    try {
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const safeLimit = Math.min(limit, 100);

        const items = await dbOps.db.all(`
            SELECT * FROM ai_credit_ledger
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, safeLimit, offset]);

        const formattedItems = (items || []).map(item => ({
            ...item,
            id: `ledger_${item.id}`,
            direction: item.direction || (item.amount < 0 ? 'debit' : 'credit'),
            amount: Math.abs(item.amount),
            reasonLabel: item.reasonLabel || item.reason || '未知'
        }));

        res.json({
            success: true,
            data: {
                items: formattedItems,
                pagination: {
                    limit: safeLimit,
                    offset,
                    hasMore: items && items.length === safeLimit
                }
            }
        });

    } catch (error) {
        console.error('Get AI Ledger Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch AI ledger' });
    }
});

// [V8.2 Fix] PUT /profile - Update user profile with password verification & 30-day cooldown
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { displayName, currentPassword, reauthToken } = req.body;

        console.log(`📝 [Profile] Update request for user ${userId}: "${displayName}"`);

        // 1. Validation
        if (!displayName || typeof displayName !== 'string') return res.status(400).json({ success: false, error: '無效的名稱' });
        const trimmedName = displayName.trim();
        if (trimmedName.length < 2 || trimmedName.length > 20) return res.status(400).json({ success: false, error: '名稱長度需介於 2-20 字元' });

        // 2. Security Check (Current Password)
        const user = await dbOps.db.get('SELECT display_name, password_hash, last_display_name_change FROM users WHERE id = $1', [userId]);
        if (!user) return res.status(404).json({ success: false, error: '找不到用戶' });

        let isMatch = false;
        if (currentPassword && user.passwordHash) {
            isMatch = await SecurityService.verifyPassword(user.passwordHash, currentPassword);
        } else if (reauthToken) {
            const challenge = await AuthIdentityService.consumeChallenge(reauthToken, 'google_reauth');
            isMatch = challenge?.userId === userId;
        }
        if (!isMatch) return res.status(401).json({ success: false, error: '請使用目前密碼或 Google 重新驗證身分' });

        // 3. Check Cooldown (30 Days)
        if (user.lastDisplayNameChange) {
            const lastChange = new Date(user.lastDisplayNameChange);
            const now = new Date();
            const daysDiff = (now - lastChange) / (1000 * 60 * 60 * 24);

            if (daysDiff < 30 && user.displayName !== trimmedName) {
                const remaining = Math.ceil(30 - daysDiff);
                return res.status(429).json({ success: false, error: `暱稱冷卻中，請在 ${remaining} 天後再試` });
            }
        }

        // 4. Update & Audit Log
        console.log(`📤 [Sovereignty] Updating display_name for ${userId}...`);
        const beforeName = user.displayName;

        const result = await dbOps.db.run(`
            UPDATE users
            SET display_name = $1, last_display_name_change = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [trimmedName, userId]);

        if (result.changes === 0) return res.status(404).json({ success: false, error: '更新失敗' });

        // 寫入系統稽核紀錄
        await AuditLogService.log({
            userId,
            action: 'user_profile_update',
            targetType: 'user',
            targetId: userId,
            before: { displayName: beforeName },
            after: { displayName: trimmedName },
            reason: 'User manual update',
            ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, displayName: trimmedName });

    } catch (error) {
        console.error('❌ [Profile] Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// [NEW] PUT /dismiss-pwd-warning - Dismiss password maturity warning (graceful period)
router.put('/dismiss-pwd-warning', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        await dbOps.db.run(`
            UPDATE users
            SET pwd_warning_dismissed_count = pwd_warning_dismissed_count + 1,
                last_warning_dismissed_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [userId]);

        console.log(`🛡️ [Security] User ${userId} dismissed password warning.`);
        res.json({ success: true });
    } catch (error) {
        console.error('Dismiss Password Warning Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// [V8.10 Fix] PUT /password - Secure password update with 180-day reset
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;
        const SecurityService = (await import('./SecurityService.js')).default;

        // 1. Get current hash
        const user = await dbOps.db.get('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // 2. Double-Check Security (Current Password required via Argon2id)
        const isMatch = await SecurityService.verifyPassword(user.passwordHash, currentPassword);
        if (!isMatch) return res.status(401).json({ success: false, error: '目前密碼錯誤' });

        // 3. Hash & Update (Argon2id)
        const newHash = await SecurityService.hashPassword(newPassword);

        await dbOps.db.run(`
            UPDATE users
            SET password_hash = $1, last_password_changed_at = CURRENT_TIMESTAMP, must_reset_auth = FALSE
            WHERE id = $2
        `, [newHash, userId]);

        console.log(`🛡️ [Sovereignty] Password updated for ${userId}. Radar reset.`);
        res.json({ success: true, message: '密碼已更新' });

    } catch (error) {
        console.error('❌ [Password] Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// [V8.10 Fix] PUT /security - Setup security questions
router.put('/security', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { question, answer } = req.body;
        const SecurityService = (await import('./SecurityService.js')).default;

        if (!question || !answer) return res.status(400).json({ success: false, error: '請提供問題與答案' });

        const answerHash = await SecurityService.hashPassword(answer.toLowerCase().trim());

        await dbOps.db.run(`
            UPDATE users SET security_question = $1, security_answer_hash = $2 WHERE id = $3
        `, [question, answerHash, userId]);

        res.json({ success: true, message: '安全問題已設定' });

    } catch (error) {
        console.error('❌ [Security] Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /settings - Update user settings (e.g. avatar)
router.put('/settings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid settings format' });
        }

        // 1. Get current user settings (Check existence first)
        const user = await dbOps.db.prepare('SELECT settings FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // 2. Parse existing settings (Default to empty object)
        let currentSettings = {};
        if (user.settings) {
            if (typeof user.settings === 'string') {
                try {
                    currentSettings = JSON.parse(user.settings);
                } catch (e) {
                    console.error('Failed to parse user settings:', e);
                }
            } else if (typeof user.settings === 'object') {
                // Postgres JSONB returns object directly
                currentSettings = user.settings;
            }
        }

        // 3. Merge new settings
        const updatedSettings = { ...currentSettings, ...settings };

        // 4. Save back to DB
        console.log(`📤 [Settings] Updating settings for user ${userId}...`);
        const result = await dbOps.db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(updatedSettings), userId);

        if (result.changes === 0) {
            console.error(`❌ [Settings] Update failed: User ${userId} not found`);
            return res.status(404).json({ success: false, error: '更新失敗：找不到用戶' });
        }

        console.log('✅ [Settings] Update successful, changes:', result.changes);

        res.json({
            success: true,
            settings: updatedSettings
        });

    } catch (error) {
        console.error('Update Settings Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /settings - Get user settings
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await dbOps.db.prepare('SELECT settings FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        let settings = {};
        if (user.settings) {
            if (typeof user.settings === 'string') {
                try {
                    settings = JSON.parse(user.settings);
                } catch (e) { }
            } else {
                settings = user.settings;
            }
        }

        res.json({ success: true, settings });

    } catch (error) {
        console.error('Get Settings Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// GET /exchange-rates - Get current bidirectional exchange rates
router.get('/exchange-rates', authenticateToken, async (req, res) => {
    try {
        const rateCoinToCredit = await dbOps.getSetting('rate_coin_to_credit', 50);
        const rateCreditToCoin = await dbOps.getSetting('rate_credit_to_coin', 45);
        res.json({
            success: true,
            data: {
                rateCoinToCredit: parseInt(rateCoinToCredit, 10),
                rateCreditToCoin: parseInt(rateCreditToCoin, 10)
            }
        });
    } catch (error) {
        console.error('Get Exchange Rates Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /exchange-assets - Bidirectional exchange between coins and AI credits
router.post('/exchange-assets', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { amount, direction } = req.body;

        if (!amount || !Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: '請輸入正確的數量' });
        }
        if (direction !== 'coin_to_credit' && direction !== 'credit_to_coin') {
            return res.status(400).json({ success: false, error: '無效的兌換方向' });
        }

        const exchangeResult = await dbOps.exchangeAssets(userId, amount, direction);

        res.json({
            success: true,
            data: exchangeResult
        });

    } catch (error) {
        console.error('Exchange Assets Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// [V8.7 Flagship Fix] Avatar Preview & Upload Endpoints
// Ensure directory exists
const avatarsDir = path.join(uploadsRoot, 'avatars');
fs.mkdir(avatarsDir, { recursive: true }).catch(err => console.error('Dir creation fail:', err));

/**
 * [V8.7] POST /avatar/preview - Hybrid HEIC Preview Engine
 */
router.post('/avatar/preview', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const userId = req.user.userId;
        const tempFilename = `preview_${userId}_${Date.now()}.webp`;
        const tempPath = path.join(avatarsDir, tempFilename);

        console.log(`🖼️ [Preview] Processing ${req.file.originalname} for ${userId}...`);

        const sharpInstance = await getSharpInstance(req.file.buffer);
        await sharpInstance
            .rotate() // [V8.11 Fix] 自動處理 EXIF 旋轉標籤，修復手機照片方向錯誤
            .resize(400, 400, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(tempPath);

        res.json({
            success: true,
            previewUrl: `/uploads/avatars/${tempFilename}`
        });

    } catch (error) {
        console.error('❌ [Preview Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * [V8.7] POST /avatar/upload - Save High-Res Avatar as WebP
 */
router.post('/avatar/upload', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const userId = req.user.userId;
        const filename = `avatar_${userId}_${Date.now()}.webp`;
        const finalPath = path.join(avatarsDir, filename);

        console.log(`🚀 [Upload] Saving final avatar for ${userId}...`);

        const sharpInstance = await getSharpInstance(req.file.buffer);
        await sharpInstance
            .rotate() // [V8.11 Fix] 自動處理 EXIF 旋轉標籤，修復手機照片方向錯誤
            .resize(400, 400, { fit: 'cover' })
            .webp({ quality: 90 })
            .toFile(finalPath);

        const avatarUrl = `/uploads/avatars/${filename}`;

        // Update database (settings JSON column)
        const user = await dbOps.db.prepare('SELECT settings FROM users WHERE id = ?').get(userId);
        let settings = {};
        if (user && user.settings) {
            settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        }

        settings.avatar = avatarUrl;
        await dbOps.db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(settings), userId);

        res.json({
            success: true,
            avatar: avatarUrl
        });

    } catch (error) {
        console.error('❌ [Upload Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
