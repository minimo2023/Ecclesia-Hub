/**
 * External Bible API Service
 *
 * 職責：處理所有對外部聖經 API 的請求 (FHL, Bible-API, Biblia)
 * 目的：作為本地資料庫缺失時的備援 (Fallback) 機制
 *
 * 設計原則：
 * 1. 統一介面：無論來源為何，回傳格式必須統一
 * 2. 錯誤處理：單一來源失敗不應導致崩潰
 * 3. 獨立性：封裝外部 API 金鑰和細節，不讓邏輯洩漏到 Controller
 */

import fetch from 'node-fetch';
import { FHL_BOOK_CATALOG, getFHLCode } from './fhlCatalog.js';

// Configuration constants (moved from frontend config)
const BIBLE_VERSIONS = {
    CUV: 'cuv',   // 和合本
    CUNP: 'cunp', // 新標點和合本
    NIV: 'niv',   // New International Version
    KJV: 'kjv',   // King James Version
    ESV: 'esv',   // English Standard Version
    RCUV: 'rcuv'  // 和合本修訂版
};

const API_ENDPOINTS = {
    FHL_BASE: 'https://bible.fhl.net/json/',
    BIBLE_API_BASE: 'https://bible-api.com/',
    BIBLIA_BASE: 'https://api.biblia.com/v1/'
};

