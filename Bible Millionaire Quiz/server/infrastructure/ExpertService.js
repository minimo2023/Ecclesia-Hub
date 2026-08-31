import { LogosEngine } from './ai/LogosEngine.js';

const EXPERT_CACHE_TTL_MS = 10 * 60 * 1000;
const EXPERT_CACHE_MAX_ENTRIES = 200;
const expertAdviceCache = new Map();
const expertAdviceInFlight = new Map();

/**
 * 專家求助服務 (極簡化主權恢復版 v2.0)
 * 核心：委派性格演繹，去除複雜統計權重
 */
export class ExpertService {
    /**
     * 生成專家建議
     * @param {Object} options
     * @param {Object} options.expert - 專家資料
     * @param {Object} options.question - 題目資料
     * @param {string} [options.playerName] - 玩家名稱
     * @param {Function} [options.onStatus] - 狀態回調
     * @returns {Promise<string>} AI 生成的建議文字
     */
    static async generateAdvice({ expert, question, playerName, correctLetter, onStatus }) {
        if (!expert || !question) {
            throw new Error('Missing expert or question data');
        }

        const startedAt = Date.now();
        if (onStatus) onStatus('connected');
        console.log(`🧠 [ExpertService] Calling expert: ${expert.name} for player: ${playerName || 'Guest'}`);

        const alphabet = ['A', 'B', 'C', 'D'];
        const options = Array.isArray(question.options) ? question.options : [];
        let resolvedCorrectLetter = alphabet.includes(correctLetter) ? correctLetter : null;

        if (!resolvedCorrectLetter && Number.isInteger(question.correctIndex) && question.correctIndex >= 0) {
            resolvedCorrectLetter = alphabet[question.correctIndex] || null;
        }
        if (!resolvedCorrectLetter && alphabet.includes(question.answer)) {
            resolvedCorrectLetter = question.answer;
        }
        if (!resolvedCorrectLetter && question.answer !== undefined) {
            const answerIndex = options.findIndex(option =>
                String(option).trim() === String(question.answer).trim()
            );
            resolvedCorrectLetter = alphabet[answerIndex] || null;
        }

        if (!resolvedCorrectLetter) {
            throw new Error('Unable to resolve expert answer letter');
        }

        const correctIndex = alphabet.indexOf(resolvedCorrectLetter);
        const correctAnswer = options[correctIndex] || question.answer || resolvedCorrectLetter;
        const cacheKey = JSON.stringify([
            expert.id || expert.name,
            question.question,
            options,
            resolvedCorrectLetter
        ]);
        const cached = expertAdviceCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
            if (onStatus) onStatus('responding');
            console.log(`🧠 [ExpertService] Cache hit in ${Date.now() - startedAt}ms`);
            return cached.advice;
        }
        if (cached) expertAdviceCache.delete(cacheKey);

        const optionsStr = options
            .map((opt, i) => `${alphabet[i]}. ${opt}`)
            .join('\n');

        if (onStatus) onStatus('pondering');

        let advicePromise = expertAdviceInFlight.get(cacheKey);
        if (!advicePromise) {
            advicePromise = (async () => {
                const response = await LogosEngine.askBrain('expert_answer', {
                    expertName: String(expert.name || '聖經專家').slice(0, 40),
                    question: question.question,
                    options: optionsStr,
                    correctLetter: resolvedCorrectLetter,
                    correctAnswer,
                    rawPrompt: '請立即給出簡短、可直接用於作答的專家建議。',
                    maxTokens: 192,
                    temperature: 0.35
                }, {
                    priority: true,
                    thinkingBudget: 0,
                    maxAttempts: 1,
                    maxQueueWaitMs: 1500,
                    requestTimeoutMs: 8000,
                    allowModelFallback: true,
                    compactSystemInstruction: true,
                    retry: false
                }).catch(error => ({ error: error.message }));

                let generatedAdvice = '';
                if (typeof response === 'string') {
                    generatedAdvice = response.trim();
                } else if (response?.response) {
                    generatedAdvice = String(response.response).trim();
                }

                if (!generatedAdvice || generatedAdvice.length < 5 || response?.error) {
                    console.warn('⚠️ [ExpertService] Reliable fallback triggered.');
                    return {
                        advice: this._getReliableFallbackResponse(resolvedCorrectLetter, correctAnswer),
                        cacheable: false
                    };
                }

                return { advice: generatedAdvice, cacheable: true };
            })();
            expertAdviceInFlight.set(cacheKey, advicePromise);
        } else {
            console.log('🧠 [ExpertService] Reusing in-flight expert request');
        }

