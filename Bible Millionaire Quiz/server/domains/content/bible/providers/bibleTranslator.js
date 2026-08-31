import { bibleTranslator } from '../../../../utils/bibleTranslator.js';

/**
 * Local Proxy - 專為子服務提供的譯本對位代理
 * 避免在 ESM 環境下回溯多級目錄時的解析錯誤
 */
export { bibleTranslator };
export default bibleTranslator;
