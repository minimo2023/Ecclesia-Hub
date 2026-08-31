/**
 * [SOVEREIGN UNIT] Devotional Service
 * v3.5 - High-fidelity AI Devotional Engine
 * Pursuing "Stable and Accurate" spiritual nourishment.
 */
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { DEFAULT_MODEL } from '../../../infrastructure/ai/gemini-client.js';
import { dbOps } from '../../../database/index.js';
import { ContentManager } from '../bible/ContentManager.js';
import { logger } from '../../../utils/logger.js';
import EventEmitter from 'events';
import {
    DEFAULT_V2_START_DATE,
    DEVOTIONAL_PROMPT_VERSION
} from './prompts/authorProfiles.js';

export const devotionalEvents = new EventEmitter();

export class DevotionalGenerationInProgress extends Error {
    constructor(dateKey) {
        super(`${dateKey} 的靈修正在生成中`);
        this.name = 'DevotionalGenerationInProgress';
        this.code = 'DEVOTIONAL_GENERATING';
    }
}

export const getTaiwanDateKey = (now = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);

const REQUIRED_UNIFIED_FIELDS = [
    'selected_index', 'title', 'scripture', 'scriptureReference',
    'understanding', 'meditation', 'prayer', 'closingWord'
];

export function validateUnifiedDevotional(response, candidateCount) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new Error('AI 回傳格式損毀，必須是靈修物件。');
    }
    for (const field of REQUIRED_UNIFIED_FIELDS) {
        if (field === 'selected_index') continue;
        if (typeof response[field] !== 'string' || !response[field].trim()) {
            throw new Error(`AI 回傳格式損毀，缺少 ${field}。`);
        }
    }
    const selectedIndex = Number.parseInt(response.selected_index, 10);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > candidateCount) {
        throw new Error('AI 回傳格式損毀，selected_index 超出候選範圍。');
    }
    return selectedIndex;
}

