/**
 * 聖經書卷與體裁主權映射 (Bible Genre Sovereignty Mapping)
 * 用於 LogosEngine 的 specialty layer 自動注入分發。
 */

export const BOOK_GENRE_MAP = {
    // 舊約 - 律法與敘事 (Narrative/Law)
    '創世記': 'narrative', 'Genesis': 'narrative',
    '出埃及記': 'narrative', 'Exodus': 'narrative',
    '利未記': 'law', 'Leviticus': 'law',
    '民數記': 'narrative', 'Numbers': 'narrative',
    '申命記': 'law', 'Deuteronomy': 'law',
    '約書亞記': 'narrative', 'Joshua': 'narrative',
    '士師記': 'narrative', 'Judges': 'narrative',
    '路得記': 'narrative', 'Ruth': 'narrative',
    '撒母耳記上': 'narrative', '1 Samuel': 'narrative',
    '撒母耳記下': 'narrative', '2 Samuel': 'narrative',
    '列王紀上': 'narrative', '1 Kings': 'narrative',
    '列王紀下': 'narrative', '2 Kings': 'narrative',
    '歷代志上': 'narrative', '1 Chronicles': 'narrative',
    '歷代志下': 'narrative', '2 Chronicles': 'narrative',
    '以斯拉記': 'narrative', 'Ezra': 'narrative',
    '尼希米記': 'narrative', 'Nehemiah': 'narrative',
    '以斯帖記': 'narrative', 'Esther': 'narrative',

    // 舊約 - 詩歌與智慧 (Poetry/Wisdom)
    '約伯記': 'poetic', 'Job': 'poetic',
    '詩篇': 'poetic', 'Psalms': 'poetic',
    '箴言': 'wisdom', 'Proverbs': 'wisdom',
    '傳道書': 'wisdom', 'Ecclesiastes': 'wisdom',
    '雅歌': 'poetic', 'Song of Songs': 'poetic',

    // 舊寫 - 大/小先知書 (Prophetic)
    '以賽亞書': 'prophetic', 'Isaiah': 'prophetic',
    '耶利米書': 'prophetic', 'Jeremiah': 'prophetic',
    '耶利米哀歌': 'poetic', 'Lamentations': 'poetic',
    '以西結書': 'prophetic', 'Ezekiel': 'prophetic',
    '但以理書': 'prophetic_apocalyptic', 'Daniel': 'prophetic_apocalyptic',
    // ... 其他小先知書略，暫設為 prophetic

    // 新約 - 敘事 (Gospels & Acts)
    '馬太福音': 'narrative', 'Matthew': 'narrative',
    '馬可福音': 'narrative', 'Mark': 'narrative',
    '路加福音': 'narrative', 'Luke': 'narrative',
    '約翰福音': 'narrative', 'John': 'narrative',
    '使徒行傳': 'narrative', 'Acts': 'narrative',

    // 新約 - 書信 (Epistles)
    '羅馬書': 'epistle', 'Romans': 'epistle',
    '哥林多前書': 'epistle', '1 Corinthians': 'epistle',
    '哥林多後書': 'epistle', '2 Corinthians': 'epistle',
    // ... 其他書信略，暫設為 epistle

    // 啟示錄 (Apocalyptic)
    '啟示錄': 'apocalyptic', 'Revelation': 'apocalyptic'
};

/**
 * 根據書名取得體裁類別
 */
export function getGenre(bookName) {
    return BOOK_GENRE_MAP[bookName] || 'narrative'; // 預設為敘事，因為最常見且包含對話
}
