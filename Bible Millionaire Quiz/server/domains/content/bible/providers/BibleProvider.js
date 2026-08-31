import { bibleTranslator } from './bibleTranslator.js';
import logger from './logger.js';
import { presentBibleChapterVerses } from '../BibleTextPresentation.js';

/**
 * BibleProvider - 專職經文檢索與譯本管理 (V38.6 修正對位版)
 * 🚀 [Sovereign Implementation]
 */
export default class BibleProvider {
    constructor(db, ops, manager) {
        this.db = db;
        this.ops = ops;
        this.manager = manager;
    }

    /**
     * 獲取章節經文 (含自動降級策略)
     */
    async getChapterVerses(book, chapter, version = 'unv') {
        const bookEn = bibleTranslator.toEnglish(book);
        const targetVersion = this.manager._resolveVersion(version);

        try {
            let verses = await this.db.query(`
                SELECT book, chapter, verse, text, version, metadata
                FROM bible_verses
                WHERE book = $1 AND chapter = $2 AND version = $3
                ORDER BY verse
            `, [bookEn, chapter, targetVersion]);

            // [AUTO-FALLBACK] 本地其他譯本降級
            if (!verses || verses.length === 0) {
                const FALLBACK_ORDER = ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD', 'LCC_TRAD'];
                for (const fallbackV of FALLBACK_ORDER) {
                    if (fallbackV === targetVersion) continue;
                    verses = await this.db.query(`
                        SELECT book, chapter, verse, text, version, metadata
                        FROM bible_verses
                        WHERE book = $1 AND chapter = $2 AND version = $3
                        ORDER BY verse
                    `, [bookEn, chapter, fallbackV]);
                    if (verses && verses.length > 0) {
                        logger.info(`💡 [BibleProvider] Local fallback: Found ${bookEn} ${chapter} in ${fallbackV}`);
                        break;
                    }
                }
            }

            // [HEALING] 若仍未找到，調用修復服務
            if (!verses || verses.length === 0) {
                verses = await this.manager.healing._healChapter(bookEn, chapter, version);
            }

            return presentBibleChapterVerses(verses || []);
        } catch (e) {
            logger.warn(`❌ [BibleProvider] getChapterVerses failed (book: ${bookEn}): ${e.message}`);
            return [];
        }
    }

    /**
     * 獲取單節經文
     */
    async getSingleVerse(book, chapter, verse, version = 'unv') {
        const bookEn = bibleTranslator.toEnglish(book);
        const targetVersion = this.manager._resolveVersion(version);

        try {
            let v = await this.db.get(`
                SELECT book, chapter, verse, text, version, metadata
                FROM bible_verses
                WHERE book = $1 AND chapter = $2 AND verse = $3 AND version = $4
            `, [bookEn, chapter, verse, targetVersion]);

            if (!v) {
                v = await this.manager.healing._healVerse(bookEn, chapter, verse, version);
            }

            if (!v) return null;

            // 合併節的空白 placeholder 必須回到實際承載正文的顯示列。
            const chapterVerses = await this.getChapterVerses(book, chapter, version);
            return chapterVerses.find(item => (
                Number(item.verseStart ?? item.verse) <= Number(verse)
                && Number(item.verseEnd ?? item.verse) >= Number(verse)
            )) || null;
        } catch (e) {
            logger.warn(`❌ [BibleProvider] getSingleVerse failed: ${e.message}`);
            return null;
        }
    }

    /**
     * 獲取連續經文段落 (Passage)
     */
    async getPassage(book, startChapter, startVerse, endChapter, endVerse, version = 'unv') {
        try {
            if (startChapter === endChapter) {
                const allVerses = await this.getChapterVerses(book, startChapter, version);
                return (allVerses || []).filter(v => (
                    Number(v.verseEnd ?? v.verse) >= startVerse
                    && Number(v.verseStart ?? v.verse) <= endVerse
                ));
            }

            let results = [];
            for (let c = startChapter; c <= endChapter; c++) {
                const verses = await this.getChapterVerses(book, c, version);
                if (c === startChapter) {
                    results.push(...verses.filter(v => Number(v.verseEnd ?? v.verse) >= startVerse));
                } else if (c === endChapter) {
                    results.push(...verses.filter(v => Number(v.verseStart ?? v.verse) <= endVerse));
                } else {
                    results.push(...verses);
                }
            }
            return results;
        } catch (e) {
            logger.error(`❌ [BibleProvider] getPassage failed: ${e.message}`);
            return [];
        }
    }

    /**
     * 獲取可用書卷清單
     */
    async getAvailableBooks(version = 'unv') {
        const targetVersion = this.manager._resolveVersion(version);
        try {
            return await this.db.query(`
                SELECT DISTINCT book, MAX(chapter) as chapters
                FROM bible_verses
                WHERE version = $1
                GROUP BY book
            `, [targetVersion]);
        } catch (e) {
            logger.warn(`❌ [BibleProvider] getAvailableBooks failed: ${e.message}`);
            return [];
        }
    }
}
