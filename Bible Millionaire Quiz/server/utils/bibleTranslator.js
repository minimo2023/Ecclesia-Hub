/**
 * Bible Translator Utility (聖經書名譯官)
 * 
 * 核心職責：
 * 1. 提供全系統統一的 66 卷書中英映射。
 * 2. 處理各種輸入變體（如底線、大小寫）。
 * 3. 作為資料庫清洗與前端顯示的權威事實來源。
 */

const BIBLE_MAPPING = {
    'Genesis': '創世記', 'Exodus': '出埃及記', 'Leviticus': '利未記',
    'Numbers': '民數記', 'Deuteronomy': '申命記', 'Joshua': '約書亞記',
    'Judges': '士師記', 'Ruth': '路得記', '1 Samuel': '撒母耳記上',
    '2 Samuel': '撒母耳記下', '1 Kings': '列王紀上', '2 Kings': '列王紀下',
    '1 Chronicles': '歷代志上', '2 Chronicles': '歷代志下', 'Ezra': '以斯拉記',
    'Nehemiah': '尼希米記', 'Esther': '以斯帖記', 'Job': '約伯記',
    'Psalms': '詩篇', 'Proverbs': '箴言', 'Ecclesiastes': '傳道書',
    'Song of Solomon': '雅歌', 'Isaiah': '以賽亞書', 'Jeremiah': '耶利米書',
    'Lamentations': '耶利米哀歌', 'Ezekiel': '以西結書', 'Daniel': '但以理書',
    'Hosea': '何西阿書', 'Joel': '約珥書', 'Amos': '阿摩司書',
    'Obadiah': '俄巴底亞書', 'Jonah': '約拿書', 'Micah': '彌迦書',
    'Nahum': '那鴻書', 'Habakkuk': '哈巴谷書', 'Zephaniah': '西番雅書',
    'Haggai': '哈該書', 'Zechariah': '撒迦利亞書', 'Malachi': '瑪拉基書',
    'Matthew': '馬太福音', 'Mark': '馬可福音', 'Luke': '路加福音',
    'John': '約翰福音', 'Acts': '使徒行傳', 'Romans': '羅馬書',
    '1 Corinthians': '哥林多前書', '2 Corinthians': '哥林多後書',
    'Galatians': '加拉太書', 'Ephesians': '以弗所書', 'Philippians': '腓立比書',
    'Colossians': '歌羅西書', '1 Thessalonians': '帖撒羅尼迦前書',
    '2 Thessalonians': '帖撒羅尼迦後書', '1 Timothy': '提摩太前書',
    '2 Timothy': '提摩太後書', 'Titus': '提多書', 'Philemon': '腓利門書',
    'Hebrews': '希伯來書', 'James': '雅各書', '1 Peter': '彼得前書',
    '2 Peter': '彼得後書', '1 John': '約翰一書', '2 John': '約翰二書',
    '3 John': '約翰三書', 'Jude': '猶大書', 'Revelation': '啟示錄'
};

// 反向映射（用於 中 -> 英）
const CHINESE_TO_ENGLISH = Object.entries(BIBLE_MAPPING).reduce((acc, [en, zh]) => {
    acc[zh] = en;
    return acc;
}, {});

const CANONICAL_BOOK_ORDER = Object.freeze(Object.values(BIBLE_MAPPING));
const CANONICAL_BOOK_INDEX = new Map(CANONICAL_BOOK_ORDER.map((book, index) => [book, index]));

/**
 * 規格化輸入：將 "1_samuel" 轉為 "1 Samuel" 並處理組合書名 (如 "列王紀上/下")
 */
function normalizeName(name) {
    if (!name) return '';
    // 1. 處理斜槓分隔的組合書名，取第一個
    let baseName = name.split('/')[0].trim();
    // 2. 處理底線與多餘空格
    baseName = baseName.replace(/_/g, ' ').replace(/\s+/g, ' ');
    // 3. [V4.5.1 Fix] 處理數字與字母連寫的情況 (如 1Peter -> 1 Peter, 2John -> 2 John)
    baseName = baseName.replace(/^([1-3])([A-Za-z])/, '$1 $2');
    // 4. [V4.5.1 Enhancement] 處理常見縮寫變體 (如 SongOfSolomon -> Song of Solomon)
    if (baseName.toLowerCase() === 'songofsolomon') baseName = 'Song of Solomon';
    return baseName.trim();
}

