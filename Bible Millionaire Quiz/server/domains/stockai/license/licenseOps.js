import crypto from 'crypto';
import { usersDb } from '../../../database/index.js';

export const LicenseOps = {
    /**
     * 取得序號詳細資料
     */
    async getLicense(licenseKey) {
        return await usersDb.get('SELECT * FROM stockai_licenses WHERE license_key = $1', [licenseKey]);
    },

    /**
     * 激活序號 (綁定 HWID)
     */
    async activateLicense(licenseKey, machineId) {
        return await usersDb.transaction(async (tx) => {
            const license = await tx.get('SELECT * FROM stockai_licenses WHERE license_key = $1', [licenseKey]);
            
            if (!license) throw new Error('LICENSE_NOT_FOUND');
            if (license.status !== 'active') throw new Error(`LICENSE_${license.status.toUpperCase()}`);

            let machineIds = [];
            try {
                machineIds = typeof license.machine_ids === 'string' ? JSON.parse(license.machine_ids) : (license.machine_ids || []);
            } catch (e) { machineIds = []; }

            // 檢查是否已綁定
            if (machineIds.includes(machineId)) {
                return license;
            }

            // 檢查機器數上限
            if (machineIds.length >= (license.max_devices || 1)) {
                throw new Error('MAX_DEVICES_REACHED');
            }

            // 執行綁定
            machineIds.push(machineId);
            await tx.run(
                'UPDATE stockai_licenses SET machine_ids = $1, updated_at = CURRENT_TIMESTAMP WHERE license_key = $2',
                [JSON.stringify(machineIds), licenseKey]
            );

            return { ...license, machine_ids: machineIds };
        });
    },

    /**
     * 解除綁定 (由用戶發起)
     */
    async deactivateLicense(licenseKey, machineId) {
        const license = await this.getLicense(licenseKey);
        if (!license) return false;

        let machineIds = [];
        try {
            machineIds = typeof license.machine_ids === 'string' ? JSON.parse(license.machine_ids) : (license.machine_ids || []);
        } catch (e) { machineIds = []; }

        const newIds = machineIds.filter(id => id !== machineId);
        if (newIds.length === machineIds.length) return true; // 本來就沒綁定

        await usersDb.run(
            'UPDATE stockai_licenses SET machine_ids = $1, updated_at = CURRENT_TIMESTAMP WHERE license_key = $2',
            [JSON.stringify(newIds), licenseKey]
        );
        return true;
    },

    /**
     * 管理員手動清除所有綁定 (救援路徑)
     */
    async adminClearHWID(licenseKey) {
        await usersDb.run(
            "UPDATE stockai_licenses SET machine_ids = '[]', updated_at = CURRENT_TIMESTAMP WHERE license_key = $1",
            [licenseKey]
        );
        return true;
    },

    /**
     * 批量產生序號
     */
    async bulkGenerate(count, tier, maxDevices, expiresAt) {
        const results = [];
        const prefix = tier === 'lifetime' ? 'SKAI-LT' : (tier === 'pro' ? 'SKAI-PR' : 'SKAI-FR');
        
        for (let i = 0; i < count; i++) {
            const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
            const key = `${prefix}-${randomStr}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            
            await usersDb.run(
                'INSERT INTO stockai_licenses (license_key, tier, max_devices, expires_at) VALUES ($1, $2, $3, $4)',
                [key, tier, maxDevices, expiresAt]
            );
            results.push(key);
        }
        return results;
    },
    
    /**
     * 查詢所有授權 (Admin 用)
     */
    async getAllLicenses() {
        return await usersDb.all('SELECT * FROM stockai_licenses ORDER BY created_at DESC');
    }
};
