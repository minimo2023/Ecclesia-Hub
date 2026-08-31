/**
 * Gemini AI Client - 集中管理的 AI 服務 (多金鑰備援版)
 *
 * 設計理念：
 * 1. 支援多金鑰輪換 (Key Rotation)：防止單一 Key 額度用盡導致系統崩潰
 * 2. 自動故障切換 (Failover)：偵測 429 錯誤並自動換 Key 重試
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { dbOps } from '../../database/index.js';
import {
    filterAllowedGeminiModels,
    getRecommendedGeminiModels,
    resolveGeminiModel
} from './model-policy.js';
dotenv.config();

// 台幣計費基礎 (官方牌價依據 1M tokens)
const TWD_RATE = 32.2;
const PER_MILLION = 1000000;

// 本地緩存以提升頻繁調用的效能
let modelPriceCache = new Map();
let rawModels = filterAllowedGeminiModels(
    (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || '')
        .split(',')
);
if (rawModels.length === 0) rawModels = getRecommendedGeminiModels();
let modelsPool = rawModels.map(m => ({ model: m, cooldownUntil: 0 }));

let currentSystemModel = modelsPool[0].model;
let lastConfigSync = 0;
const CACHE_TTL = 300000; // 5分鐘同步一次配置

/**
 * 從資料庫同步最新的模型與計費配置
 * @param {boolean} force - 是否強制同步 (跳過快取 TTL)
 */
export async function syncAIConfig(force = false) {
    try {
        if (!force && (Date.now() - lastConfigSync < CACHE_TTL)) return;

        // 1. 獲取當前預設模型
        const modelConfig = await dbOps.db.get("SELECT value FROM ai_gov.ai_system_config WHERE key = 'default_ai_model'");
        currentSystemModel = resolveGeminiModel(modelConfig?.value);
        DEFAULT_MODEL = currentSystemModel;

        // 2. 獲取所有費率與活動模型設定
        const rates = await dbOps.db.query("SELECT model_id, input_price_per_1k_points, output_price_per_1k_points FROM ai_gov.ai_model_config WHERE is_active = TRUE");
        
        const newPool = [];
        rates.forEach(r => {
            const modelId = r.modelId ?? r.model_id;
            if (!filterAllowedGeminiModels([modelId]).length) return;

            modelPriceCache.set(modelId, {
                input: (parseFloat(r.inputPricePer1kPoints ?? r.input_price_per_1k_points) / PER_MILLION) * TWD_RATE,
                output: (parseFloat(r.outputPricePer1kPoints ?? r.output_price_per_1k_points) / PER_MILLION) * TWD_RATE
            });
            // 保留現有模型的冷卻狀態，以免熱更新時重置冷卻限制
            const existing = modelsPool.find(m => m.model === modelId);
            newPool.push({ model: modelId, cooldownUntil: existing ? existing.cooldownUntil : 0 });
        });

        // 3. 確保預設模型排在第一位（優先取用）
        if (currentSystemModel) {
            const defaultIdx = newPool.findIndex(m => m.model === currentSystemModel);
            if (defaultIdx > -1) {
                const [defItem] = newPool.splice(defaultIdx, 1);
                newPool.unshift(defItem);
            } else {
                newPool.unshift({ model: currentSystemModel, cooldownUntil: 0 });
            }
        }

        if (newPool.length > 0) {
            modelsPool = newPool;
        } else {
            modelsPool = getRecommendedGeminiModels()
                .map(model => ({ model, cooldownUntil: 0 }));
        }

        lastConfigSync = Date.now();
        console.log(`📡 [AI Client] Config Synced. Current: ${currentSystemModel} | Active Models: ${modelsPool.length}`);
    } catch (err) {
        console.error('❌ [AI Client] Config Sync Failed:', err.message);
    }
}

// 模型配置 (對外導出)
export let DEFAULT_MODEL = modelsPool[0].model; // 初始預設值

/**
 * 取得當前系統最權威的模型名稱
 */
export async function getCurrentModel() {
    await syncAIConfig();
    return currentSystemModel;
}

/**
 * 獲取當前最適用的模型 (自動迴避 503 冷卻中模型)
 */