const normalizeOpening = value => String(value || '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 18);

export function collectDevotionalStyleWarnings(response, recentOpenings = []) {
    const warnings = [];
    const meditation = String(response?.meditation || '');
    const chineseCharacterCount = (meditation.match(/[\u3400-\u9FFF]/g) || []).length;
    if (chineseCharacterCount < 350) warnings.push(`meditation_too_short:${chineseCharacterCount}`);
    if (chineseCharacterCount > 550) warnings.push(`meditation_too_long:${chineseCharacterCount}`);

    const opening = normalizeOpening(meditation);
    if (opening.length >= 12 && recentOpenings.some(item => {
        const recent = normalizeOpening(item);
        return recent.length >= 12 && (opening.startsWith(recent.slice(0, 12)) || recent.startsWith(opening.slice(0, 12)));
    })) warnings.push('recent_opening_similarity');

    return warnings;
}

function getStyleAuditMode(dateKey) {
    const startDate = process.env.DEVOTIONAL_AUTHOR_V2_START_DATE || DEFAULT_V2_START_DATE;
    const toUtc = value => {
        const [year, month, day] = value.split('-').map(Number);
        return Date.UTC(year, month - 1, day);
    };
    const elapsedDays = Math.floor((toUtc(dateKey) - toUtc(startDate)) / 86400000);
    return elapsedDays >= 0 && elapsedDays < 21 ? 'observe' : 'standard';
}

/**
 * @typedef {Object} DevotionalContent
 * @property {string} title - 靈修主題
 * @property {string} scriptureReference - 經文出處
 * @property {string} scriptureText - 經文內容
 * @property {string} meditation - 靈修隨想
 * @property {string} prayer - 今日禱告
 * @property {string} closingWord - 生命加油站
 */

/**
 * 靈修服務 初始化
 * @returns {boolean}
 */
function initDevotionalService() {
    const isAvailable = isServiceAvailable();
    logger.info(`✨ [靈修服務] AI 服務初始化狀態: ${isAvailable ? '✅ 可用' : '❌ 不可用'}`);
    return isAvailable;
}

/**
 * 檢查服務可用性
 * @returns {boolean}
 */
function isServiceAvailable() {
    return LogosEngine.isAvailable?.() ?? true;
}

/**
 * 生成靈修短文 (核動力版本 - 單一事實來源)
 * @param {Object} options
 * @returns {Promise<DevotionalContent>}
 */
async function generateDevotional(options = {}) {
    if (!isServiceAvailable()) throw new Error('靈修服務尚未平穩啟動或 AI 不可用');

    const { targetDate, forceRefresh = false } = options;
    const dateKey = targetDate || getTaiwanDateKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('靈修日期格式不正確');

    return dbOps.notesDb.transaction(async tx => {
        const lock = await tx.get(
            `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
            [`daily_devotional:${dateKey}`]
        );
        if (!lock?.acquired) throw new DevotionalGenerationInProgress(dateKey);
        const existing = await tx.get('SELECT * FROM public.daily_devotionals WHERE "dateKey" = $1 FOR UPDATE', [dateKey]);
        if (existing && !forceRefresh) {
            return typeof existing.content === 'string' ? JSON.parse(existing.content) : existing.content;
        }

        // 1. 取得多個候選上下文 (含節期、多個經文候選與多譯本、撰文者)
        const context = await ContentManager.getDailyDevotionalCandidates(dateKey);
        const { author, holiday, candidates, recentOpenings = [] } = context;
        if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('沒有可用的靈修經文候選');

        logger.info(`✨ [靈修服務] 啟動全能生成... (作家: ${author.name}${holiday ? `，節期: ${holiday.name}` : ''})`);
        devotionalEvents.emit('status', { date: dateKey, status: 'generating', message: '正在呼叫 AI 產生今日靈修...' });

        const holidayContext = holiday ? `今日是 ${holiday.name}，主題為「${holiday.theme}」。` : '無特別節期';
    
    // --- STAGE 1: 統一選題與生成 (Unified Generation) ---
        const contextData = {
            date: dateKey,
            holidayContext,
            author_name: author.name,
            author_voice: author.authorVoice || '',
            author_profile_version: author.authorProfileVersion || 'v1',
            prompt_version: DEVOTIONAL_PROMPT_VERSION,
            style_name: author.styleName || '預設風格',
            style_prompt: author.stylePrompt || '',
            recent_openings: recentOpenings,
            candidates: candidates.map((c, i) => ({
                index: i + 1,
                reference: c.reference,
                CUV_TRAD: c.versionTexts.CUV_TRAD || '無資料',
                CNV_TRAD: c.versionTexts.CNV_TRAD || '無資料',
                TCV_TRAD: c.versionTexts.TCV2010_TRAD || '無資料'
            }))
        };

        let response;
        try {
            // 正式流程維持單次 unified_devotional 呼叫；不接入四階段提示詞。
            response = await LogosEngine.askBrain('unified_devotional', contextData, {
                priority: true,
                retry: false
            });
        } catch (e) {
            logger.error(`❌ [靈修服務] AI 統一生成失敗:`, e.message);
            throw e;
        }

        const selectedIdx = validateUnifiedDevotional(response, candidates.length);
        const chosen = candidates[selectedIdx - 1];
        const styleWarnings = collectDevotionalStyleWarnings(response, recentOpenings);
        if (styleWarnings.length > 0) {
            logger.warn(`⚠️ [靈修文風觀察] ${dateKey} ${author.name}: ${styleWarnings.join(', ')}`);
        }

    // [LOGIC] 移除可能的高風險字元或損壞控制符，但完整保留中英文、標點、Markdown 等
        const sanitizeChineseText = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
        };

    // 封裝為主權資料結構 (完全對位 DevotionCard.jsx)
        const result = {
        title: sanitizeChineseText(response.title || response.topic || response.mainTheme) || `${author.name} 的今日靈修`,
        scriptureReference: sanitizeChineseText(response.scriptureReference) || chosen.reference,
        scripture: sanitizeChineseText(response.scripture) || chosen.versionTexts.CUV_TRAD,
        understanding: sanitizeChineseText(response.understanding),
        meditation: sanitizeChineseText(response.meditation),
        prayer: sanitizeChineseText(response.prayer),
        closingWord: sanitizeChineseText(response.closingWord),
        author: author.name,
        dateKey,
        metadata: {
            authorId: author.id,
            styleId: author.styleId || 'default',
            authorProfileVersion: author.authorProfileVersion || 'v1',
            stylePromptVersion: author.stylePromptVersion || 'v1',
            promptVersion: DEVOTIONAL_PROMPT_VERSION,
            rotationIndex: author.rotationIndex ?? null,
            rotationPosition: author.rotationPosition ?? null,
            model: DEFAULT_MODEL,
            authorType: 'virtual_ai',
            disclosureVersion: 'v1',
            styleAuditMode: getStyleAuditMode(dateKey),
            styleWarnings,
            intent: holidayContext, // Record holiday intent
            version: 'CUV_TRAD', // Unified prompt simplifies this
            holidayName: holiday?.name || null,
            generatedAt: new Date().toISOString()
        }
        };

        // 候選完整通過 unified schema 後才在同一交易替換正式文章。
        devotionalEvents.emit('status', { date: dateKey, status: 'saving', message: '靈修生成完畢，正在寫入資料庫...' });
        await tx.run(`
            INSERT INTO public.daily_devotionals
                ("dateKey", content, metadata, "styleId", "authorId")
            VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
            ON CONFLICT ("dateKey") DO UPDATE SET
                content = EXCLUDED.content,
                metadata = EXCLUDED.metadata,
                "styleId" = EXCLUDED."styleId",
                "authorId" = EXCLUDED."authorId",
                "createdAt" = CURRENT_TIMESTAMP
        `, [dateKey, JSON.stringify(result), JSON.stringify(result.metadata), author.styleId || null, author.id || null]);
        logger.info(`✅ [靈修服務] ${dateKey} 靈修內容已原子寫入。`);
        devotionalEvents.emit('status', { date: dateKey, status: 'completed', data: result });

        return result;
    });
}

/**
 * 確保今日靈修存在 (保底邏輯)
 * @returns {Promise<boolean>}
 */
async function ensureDailyDevotional() {
    const today = getTaiwanDateKey();
    const existing = await dbOps.getDevotional(today);
    if (!existing) {
        logger.info(`🆕 [靈修服務] 偵測到今日資料空白，啟動自動生成補全...`);
        await generateDevotional({ targetDate: today });
        return true;
    }
    return false;
}

/**
 * 獲取 Did You Know 事實
 * @param {string} dateKey
 * @returns {Promise<string>}
 */
async function getDidYouKnow(dateKey) {
    const devotional = await dbOps.getDevotional(dateKey);
    if (devotional && devotional.closingWord) {
        return devotional.closingWord;
    }
    return "上帝的話是我們腳前的燈，路上的光。";
}

const devotionalService = {
    initDevotionalService,
    isServiceAvailable,
    generateDevotional,
    ensureDailyDevotional,
    getDidYouKnow
};

// --- [SOVEREIGN UNIT] EXPORTS ---
export {
    initDevotionalService,
    isServiceAvailable,
    generateDevotional,
    ensureDailyDevotional,
    getDidYouKnow
};

export default devotionalService;
