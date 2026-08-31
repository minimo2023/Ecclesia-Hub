/**
 * CommentarySyncService
 *
 * 穩健且精準的 FHL 註釋採集與資料庫同步服務。
 * 核心原則：穩 (穩定抓取)、準 (準確入庫)、有禮 (尊重 API 頻率限制)。
 */

import crypto from 'crypto';
import { ContentManager } from '../bible/ContentManager.js';

const FHL_API_BASE = 'https://bible.fhl.net/json/sc.php';

class CommentarySyncService {
    constructor() {
        this.isSyncing = false;
        this.stats = {
            processed: 0,
            success: 0,
            failed: 0,
            lastRun: null
        };
    }

    /**
     * 同步指定書卷的註釋
     * @param {string} bookName - 書卷名 (例如 '創世記')
     * @param {string} engsCodes - FHL 縮寫 (例如 'Gen')
     * @param {number} maxChapters - 最大同步章數 (可選)
     */
    async syncBook(bookName, engsCodes, maxChapters = 999) {
        if (this.isSyncing) {
            console.warn('⚠️ [SyncService] 同步已在運行中。');
            return;
        }

        console.log(`🚀 [SyncService] 開始同步書卷: ${bookName} (${engsCodes})...`);
        this.isSyncing = true;
        this.stats.processed = 0;
        this.stats.success = 0;
        this.stats.failed = 0;

        try {
            // 確保 ContentManager 已初始化
            if (!ContentManager.initialized) {
                await ContentManager.initialize();
            }

            let currentChap = 1;
            let currentSec = 1;

            while (currentChap <= maxChapters) {
                // [FIX] 加入 &gb=0&book=3 以確保獲取信望愛站註釋
                const url = `${FHL_API_BASE}?engs=${engsCodes}&chap=${currentChap}&sec=${currentSec}&gb=0&book=3`;
                console.log(`🔍 [Sync] 正在抓取: ${engsCodes} ${currentChap}:${currentSec}`);

                const data = await this._fetchWithRetry(url);

                if (data && data.status === 'success' && data.record && data.record.length > 0) {
                    const record = data.record[0];

                    // 準確入庫：建立資源與文本對象
                    await this._processRecord(bookName, currentChap, currentSec, record, url);

                    this.stats.success++;

                    // 鏈接串列跳轉
                    if (data.next && (data.next.engs === engsCodes || data.next.engs.toLowerCase() === engsCodes.toLowerCase())) {
                        currentChap = data.next.chap;
                        currentSec = data.next.sec;
                        if (currentChap > maxChapters) break;
                    } else {
                        // 有時 next.engs 會因為大小寫或縮寫略有不同 (例如 Matt vs Mat), 只要還在同一卷書就繼續
                        break;
                    }
                } else {
                    console.warn(`⚠️ [Sync] ${engsCodes} ${currentChap}:${currentSec} 未找到數據，終止同步。`);
                    this.stats.failed++;
                    break;
                }

                this.stats.processed++;

                // 有禮：頻率限制 (300ms 延遲)
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            this.stats.lastRun = new Date();
            console.log(`✅ [SyncService] 同步完成! 成功: ${this.stats.success}, 失敗: ${this.stats.failed}`);
            return this.stats;

        } catch (error) {
            console.error('❌ [SyncService] 同步過程發生致命錯誤:', error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * 帶重試機制的抓取
     */
    async _fetchWithRetry(url, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error(`⚠️ [Sync] 第 ${i + 1} 次嘗試失敗 (${url}): ${error.message}`);
                if (i === retries - 1) return null;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 指數退避
            }
        }
    }

    /**
     * 處理單筆記錄入庫 (外部檢核模式：確保 UUID 穩定與關聯正確)
     */
    async _processRecord(book, chap, sec, record, sourceUrl) {
        const resourceId = crypto.createHash('md5').update(`FHL_SC_${book}_${chap}_${sec}`).digest('hex');
        const textId = crypto.createHash('md5').update(`TEXT_FHL_SC_${book}_${chap}_${sec}`).digest('hex');

        const resource = {
            id: resourceId,
            title: record.title,
            filename: `FHL_SC_${book}_${chap}_${sec}`,
            file_path: sourceUrl,
            category: 'commentary',
            related_books: book,
            source: record.book_name || '信望愛站註釋',
            content_type: 'commentary',
            is_indexed: 1
        };

        const extractedText = {
            id: textId,
            resource_id: resourceId,
            content: record.com_text,
            word_count: record.com_text?.length || 0
        };

        // 導入 ContentManager (內部已處理 ON CONFLICT)
        await ContentManager.resources.importResources([resource]);
        await ContentManager.resources.importExtractedText([extractedText]);
    }

    /**
     * 外部稽核方法：驗證書卷註釋覆蓋率
     */
    async auditBook(bookName) {
        if (!ContentManager.initialized) await ContentManager.initialize();

        const count = await ContentManager.db.get(`
            SELECT COUNT(*) as count FROM resources
            WHERE metadata->>'related_books' = ? AND metadata->>'category' = 'commentary'
        `, [bookName]);

        const sample = await ContentManager.db.query(`
            SELECT r.title, LENGTH(e.content) as len, e.content
            FROM resources r
            JOIN extracted_text e ON r.id = e.resource_id
            WHERE r.metadata->>'related_books' = ?
            ORDER BY r.title ASC
            LIMIT 3
        `, [bookName]);

        return {
            book: bookName,
            recordsInDb: count?.count || 0,
            sample: sample
        };
    }
}

export const commentarySyncService = new CommentarySyncService();
