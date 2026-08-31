import { getProfilesByStyle } from './authorProfiles.js';

const QUALITY_REQUIREMENTS = `
共同寫作目標：
- 默想正文以 350 至 550 個中文字為建議範圍；若經文需要較短或較長的篇幅，可以自然調整，不為湊字數重複內容。
- 經文觀察、神學理解、福音連結與生活反思要彼此連貫，不採固定段落公式。
- 段落長短自然交錯，避免制式排比、講章大綱、口號、過度感嘆與相同句型反覆出現。
- 只使用候選資料中可證實的經文內容；不補造歷史細節、人物台詞或心理事實。
- 不把信仰簡化成成功保證、道德要求或情緒安慰；人的回應必須建立在上帝先行的恩典上。
- 作者不得聲稱自己的家庭、服事、疾病、創傷、工作或見證；第一人稱只能表達閱讀經文後的領受。
- 不提供醫療、法律、財務或心理治療判斷；遇到相關處境時，只能給一般性的牧養陪伴與尋求合適協助的建議。
`;

const style = (id, name, description, focus) => Object.freeze({
    id,
    name,
    description,
    authors: getProfilesByStyle(id).map(profile => profile.name),
    prompt: `${focus}\n\n${QUALITY_REQUIREMENTS}`
});

export const MEDITATION_STYLES = Object.freeze({
    default: style(
        'default',
        '經典默想',
        '由經文觀察進入神學理解，再連結福音與今日生命。',
        `核心筆法：經典默想
- 從經文中的關鍵詞、動作、對比或上下文開始，不先套生活結論。
- 用親切語言說明經文的原意與上帝的作為，再自然帶向基督與救贖。
- 生活應用保持具體但不命令讀者；結尾回到經文的核心詞或應許。`
    ),
    scenicStart: style(
        'scenicStart',
        '場景鋪陳',
        '由可感知的日常場景自然轉入經文與福音。',
        `核心筆法：場景鋪陳
- 以一個簡短、可普遍理解的生活場景切入，場景只作入口，不超過正文三分之一。
- 使用今日作者卡指定的意象範圍，避免重複近期文章的時段、光線、天氣與起筆句型。
- 從場景中的動作或轉折連回經文，最後讓同一場景帶著新的理解再次出現。`
    ),
    innerDialogue: style(
        'innerDialogue',
        '內在提問',
        '以節制而真誠的問題，引導讀者在恩典中自省。',
        `核心筆法：內在提問
- 從經文揭露的渴望、倚靠、選擇或張力提出少量而準確的問題。
- 問題不可預設讀者有某種經歷，也不可製造羞愧或把反思變成自責。
- 不急著消除疑問；讓問題走向基督的接納、真理與更新，結尾保留一個可帶進禱告的開放問題。`
    ),
    narrativeFlow: style(
        'narrativeFlow',
        '敘事故事',
        '以經文敘事或清楚標示的虛構微型情境承接主題。',
        `核心筆法：敘事故事
- 若使用聖經敘事，只描述經文明載或可合理觀察之事；推想必須節制且不可寫成史實。
- 若使用當代微型情境，須讓讀者知道那是想像情境，不得冒充作者或真人見證。
- 故事只服務一個經文重點，答案來自上帝在經文中的作為；結尾停在一個有回響的動作或畫面。`
    ),
    poeticImagery: style(
        'poeticImagery',
        '意象詩意',
        '以克制的意象與節奏承載清楚的經文真理。',
        `核心筆法：意象詩意
- 每篇以一個主要意象為限，意象必須受到經文支持並服務神學內容。
- 允許長短句與留白，但語意、因果與福音連結仍須清楚，不用漂亮句子遮掩空泛內容。
- 收尾留在一個能回應經文的畫面，不另加口號或說教。`
    ),
    gentleCompanion: style(
        'gentleCompanion',
        '溫柔陪伴',
        '尊重讀者處境與界線，以恩典陪伴一個可行回應。',
        `核心筆法：溫柔陪伴
- 承認讀者處境可能各不相同，不替讀者命名創傷、診斷狀態或保證結果。
- 語氣接納但不稀釋真理；指出基督如何親近、承擔與更新，而非只提供情緒安慰。
- 應用採不施壓的邀請，收尾可提出一個安全、微小而具體的下一步。`
    ),
    contemplativeStillness: style(
        'contemplativeStillness',
        '安靜留白',
        '刪去多餘修飾，以少量精準文字形成安靜的經文空間。',
        `核心筆法：安靜留白
- 抓住經文的一句話、一個動詞或一個主意象，保持內容精準而不是含糊。
- 段落可以短，但神學脈絡與基督的恩典不可省略；安靜不等於空泛或神祕化。
- 收尾用一至兩行停在經文支持的畫面中，不追加訓誡，也不宣稱困境已立即消失。`
    )
});

export function selectStyle(dateKey) {
    const styles = Object.values(MEDITATION_STYLES);
    const dateHash = dateKey.split('-').reduce((sum, part) => sum + Number.parseInt(part, 10), 0);
    return styles[dateHash % styles.length];
}

export function getStyleById(styleId) {
    return MEDITATION_STYLES[styleId] || null;
}

export function getAvailableStyles() {
    return Object.values(MEDITATION_STYLES).map(({ id, name, description }) => ({ id, name, description }));
}

export const FESTIVAL_GUIDANCE = Object.freeze({
    新年: '聚焦上帝更新、引導與信實；避免把信仰寫成年度成功計畫。',
    聖誕節: '聚焦道成肉身、基督降卑與上帝親近人；避免只描寫節慶氣氛。',
    平安夜: '聚焦等待、盼望與基督降生；避免浪漫化孤獨或家庭處境。',
    復活節: '聚焦基督復活、死亡權勢被勝過與新生命；不跳過十字架。',
    受難日: '聚焦基督受苦、代贖與恩典；語氣莊重，不操弄罪疚。',
    感恩節: '聚焦上帝的恩典與群體分享；不把富足視為信心的必然結果。'
});

export function getFestivalGuidance(holidayName) {
    return FESTIVAL_GUIDANCE[holidayName] || null;
}

export function getAuthorForStyle(styleId, dateKey) {
    const profiles = getProfilesByStyle(styleId);
    const fallback = getProfilesByStyle('default');
    const authors = profiles.length > 0 ? profiles : fallback;
    const dateHash = dateKey.split('-').reduce((sum, part) => sum + Number.parseInt(part, 10), 0);
    return authors[dateHash % authors.length].name;
}

export async function getAuthorForStyleAsync(styleId, dateKey) {
    try {
        const { dbOps } = await import('../../../../database/index.js');
        const dbAuthors = await dbOps.getAuthorsForStyle?.(styleId);
        if (Array.isArray(dbAuthors) && dbAuthors.length > 0) {
            const dateHash = dateKey.split('-').reduce((sum, part) => sum + Number.parseInt(part, 10), 0);
            return dbAuthors[dateHash % dbAuthors.length].name;
        }
    } catch {
        // 保留舊路徑的本機作者卡 fallback。
    }
    return getAuthorForStyle(styleId, dateKey);
}

export default {
    MEDITATION_STYLES,
    FESTIVAL_GUIDANCE,
    selectStyle,
    getStyleById,
    getAvailableStyles,
    getAuthorForStyle,
    getAuthorForStyleAsync,
    getFestivalGuidance
};