// Book Code Mappings (Simplified for backend use)
// Frontend often has fuller maps, here we focus on what's needed for API calls
const BOOK_CODES = {
    // 舊約 Old Testament
    'Genesis': { fhl: '1', biblia: 'Gen', zh: '創世記' },
    'Exodus': { fhl: '2', biblia: 'Exod', zh: '出埃及記' },
    'Leviticus': { fhl: '3', biblia: 'Lev', zh: '利未記' },
    'Numbers': { fhl: '4', biblia: 'Num', zh: '民數記' },
    'Deuteronomy': { fhl: '5', biblia: 'Deut', zh: '申命記' },
    'Joshua': { fhl: '6', biblia: 'Josh', zh: '約書亞記' },
    'Judges': { fhl: '7', biblia: 'Judg', zh: '士師記' },
    'Ruth': { fhl: '8', biblia: 'Ruth', zh: '路得記' },
    '1 Samuel': { fhl: '9', biblia: '1Sam', zh: '撒母耳記上' },
    '2 Samuel': { fhl: '10', biblia: '2Sam', zh: '撒母耳記下' },
    '1 Kings': { fhl: '11', biblia: '1Kgs', zh: '列王紀上' },
    '2 Kings': { fhl: '12', biblia: '2Kgs', zh: '列王紀下' },
    '1 Chronicles': { fhl: '13', biblia: '1Chron', zh: '歷代志上' },
    '2 Chronicles': { fhl: '14', biblia: '2Chron', zh: '歷代志下' },
    'Ezra': { fhl: '15', biblia: 'Ezra', zh: '以斯拉記' },
    'Nehemiah': { fhl: '16', biblia: 'Neh', zh: '尼希米記' },
    'Esther': { fhl: '17', biblia: 'Esth', zh: '以斯帖記' },
    'Job': { fhl: '18', biblia: 'Job', zh: '約伯記' },
    'Psalms': { fhl: '19', biblia: 'Ps', zh: '詩篇' },
    'Proverbs': { fhl: '20', biblia: 'Prov', zh: '箴言' },
    'Ecclesiastes': { fhl: '21', biblia: 'Eccles', zh: '傳道書' },
    'Song of Solomon': { fhl: '22', biblia: 'Song', zh: '雅歌' },
    'Isaiah': { fhl: '23', biblia: 'Isa', zh: '以賽亞書' },
    'Jeremiah': { fhl: '24', biblia: 'Jer', zh: '耶利米書' },
    'Lamentations': { fhl: '25', biblia: 'Lam', zh: '耶利米哀歌' },
    'Ezekiel': { fhl: '26', biblia: 'Ezek', zh: '以西結書' },
    'Daniel': { fhl: '27', biblia: 'Dan', zh: '但以理書' },
    'Hosea': { fhl: '28', biblia: 'Hos', zh: '何西阿書' },
    'Joel': { fhl: '29', biblia: 'Joel', zh: '約珥書' },
    'Amos': { fhl: '30', biblia: 'Amos', zh: '阿摩司書' },
    'Obadiah': { fhl: '31', biblia: 'Obad', zh: '俄巴底亞書' },
    'Jonah': { fhl: '32', biblia: 'Jonah', zh: '約拿書' },
    'Micah': { fhl: '33', biblia: 'Mic', zh: '彌迦書' },
    'Nahum': { fhl: '34', biblia: 'Nah', zh: '那鴻書' },
    'Habakkuk': { fhl: '35', biblia: 'Hab', zh: '哈巴谷書' },
    'Zephaniah': { fhl: '36', biblia: 'Zeph', zh: '西番雅書' },
    'Haggai': { fhl: '37', biblia: 'Hag', zh: '哈該書' },
    'Zechariah': { fhl: '38', biblia: 'Zech', zh: '撒迦利亞書' },
    'Malachi': { fhl: '39', biblia: 'Mal', zh: '瑪拉基書' },

    // 新約 New Testament
    'Matthew': { fhl: '40', biblia: 'Matt', zh: '馬太福音' },
    'Mark': { fhl: '41', biblia: 'Mark', zh: '馬可福音' },
    'Luke': { fhl: '42', biblia: 'Luke', zh: '路加福音' },
    'John': { fhl: '43', biblia: 'John', zh: '約翰福音' },
    'Acts': { fhl: '44', biblia: 'Acts', zh: '使徒行傳' },
    'Romans': { fhl: '45', biblia: 'Rom', zh: '羅馬書' },
    '1 Corinthians': { fhl: '46', biblia: '1Cor', zh: '哥林多前書' },
    '2 Corinthians': { fhl: '47', biblia: '2Cor', zh: '哥林多後書' },
    'Galatians': { fhl: '48', biblia: 'Gal', zh: '加拉太書' },
    'Ephesians': { fhl: '49', biblia: 'Eph', zh: '以弗所書' },
    'Philippians': { fhl: '50', biblia: 'Phil', zh: '腓立比書' },
    'Colossians': { fhl: '51', biblia: 'Col', zh: '歌羅西書' },
    '1 Thessalonians': { fhl: '52', biblia: '1Thess', zh: '帖撒羅尼迦前書' },
    '2 Thessalonians': { fhl: '53', biblia: '2Thess', zh: '帖撒羅尼迦後書' },
    '1 Timothy': { fhl: '54', biblia: '1Tim', zh: '提摩太前書' },
    '2 Timothy': { fhl: '55', biblia: '2Tim', zh: '提摩太後書' },
    'Titus': { fhl: '56', biblia: 'Titus', zh: '提多書' },
    'Philemon': { fhl: '57', biblia: 'Philem', zh: '腓利門書' },
    'Hebrews': { fhl: '58', biblia: 'Heb', zh: '希伯來書' },
    'James': { fhl: '59', biblia: 'Jas', zh: '雅各書' },
    '1 Peter': { fhl: '60', biblia: '1Pet', zh: '彼得前書' },
    '2 Peter': { fhl: '61', biblia: '2Pet', zh: '彼得後書' },
    '1 John': { fhl: '62', biblia: '1John', zh: '約翰一書' },
    '2 John': { fhl: '63', biblia: '2John', zh: '約翰二書' },
    '3 John': { fhl: '64', biblia: '3John', zh: '約翰三書' },
    'Jude': { fhl: '65', biblia: 'Jude', zh: '猶大書' },
    'Revelation': { fhl: '66', biblia: 'Rev', zh: '啟示錄' }
};

const FHL_BOOK_ABBREVIATIONS = Object.freeze(Object.fromEntries(
    FHL_BOOK_CATALOG.map(({ chinese, code }) => [chinese, code])
));

const BIBLIA_API_KEY = process.env.BIBLIA_API_KEY;

class ExternalBibleAPIService {

