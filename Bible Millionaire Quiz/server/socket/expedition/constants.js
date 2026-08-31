// 階段等待時間設定
export const STAGE_WAIT_TIME = {
    1: 90,  // 平安平原
    2: 60,  // 曠野行軍
    3: 30,  // 死蔭幽谷
    4: 10   // 至聖之巔
};

export const ANSWER_COUNTDOWN = 10; // 答題倒數秒數

/**
 * 每個階段的選項總數（1 正解 + N 誤導）
 * V4.1 統一為 4 選項（1 正解 + 3 個已稽核錯項）。
 * 階段難度由等待時間、題目難度與道具規則調整，不再靠臨時增加未稽核錯項。
 */
export const STAGE_OPTION_COUNT = {
    1: 4,
    2: 4,
    3: 4,
    4: 4
};

/** 快速取得指定階段所需的誤導數 */
export function getDistractorCount(stage) {
    return (STAGE_OPTION_COUNT[stage] ?? STAGE_OPTION_COUNT[1]) - 1;
}

/** 快速取得指定階段所需的選項總數 */
export function getOptionCount(stage) {
    return STAGE_OPTION_COUNT[stage] ?? STAGE_OPTION_COUNT[1];
}