// 📂 [Sovereign Codes] 3 字母縮寫映射表 (與資料庫 bible_verses 對齊)
const BIBLE_SHORT_CODES = {
    'Genesis': 'Gen', 'Exodus': 'Exo', 'Leviticus': 'Lev', 'Numbers': 'Num',
    'Deuteronomy': 'Deu', 'Joshua': 'Jos', 'Judges': 'Jdg', 'Ruth': 'Rut',
    '1 Samuel': '1Sa', '2 Samuel': '2Sa', '1 Kings': '1Ki', '2 Kings': '2Ki',
    '1 Chronicles': '1Ch', '2 Chronicles': '2Ch', 'Ezra': 'Ezr', 'Nehemiah': 'Neh',
    'Esther': 'Est', 'Job': 'Job', 'Psalms': 'Psa', 'Proverbs': 'Pro',
    'Ecclesiastes': 'Ecc', 'Song of Solomon': 'Sng', 'Isaiah': 'Isa', 'Jeremiah': 'Jer',
    'Lamentations': 'Lam', 'Ezekiel': 'Eze', 'Daniel': 'Dan', 'Hosea': 'Hos',
    'Joel': 'Joe', 'Amos': 'Amo', 'Obadiah': 'Oba', 'Jonah': 'Jon',
    'Micah': 'Mic', 'Nahum': 'Nah', 'Habakkuk': 'Hab', 'Zechariah': 'Zec',
    'Malachi': 'Mal', 'Zephaniah': 'Zep', 'Haggai': 'Hag', 'Matthew': 'Mat',
    'Mark': 'Mrk', 'Luke': 'Luk', 'John': 'Jhn', 'Acts': 'Act',
    'Romans': 'Rom', '1 Corinthians': '1Co', '2 Corinthians': '2Co', 'Galatians': 'Gal',
    'Ephesians': 'Eph', 'Philippians': 'Php', 'Colossians': 'Col', '1 Thessalonians': '1Th',
    '2 Thessalonians': '2Th', '1 Timothy': '1Ti', '2 Timothy': '2Ti', 'Titus': 'Tit',
    'Philemon': 'Phm', 'Hebrews': 'Heb', 'James': 'Jas', '1 Peter': '1Pe',
    '2 Peter': '2Pe', '1 John': '1Jn', '2 John': '2Jn', '3 John': '3Jn',
    'Jude': 'Jud', 'Revelation': 'Rev'
};

/**
 * 轉換為正確的繁體中文名稱
 * @param {string} name - 英文名、中文名或各種變體
 */
export function toChinese(name) {
    const normalized = normalizeName(name);
    
    // 1. 直接是中文
    if (CHINESE_TO_ENGLISH[normalized]) return normalized;
    
    // [Fix] 轉換為標準英文名稱，處理縮寫或別名 (如 '2pe' -> '2 Peter')
    const standardEnglish = toEnglish(name);
    if (BIBLE_MAPPING[standardEnglish]) return BIBLE_MAPPING[standardEnglish];

    // 2. 查表 (精確比對)
    if (BIBLE_MAPPING[normalized]) return BIBLE_MAPPING[normalized];
    
    // 3. 查表 (不分大小寫比對)
    const lower = normalized.toLowerCase();
    const entry = Object.entries(BIBLE_MAPPING).find(([en]) => en.toLowerCase() === lower);
    if (entry) return entry[1];

    // 4. 對組合書名的特殊補償 (例如 "列王紀上/列王紀下" -> 第一部分已轉換為 "列王紀上")
    return normalized;
}

/**
 * 轉換為標準英文名稱
 * @param {string} name - 中文名或英文名
 */
