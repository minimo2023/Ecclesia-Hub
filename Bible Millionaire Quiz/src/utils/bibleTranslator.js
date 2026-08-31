/**
 * Bible Translator Utility (Frontend Port)
 * 核心職責：提供全系統統一的 66 卷書中英映射。
 */

const BIBLE_MAPPING = {
    'Genesis': '創世記', 'Exodus': '出埃及記', 'Leviticus': '利未記',
    'Numbers': '民數記', 'Deuteronomy': '申命記', 'Joshua': '約書亞記',
    'Judges': '士師記', 'Ruth': '路得記', '1 Samuel': '撒母耳記上',
    '2 Samuel': '撒母耳記下', '1 Kings': '利王紀上', '2 Kings': '利王紀下',
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

const CHINESE_TO_ENGLISH = Object.entries(BIBLE_MAPPING).reduce((acc, [en, zh]) => {
    acc[zh] = en;
    return acc;
}, {});

const ABBREVIATION_MAPPING = {
    'gen': 'Genesis', 'exo': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers', 'deu': 'Deuteronomy',
    'jos': 'Joshua', 'jdg': 'Judges', 'rut': 'Ruth', '1sa': '1 Samuel', '2sa': '2 Samuel',
    '1ki': '1 Kings', '2ki': '2 Kings', '1ch': '1 Chronicles', '2ch': '2 Chronicles',
    'ezr': 'Ezra', 'neh': 'Nehemiah', 'est': 'Esther', 'job': 'Job', 'psa': 'Psalms',
    'pro': 'Proverbs', 'ecc': 'Ecclesiastes', 'sng': 'Song of Solomon', 'isa': 'Isaiah',
    'jer': 'Jeremiah', 'lam': 'Lamentations', 'ezk': 'Ezekiel', 'dan': 'Daniel',
    'hos': 'Hosea', 'jol': 'Joel', 'amo': 'Amos', 'oba': 'Obadiah', 'jon': 'Jonah',
    'mic': 'Micah', 'nam': 'Nahum', 'hab': 'Habakkuk', 'zep': 'Zephaniah', 'hag': 'Haggai',
    'zec': 'Zechariah', 'mal': 'Malachi', 'mat': 'Matthew', 'mrk': 'Mark', 'luk': 'Luke',
    'jhn': 'John', 'act': 'Acts', 'rom': 'Romans', '1co': '1 Corinthians', '2co': '2 Corinthians',
    'gal': 'Galatians', 'eph': 'Ephesians', 'php': 'Philippians', 'col': 'Colossians',
    '1th': '1 Thessalonians', '2th': '2 Thessalonians', '1ti': '1 Timothy', '2ti': '2 Timothy',
    'tit': 'Titus', 'phm': 'Philemon', 'heb': 'Hebrews', 'jas': 'James', '1pe': '1 Peter',
    '2pe': '2 Peter', '1jn': '1 John', '2jn': '2 John', '3jn': '3 John', 'jud': 'Jude', 'rev': 'Revelation'
};

function normalizeName(name) {
    if (!name) return '';
    let baseName = name.split('/')[0].trim();
    return baseName.replace(/_/g, ' ').trim();
}

export function toChinese(name) {
    let normalized = normalizeName(name);
    
    // 處理簡寫 (e.g. 'jol' -> 'Joel')
    const lowerName = normalized.toLowerCase();
    if (ABBREVIATION_MAPPING[lowerName]) {
        normalized = ABBREVIATION_MAPPING[lowerName];
    }

    if (CHINESE_TO_ENGLISH[normalized]) return normalized;
    if (BIBLE_MAPPING[normalized]) return BIBLE_MAPPING[normalized];
    const entry = Object.entries(BIBLE_MAPPING).find(([en]) => en.toLowerCase() === normalized.toLowerCase());
    if (entry) return entry[1];
    return normalized;
}

export function toEnglish(name) {
    let normalized = normalizeName(name);

    // 處理簡寫 (e.g. 'jol' -> 'Joel')
    const lowerName = normalized.toLowerCase();
    if (ABBREVIATION_MAPPING[lowerName]) {
        normalized = ABBREVIATION_MAPPING[lowerName];
    }

    if (CHINESE_TO_ENGLISH[normalized]) return CHINESE_TO_ENGLISH[normalized];
    if (BIBLE_MAPPING[normalized]) return normalized;
    return normalized;
}

export const bibleTranslator = {
    toChinese,
    toEnglish,
    allBooks: Object.values(BIBLE_MAPPING)
};

export default bibleTranslator;
