import { bibleTranslator } from './bibleTranslator.js';
import logger from './logger.js';

/**
 * ContextBuilder - 專職出題上下文數據整合 (V38.8 修正版)
 * 🚀 [Sovereign Implementation]
 */
export default class ContextBuilder {
    constructor(db, ops, manager) {
        this.db = db;
        this.ops = ops;
        this.manager = manager;
        this._lexiconIndex = null;
        this._lexiconLastUpdate = 0;
    }

    /**
     * 出題上下文 API (核心整合點)
     * 職責：整合多源數據，供 AI 生成高品質題目。
     */
    async getQuestionContext(book, startChapter, endChapter, locale = 'zh-TW', verseStart = 1, verseEnd = 200, options = {}) {
        const version = options.version || (locale === 'en' ? 'web' : 'unv');
        const targetVersion = this.manager._resolveVersion(version);

        const bookEn = bibleTranslator.toEnglish(book);
        const bookZh = bibleTranslator.toChinese(book);
        const bookCode = bibleTranslator.toShortCode(book); // ⚡ PostgreSQL 只認 3 字母縮寫

        const vStartRaw = parseInt(verseStart) || 1;
        const vEndRaw = parseInt(verseEnd) || 200;

        // 💡 [Context Buffer] 增加前後 3 節的緩衝區間，提供語意背景
        const buffer = 3;
        const vStartBuff = Math.max(1, vStartRaw - buffer);
        const vEndBuff = vEndRaw + buffer;

        const context = {
            book: bookEn,
            bookChinese: bookZh,
            startChapter,
            endChapter,
            verseStart: vStartRaw,
            verseEnd: vEndRaw,
            locale,
            version: targetVersion,
            verses: [],
            totalVerses: 0,
            commentary: null,
            geography: [],
            summary: null,
            has_db_data: false,
            status: 'ready'
        };

        try {
            // 1. 經文內容 (精確到節，帶緩衝)
            context.verses = await this.db.query(`
                SELECT book, chapter, verse, text, version
                FROM bible_verses
                WHERE book = $1 AND chapter >= $2 AND chapter <= $3
                AND verse >= $4 AND verse <= $5
                AND version = $6
                ORDER BY chapter, verse
            `, [bookEn, startChapter, endChapter, vStartBuff, vEndBuff, targetVersion]);

            // [HEALING] 若無經文，觸發修補
            if (!context.verses || context.verses.length === 0) {
                logger.info(`🩹 [ContextBuilder] Missing verses for ${bookEn} ${startChapter}:${vStartBuff}-${vEndBuff}. Healing...`);
                for (let ch = startChapter; ch <= endChapter; ch++) {
                    await this.manager.healing._healChapter(bookEn, ch, version);
                }
                // 重新獲取
                context.verses = await this.db.query(`
                    SELECT book, chapter, verse, text, version
                    FROM bible_verses
                    WHERE book = $1 AND chapter >= $2 AND chapter <= $3
                    AND verse >= $4 AND verse <= $5
                    AND version = $6
                    ORDER BY chapter, verse
                `, [bookEn, startChapter, endChapter, vStartBuff, vEndBuff, targetVersion]);
            }

            context.verses = (context.verses || []).map(v => ({
                ...v,
                text: v.text ? v.text.split(' | ')[0].trim() : ''
            }));

            context.totalVerses = context.verses.length;
            context.has_db_data = context.totalVerses > 0;

            // 2. 相關百科資源 (V40.8 四層主權過濾版)
            // 💡 [Sovereignty V40.8] 僅抓取無爭議的事實層 (ID/FUNC)，徹底排除神學詮釋
            if (options.includeEncyclopedia !== false && options.isBatch !== true) {
                try {
                    const testament = (context.verses[0]?.testament) || (startChapter > 0 ? (await this.manager._getTestament(bookEn)) : null);

                    const segments = await this.db.query(`
                        SELECT theme, content, layer_type
                        FROM knowledge_segments
                        WHERE book = $1 AND chapter = $2
                        AND layer_type IN ('ID', 'FUNC')
                        AND is_standard_answer = TRUE
                        AND (testament = $3 OR testament IS NULL)
                        ORDER BY layer_type ASC
                        LIMIT 3
                    `, [bookZh, startChapter, testament]);

                    if (segments && segments.length > 0) {
                        context.commentary = segments.map(s => ({
                            title: s.theme,
                            content: s.content,
                            layer: s.layer_type
                        }));
                        logger.info(`🎯 [ContextBuilder] Fetched ${segments.length} distilled fact segments for ${bookZh} Ch.${startChapter}`);
                    }
                } catch (e) { logger.warn(`❌ [ContextBuilder] Knowledge segments query failed: ${e.message}`); }
            }

            // 2. 主權知識光環 (Sovereign Insights Aura)
            // 💡 [HQ 2.0] 直接從優化後的 lexicons 表進行關鍵字比對注入
            context.sovereignInsights = {
                geography: [],
                lexicons: []
            };

            // [A] 地理主權對立 (限 15 筆)
            try {
                const locations = await this.db.query(`
                    SELECT DISTINCT l.name_zh, l.description as info, l.metadata
                    FROM locations l
                    INNER JOIN verse_locations vl ON l.id = vl.location_id
                    WHERE vl.book = $1 AND vl.chapter >= $2 AND vl.chapter <= $3
                    AND vl.verse >= $4 AND vl.verse <= $5
                    LIMIT 10
                `, [bookCode, startChapter, endChapter, vStartBuff, vEndBuff]);

                context.sovereignInsights.geography = (locations || []).map(l => {
                    let meta = {};
                    try { meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata) : (l.metadata || {}); } catch (e) {}
                    return {
                        name: l.name_zh,
                        description: l.info,
                        meaning: meta.meaning || null
                    };
                });
            } catch (e) { logger.warn(`❌ [ContextBuilder] Geo aura failed: ${e.message}`); }

            // [B] 百科主權對位 (Lexicon Scanning)
            if (options.includeEncyclopedia !== false) {
                try {
                    const fullText = context.verses.map(v => v.text).join(' ');
                    const lexiconHits = await this._scanSovereignLexicons(fullText);
                    context.sovereignInsights.lexicons = lexiconHits;
                } catch (e) { logger.warn(`❌ [ContextBuilder] Lexicon aura failed: ${e.message}`); }
            }

            // 4. AI 摘要 (單章模式)
            if (startChapter === endChapter) {
                try {
                    const summary = await this.db.get(`
                        SELECT summary_json FROM ai_summaries
                        WHERE book = $1 AND chapter = $2
                        ORDER BY created_at DESC LIMIT 1
                    `, [bookZh, startChapter]);

                    if (summary) {
                        context.summary = typeof summary.summary_json === 'string' ? JSON.parse(summary.summary_json) : (summary.summary_json || {});
                    }
                } catch (e) {}
            }

        } catch (e) {
            logger.error(`❌ [ContextBuilder] getQuestionContext failed: ${e.message}`);
        }

