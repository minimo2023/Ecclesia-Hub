/**
 * Question Service (Main Coordinator)
 * 
 * 職責：
 * - 協調各個模塊
 * - 管理歷史記錄和本地緩存
 * - 提供統一的 API
 */

import * as storage from './questionStorage';

const getRewardSession = () => sessionStorage.getItem('active_game_reward_session');
const getMemberHeaders = () => {
    const token = sessionStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

class QuestionService {
    constructor() {
        this.db = { history: [] };
        this.localQuestions = []; // Local cache

        try {
            const savedHistory = localStorage.getItem('bible_millionaire_history');
            if (savedHistory) this.db.history = JSON.parse(savedHistory);

            const savedQuestions = localStorage.getItem('bible_millionaire_questions');
            if (savedQuestions) this.localQuestions = JSON.parse(savedQuestions);
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
    }

    /**
     * 記錄已使用的題目
     */
    recordHistory(questionIds) {
        const newHistory = [...new Set([...this.db.history, ...questionIds])];
        if (newHistory.length > 200) {
            newHistory.splice(0, newHistory.length - 200);
        }
        this.db.history = newHistory;
        localStorage.setItem('bible_millionaire_history', JSON.stringify(newHistory));
    }

    /**
     * 獲取全局排除清單 (依據歷史記錄中的題目文字)
     * 用於開局時的種子排除，防止起手勢重複。
     */
    getGlobalExcludeList(limit = 50) {
        // 利用最近的 history IDs/texts 對應 localQuestions 內容
        const recentHistory = this.db.history.slice(-limit);
        const texts = [];
        
        recentHistory.forEach(item => {
            // 如果 item 已經是文字，直接加入
            if (typeof item === 'string' && item.length > 10 && !item.match(/^[0-9a-fA-F-]{36}$/)) {
                texts.push(item);
            } else {
                // 如果是 ID，嘗試從本地快取中找匹配的題目文字
                const found = this.localQuestions.find(q => q.id === item);
                if (found && found.question) texts.push(found.question);
            }
        });

        return [...new Set(texts)];
    }

    /**
     * V2 API: 獲取題目 (支援多書卷)
     * @param {Array} bookSelections - [{book: 'Genesis', startChapter: 1, endChapter: 50}]
     * @param {number} totalCount - 總題數
     * @param {string} gameMode - 遊戲模式
     */
    async getQuestionsV2(bookSelections, totalCount = 15, gameMode = 'classic', excludeQuestions = [], options = {}) {
        const rewardSessionId = getRewardSession();
        const requestKey = JSON.stringify({
            b: bookSelections.map(selection => [
                selection.book,
                selection.startChapter || 1,
                selection.endChapter || selection.startChapter || 1
            ]),
            c: totalCount,
            m: gameMode,
            e: excludeQuestions.slice(-40),
            v: options.bibleVersion || 'CUV_TRAD',
            g: options.includeGeography ?? true,
            x: options.includeEncyclopedia ?? true,
            i: Boolean(options.isInfiniteMode),
            s: rewardSessionId
        });

        if (this.pendingRequests && this.pendingRequests.has(requestKey)) {
            console.log('[QuestionService] ⚡ Deduplication: Returning pending request for same parameters');
            return this.pendingRequests.get(requestKey);
        }

        const outputPromise = (async () => {
            const response = await fetch('/api/quiz/v2/hand', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getMemberHeaders()
                },
                body: JSON.stringify({
                    scopes: bookSelections.map(selection => ({
                        book: selection.book,
                        startChapter: selection.startChapter || 1,
                        endChapter: selection.endChapter || selection.startChapter || 1
                    })),
                    count: totalCount,
                    gameMode,
                    locale: 'zh-TW',
                    version: options.bibleVersion || 'CUV_TRAD',
                    exclude: excludeQuestions,
                    isInfiniteMode: Boolean(options.isInfiniteMode),
                    gameSessionId: rewardSessionId
                })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.success || !Array.isArray(data.questions)) {
                const shortageSummary = data.shortages
                    ? Object.entries(data.shortages)
                        .map(([difficulty, detail]) => `${difficulty} 缺 ${detail.missing} 題`)
                        .join('、')
                    : '';
                const error = new Error(
                    shortageSummary
                        ? `${data.message}（${shortageSummary}）`
                        : data.message || '目前無法組成完整題組'
                );
                error.code = data.error || 'HAND_REQUEST_FAILED';
                error.shortages = data.shortages || null;
                throw error;
            }

            return {
                questions: data.questions,
                blueprint: data.blueprint || [],
                difficultyTargets: data.difficultyTargets
            };
        })();

        // Cache the promise
        if (!this.pendingRequests) this.pendingRequests = new Map();
        this.pendingRequests.set(requestKey, outputPromise);

        try {
            return await outputPromise;
        } finally {
            // Remove after completion (but keep briefly? No, pending is strictly for execution overlap)
            this.pendingRequests.delete(requestKey);
        }
    }

    /**
     * 獲取題目 (統一入口)
     * 如果 V2 失敗，可 fallback (目前 V2 應為唯一來源)
     */
    async getQuestions(bookSelections, count = 15, options = {}) {
        try {
            const gameMode = options.gameMode || 'classic';
            const questions = await this.getQuestionsV2(
                bookSelections,
                count,
                gameMode,
                options.exclude || [],
                options
            );
            if (options.onProgress) options.onProgress(100);
            return questions;
        } catch (e) {
            console.error("V2 Fetch failed:", e);
            throw e;
        }
    }

    /**
     * 動態補題入口 (Q6-Q15)
     * 呼叫 /api/quiz/next，根據題號由後端決定難度和題型
     * @param {object} bookSelection - { book, startChapter, endChapter }
     * @param {number} targetIndex - 目標題號 (6-15)，讓後端知道要出哪個難度
     * @param {string[]} excludeList - 已出過的題目文字清單
     * @param {string} locale
     * @returns {Promise<object|null>} 單一題目物件
     */
    async replenishQuestion(bookSelection, targetIndex, excludeList = [], locale = 'zh-TW', anchorChapter = null, vRange = null, options = {}) {
        try {
            const { book, startChapter, endChapter } = bookSelection;
            const chapter = anchorChapter || startChapter || 1;

            const params = new URLSearchParams({
                book,
                startChapter: chapter, // 💡 [Blueprint anchor]
                endChapter: endChapter || chapter,
                index: targetIndex,
                locale,
                gameMode: options.gameMode || 'classic',
                isInfiniteMode: Boolean(options.isInfiniteMode).toString(),
                version: options.bibleVersion || 'CUV_TRAD',
                includeGeo: (options.includeGeography ?? true).toString(),
                includeLex: (options.includeEncyclopedia ?? true).toString()
            });
            if (anchorChapter) params.append('anchorChapter', anchorChapter);
            if (vRange?.start) {
                params.append('vStart', vRange.start);
                params.append('vEnd', vRange.end || vRange.start);
            }
            const rewardSessionId = getRewardSession();
            if (rewardSessionId) params.append('gameSessionId', rewardSessionId);
            
            excludeList.forEach(q => params.append('exclude', q));

            console.log(`[QuestionService] Replenishing Q${targetIndex} via anchor Ch.${chapter} [Verse Range: ${vRange?.start || 'Any'}]`);
            const response = await fetch(`/api/quiz/next?${params.toString()}`, {
                headers: getMemberHeaders()
            });

            if (!response.ok) return null;

            const data = await response.json();
            if (data.success && data.question) {
                return data.question;
            }
            return null;
        } catch (e) {
            console.error('[QuestionService] replenishQuestion error:', e);
            return null;
        }
    }

    /**
     * @deprecated Legacy batch generation
     */
    async generateBatch(bookSelections, difficulty, count, _excludeList = [], _recentQuestions = []) {
        console.warn("generateBatch is deprecated usually. Using direct V2 fetch if possible.");
        // Keep for backward compatibility if needed, or redirect to V2 filtered by difficulty?
        // For now, let's leave it as legacy or redirect:
        // But generateBatch is for specific difficulty. V2 returns mixed.
        // It's better to NOT use generateBatch in V2 flow.
        return this.getQuestionsV2(bookSelections, count, 'casual'); // Casual approximates 'medium'
    }

    /**
     * 保存生成的題目到雲端
     */
    async saveToCloud(questions, addToast) {
        // 1. 保存到本地緩存
        let localSaved = 0;
        try {
            const newLocal = questions.filter(q =>
                !this.localQuestions.some(lq => lq.question === q.question)
            );

            if (newLocal.length > 0) {
                this.localQuestions = [...this.localQuestions, ...newLocal];
                localStorage.setItem('bible_millionaire_questions', JSON.stringify(this.localQuestions));
                localSaved = newLocal.length;
                console.log(`[Local Cache] Saved ${localSaved} questions`);
            }
        } catch (e) {
            console.error("Error saving to localStorage:", e);
        }

        // 2. 保存到數據庫
        const result = await storage.saveQuestions(questions);

        if (result.saved > 0 && addToast) {
            addToast(`☁️ AI 成功生成並儲存了 ${result.saved} 題新題目！`, 'success');
        }

        return { ...result, localSaved };
    }

    /**
     * 回報問題題目
     */
    async reportQuestion(reportData) {
        return await storage.reportQuestion(reportData);
    }
}

export default QuestionService;
