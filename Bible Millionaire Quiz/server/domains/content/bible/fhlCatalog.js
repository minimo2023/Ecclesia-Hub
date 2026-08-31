/**
 * 信望愛聖經 API 的唯一書卷代碼目錄。
 *
 * qb.php/qsb.php 的 chineses/qstr 參數使用中文縮寫；《希伯來書》
 * 必須使用「來」，使用「希」雖會回傳 success，record 會是空陣列。
 */
const BOOK_ROWS = [
    ['Genesis', '創世記', '創', 50], ['Exodus', '出埃及記', '出', 40],
    ['Leviticus', '利未記', '利', 27], ['Numbers', '民數記', '民', 36],
    ['Deuteronomy', '申命記', '申', 34], ['Joshua', '約書亞記', '書', 24],
    ['Judges', '士師記', '士', 21], ['Ruth', '路得記', '得', 4],
    ['1 Samuel', '撒母耳記上', '撒上', 31], ['2 Samuel', '撒母耳記下', '撒下', 24],
    ['1 Kings', '列王紀上', '王上', 22], ['2 Kings', '列王紀下', '王下', 25],
    ['1 Chronicles', '歷代志上', '代上', 29], ['2 Chronicles', '歷代志下', '代下', 36],
    ['Ezra', '以斯拉記', '拉', 10], ['Nehemiah', '尼希米記', '尼', 13],
    ['Esther', '以斯帖記', '斯', 10], ['Job', '約伯記', '伯', 42],
    ['Psalms', '詩篇', '詩', 150], ['Proverbs', '箴言', '箴', 31],
    ['Ecclesiastes', '傳道書', '傳', 12], ['Song of Solomon', '雅歌', '歌', 8],
    ['Isaiah', '以賽亞書', '賽', 66], ['Jeremiah', '耶利米書', '耶', 52],
    ['Lamentations', '耶利米哀歌', '哀', 5], ['Ezekiel', '以西結書', '結', 48],
    ['Daniel', '但以理書', '但', 12], ['Hosea', '何西阿書', '何', 14],
    ['Joel', '約珥書', '珥', 3], ['Amos', '阿摩司書', '摩', 9],
    ['Obadiah', '俄巴底亞書', '俄', 1], ['Jonah', '約拿書', '拿', 4],
    ['Micah', '彌迦書', '彌', 7], ['Nahum', '那鴻書', '鴻', 3],
    ['Habakkuk', '哈巴谷書', '哈', 3], ['Zephaniah', '西番雅書', '番', 3],
    ['Haggai', '哈該書', '該', 2], ['Zechariah', '撒迦利亞書', '亞', 14],
    ['Malachi', '瑪拉基書', '瑪', 4], ['Matthew', '馬太福音', '太', 28],
    ['Mark', '馬可福音', '可', 16], ['Luke', '路加福音', '路', 24],
    ['John', '約翰福音', '約', 21], ['Acts', '使徒行傳', '徒', 28],
    ['Romans', '羅馬書', '羅', 16], ['1 Corinthians', '哥林多前書', '林前', 16],
    ['2 Corinthians', '哥林多後書', '林後', 13], ['Galatians', '加拉太書', '加', 6],
    ['Ephesians', '以弗所書', '弗', 6], ['Philippians', '腓立比書', '腓', 4],
    ['Colossians', '歌羅西書', '西', 4], ['1 Thessalonians', '帖撒羅尼迦前書', '帖前', 5],
    ['2 Thessalonians', '帖撒羅尼迦後書', '帖後', 3], ['1 Timothy', '提摩太前書', '提前', 6],
    ['2 Timothy', '提摩太後書', '提後', 4], ['Titus', '提多書', '多', 3],
    ['Philemon', '腓利門書', '門', 1], ['Hebrews', '希伯來書', '來', 13],
    ['James', '雅各書', '雅', 5], ['1 Peter', '彼得前書', '彼前', 5],
    ['2 Peter', '彼得後書', '彼後', 3], ['1 John', '約翰一書', '約一', 5],
    ['2 John', '約翰二書', '約二', 1], ['3 John', '約翰三書', '約三', 1],
    ['Jude', '猶大書', '猶', 1], ['Revelation', '啟示錄', '啟', 22]
];

export const FHL_BOOK_CATALOG = Object.freeze(BOOK_ROWS.map(([english, chinese, code, chapters]) =>
    Object.freeze({ english, chinese, code, chapters })
));

export const FHL_BOOKS = Object.freeze(Object.fromEntries(
    FHL_BOOK_CATALOG.map(({ english, code }) => [english, code])
));

export const FHL_BOOK_NAMES = Object.freeze(Object.fromEntries(
    FHL_BOOK_CATALOG.map(({ english, chinese }) => [english, chinese])
));

export const FHL_CHAPTER_COUNTS = Object.freeze(Object.fromEntries(
    FHL_BOOK_CATALOG.map(({ english, chapters }) => [english, chapters])
));

const ALIASES = new Map();
for (const entry of FHL_BOOK_CATALOG) {
    ALIASES.set(entry.english.toLowerCase(), entry);
    ALIASES.set(entry.chinese, entry);
    ALIASES.set(entry.code, entry);
}

export function getFhlBook(input) {
    if (!input) return null;
    return ALIASES.get(String(input).replace(/_/g, ' ').trim().toLowerCase())
        || ALIASES.get(String(input).trim())
        || null;
}

export function getFHLCode(input) {
    return getFhlBook(input)?.code || null;
}

export function getFHLChapterCount(input) {
    return getFhlBook(input)?.chapters || null;
}

export default {
    FHL_BOOK_CATALOG,
    FHL_BOOKS,
    FHL_BOOK_NAMES,
    FHL_CHAPTER_COUNTS,
    getFhlBook,
    getFHLCode,
    getFHLChapterCount
};