export function getBestModel() {
    const now = Date.now();
    let bestIndex = modelsPool.findIndex(m => now >= m.cooldownUntil);
    if (bestIndex === -1) {
        bestIndex = modelsPool.length - 1; // 全死時用最後一個保底
    }
    return modelsPool[bestIndex].model;
}

// 金鑰池管理：支援 3 級隔離架構 (BG / GAME / PAID)
let apiKeysPool = (() => {
    const bgRaw = process.env.GEMINI_BG_KEYS;
    const gameRaw = process.env.GEMINI_GAME_KEYS;
    const paidRaw = process.env.GEMINI_PAID_KEYS;
    const freeRaw = process.env.GEMINI_FREE_KEYS; // 向後相容

    const bgKeys = (bgRaw || '').split(',').map(k => k.trim()).filter(Boolean);
    const gameKeys = (gameRaw || '').split(',').map(k => k.trim()).filter(Boolean);
    const paidKeys = (paidRaw || '').split(',').map(k => k.trim()).filter(Boolean);
    const freeKeys = (freeRaw || '').split(',').map(k => k.trim()).filter(Boolean);

    let idx = 0;
    const pool = [
        ...bgKeys.map(k => ({ key: k, index: idx++, cooldownUntil: 0, lastUsedAt: 0, poolType: 'bg' })),
        ...gameKeys.map(k => ({ key: k, index: idx++, cooldownUntil: 0, lastUsedAt: 0, poolType: 'game' })),
        ...paidKeys.map(k => ({ key: k, index: idx++, cooldownUntil: 0, lastUsedAt: 0, poolType: 'paid' })),
        ...freeKeys.map(k => ({ key: k, index: idx++, cooldownUntil: 0, lastUsedAt: 0, poolType: 'free' }))
    ];

    if (pool.length > 0) return pool;

    // 極端向後相容
    const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').filter(k => k.trim());
    return rawKeys.map((k, index) => ({ key: k, index, cooldownUntil: 0, lastUsedAt: 0, poolType: index === 5 ? 'paid' : 'free' }));
})();

let genAIInstances = new Map(); // 快取實例

// 全域治理狀態 [SOVEREIGN V4.0]
/**
 * GlobalAIState - 控制全系統背景任務的閥門
 * Green: 正常 | Yellow: 警告 (暫停背景任務) | Red: 嚴重 (僅限關鍵任務)
 */
