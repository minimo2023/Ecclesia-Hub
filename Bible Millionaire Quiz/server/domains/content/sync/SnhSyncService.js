/**
 * SnhSyncService
 *
 * 強大的 Strong's Number (SNH) 原文辭典採集與整合服務。
 * 核心原則：精準提取 (Scan)、無冗餘採集 (Fetch)、結構化入庫 (Store)。
 */

import crypto from 'crypto';
import { ContentManager } from '../bible/ContentManager.js';

const FHL_SD_API = 'https://bible.fhl.net/json/sd.php';

class SnhSyncService {
    constructor() {
        this.stats = {
            extracted: 0,
            synced: 0,
            errors: 0
        };
    }

    /**
     * 從資料庫現有的註釋文本中提取所有 SNH 編號
     * @returns {Promise<Set<string>>} 唯一的 SNH 編號集合 (例如 'H7225', 'G2424')
     */
    async extractSnhsFromDb() {
        console.log('🔍 [SnhSync] 開始從註釋文本中提取 SNH 編號...');
        if (!ContentManager.initialized) await ContentManager.initialize();

        const db = ContentManager.getDb();
        const rows = await db.all('SELECT content FROM extracted_text');

        const snhSet = new Set();
        // Regex 模式：支援 SNH07225, SNG02424, SH 7225, SG 2424 等多種書寫格式
        const patterns = [
            { regex: /SNH(\d{1,5})/gi, type: 'H' },
            { regex: /SNG(\d{1,5})/gi, type: 'G' },
            { regex: /SH\s?(\d{1,5})/gi, type: 'H' },
            { regex: /SG\s?(\d{1,5})/gi, type: 'G' }
        ];

        for (const row of rows) {
            if (!row.content) continue;
            for (const p of patterns) {
                let match;
                while ((match = p.regex.exec(row.content)) !== null) {
                    const num = match[1].padStart(4, '0'); // 補齊 4 位數，例如 7225 -> 07225
                    snhSet.add(`${p.type}${num}`);
                }
            }
        }

        this.stats.extracted = snhSet.size;
        console.log(`✅ [SnhSync] 提取完成！共發現 ${snhSet.size} 個唯一 SNH 編號。`);
        return snhSet;
    }

    /**
     * 同步單個 SNH 編號的定義
     * @param {string} snhCode - 例如 'H7225'
     */
    async syncSnh(snhCode) {
        const type = snhCode.startsWith('H') ? 1 : 0; // 1: Hebrew, 0: Greek
        const num = parseInt(snhCode.substring(1));
        const url = `${FHL_SD_API}?N=${type}&k=${num}&gb=0`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data && data.status === 'success' && data.record && data.record.length > 0) {
                const record = data.record[0];
                await this._storeDefinition(snhCode, type, num, record);
                this.stats.synced++;
                return true;
            }
            return false;
        } catch (error) {
            console.error(`❌ [SnhSync] 同步 ${snhCode} 失敗:`, error.message);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 批量同步所有活躍的 SNH
     */
    async syncActiveSnhs() {
        const snhs = await this.extractSnhsFromDb();
        console.log(`🚀 [SnhSync] 開始同步 ${snhs.size} 個辭典定義...`);

        let count = 0;
        for (const snh of snhs) {
            // 先檢查資料庫是否已存在
            const success = await this.syncSnh(snh);
            if (success) count++;

            // 頻率限制
            if (count % 10 === 0) {
                process.stdout.write(`.`);
                await new Promise(r => setTimeout(r, 200));
            }
        }
        console.log(`\n✨ [SnhSync] 同步完畢！成功: ${count}, 錯誤: ${this.stats.errors}`);
        return this.stats;
    }

    /**
     * 存儲辭典定義入庫
     */
    async _storeDefinition(id, type, num, record) {
        const db = ContentManager.getDb();
        await db.run(`
            INSERT INTO snh_definitions (
                id, sn_type, sn_number, original_word, pronunciation, definition, extended_info
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                original_word = EXCLUDED.original_word,
                pronunciation = EXCLUDED.pronunciation,
                definition = EXCLUDED.definition,
                extended_info = EXCLUDED.extended_info
        `, [
            id, type, num,
            record.orig || '',
            record.pronun || '',
            record.dic_text || '',
            JSON.stringify(record)
        ]);
    }
}

export const snhSyncService = new SnhSyncService();
