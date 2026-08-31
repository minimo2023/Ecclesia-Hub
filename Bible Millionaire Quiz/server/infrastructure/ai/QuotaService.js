import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { serverConfigRoot } from '../../utils/paths.js';

/**
 * [PHASE 4] Quota Monitoring Service
 * 負責透過 Google Cloud Quotas API 抓取 2.5-flash 的實時剩餘次數
 */

const KEY_FILE = path.join(serverConfigRoot, 'caramel-banner-349014-764aa29a6b70.json');

class QuotaService {
    constructor() {
        this.auth = null;
        this.initialized = false;
        this._initAuth();
    }

    _initAuth() {
        try {
            if (fs.existsSync(KEY_FILE)) {
                this.auth = new google.auth.GoogleAuth({
                    keyFile: KEY_FILE,
                    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
                });
                this.initialized = true;
                console.log('✨ [Quota Service] Google Service Account Auth Initialized.');
            }
        } catch (error) {
            console.error('❌ [Quota Service] Auth Error:', error.message);
        }
    }

    /**
     * 抓取當前 Gemini 2.0-flash 的配額狀態 (紅綠燈數據)
     * 備註：此功能需要 Google Cloud 專案開啟 Cloud Quotas API
     */
    async getGeminiQuota() {
        if (!this.initialized || !this.auth) {
            return { success: false, reason: 'Auth Not Ready' };
        }

        try {
            // 目前採用保守估計模式，因為 Cloud Quotas SDK 在 V1 較為複雜
            // 我們暫時返回「已授權」狀態，預留給後端 admin_ai.js 呼叫
            // 未來擴充：透過 cloudquotas.projects.locations.quotas.get 抓取精確 Request Count

            return {
                success: true,
                source: 'caramel-banner-349014',
                status: 'Authorized',
                dailyLimit: 20, // 針對 1.5-flash 免費版預設上限
                remaining: null  // 待 API 完全開通後填入
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default new QuotaService();