        return context;
    }

    /**
     * 多片段上下文 API (Segmented Batch)
     * 職責：為多個錨點 (Anchors) 批量抓取上下文，供 AI 批次出題。
     */
    async getMultiSegmentContext(book, anchors, version = 'unv', options = {}) {
        // [V4.2 效能主權] 並行抓取所有片段上下文，而非序列等待
        // 15 個 anchor 同時送出 DB 查詢，大幅減少前置等待時間
        const tasks = anchors.map((anchor, index) => {
            const ch = anchor.chapter;
            const vs = anchor.verseRange?.start || 1;
            const ve = anchor.verseRange?.end || 200;

            logger.info(`🔍 [ContextBuilder] Segment Fetching for ${book} Ch.${ch}:${vs}-${ve}...`);
            return this.getQuestionContext(book, ch, ch, options.locale || 'zh-TW', vs, ve, { ...options, version, isBatch: true })
                .then(context => context ? {
                    id: index + 1,
                    ref: `${book} ${ch}:${vs}-${ve}`,
                    chapter: ch,
                    verseRange: { start: vs, end: ve },
                    context
                } : null);
        });

        const settled = await Promise.all(tasks);
        return settled.filter(Boolean);
    }

    /**
     * [HQ 2.0] 百科主權關鍵字掃描
     * @param {string} text - 待掃描的經文文本
     * @returns {Promise<Array>} 命中的百科條目清單
     */
    async _scanSovereignLexicons(text) {
        if (!text || text.length < 2) return [];

        // 1. 確保關鍵字索引已加載 (快取 1 小時或直到進程重啟)
        if (!this._lexiconIndex || (Date.now() - this._lexiconLastUpdate > 3600000)) {
            await this._loadLexiconIndex();
        }

        if (!this._lexiconIndex || this._lexiconIndex.length === 0) return [];

        // 2. 使用快速正則掃描 (排除過短的關鍵字以避免誤報)
        const hits = [];
        for (const item of this._lexiconIndex) {
            if (text.includes(item.name)) {
                hits.push(item);
            }
            if (hits.length >= 5) break; // 每片段限制 5 個百科點，避免 Prompt 爆炸
        }

        if (hits.length === 0) return [];

        // 3. 獲取命中項目的詳細精煉資料
        try {
            const ids = hits.map(h => h.id);
            const details = await this.db.query(`
                SELECT id, name_zh as name, distilled_json as insights, category
                FROM lexicons
                WHERE id = ANY($1)
            `, [ids]);

            return (details || []).map(d => ({
                id: d.id,
                name: d.name,
                category: d.category,
                details: typeof d.insights === 'string' ? JSON.parse(d.insights) : d.insights
            }));
        } catch (e) {
            logger.warn(`❌ [ContextBuilder] Fetch lexicon details failed: ${e.message}`);
            return [];
        }
    }

    async _loadLexiconIndex() {
        try {
            // 只抓取已精煉且適合出題的類別 (例如：動植物、器物)
            const rows = await this.db.query(`
                SELECT id, name_zh as name
                FROM lexicons
                WHERE is_distilled = TRUE AND LENGTH(name_zh) >= 2
                LIMIT 1000
            `);

            // 處理括號內容，提取主關鍵字
            this._lexiconIndex = (rows || []).map(r => ({
                id: r.id,
                name: r.name.split(/[（(、\s]/)[0].trim()
            })).filter(r => r.name.length >= 2);

            this._lexiconLastUpdate = Date.now();
            logger.info(`📚 [ContextBuilder] Sovereign Lexicon Index loaded: ${this._lexiconIndex.length} items.`);
        } catch (e) {
            logger.error(`❌ [ContextBuilder] Load lexicon index failed: ${e.message}`);
            this._lexiconIndex = [];
        }
    }
}
