/**
 * Logos 靈修資產庫 (Devotional Assets v1.0)
 *
 * 此模組匯集了靈修生成所需的所有數據、筆法風格以及譯本元數據。
 */

// 🎨 [Style Registry] 筆法風格與核心 Persona
export const MEDITATION_STYLES = {
    default: {
        id: 'default',
        name: '經典默想型',
        authors: ['林以恩', '陳恩典', '何信望'],
        prompt: `【筆法：經典默想型】... (略，動態裝載於 LogosEngine)`
    },
    scenicStart: {
        id: 'scenicStart',
        name: '場景鋪陳型',
        authors: ['陳雨晴', '張曉晶', '劉春雨'],
        prompt: `【筆法：場景鋪陳型】...`
    },
    innerDialogue: {
        id: 'innerDialogue',
        name: '內在提問型',
        authors: ['柯靜心', '黃念慧', '周思畢'],
        prompt: `【筆法：內在提問型】...`
    },
    narrativeFlow: {
        id: 'narrativeFlow',
        name: '敘事故事型',
        authors: ['葛書亞', '方曉薇', '李敘文'],
        prompt: `【筆法：敘事故事型】...`
    },
    poeticImagery: {
        id: 'poeticImagery',
        name: '意象詩意型',
        authors: ['蘇映荷', '謝詩婷', '王詠嵐'],
        prompt: `【筆法：意象詩意型】...`
    },
    gentleCompanion: {
        id: 'gentleCompanion',
        name: '溫柔專伴型',
        authors: ['潘安琪', '吳暖心', '陳同行'],
        prompt: `【筆法：溫柔專伴型】...`
    },
    contemplativeStillness: {
        id: 'contemplativeStillness',
        name: '安靜留白型',
        authors: ['白默然', '何寂光', '王靜安'],
        prompt: `【筆法：安靜留白型】...`
    }
};

// 📅 [Topic Lifecycle] 每日主題輪替 (6 天循環)
export const TOPIC_CYCLES = [
    { id: 'gospels', name: '福音書與耶穌生平', focus: ['馬太福音', '馬可福音', '路加福音', '約翰福音'] },
    { id: 'wisdom', name: '詩篇與智慧文學', focus: ['詩篇', '箴言', '傳道書', '雅歌', '約伯記'] },
    { id: 'epistles', name: '使徒書信與教會建造', focus: ['羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前後書', '提摩太前後書', '提多書', '腓利門書', '希伯來書', '雅各書', '彼得前後書', '約翰一二三書', '猶大書'] },
    { id: 'ot_history', name: '舊約歷史與上帝作為', focus: ['創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記', '撒母耳記上下', '列王紀上下', '歷代志上下', '以斯拉記', '尼希米記', '以斯帖記'] },
    { id: 'prophets', name: '先知書與上帝的心意', focus: ['以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書'] },
    { id: 'general', name: '綜合領受', focus: ['全本聖經'] }
];

// 📖 [Translation Metadata] 譯本 AI 指引 (輔助 LogosEngine)
export const TRANSLATION_METADATA = {
    'cuv': { name: '和合本', aiInstruction: '請以「和合本」的莊嚴文言語感行文。' },
    'ncv': { name: '新譯本', aiInstruction: '請以「新譯本」的忠信現代語感行文。' },
    'tcv2019': { name: '現代中文譯本2019', aiInstruction: '請以「現代中文譯本」的白話親切語感行文。' },
    'cunp': { name: '新標點和合本', aiInstruction: '請以「新標點和合本」的流暢語感行文。' }
};

// 🎄 [Festival Guidance] 節期指示
export const FESTIVAL_GUIDANCE = {
    '聖誕節': '主題：道成肉身的愛與盼望。強調：神主動來到我們中間。',
    '復活節': '主題：基督復活，勝過死亡。強調：從絕望到盼望。'
};

/**
 * [Select Logic] 基於日期的 Hash 選擇器
 */
export function selectFromAssets(dateKey, assets, mod) {
    const dateHash = dateKey.split('-').reduce((acc, num) => acc + parseInt(num), 0);
    const pool = Array.isArray(assets) ? assets : Object.values(assets);
    return pool[dateHash % pool.length];
}

export default {
    MEDITATION_STYLES,
    TOPIC_CYCLES,
    TRANSLATION_METADATA,
    FESTIVAL_GUIDANCE,
    selectFromAssets
};