export function toEnglish(name) {
    const normalized = normalizeName(name);
    
    // 1. 直查中文映射
    if (CHINESE_TO_ENGLISH[normalized]) return CHINESE_TO_ENGLISH[normalized];

    // [V4.5.1] 增加逆向映射：從縮寫 (如 1Co, Zep) 轉為全名 (如 1 Corinthians, Zephaniah)
    const normalizedShort = normalized.replace(/\s+/g, '').toLowerCase();
    const reverseEntry = Object.entries(BIBLE_SHORT_CODES).find(([en, code]) => code.toLowerCase() === normalizedShort);
    if (reverseEntry) return reverseEntry[0]; 

    // [V4.5] 增加別名相容性處理 (常見譯名補償 + Holylight/各平台縮寫變體)
    const ALIASES = {
        // 中文別名
        '拿鴻書': 'Nahum',
        '羅馬人書': 'Romans',
        '賽亞書': 'Isaiah',
        // Holylight 英文縮寫 (與 bibleTranslator 短碼不同的 26 個)
        '1 Chr': '1 Chronicles',  '2 Chr': '2 Chronicles',
        '1 Cor': '1 Corinthians', '2 Cor': '2 Corinthians',
        '1 Kgs': '1 Kings',       '2 Kgs': '2 Kings',
        '1 Pet': '1 Peter',       '2 Pet': '2 Peter',
        '1 Sam': '1 Samuel',      '2 Sam': '2 Samuel',
        '1 Thes': '1 Thessalonians', '2 Thes': '2 Thessalonians',
        '1 Tim': '1 Timothy',     '2 Tim': '2 Timothy',
        'Deut': 'Deuteronomy',    'Eccl': 'Ecclesiastes',
        'Ex': 'Exodus',           'Ezek': 'Ezekiel',
        'Josh': 'Joshua',         'Judg': 'Judges',
        'Matt': 'Matthew',        'Nahum': 'Nahum',
        'Obad': 'Obadiah',        'Phil': 'Philippians',
        'Ps': 'Psalms',           'Titus': 'Titus',
        'Zech': 'Zechariah',      'Zeph': 'Zephaniah',
    };
    if (ALIASES[normalized]) return ALIASES[normalized];
    
    // 2. 已經是正確英文名
    if (BIBLE_MAPPING[normalized]) return normalized;

    // [V4.5.1] 最後保底：不分大小寫查核全名
    const lower = normalized.toLowerCase();
    const enEntry = Object.keys(BIBLE_MAPPING).find(en => en.toLowerCase() === lower);
    if (enEntry) return enEntry;

    return normalized;
}

/**
 * 轉換為資料庫縮寫代碼 (USFM 3-letter)
 * @param {string} name - 中文或全名
 */
export function toShortCode(name) {
    if (!name) return '';
    
    // 1. 先標準化英文名稱 (處理大小寫與縮寫變體)
    const normalized = normalizeName(name).toLowerCase();
    
    // 2. 尋找匹配的英文全名
    const enEntry = Object.entries(BIBLE_SHORT_CODES).find(([en]) => en.toLowerCase() === normalized);
    if (enEntry) return enEntry[1];
    
    // 3. 尋找匹配的中文名
    const zhEnName = toEnglish(name);
    if (BIBLE_SHORT_CODES[zhEnName]) return BIBLE_SHORT_CODES[zhEnName];

    // 4. 如果已經是縮寫形式 (如 1Co, 1CO, 1 CO)，嘗試標準化大小寫
    const searchCode = normalized.replace(/\s+/g, '');
    const shortEntry = Object.values(BIBLE_SHORT_CODES).find(code => code.toLowerCase() === searchCode);
    if (shortEntry) return shortEntry;

    return zhEnName;
}

/**
 * 判斷是否為已知的標準聖經書名
 * @param {string} name 
 * @returns {boolean}
 */
export function isKnownBook(name) {
    if (!name) return false;
    const normalized = name.replace(/_/g, ' ').trim().split('/')[0].trim();
    // 檢查中文或英文映射表
    return !!(CHINESE_TO_ENGLISH[normalized] || BIBLE_MAPPING[normalized] || Object.values(BIBLE_MAPPING).includes(normalized));
}

/**
 * 依聖經正典順序比較書卷（創、出、利、民、申……啟）。
 * 未知名稱排在 66 卷之後，並以繁體中文名稱穩定排序。
 */
export function compareBibleBooks(left, right) {
    const leftBook = toChinese(left);
    const rightBook = toChinese(right);
    const leftIndex = CANONICAL_BOOK_INDEX.get(leftBook) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = CANONICAL_BOOK_INDEX.get(rightBook) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || leftBook.localeCompare(rightBook, 'zh-Hant');
}

export const bibleTranslator = {
    toChinese,
    toEnglish,
    toShortCode,
    isKnownBook,
    compareBooks: compareBibleBooks,
    allBooks: CANONICAL_BOOK_ORDER
};

export default bibleTranslator;