export const GlobalAIState = {
    status: 'green', // 'green', 'yellow', 'red'
    cooldownUntil: 0,
    last429At: 0,
    paidPatrolUntil: 0, // 付費補題模式截止時間 (0 = 未啟用)
    checkHealth: function() {
        if (Date.now() >= this.cooldownUntil) {
            this.status = 'green';
        }
        return this.status;
    },
    triggerWarning: function(severity = 'yellow') {
        this.status = severity;
        this.last429At = Date.now();
        // Yellow 鎖定 2 分鐘，Red 鎖定 10 分鐘
        const lockMs = severity === 'red' ? 600000 : 120000;
        this.cooldownUntil = Date.now() + lockMs;
        console.warn(`🚨 [AI Governor] System entered ${severity.toUpperCase()} state. Lock until ${new Date(this.cooldownUntil).toLocaleTimeString()}`);
    },
    /** 啟用付費補題模式 (Admin 手動觸發，持續 durationMs 毫秒) */
    activatePaidPatrol: function(durationMs = 2 * 60 * 60 * 1000) {
        this.paidPatrolUntil = Date.now() + durationMs;
        const expiry = new Date(this.paidPatrolUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        console.log(`💳 [AI Governor] Paid Patrol Mode ACTIVATED — expires at ${expiry}`);
    },
    /** 檢查是否在付費補題有效視窗內 */
    isPaidPatrolActive: function() {
        return Date.now() < this.paidPatrolUntil;
    }
};

// 全域冷卻間隔: 免費 key 15 RPM (每4秒一次已夠)，付費 key 更寬鬆，3秒兼顧兩者
const PACING_DELAY = 3000;
const FREE_PREFERRED_WAIT_MS = 10000;

const getKeyReadyAt = (key, pacingDelay = PACING_DELAY) => Math.max(
    Number(key?.cooldownUntil || 0),
    Number(key?.lastUsedAt || 0) + pacingDelay
);

export function selectGeminiKeyForPolicy(keys = [], {
    now = Date.now(),
    priority = false,
    paidOnly = false,
    freeOnly = false,
    freePreferred = false,
    paidPatrolActive = false,
    pacingDelay = PACING_DELAY,
    freePreferredWaitMs = FREE_PREFERRED_WAIT_MS
} = {}) {
    const bgPool = keys.filter(key => key.poolType === 'bg' || key.poolType === 'free');
    const gamePool = keys.filter(key => key.poolType === 'game' || key.poolType === 'free');
    const paidPool = keys.filter(key => key.poolType === 'paid');
    const isReady = key => now >= getKeyReadyAt(key, pacingDelay);
    const pickBest = pool => pool.find(isReady) ?? null;
    const pickLeastRecentlyUsed = pool => [...pool]
        .filter(isReady)
        .sort((a, b) => Number(a.lastUsedAt || 0) - Number(b.lastUsedAt || 0))[0] ?? null;
    const pickSoonest = pool => [...pool].sort(
        (a, b) => getKeyReadyAt(a, pacingDelay) - getKeyReadyAt(b, pacingDelay)
    )[0] ?? null;
    const pickSooner = (first, second) => [first, second]
        .filter(Boolean)
        .sort((a, b) => getKeyReadyAt(a, pacingDelay) - getKeyReadyAt(b, pacingDelay))[0]
        || null;

    if (paidOnly && freeOnly) return null;
    if (paidOnly) return pickBest(paidPool) || pickSoonest(paidPool);
    if (freeOnly) return pickLeastRecentlyUsed(bgPool) || pickSoonest(bgPool);

    if (freePreferred) {
        const freeReady = pickBest(bgPool);
        if (freeReady) return freeReady;

        const freeSoonest = pickSoonest(bgPool);
        const freeWait = freeSoonest ? getKeyReadyAt(freeSoonest, pacingDelay) - now : Infinity;
        if (freeSoonest && freeWait <= freePreferredWaitMs) return freeSoonest;

        return pickBest(paidPool) || freeSoonest || pickSoonest(paidPool);
    }

    if (priority === false) {
        const backgroundReady = pickBest(bgPool);
        if (backgroundReady) return backgroundReady;
        if (paidPatrolActive) return pickBest(paidPool) || pickSooner(pickSoonest(bgPool), pickSoonest(paidPool));
        return pickSoonest(bgPool);
    }

    if (priority === 'game') {
        return pickBest(gamePool)
            || pickBest(paidPool)
            || pickSooner(pickSoonest(gamePool), pickSoonest(paidPool));
    }

    return pickBest(paidPool)
        || pickBest(gamePool)
        || pickSooner(pickSoonest(paidPool), pickSoonest(gamePool));
}

/**
 * 獲取當前最適用的金鑰實例
 * 策略 [SOVEREIGN V3.15]:
 * 1. 優先從免費池 (1-5) 找「已冷卻完畢」的金鑰。
 * 2. 如果是優先任務且免費池全忙/冷卻中，則啟用第 6 把付費金鑰。
 * 3. 如果依然沒空，則返回當前最快冷卻結束的金鑰。
 */
/**
 * 取得最適用的金鑰實例
 * - isPriority = false  : 僅限背景任務使用 bg 池 (若無則 fallback free)
 * - isPriority = 'game' : 遊戲專用 game 池，枯竭則向 paid 借用
 * - isPriority = true   : 付費級高優先任務，優先 paid，枯竭借用 game
 */
export function getGenAI(isPriority = false, paidOnly = false, freePreferred = false, freeOnly = false) {
    if (apiKeysPool.length === 0) return null;

    const now = Date.now();
    const bgPool = apiKeysPool.filter(k => k.poolType === 'bg' || k.poolType === 'free');
    const gamePool = apiKeysPool.filter(k => k.poolType === 'game' || k.poolType === 'free');
    const paidPool = apiKeysPool.filter(k => k.poolType === 'paid');

    const isReady = k => now >= k.cooldownUntil && (now - k.lastUsedAt >= PACING_DELAY);
    const pickBest = pool => pool.find(isReady) ?? null;
    const pickSoonest = pool => [...pool].sort((a, b) =>
        Math.max(a.cooldownUntil, a.lastUsedAt + PACING_DELAY) -
        Math.max(b.cooldownUntil, b.lastUsedAt + PACING_DELAY)
    )[0] ?? null;

    let bestKeyObj = null;

    if (paidOnly && freeOnly) {
        return null;
    } else if (paidOnly) {
        bestKeyObj = pickBest(paidPool) || pickSoonest(paidPool);
    } else if (freeOnly) {
        bestKeyObj = selectGeminiKeyForPolicy(apiKeysPool, {
            priority: isPriority,
            freeOnly: true,
            paidPatrolActive: false
        });
    } else if (freePreferred) {
        bestKeyObj = selectGeminiKeyForPolicy(apiKeysPool, {
            priority: isPriority,
            freePreferred: true,
            paidPatrolActive: GlobalAIState.isPaidPatrolActive()
        });
    } else if (isPriority === false) {
        // 背景任務：先嘗試 BG 池
        bestKeyObj = pickBest(bgPool);
        // 若啟用了手動付費補題模式且 BG 枯竭，允許背景任務借用 PAID 金鑰
        if (!bestKeyObj && GlobalAIState.isPaidPatrolActive()) {
            bestKeyObj = pickBest(paidPool);
            if (bestKeyObj) console.log(`🛡️  [AI Client] BG pool exhausted — Paid Patrol Mode active, falling back to PAID key[${bestKeyObj.index}].`);
        }
        if (!bestKeyObj) {
            const poolToPick = GlobalAIState.isPaidPatrolActive() ? [...bgPool, ...paidPool] : bgPool;
            bestKeyObj = pickSoonest(poolToPick);
        }
    } else if (isPriority === 'game') {
        // 遊戲出題：先用 GAME 池，枯竭才用 PAID 保底
        bestKeyObj = pickBest(gamePool);
        if (!bestKeyObj) {
            bestKeyObj = pickBest(paidPool);
            if (bestKeyObj) console.log(`🛡️  [AI Client] GAME pool exhausted — falling back to PAID key[${bestKeyObj.index}].`);
        }
        if (!bestKeyObj) {
            const gameSoonest = pickSoonest(gamePool);
            const paidSoonest = pickSoonest(paidPool);
            bestKeyObj = (paidSoonest && gameSoonest && Math.max(paidSoonest.cooldownUntil, paidSoonest.lastUsedAt + PACING_DELAY) <= Math.max(gameSoonest.cooldownUntil, gameSoonest.lastUsedAt + PACING_DELAY)) ? paidSoonest : gameSoonest;
        }
    } else if (isPriority === true) {
        // 優先付費任務
        bestKeyObj = pickBest(paidPool);
        if (!bestKeyObj) bestKeyObj = pickBest(gamePool);
        if (!bestKeyObj) {
            const paidSoonest = pickSoonest(paidPool);
            const gameSoonest = pickSoonest(gamePool);
            bestKeyObj = (paidSoonest && gameSoonest && Math.max(paidSoonest.cooldownUntil, paidSoonest.lastUsedAt + PACING_DELAY) <= Math.max(gameSoonest.cooldownUntil, gameSoonest.lastUsedAt + PACING_DELAY)) ? paidSoonest : gameSoonest;
        }
    }

    if (!bestKeyObj) return null;

    if (freePreferred && bestKeyObj.poolType === 'paid') {
        console.log(`[AI Client] Free-preferred pool unavailable; falling back to PAID key[${bestKeyObj.index}].`);
    }

    const key = bestKeyObj.key;
    if (!genAIInstances.has(key)) {
        genAIInstances.set(key, new GoogleGenerativeAI(key));
    }
    return { ai: genAIInstances.get(key), index: bestKeyObj.index };
}

/**
 * 檢查 AI 服務是否可用
 */
export function isAIAvailable() {
    return apiKeysPool.length > 0;
}

/**
 * 快速呼叫 Gemini 並返回文字結果
 * [REFACTORED V4.0] 支援日配額偵測、24h 鎖定、免費池耗盡後自動升級付費金鑰
 */

// 偵測是否為「日配額耗盡」（非 RPM 速率限制）
function _isDailyQuotaError(msg) {
    if (!msg) return false;
    return msg.includes('GenerateRequestsPerDayPerProjectPerModel') ||
           msg.includes('FreeTier') ||
           (msg.includes('quota') && msg.toLowerCase().includes('day'));
}

function _nextFreeQuotaResetAt(now = new Date()) {
    const timeZone = 'America/Los_Angeles';
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(now)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, Number(part.value)])
    );
    const localTarget = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 5, 0);
    let utcTarget = localTarget;
    for (let pass = 0; pass < 2; pass += 1) {
        const targetParts = Object.fromEntries(
            formatter.formatToParts(new Date(utcTarget))
                .filter(part => part.type !== 'literal')
                .map(part => [part.type, Number(part.value)])
        );
        const representedUtc = Date.UTC(
            targetParts.year,
            targetParts.month - 1,
            targetParts.day,
            targetParts.hour,
            targetParts.minute,
            targetParts.second
        );
        utcTarget = localTarget - (representedUtc - utcTarget);
    }
    return utcTarget;
}

