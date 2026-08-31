import { dbOps } from '../../../database/index.js';
import { ContentManager } from '../../content/bible/ContentManager.js';
import { questionInventoryService } from './QuestionInventoryService.js';

export const QuestionSourcePlanner = {
    /**
     * 根據指定書卷與章節的現有題庫分布，計算出最缺乏的題型與難度帶
     * @param {string} book 
     * @param {number} chapter 
     * @param {string} version
     * @returns {Promise<Object>} 包含 target_category, target_difficulty_band, target_score_range 的任務目標
     */
    async planNextBatch(book, chapter, version = 'CUV_TRAD', targetCount = 15) {
        // 1. 段落盤點與整卷可用庫存都採用遊戲的同一套 eligibility 規則。
        const [rows, inventory] = await Promise.all([
            dbOps.getPlayableQuestionsInBatchRange(book, chapter, chapter, version),
            questionInventoryService.getSnapshot({ book, version, targetCount })
        ]);

        // [Phase 12.1] 準備段落統計
        const windowSize = 5;
        const windowCounts = {};
        let maxVerse = 0;

        // 填入現有資料
        if (Array.isArray(rows)) {
            for (const row of rows) {
                // [Phase 12.1] 累加段落題數
                const verseStart = row.verse_start ?? row.verseStart;
                if (verseStart) {
                    const start = parseInt(verseStart, 10);
                    if (!isNaN(start)) {
                        if (start > maxVerse) maxVerse = start;
                        
                        const windowStart = Math.floor((start - 1) / windowSize) * windowSize + 1;
                        const wKey = `${windowStart}-${windowStart + windowSize - 1}`;
                        windowCounts[wKey] = (windowCounts[wKey] || 0) + 1;
                    }
                }
            }
        }

        // [Phase 12.1 補強] 優先取得該章實際 verseCount
        let chapterVerseCount = 0;
        try {
            const struct = await ContentManager.getBookStructure(book);
            if (struct && struct.chapters) {
                const chData = struct.chapters.find(c => c.chapter === chapter);
                if (chData) {
                    chapterVerseCount = chData.verseCount || chData.verse_count || 0;
                }
            }
        } catch {
            // 若失敗則 fallback 到 maxVerse
        }

        // [Phase 12.1] 找出缺口與熱區
        let preferredVerseWindow = null;
        const avoidVerseWindows = [];

        // 建立該章理論上的 windows 列表
        const allWindows = [];
        const topBound = chapterVerseCount > 0 ? chapterVerseCount : (maxVerse > 0 ? maxVerse : windowSize);
        for (let i = 1; i <= topBound; i += windowSize) {
            const wKey = `${i}-${i + windowSize - 1}`;
            allWindows.push({
                key: wKey,
                count: windowCounts[wKey] || 0
            });
        }

        if (allWindows.length > 0) {
            const totalQuestions = allWindows.reduce((sum, w) => sum + w.count, 0);
            const avg = totalQuestions / allWindows.length;

            allWindows.sort((a, b) => a.count - b.count);

            // 題數最少的作為 preferred
            preferredVerseWindow = allWindows[0].key;

            // 題數最多且明顯高於平均的作為 avoid
            for (const w of allWindows) {
                if (w.count > 0 && w.count > avg * 1.5) {
                    avoidVerseWindows.push(w.key);
                }
            }
        }

        // 3. 以一局 15 題的實際需求找出最優先缺口。
        const gap = inventory.priorityGap;
        const targetCategory = gap?.category || null;
        const targetBand = gap?.band || null;

        // 4. 定義對應的目標分數區間 (供 AI 參考)
        let targetScoreRange = '';
        switch (targetBand) {
            case 'EASY': targetScoreRange = '0-30'; break;
            case 'MEDIUM': targetScoreRange = '31-65'; break;
            case 'HARD': targetScoreRange = '66-85'; break;
            case 'VERY_HARD': targetScoreRange = '86-100'; break;
        }

        return {
            anchors: { book, chapter },
            version,
            needs_replenishment: inventory.shortageTotal > 0,
            inventory_status: inventory.status,
            inventory_total: inventory.total,
            inventory_shortage: inventory.shortageTotal,
            target_category: targetCategory,
            target_difficulty_band: targetBand,
            target_score_range: targetScoreRange,
            current_inventory: gap?.available ?? inventory.total,
            preferred_verse_window: preferredVerseWindow,
            avoid_verse_windows: avoidVerseWindows.join(', ')
        };
    }
};
