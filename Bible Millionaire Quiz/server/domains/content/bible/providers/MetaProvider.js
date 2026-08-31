import { bibleTranslator } from './bibleTranslator.js';
import logger from './logger.js';

/**
 * MetaProvider - 專職書卷結構、版本統計與主權審計 (V38.6 修正版)
 * 🚀 [Sovereign Implementation]
 */
export default class MetaProvider {
    constructor(db, ops, manager) {
        this.db = db;
        this.ops = ops;
        this.manager = manager;
    }

    /**
     * 獲取書卷章節結構 (用於出題藍圖計算)
     */
    async getBookStructure(book) {
        const stdBook = bibleTranslator.toChinese(book);
        const bookEn = bibleTranslator.toEnglish(book);

        // [V4.1 SOVEREIGN] 多版本回退機制：確保 ChronicleAnchor 總能獲得完整節數
        // 若 CUV_TRAD 無資料 (如資料庫尚未填充)，自動回退至 unv 或任意可用版本
        const VERSION_PRIORITY = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD', 'LCC_TRAD'];

        for (const version of VERSION_PRIORITY) {
            try {
                const chapters = await this.db.query(`
                    SELECT chapter, COUNT(*) as verse_count
                    FROM bible_verses
                    WHERE book = $1 AND version = $2
                    GROUP BY chapter
                    ORDER BY chapter ASC
                `, [bookEn, version]);

                if (chapters && chapters.length > 0) {
                    if (version !== 'CUV_TRAD') {
                        logger.warn(`⚠️ [MetaProvider] CUV_TRAD missing for ${bookEn}, fell back to ${version}`);
                    }
                    return {
                        name: stdBook,
                        // [FIX] Postgres Adapter 自動轉 camelCase：COUNT(*) as verse_count → verseCount
                        chapters: chapters.map(c => ({
                            chapter: parseInt(c.chapter),
                            verseCount: parseInt(c.verseCount || c.verse_count || 0),
                            verse_count: parseInt(c.verseCount || c.verse_count || 0) // 舊欄位相容
                        }))
                    };
                }
            } catch (e) {
                logger.warn(`❌ [MetaProvider] getBookStructure version ${version} failed: ${e.message}`);
            }
        }

        logger.error(`❌ [MetaProvider] getBookStructure: no verse data found for ${bookEn} in any version`);
        return null;
    }

    /**
     * 獲取所有版本的統計數據
     */
    async getVersionStats() {
        try {
            return await this.db.query(`
                SELECT version, COUNT(*) as verse_count, COUNT(DISTINCT book) as book_count
                FROM bible_verses
                GROUP BY version
            `);
        } catch (e) {
            logger.warn(`❌ [MetaProvider] getVersionStats failed: ${e.message}`);
            return [];
        }
    }

    /**
     * 獲取特定段落的純文字內容
     */
    async getPassageContent(refString) {
        try {
            const normalized = refString.replace(/[：]/g, ':').replace(/[\s\u3000]+/g, ' ').trim();
            const parts = normalized.match(/^(.+?)\s+(\d+)(?::(\d+)(?:[-\u2013\u2014](\d+))?)?/);
            if (!parts) return refString;

            const [_, book, chapter, vStart, vEnd] = parts;
            const cleanBook = book.replace(/[()（）]/g, '').trim();
            const bookName = bibleTranslator.toEnglish(cleanBook);
            const chNum = parseInt(chapter);
            const sNum = vStart ? parseInt(vStart) : 1;
            const eNum = vEnd ? parseInt(vEnd) : 31102;

            const verses = await this.db.query(`
                SELECT text FROM bible_verses
                WHERE book = $1 AND chapter = $2 AND verse >= $3 AND verse <= $4 AND version = 'CUV_TRAD'
                ORDER BY verse
            `, [bookName, chNum, sNum, eNum]);

            if (!verses || verses.length === 0) return refString;
            return verses.map(v => this.manager._cleanText(v.text)).join(' ');
        } catch (e) {
            logger.warn(`❌ [MetaProvider] getPassageContent failed: ${e.message}`);
            return refString;
        }
    }

    /**
     * 全局健康審計 (資料庫完整性)
     */
    async auditHealth() {
        logger.info('🔍 [MetaProvider] Starting Content Health Audit...');
        const stats = {
            emptyBooks: [],
            missingCoordinates: 0
        };

        try {
            const books = await this.manager.bible.getAvailableBooks();
            for (const b of books) {
                const res = await this.db.get('SELECT COUNT(*) as count FROM bible_verses WHERE book = $1', [b.book]);
                if (res ? parseInt(res.count) === 0 : true) stats.emptyBooks.push(b.book);
            }

            const geo = await this.db.get('SELECT COUNT(*) as count FROM locations WHERE lat IS NULL OR lon IS NULL');
            stats.missingCoordinates = geo ? parseInt(geo.count) : 0;

            logger.info('📊 [MetaProvider] Audit Results:', stats);
            return stats;
        } catch (e) {
            logger.error(`❌ [MetaProvider] Health Audit failed: ${e.message}`);
            return null;
        }
    }
}
