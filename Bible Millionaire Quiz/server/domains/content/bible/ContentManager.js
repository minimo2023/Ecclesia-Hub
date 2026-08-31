/**
 * [SOVEREIGN UNIT] Content Manager Service
 * v3.9 [REPAIRED] - Central Resource Orchestrator
 * Pursuing "Stable and Accurate" biblical data management.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../../../utils/config.js';
import { dbOps } from '../../../database/index.js';
import BibleProvider from './providers/BibleProvider.js';
import MetaProvider from './providers/MetaProvider.js';
import HealingService from './providers/HealingService.js';
import ContextBuilder from './providers/ContextBuilder.js';
import { logger } from '../../../utils/logger.js';
import { MEDITATION_STYLES } from '../devotional/prompts/styles.js';
import {
    resolveAuthorProfileVersion,
    selectAuthorProfile,
    STYLE_PROMPT_VERSION
} from '../devotional/prompts/authorProfiles.js';
import { getBibleVersionAliasMap, resolveBibleVersion } from './BibleVersionRegistry.js';
import { cleanBibleDisplayText } from './BibleTextPresentation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ContentManagerService {
    constructor() {
        this.db = null;
        this.ops = null;
        this.initialized = false;
        this._initPromise = null;

        this.bible = null;
        this.meta = null;
        this.healing = null;
        this.context = null;

        this.VERSION_MAP = getBibleVersionAliasMap();
    }

    /**
     * 初始化資源管理服務 (Sovereign Boot)
     * @param {Object} externalDb 外部資料庫實體 (選填)
     */
    async initialize(externalDb = null) {
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            try {
                this.db = externalDb || dbOps.db;
                this.ops = dbOps;

                // 實例化子服務
                this.bible = new BibleProvider(this.db, this.ops, this);
                this.meta = new MetaProvider(this.db, this.ops, this);
                this.healing = new HealingService(this.db, this.ops, this);
                this.context = new ContextBuilder(this.db, this.ops, this);

                logger.info('✅ [ContentManager] 資源主權初始化成功。');
                this.initialized = true;
                return true;
            } catch (error) {
                logger.error('❌ [ContentManager] 初始化失敗:', error);
                this._initPromise = null;
                throw error;
            }
        })();
        return this._initPromise;
    }

    _checkInit() { if (!this.initialized) throw new Error("ContentManager not initialized."); }

    /**
     * [SOVEREIGN] 獲取每日靈修上下文
     */
    /**
     * [V4.5 SOVEREIGN] 獲取靈修候選清單 (供 AI 自主選題使用)
     * 同時提供 3-5 個候選經文，且每個經文包含多個譯本版本。
     */
    async getDailyDevotionalCandidates(dateKey) {
        this._checkInit();
        logger.info(`🔍 [ContentManager] 正在籌備 ${dateKey} 的靈修候選庫...`);

        // 1. 取得節期建議
        const holiday = await this.ops.getTodayLiturgicalEvent(dateKey);
        const suggestedBooks = holiday?.suggestedBooks || null;

        // 2. 取得撰文者。V2 使用固定 21 日輪替；V1 保留舊 dateHash 選法供緊急回退。
        const authors = await this.db.query('SELECT id, name, "styleId", bio as style FROM public.devotional_authors WHERE active = true ORDER BY id ASC');
        if (!Array.isArray(authors) || authors.length === 0) {
            throw new Error('❌ [ContentManager] 找不到活動中的撰文者名單。');
        }

        const profileVersion = resolveAuthorProfileVersion(dateKey);
        let author;
        if (profileVersion === 'v2') {
            author = selectAuthorProfile(dateKey, authors);
        } else {
            const dateHash = dateKey.split('-').reduce((acc, part) => acc + Number.parseInt(part, 10), 0);
            const legacyAuthor = authors[dateHash % authors.length];
            author = {
                ...legacyAuthor,
                styleId: legacyAuthor.styleId || 'default',
                authorVoice: '',
                rotationIndex: null,
                rotationPosition: null,
                authorProfileVersion: 'v1',
                stylePromptVersion: 'v1'
            };
        }

        // 3. 注入人設筆法提示詞 (Sovereign Style Injection)
        const personaStyle = MEDITATION_STYLES[author.styleId] || MEDITATION_STYLES.default;
        author = {
            ...author,
            styleId: author.styleId || 'default',
            styleName: personaStyle.name,
            stylePrompt: personaStyle.prompt,
            stylePromptVersion: author.stylePromptVersion || STYLE_PROMPT_VERSION
        };

        // 4. 提取 3 個候選經文
        const candidates = await this.ops.selectWeightedScripture(suggestedBooks, { limit: 3 });

        const richCandidates = await Promise.all(candidates.map(async (c) => {
            const versions = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD', 'LCC_TRAD'];
            const texts = {};

            for (const v of versions) {
                const versesList = await this.bible.getChapterVerses(c.bookId, c.chapter, v);
                if (versesList && versesList.length > 0) {
                    const selected = versesList.slice(0, 5);
                    // [SOVEREIGN] Clean scripture: No verse numbers for devotionals
                    texts[v] = selected.map(sv => sv.text.trim()).join(' ');
                }
            }

            return {
                bookId: c.bookId,
                bookZh: c.bookZh,
                chapter: c.chapter,
                reference: `${c.bookZh} ${c.chapter}`,
                versionTexts: texts
            };
        }));

        let recentOpenings = [];
        try {
            const rows = await this.db.query(`
                SELECT LEFT(
                    REGEXP_REPLACE(COALESCE(content->>'meditation', ''), E'[\\n\\r]+', ' ', 'g'),
                    50
                ) AS opening
                FROM public.daily_devotionals
                WHERE "dateKey" < $1
                  AND COALESCE(content->>'meditation', '') <> ''
                ORDER BY "dateKey" DESC
                LIMIT 7
            `, [dateKey]);
            recentOpenings = (rows || [])
                .map(row => row.opening?.trim())
                .filter(Boolean);
        } catch (error) {
            logger.warn(`⚠️ [ContentManager] 最近文章開頭載入失敗，維持單次生成：${error.message}`);
        }

        return {
            author,
            holiday: holiday ? { name: holiday.name, theme: holiday.theme } : null,
            candidates: richCandidates,
            recentOpenings
        };
    }

    /**
     * [DEPRECATED V4.5] 獲取單一靈修上下文 (保留相容性，但鼓勵使用 Candidates 段)
     */
    async getDailyDevotionalContext(dateKey) {
        this._checkInit();
        logger.info(`🔍 [ContentManager] 正在籌備 ${dateKey} 的靈修上下文...`);

        // 1. 取得節期建議
        const holiday = await this.ops.getTodayLiturgicalEvent(dateKey);
        const suggestedBooks = holiday?.suggestedBooks || null;

        // 2. 自資料庫動態載入使用者的「人物設定表」 (加上 styleId 以進行主權對位)
        const authors = await this.db.query('SELECT id, name, "styleId", bio as style FROM public.devotional_authors WHERE active = true ORDER BY id ASC');
        if (!authors || authors.length === 0) {
            throw new Error('❌ [ContentManager] 找不到活動中的撰文者名單。');
        }

        const dateHash = dateKey.split('-').reduce((acc, part) => acc + parseInt(part), 0);
        let author = authors[dateHash % authors.length];

        // 3. 注入人設筆法提示詞 (Legacy Path Alignment)
        const { MEDITATION_STYLES } = await import('../devotional/prompts/styles.js');
        const personaStyle = MEDITATION_STYLES[author.styleId] || MEDITATION_STYLES.default;
        author = {
            ...author,
            styleId: author.styleId || 'default',
            styleName: personaStyle.name,
            stylePrompt: personaStyle.prompt
        };

        // 4. 動態譯本輪替 (CUV, CNV, TCV)
        const availableVersions = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD', 'LCC_TRAD'];
        const targetVersion = availableVersions[dateHash % availableVersions.length];

        // 5. 選取權重經文 (支援節期優先)
        const scripture = await this.ops.selectWeightedScripture(suggestedBooks);
        if (!scripture) {
            throw new Error('❌ [ContentManager] 權重引擎無法獲取推薦經文。');
        }

        logger.info(`📖 [ContentManager] 選定經文: ${scripture.bookZh} 第 ${scripture.chapter} 章 (版本: ${targetVersion})`);

        // 5. 調用 bibleProvider 獲取實際文本
        const versesList = await this.bible.getChapterVerses(scripture.bookId, scripture.chapter, targetVersion);

        let text = '';
        let verseRange = '1';

        if (versesList && versesList.length > 0) {
            // [V4.5] 取前 5-8 節作為靈修主幹，增強閱讀飽足感
            const selectedVerses = versesList.slice(0, 8);
            // [SOVEREIGN] Pure text for devotionals (No verse numbers)
            text = selectedVerses.map(v => v.text.trim()).join(' ');
            verseRange = selectedVerses.length > 1 ? `${selectedVerses[0].verse}-${selectedVerses[selectedVerses.length - 1].verse}` : `${selectedVerses[0].verse}`;
        } else {
            // 嘗試更激進的降級：換一個譯本再抓一次
            logger.warn(`⚠️ [ContentManager] 在 ${targetVersion} 找不到 ${scripture.bookId}，嘗試 CUV_TRAD 救回...`);
            const cuvVerses = await this.bible.getChapterVerses(scripture.bookId, scripture.chapter, 'CUV_TRAD');
            if (cuvVerses && cuvVerses.length > 0) {
                const selected = cuvVerses.slice(0, 5);
                text = selected.map(v => v.text.trim()).join(' ');
                verseRange = `1-${selected[selected.length - 1].verse}`;
            } else {
                throw new Error(`❌ 經文主權缺失：無法在任何譯本中找到 ${scripture.bookZh} 第 ${scripture.chapter} 章`);
            }
        }

        return {
            scripture: {
                reference: `${scripture.bookZh} ${scripture.chapter}:${verseRange}`,
                version: targetVersion,
                text: text,
                book: scripture.bookZh,
                chapter: scripture.chapter
            },
            author,
            holiday: holiday ? { name: holiday.name, theme: holiday.theme } : null
        };
    }

    // --- 代理介面 (Facade Layer - Unified V39 Aligned) ---
    async getBookStructure(book) { this._checkInit(); return await this.meta.getBookStructure(book); }
    async getMultiSegmentContext(book, anchors, version, options) {
        this._checkInit();
        return await this.context.getMultiSegmentContext(book, anchors, version, options);
    }
    async getChapterVerses(book, chapter, version) { this._checkInit(); return await this.bible.getChapterVerses(book, chapter, version); }
    async getPassage(b, sc, sv, ec, ev, v) { this._checkInit(); return await this.bible.getPassage(b, sc, sv, ec, ev, v); }
    async getScripture(b, sc, sv, ec, ev, v) { this._checkInit(); return await this.bible.getPassage(b, sc, sv, ec, ev, v); }
    async getAvailableBooks(v) { this._checkInit(); return await this.bible.getAvailableBooks(v); }

    async getQuestionContext(book, startChapter, endChapter, locale, verseStart, verseEnd, options) {
        this._checkInit();
        return await this.context.getQuestionContext(book, startChapter, endChapter, locale, verseStart, verseEnd, options);
    }

    // Lexicon Proxies
    async getRandomLexicons(category = null, limit = 1) { this._checkInit(); return await dbOps.getRandomLexicons(category, limit); }
    async searchLexicons(query, category = null, limit = 20) { this._checkInit(); return await dbOps.searchLexicons(query, category, limit); }
    async getLexicon(id) { this._checkInit(); return await dbOps.getLexicon(id); }

    _resolveVersion(v) {
        const resolved = resolveBibleVersion(v || 'CUV_TRAD');
        return resolved?.storageVersion || v || 'CUV_TRAD';
    }
    _cleanText(t) {
        return cleanBibleDisplayText(t);
    }
    async query(s, p) { this._checkInit(); return await this.db.query(s, p); }

    /**
     * [V4.1 SOVEREIGN] 判斷書卷所屬約 (新約/舊約)
     * 用於 ContextBuilder 的知識片段篩選，確保跨約準確率。
     * @param {string} bookEnglish - 英文書名 (如 'Acts', 'Genesis')
     * @returns {Promise<string>} 'New' | 'Old' | null
     */
    async _getTestament(bookEnglish) {
        const NEW_TESTAMENT_BOOKS = [
            'Matthew', 'Mark', 'Luke', 'John', 'Acts',
            'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
            'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
            '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
            'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
            'Jude', 'Revelation'
        ];
        if (!bookEnglish) return null;
        return NEW_TESTAMENT_BOOKS.includes(bookEnglish) ? 'New' : 'Old';
    }
}

const contentManager = new ContentManagerService();

/**
 * [SOVEREIGN UNIT] EXPORTS
 */
export { ContentManagerService, contentManager as ContentManager };
export default contentManager;
