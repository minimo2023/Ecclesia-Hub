/**
 * 靈修 Prompt 模組索引
 *
 * 統一匯出所有靈修相關的 prompt 模組
 */

export { SYSTEM_INSTRUCTION, BIBLE_BOOKS } from './core.js';
export { MEDITATION_STYLES, selectStyle, getAvailableStyles, getAuthorForStyle } from './styles.js';
export { formatForMobileReading, setFormatterEnabled, isEnabled as isFormatterEnabled } from './formatter.js';

// 預設匯出為方便使用
import coreModule from './core.js';
import stylesModule from './styles.js';
import formatterModule from './formatter.js';

export default {
    ...coreModule,
    ...stylesModule,
    ...formatterModule
};
