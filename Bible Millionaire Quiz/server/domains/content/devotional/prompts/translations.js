/**
 * 靈修譯本選擇模組
 *
 * 設計原則：以資料庫（ContentManager.VERSION_MAP）為唯一真相來源。
 * 此檔案只提供各譯本的「顯示名稱」與「AI 行文指引」的元資料，
 * 實際的可用譯本列表由 ContentManager 的 VERSION_MAP 決定。
 *
 * 擴充方式：當資料庫新增譯本時，只需：
 * 1. 在 ContentManager.VERSION_MAP 中加入對應的版本代碼
 * 2. 在下方 TRANSLATION_METADATA 中補上說明（可選，無則使用預設值）
 */

// ========== 譯本元資料（說明、AI 指引）==========
// key 對應 ContentManager.VERSION_MAP 的鍵（如 'cuv', 'ncv', 'tcv2019'）
export const TRANSLATION_METADATA = {
    'cuv': {
        name: '和合本',
        label: '和合本 (1919)',
        aiInstruction: '請以「和合本」的莊嚴文言語感行文，引用經文時保留其典雅語氣。'
    },
    'unv': {
        name: '和合本',
        label: '和合本 (Union Version)',
        aiInstruction: '請以「和合本」的莊嚴文言語感行文，引用經文時保留其典雅語氣。'
    },
    'ncv': {
        name: '新譯本',
        label: '新譯本 (環球聖經公會)',
        aiInstruction: '請以「新譯本」的忠信現代語感行文，引用經文時保留原文精確性與流暢感。'
    },
    'tcv2019': {
        name: '現代中文譯本',
        label: '現代中文譯本 (2019)',
        aiInstruction: '請以「現代中文譯本」的白話親切語感行文，引用經文時語氣自然、貼近日常生活。'
    },
    'tcv': {
        name: '現代中文譯本',
        label: '現代中文譯本',
        aiInstruction: '請以「現代中文譯本」的白話親切語感行文，引用經文時語氣自然、貼近日常生活。'
    },
    'lcc': {
        name: '呂振中譯本',
        label: '呂振中譯本',
        aiInstruction: '請忠實保留「呂振中譯本」貼近原文結構的語感，不自行改寫經文。'
    },
    'cunp': {
        name: '新標點和合本',
        label: '新標點和合本',
        aiInstruction: '請以「新標點和合本」的流暢語感行文，兼顧傳統語氣與現代閱讀體驗。'
    },
    // 預留：未來可新增更多譯本的元資料
    // 'lzz': { name: '呂振中譯本', label: '呂振中譯本', aiInstruction: '...' },
    // 'nlt_tc': { name: '新漢語譯本', label: '新漢語譯本', aiInstruction: '...' }
};

// 預設元資料（當 VERSION_MAP 中有新版本但 TRANSLATION_METADATA 未收錄時的 fallback）
const DEFAULT_METADATA = {
    name: '聖經',
    label: '聖經',
    aiInstruction: '請以溫柔忠信的語感行文，忠實反映所引用的聖經譯本風格。'
};

/**
 * 根據 ContentManager 的 VERSION_MAP 動態建立可用譯本輪換池
 * 排除重複的 DB 欄位（如 'cuv' 和 'unv' 都映射到 CUV_TRAD，只保留一個）
 *
 * @param {Object} versionMap - ContentManager.VERSION_MAP
 * @returns {Array} 去重後的譯本列表
 */
export function buildTranslationPool(versionMap) {
    const seen = new Set(); // 用於去重 DB 欄位（如 CUV_TRAD）
    const pool = [];

    for (const [code, dbColumn] of Object.entries(versionMap)) {
        // 跳過英文版本（只保留中文）
        if (['web', 'niv'].includes(code)) continue;
        // 跳過已加入的相同 DB 欄位（去重）
        if (seen.has(dbColumn)) continue;

        seen.add(dbColumn);
        const meta = TRANSLATION_METADATA[code] || { ...DEFAULT_METADATA, name: code };
        pool.push({
            id: code,
            dbVersion: code,
            dbColumn,
            ...meta
        });
    }

    return pool;
}

/**
 * 根據日期 Hash 從動態譯本池中選擇當日譯本
 *
 * @param {string} dateKey - 格式 YYYY-MM-DD
 * @param {Object} versionMap - ContentManager.VERSION_MAP
 * @returns {Object} 選定的譯本物件
 */
export function selectTranslation(dateKey, versionMap) {
    const pool = buildTranslationPool(versionMap);
    if (pool.length === 0) {
        // Fallback：資料庫無任何版本時使用和合本
        return { id: 'cuv', dbVersion: 'cuv', name: '和合本', label: '和合本', aiInstruction: '' };
    }
    const dateNum = parseInt(dateKey.replace(/-/g, ''), 10);
    const index = dateNum % pool.length;
    return pool[index];
}

export default {
    TRANSLATION_METADATA,
    buildTranslationPool,
    selectTranslation
};