    /**
     * Fetch standard verse data from available external sources
     */
    async getVerse(book, chapter, verse, version = BIBLE_VERSIONS.CUV) {
        // Normalize english book name (e.g., "1_samuel" -> "1 Samuel")
        const normalizedInput = book.replace(/_/g, ' ').trim();
        let standardBook = normalizedInput;

        // Find by Chinese name if input is Chinese
        if (/[\u4e00-\u9fa5]/.test(normalizedInput)) {
            const entry = Object.entries(BOOK_CODES).find(([k, v]) => v.zh === normalizedInput);
            if (entry) standardBook = entry[0];
        }

        try {
            switch (version) {
                case BIBLE_VERSIONS.CUV:
                case BIBLE_VERSIONS.CUNP:
                case BIBLE_VERSIONS.RCUV:
                    return await this.fetchFromFHL(standardBook, chapter, verse);

                case BIBLE_VERSIONS.NIV:
                    // Bible-api.com is good for NIV/WEB
                    return await this.fetchFromBibleAPI(standardBook, chapter, verse);

                case BIBLE_VERSIONS.KJV:
                case BIBLE_VERSIONS.ESV:
                    // Biblia is best for KJV, ESV, NASB
                    if (BIBLIA_API_KEY) {
                        return await this.fetchFromBiblia(standardBook, chapter, verse, version);
                    } else {
                        // Fallback to bible-api if key missing (only KJV supported there)
                        if (version === BIBLE_VERSIONS.KJV) {
                            return await this.fetchFromBibleAPI(standardBook, chapter, verse, 'kjv');
                        }
                        throw new Error('Biblia API key required for ' + version);
                    }

                default:
                    // Default fallback to WEB via Bible-API if version unknown but English-like
                    return await this.fetchFromBibleAPI(standardBook, chapter, verse);
            }
        } catch (error) {
            console.error(`[ExternalBibleAPIs] Failed to fetch ${book} ${chapter}:${verse} (${version}):`, error.message);
            return null; // Silent fail, let ContentManager handle the null
        }
    }

