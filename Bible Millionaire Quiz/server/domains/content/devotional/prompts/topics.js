/**
 * 靈修主題與經文範圍輪替模組
 *
 * 為了解決 AI 生成內容重複的問題，我們引入「每日主題輪替」機制。
 * 根據日期決定當天應聚焦的聖經範圍或主題類別。
 */

const TOPIC_CYCLES = [
    {
        id: 'gospels',
        name: '福音書與耶穌生平',
        description: '聚焦於耶穌的教導、神蹟與生平事蹟',
        focus: ['馬太福音', '馬可福音', '路加福音', '約翰福音']
    },
    {
        id: 'wisdom',
        name: '詩篇與智慧文學',
        description: '從詩篇、箴言、傳道書獲取屬靈智慧與安慰',
        focus: ['詩篇', '箴言', '傳道書', '雅歌', '約伯記']
    },
    {
        id: 'epistles',
        name: '使徒書信與教會建造',
        description: '保羅與其他使徒的書信，關於生命建造與真理',
        focus: ['羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前後書', '提摩太前後書', '提多書', '腓利門書', '希伯來書', '雅各書', '彼得前後書', '約翰一二三書', '猶大書']
    },
    {
        id: 'ot_history',
        name: '舊約歷史與上帝作為',
        description: '從創世記到以斯帖記，看見上帝在歷史中的帶領',
        focus: ['創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記', '撒母耳記上下', '列王紀上下', '歷代志上下', '以斯拉記', '尼希米記', '以斯帖記']
    },
    {
        id: 'prophets',
        name: '先知書與上帝的心意',
        description: '大先知書與小先知書，聆聽上帝對時代的呼喚',
        focus: ['以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書']
    },
    {
        id: 'general',
        name: '綜合領受',
        description: '不限範圍，由聖靈引導的自由主題',
        focus: ['全本聖經']
    }
];

/**
 * 獲取今日的主題焦點
 * @param {string} dateKey - YYYY-MM-DD
 */
export function getDailyTopic(dateKey) {
    const dateHash = dateKey.split('-').reduce((acc, num) => acc + parseInt(num), 0);
    // 使用 hash 確保同一天拿到同一個主題，但每天會變
    // 為了避免與 Style 同步 (mod 7)，這裡使用 mod 6 (TOPIC_CYCLES.length)
    // 加上 dateHash 的變形 (例如乘數) 讓偏移量更不規律
    // Modulo 6 (TOPIC_CYCLES.length).
    // Using 11 (coprime to 6) ensures we hit all indices 0-5 over time.
    const index = (dateHash * 11 + 7) % TOPIC_CYCLES.length;
    return TOPIC_CYCLES[index];
}

export default {
    TOPIC_CYCLES,
    getDailyTopic
};