export function isModelUnavailableError(msg) {
    const normalized = String(msg || '').toLowerCase();
    return normalized.includes('404')
        || normalized.includes('model not found')
        || normalized.includes('no longer available')
        || normalized.includes('is not available');
}

export function isGeminiAuthenticationError(message = '') {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('401 unauthorized')
        || normalized.includes('invalid authentication credentials')
        || normalized.includes('access_token_type_unsupported')
        || normalized.includes('api key not valid');
}

export async function callGeminiRaw(prompt, options = {}) {
    const isPriority = options.priority === true ? true : (options.priority === 'game' ? 'game' : false);
    if (options.paidOnly === true && options.freeOnly === true) {
        throw new Error('AI_KEY_POLICY_CONFLICT: paidOnly and freeOnly cannot both be enabled');
    }

    const eligibleKeyCount = options.freeOnly === true
        ? apiKeysPool.filter(key => key.poolType === 'bg' || key.poolType === 'free').length
        : (options.paidOnly === true
            ? apiKeysPool.filter(key => key.poolType === 'paid').length
            : apiKeysPool.length);
    if (eligibleKeyCount === 0) {
        throw new Error(options.freeOnly === true
            ? 'AI_FREE_KEYS_NOT_CONFIGURED'
            : 'AI service not configured');
    }

    // 嚴格免費模式會逐一嘗試所有免費專案，不因個別專案額度耗盡而轉付費。
    const maxAttempts = options.maxAttempts ?? Math.max(eligibleKeyCount, 1);

    let lastError = null;
    // 當免費池全數日配額耗盡時升起，強制下次嘗試使用付費金鑰
    let forcePaidKey = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const effectivePriority = forcePaidKey ? true : isPriority;
        const aiData = getGenAI(
            effectivePriority,
            options.paidOnly === true,
            options.freePreferred === true && !forcePaidKey,
            options.freeOnly === true
        );
        if (!aiData) throw new Error('AI service not configured');

        const { index } = aiData;
        const keyObj = apiKeysPool[index];

        // 升級後若仍選到非付費金鑰（付費金鑰也冷卻中），直接放棄
        if ((forcePaidKey || options.paidOnly === true) && keyObj.poolType !== 'paid') {
            throw lastError || new Error('All API keys exhausted (daily quota)');
        }
        if (options.freeOnly === true && keyObj.poolType === 'paid') {
            throw new Error('AI_FREE_ONLY_POLICY_VIOLATION');
        }

        const now = Date.now();

        // 智慧等待：付費金鑰使用 500ms 雜訊，其餘一律 3000ms
        const keyPacing = keyObj.poolType === 'paid' ? 500 : PACING_DELAY;
        const nextAvailable = Math.max(keyObj.cooldownUntil, keyObj.lastUsedAt + keyPacing);
        const waitTime = nextAvailable - now;

        if (options.maxQueueWaitMs !== undefined && waitTime > options.maxQueueWaitMs) {
            throw lastError || new Error(`AI key queue wait ${waitTime}ms exceeds live request limit`);
        }
        
        // 如果需要等待超過 2 分鐘（例如被鎖到明天），直接拋出錯誤，避免把執行緒卡死 24 小時
        if (waitTime > 120000) {
            if (options.freeOnly === true) {
                throw new Error(`FREE_ONLY_QUOTA_EXHAUSTED:retryAt=${nextAvailable}`);
            }
            throw lastError || new Error(`All suitable API keys are exhausted. Next available in ${Math.round(waitTime / 60000)} minutes.`);
        }

        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }

        keyObj.lastUsedAt = Date.now();

        console.log(`📡 [AI Client] Attempt ${attempt}/${maxAttempts} via Key[${index}] (${keyObj.poolType.toUpperCase()})...`);

        try {
            return await _internalCall(prompt, options, aiData);
        } catch (error) {
            lastError = error;
            const isQuotaError  = error.message?.includes('429') || error.message?.includes('spending cap');
            const isServerError = error.message?.includes('503') || error.message?.includes('500') || error.message?.includes('502');
            const isModelUnavailable = isModelUnavailableError(error.message);
            const isAuthenticationError = isGeminiAuthenticationError(error.message);

            console.warn(`⚠️ [AI Client] Attempt ${attempt}/${maxAttempts} failed (Key[${index}]): ${error.message?.substring(0, 150)}`);

            if (isAuthenticationError) {
                keyObj.cooldownUntil = Date.now() + 24 * 60 * 60 * 1000;
                console.warn(`🔒 [AI Client] Key[${index}] authentication failed — quarantined for 24 hours.`);
                continue;
            }

            if (isModelUnavailable && modelsPool.length > 1 && !options.model) {
                const currentModel = getBestModel();
                const modelIndex = modelsPool.findIndex(model => model.model === currentModel);
                if (modelIndex !== -1) {
                    modelsPool[modelIndex].cooldownUntil = Date.now() + 6 * 60 * 60 * 1000;
                    console.warn(`[AI Client] Model [${currentModel}] is unavailable; switching model for 6 hours.`);
                    continue;
                }
            }

            if (isQuotaError) {
                if (keyObj.poolType !== 'paid' && _isDailyQuotaError(error.message)) {
                    // 日配額耗盡：鎖定到隔天 UTC 零時（加 5 分鐘緩衝）
                    const resetAt = _nextFreeQuotaResetAt();
                    keyObj.cooldownUntil = resetAt;
                    console.warn(`💀 [AI Client] Key[${index}] DAILY QUOTA exhausted — locked until ${new Date(resetAt).toUTCString()}`);

                    // 遊戲或高優先請求：一旦所有免費金鑰日配額耗盡，立即升級付費金鑰
                    if ((isPriority === 'game' || isPriority === true) && !forcePaidKey) {
                        const bgGamePool = apiKeysPool.filter(k => k.poolType === 'game' || k.poolType === 'bg' || k.poolType === 'free');
                        const paidPool = apiKeysPool.filter(k => k.poolType === 'paid');
                        const allBaseExhausted = bgGamePool.every(k => Date.now() < k.cooldownUntil);
                        const hasPaidReady = paidPool.some(k => Date.now() >= k.cooldownUntil);
                        if (allBaseExhausted && hasPaidReady && options.freeOnly !== true) {
                            forcePaidKey = true;
                            console.log(`🛡️  [AI Client] All free keys at daily quota — escalating to PAID key immediately.`);
                            GlobalAIState.triggerWarning('yellow');
                            continue; // 不等待，立即以付費金鑰重試
                        }
                    }

                    if (options.freeOnly === true) {
                        const freePool = apiKeysPool.filter(k => k.poolType === 'bg' || k.poolType === 'free');
                        const allFreeExhausted = freePool.length > 0
                            && freePool.every(k => Date.now() < k.cooldownUntil);
                        if (allFreeExhausted) {
                            const retryAt = Math.min(...freePool.map(k => k.cooldownUntil));
                            throw new Error(`FREE_ONLY_QUOTA_EXHAUSTED:retryAt=${retryAt}`);
                        }
                    }
                } else {
                    // RPM 速率限制：鎖定 120 秒
                    keyObj.cooldownUntil = Date.now() + 120000;
                    console.warn(`🚀 [AI Client] Key[${index}] 429 rate limit — locked 120s, rotating.`);
                }
                GlobalAIState.triggerWarning('yellow');
                continue;
            }

            if (isServerError && modelsPool.length > 1 && !options.model) {
                // 鎖定該模型 5 分鐘，切換至備援模型
                const currentModel = getBestModel();
                const mIndex = modelsPool.findIndex(m => m.model === currentModel);
                if (mIndex !== -1 && mIndex < modelsPool.length - 1) {
                    modelsPool[mIndex].cooldownUntil = Date.now() + 300000;
                    console.warn(`🚀 [AI Client] Model [${currentModel}] 503 — locked 5 min, switching model.`);
                }
            }

            // 其他錯誤：遞增等待後重試
            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

/**
 * 內部單次 API 調用（不含重試迴圈）
 * 所有重試與金鑰輪換邏輯統一由 callGeminiRaw 管理
 */
async function _internalCall(prompt, options = {}, aiData) {
    if (!aiData) throw new Error('AI service not configured');
    const { ai, index: usedIndex } = aiData;

    const apiVersion = (options.apiVersion || process.env.GEMINI_API_VERSION || 'v1beta').trim();
    const activeModel = getBestModel();
    const effectiveModel = resolveGeminiModel(options.model || activeModel);

    const modelConfig = {
        model: effectiveModel,
        generationConfig: {
            maxOutputTokens: options.maxOutputTokens || 2048,
            temperature: options.temperature || 0.7,
            ...(options.json ? { responseMimeType: 'application/json' } : {}),
            // 關閉思考模式以避免 thinking tokens 耗盡 maxOutputTokens
            ...(options.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } } : {})
        },
        safetySettings: options.safetySettings || []
    };

    if (options.systemInstruction) {
        modelConfig.systemInstruction = options.systemInstruction;
    }

    let finalPrompt = prompt;
    if (options.json && apiVersion !== 'v1beta') {
        finalPrompt = `${prompt}\n\nIMPORTANT: Output strictly in JSON format.`;
    }

    const model = ai.getGenerativeModel(modelConfig, { apiVersion });
    let requestTimeoutId = null;
    const generationPromise = model.generateContent(finalPrompt);
    const result = options.requestTimeoutMs
        ? await Promise.race([
            generationPromise,
            new Promise((_, reject) => {
                requestTimeoutId = setTimeout(
                    () => reject(new Error(`AI request timed out after ${options.requestTimeoutMs}ms`)),
                    options.requestTimeoutMs
                );
            })
        ]).finally(() => {
            if (requestTimeoutId) clearTimeout(requestTimeoutId);
        })
        : await generationPromise;
    const response = await result.response;

    // Token 與成本統計
    const usageData = response.usageMetadata;
    const moduleName = options.moduleName || 'unknown';

    if (usageData) {
        await syncAIConfig();
        const modelId = effectiveModel;
        const rates = modelPriceCache.get(modelId) || {
            input: (0.1 / PER_MILLION) * TWD_RATE,
            output: (0.4 / PER_MILLION) * TWD_RATE
        };

        // 僅付費金鑰記錄台幣成本
        const keyObj = apiKeysPool[usedIndex];
        let costTwd = keyObj.poolType === 'paid'
            ? ((usageData.promptTokenCount || 0) * rates.input) + ((usageData.candidatesTokenCount || 0) * rates.output)
            : 0;
        
        if (Number.isNaN(costTwd)) costTwd = 0;

        const { usersOps } = await import('../../database/index.js');
        if (usersOps) {
            usersOps.logAIUsage(
                options.userId || 'system',
                moduleName,
                usageData.promptTokenCount,
                usageData.candidatesTokenCount,
                costTwd,
                modelId,
                options.correlationId || null
            ).catch(err => console.error('❌ [AI Client] Usage Log Error:', err.message));
        }

        console.log(`📊 [AI Usage] ${moduleName} (${modelId}) | Key:[${usedIndex}] Pool:[${keyObj.poolType}] | In ${usageData.promptTokenCount} / Out ${usageData.candidatesTokenCount} | 💸 Cost: NT$${costTwd.toFixed(4)}`);
    }

    return response.text();
}

export const callGemini = callGeminiRaw;

export default {
    getGenAI,
    isAIAvailable,
    callGemini,
    callGeminiRaw,
    DEFAULT_MODEL
};
