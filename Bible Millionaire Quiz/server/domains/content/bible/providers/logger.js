/**
 * Local Logger - 專為子服務路徑對位提供的在地副本
 */
export const logger = {
    info: (msg, meta) => console.log(`[SUB-INFO] 🚀 ${msg}`, meta || ''),
    error: (msg, meta) => console.error(`[SUB-ERROR] ❌ ${msg}`, meta || ''),
    warn: (msg, meta) => console.warn(`[SUB-WARN] ⚠️ ${msg}`, meta || '')
};

export default logger;
