import express from 'express';
import { LicenseOps } from './license/licenseOps.js';
import { signLicense, verifyAdminToken } from './license/security.js';
import { LogosEngine } from '../../infrastructure/ai/LogosEngine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

/**
 * [WEB] 獨立管理門戶入口
 */
router.get('/admin-ui', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin/stockai-admin.html'));
});

/**
 * [MIDDLEWARE] 管理員權限檢查
 */
const adminAuth = (req, res, next) => {
    if (!verifyAdminToken(req.headers.authorization)) {
        return res.status(403).json({ success: false, error: 'ADMIN_ACCESS_DENIED' });
    }
    next();
};

/**
 * [USER API] 激活序號
 */
router.post('/license/activate', async (req, res) => {
    try {
        const { license_key, machine_id } = req.body;
        if (!license_key || !machine_id) return res.status(400).json({ error: 'MISSING_PARAMS' });

        const license = await LicenseOps.activateLicense(license_key, machine_id);
        
        // 簽署授權憑證
        const payload = {
            license_key: license.license_key,
            machine_id: machine_id,
            tier: license.tier,
            expires_at: license.expires_at
        };
        const signature = signLicense(payload);

        res.json({ success: true, payload, signature });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

/**
 * [USER API] 背景靜默驗證
 */
router.get('/license/verify', async (req, res) => {
    try {
        const { license_key, machine_id } = req.query;
        const license = await LicenseOps.getLicense(license_key);
        
        if (!license || license.status !== 'active') {
            return res.status(403).json({ valid: false });
        }

        const machineIds = typeof license.machine_ids === 'string' ? JSON.parse(license.machine_ids) : license.machine_ids;
        if (!machineIds.includes(machine_id)) {
            return res.status(403).json({ valid: false, error: 'MACHINE_NOT_BOUND' });
        }

        res.json({ valid: true, tier: license.tier, expires_at: license.expires_at });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * [USER API] 雲端分析代理 (核心安全防線)
 */
router.post('/license/analyze', async (req, res) => {
    try {
        const { license_key, machine_id, stock_data, task_type } = req.body;
        
        // 1. 先驗證授權
        const license = await LicenseOps.getLicense(license_key);
        if (!license || license.status !== 'active') return res.status(403).json({ error: 'INVALID_LICENSE' });
        
        // 2. 呼叫 LogosEngine
        const contextData = {
            stock_data,
            systemInstruction: "你是一位專業的台股分析師，請根據提供的數據進行深度分析..." 
        };
        
        const result = await LogosEngine.askBrain(task_type || 'stock_analysis', contextData, {
            userId: `STOCKAI_${license_key}`, // 記錄至 AI 治理日誌
            priority: true
        });

        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * [ADMIN API] 批量產生序號
 */
router.post('/admin/generate', adminAuth, async (req, res) => {
    try {
        const { count, tier, max_devices, expires_at } = req.body;
        const keys = await LicenseOps.bulkGenerate(count || 1, tier || 'pro', max_devices || 1, expires_at);
        res.json({ success: true, keys });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * [ADMIN API] 查詢所有授權
 */
router.get('/admin/licenses', adminAuth, async (req, res) => {
    try {
        const licenses = await LicenseOps.getAllLicenses();
        res.json({ success: true, licenses });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * [ADMIN API] 救援：清除 HWID
 */
router.post('/admin/clear-hwid', adminAuth, async (req, res) => {
    try {
        const { license_key } = req.body;
        await LicenseOps.adminClearHWID(license_key);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
