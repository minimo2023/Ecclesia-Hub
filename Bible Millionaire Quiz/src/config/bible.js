/**
 * Bible API Configuration
 */

// 🚀 [Sovereign Versions] 聖經版本 (與本地 PostgreSQL 資料庫對齊)
export const BIBLE_VERSIONS = {
    CUV: 'cuv',          // 和合本
    NCV: 'ncv',          // 新譯本
    TCV: 'tcv95',        // 現代中文譯本 (1995)
};

// API 來源
export const BIBLE_API_SOURCES = {
    FHL: 'fhl',               // 信望愛 bible.fhl.net
    BIBLE_API: 'bible-api',   // Bible-api.com
    BIBLIA: 'biblia'          // Biblia.com
};

// API 端點
export const BIBLE_API_ENDPOINTS = {
    FHL_BASE: 'https://bible.fhl.net/json/',
    BIBLE_API_BASE: 'https://bible-api.com/',
    BIBLIA_BASE: 'https://api.biblia.com/v1/'
};

// Biblia API Key
export const BIBLIA_API_KEY = import.meta.env.VITE_BIBLIA_API_KEY;

// 書卷代碼映射
export const BOOK_CODES = {
    // 舊約
    'GEN': { zh: '創世記', en: 'Genesis', fhl: 'gen', biblia: 'Ge' },
    'EXO': { zh: '出埃及記', en: 'Exodus', fhl: 'exo', biblia: 'Ex' },
    'LEV': { zh: '利未記', en: 'Leviticus', fhl: 'lev', biblia: 'Le' },
    // ... 更多書卷

    // 新約
    'MAT': { zh: '馬太福音', en: 'Matthew', fhl: 'mat', biblia: 'Mt' },
    'JHN': { zh: '約翰福音', en: 'John', fhl: 'jhn', biblia: 'Jn' },
    // ... 更多書卷
};

// 快取設定（秒）
export const CACHE_TTL = {
    VERSE: 86400 * 7,      // 經文快取 7 天
    CHAPTER: 86400 * 7,    // 整章快取 7 天
    SEARCH: 3600,          // 搜尋快取 1 小時
};

/**
 * 檢查 Biblia API 是否可用
 */
export function isBibliaAvailable() {
    return !!BIBLIA_API_KEY && BIBLIA_API_KEY !== 'your_biblia_key_here';
}