    /**
     * 清洗經文文字：移除 {} 標記、HTML 標籤與多餘空格
     */
    _cleanText(text) {
        if (!text) return '';
        return text
            .replace(/\{[^}]*\}/g, '') // 移除 {} 及其內容 (FHL 隱含詞標記)
            .replace(/\{\}/g, '')       // 移除空 {}
            .replace(/<[^>]*>/g, '')    // 移除所有 HTML 標籤 (如 <u>)
            .replace(/  +/g, ' ')      // 壓縮多餘空格
            .trim();
    }

    async fetchFromFHL(book, chapter, verse) {
        const bookCode = getFHLCode(book);
        if (!bookCode) throw new Error(`Unknown FHL book code: ${book}`);

        const url = `${API_ENDPOINTS.FHL_BASE}qb.php?chineses=${encodeURIComponent(bookCode)}&chap=${chapter}&sec=${verse}&version=unv&strong=0`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`FHL Status: ${response.status}`);

        const data = await response.json();
        if (!data.record || data.record.length === 0) throw new Error('FHL: No records found');

        return {
            book: book,
            chapter: parseInt(chapter),
            verse: parseInt(verse),
            text: this._cleanText(data.record[0].bible_text),
            version: 'unv' // FHL usually returns Union Version
        };
    }

    async fetchFromBibleAPI(book, chapter, verse, specificVersion = '') {
        // bible-api.com supports format: /book+chapter:verse?translation=niv
        const url = `${API_ENDPOINTS.BIBLE_API_BASE}${encodeURIComponent(book)}+${chapter}:${verse}${specificVersion ? '?translation=' + specificVersion : ''}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`BibleAPI Status: ${response.status}`);

        const data = await response.json();

        return {
            book: book,
            chapter: parseInt(chapter),
            verse: parseInt(verse),
            text: data.text.trim(),
            version: specificVersion || 'web'
        };
    }

    async fetchFromBiblia(book, chapter, verse, version) {
        const bookData = BOOK_CODES[book];
        const bookCode = bookData?.biblia || 'Gen';

        const passage = `${bookCode}${chapter}:${verse}`;
        const url = `${API_ENDPOINTS.BIBLIA_BASE}bible/content/${version}.txt?passage=${encodeURIComponent(passage)}&key=${BIBLIA_API_KEY}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Biblia Status: ${response.status}`);

        const text = await response.text();

        return {
            book: book,
            chapter: parseInt(chapter),
            verse: parseInt(verse),
            text: text.trim(),
            version: version
        };
    }

    /**
     * Fetch entire chapter from external sources
     * Returns Array of standardized verse objects
     */
    async getChapter(book, chapter, version = 'unv') {
        let standardBook = book;
        if (/[\u4e00-\u9fa5]/.test(book)) {
            const entry = Object.entries(BOOK_CODES).find(([k, v]) => v.zh === book);
            if (entry) standardBook = entry[0];
        }

        try {
            // Updated list of FHL supported versions based on Frontend
            const fhlVersions = ['unv', 'cunp', 'cuv', 'rcuv', 'lcc', 'ncv', 'tcv2019', 'csb', 'cub', 'kjv'];

            if (fhlVersions.includes(version)) {
                return await this.fetchChapterFromFHL(standardBook, chapter, version);
            } else {
                return await this.fetchChapterFromBibleAPI(standardBook, chapter, version);
            }
        } catch (error) {
            console.error(`[ExternalBibleAPIs] Failed to fetch chapter ${book} ${chapter}:`, error.message);
            return [];
        }
    }

    async fetchChapterFromFHL(book, chapter, version = 'unv') {
        const normalizedInput = book.replace(/_/g, ' ').trim();
        const bookData = BOOK_CODES[normalizedInput] ||
                         Object.entries(BOOK_CODES).find(([k, v]) => k.toLowerCase() === normalizedInput.toLowerCase())?.[1];

        let qstrBook = getFHLCode(normalizedInput) || bookData?.fhl || null;

        // Strategy: Use Chinese Abbreviation (Most reliable for FHL non-unv versions)
        // 1. Get Chinese Name
        const chineseName = bookData?.zh || (/[^\u0000-\u007F]/.test(book) ? book : null);

        // 2. Look up abbreviation
        if (chineseName && FHL_BOOK_ABBREVIATIONS[chineseName]) {
            qstrBook = FHL_BOOK_ABBREVIATIONS[chineseName];
        }
        if (!qstrBook) {
            throw new Error(`Unknown FHL book code: ${book}`);
        }

        const qstr = `${qstrBook}${chapter}`;
        // Use URL object for correct encoding of Chinese characters
        const apiUrl = new URL(`${API_ENDPOINTS.FHL_BASE}qsb.php`);
        apiUrl.searchParams.append('qstr', qstr);
        apiUrl.searchParams.append('version', version);
        apiUrl.searchParams.append('gb', '0');

        const url = apiUrl.toString();

        console.log(`[ExternalBibleAPIs] Preparing fetch: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        try {
            const start = Date.now();
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            console.log(`[ExternalBibleAPIs] Response received in ${Date.now() - start}ms. Status: ${response.status}`);

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`FHL Status: ${response.status}`);
            }

            const text = await response.text();

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error(`[ExternalBibleAPIs] JSON Parse Error. Raw text prefix: ${text.substring(0, 100)}`);
                throw new Error('Invalid JSON from FHL');
            }

            if (data.status !== 'success' || !data.record) {
                console.warn(`[ExternalBibleAPIs] FHL logical error or empty`, data);
                throw new Error('FHL Chapter Fetch Failed or Empty');
            }

            console.log(`[ExternalBibleAPIs] Successfully parsed ${data.record.length} records.`);

            return data.record.map(rec => ({
                book: book,
                chapter: parseInt(chapter),
                verse: parseInt(rec.sec),
                text: this._cleanText(rec.bible_text),
                version: version
            }));

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error(`[ExternalBibleAPIs] Fetch timed out after 8000ms: ${url}`);
            } else {
                console.error(`[ExternalBibleAPIs] Request failed: ${error.message}`);
            }
            throw error;
        }
    }

    async fetchChapterFromBibleAPI(book, chapter, version) {
        const url = `${API_ENDPOINTS.BIBLE_API_BASE}${encodeURIComponent(book)}+${chapter}${version ? '?translation=' + version : ''}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`BibleAPI Status: ${response.status}`);
        const data = await response.json();

        if (!data.verses) return [];

        return data.verses.map(v => ({
            book: book,
            chapter: parseInt(chapter),
            verse: v.verse,
            text: v.text.trim(),
            version: version || 'web'
        }));
    }
}

export const externalBibleService = new ExternalBibleAPIService();