        try {
            const generated = await advicePromise;
            if (generated.cacheable) {
                expertAdviceCache.set(cacheKey, {
                    advice: generated.advice,
                    expiresAt: Date.now() + EXPERT_CACHE_TTL_MS
                });
                this._trimCache();
            }
            if (onStatus) onStatus('responding');
            console.log(`🧠 [ExpertService] Response completed in ${Date.now() - startedAt}ms`);
            return generated.advice;
        } finally {
            if (expertAdviceInFlight.get(cacheKey) === advicePromise) {
                expertAdviceInFlight.delete(cacheKey);
            }
        }
    }

    static _trimCache() {
        const now = Date.now();
        for (const [key, entry] of expertAdviceCache) {
            if (entry.expiresAt <= now) expertAdviceCache.delete(key);
        }
        while (expertAdviceCache.size > EXPERT_CACHE_MAX_ENTRIES) {
            expertAdviceCache.delete(expertAdviceCache.keys().next().value);
        }
    }

    static _getReliableFallbackResponse(correctLetter, correctAnswer) {
        return `「我確認過了，答案選 ${correctLetter}：${correctAnswer}。先抓住題幹中的人物、事件與經文脈絡。」`;
    }

    /**
     * 隨機取得專家的「斷線/忙碌」應對語句 (戲劇降級機制)
     */
    static _getFallbackResponse(expertName) {
        const expertFallbacks = {
            '張以諾牧師': [
                `「平安，我現在正在主持婚禮，待會撥給我好嗎？（電話掛斷）」`,
                `「您撥的電話暫時無人接聽，請稍後再撥。」`,
                `「（雜訊）...喂？張牧師...正在...山區宣教...訊號...（通訊中斷）」`
            ],
            '李樂恩博士': [
                `「我現在正在地底坑洞中進行挖掘，這裡完全沒有訊號，請稍後再試。」`,
                `「Sorry，我正在跟大學教授開會，目前不方便接聽。」`,
                `「（語音音箱）我是李樂恩。有急事請傳訊息，現在不接電話。」`
            ],
            '金多拉教授': [
                `「（背景音樂：聖詩）我正在帶領靈修默想，請不要在安息時間撥打電話。」`,
                `「呼...呼...我正在山頂靈修，風聲太大了，我聽不見，之後再說！」`,
                `「（語音）平安。金教授目前正出國參加特會，預計一週後回國。」`
            ],
            '喬治・艾爾文牧師': [
                `「嗨！我現在正準備上講台！耶穌愛你！我們過一會再聊！（掛斷）」`,
                `「我是喬治！我正忙著跟弟兄姊妹聚餐，請留下您的話語！」`,
                `「喂？喂？這訊號怎麼回事？我只聽到滋滋聲...喂？」`
            ],
            '陳以斯拉傳道': [
                `「不好意思，我現在正在圖書館閱覽室，這裡不方便講電話。」`,
                `「（快速低聲）我正忙著彙整資料，之後再回撥給你，先掛了。」`,
                `「（語音信箱）楊教授目前公差中，請留言或稍後再撥。」`
            ],
            '蘇菲・海倫博士': [
                `「I am currently in the middle of a lecture. Please do not call during class!」`,
                `「You have reached Dr. Helen. I am away from my desk. Goodbye.」`,
                `「Oh dear, the connection is absolutely dreadful. I cannot hear a word.」`
            ],
            '馬修・羅伯茲教授': [
                `「我剛好在醫院探訪，目前不方便接聽電話，請見諒。」`,
                `「喂？我這老手機好像又出問題了...我聽不到你說話...喂？」`,
                `「我是馬修羅伯茲，我現在不方便接電話，願主賜平安給你。」`
            ],
            '林恩慈': [
                `「不好意思，我正在進行輔導諮商，不方便接聽，請傳簡訊給我。」`,
                `「（柔和的聲音）平安，恩慈目前不方便接電話，請稍後再試好嗎？」`,
                `「喂？你在說什麼？我聽不到你的聲音耶，是不是訊號不好？」`
            ],
            '費南度・馬丁': [
                `「喂！我在雨林裡耶！這裡訊號超爛！完全聽不到聲音！喂？（斷線）」`,
                `「嘿！我正在忙著搭建宣教中心的棚子呢，等我忙完再說！」`,
                `「（語音）我是費南度。我現在去宣教的路上了，訊號可能不太好喔！」`
            ],
            '楊若晨教授': [
                `「我正在主持學術研討會，請不要在這個時段撥打，謝謝。」`,
                `「對不起，我正在進行重要的經卷掃描，不能接聽電話，請稍候。」`,
                `「（語音信箱）楊教授目前公差中，請留言或稍後再撥。」`
            ]
        };

        const fallbacks = expertFallbacks[expertName] || [
            `「您撥的號碼目前無法接聽，請稍後再撥。」`,
            `「（訊號干擾聲）...喂？收訊...不良...（通訊自動結束）」`
        ];

        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
