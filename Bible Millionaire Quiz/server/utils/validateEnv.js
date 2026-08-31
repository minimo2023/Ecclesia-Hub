/**
 * validateEnv.js - 環境變數驗證
 * 啟動時檢查必要的環境變數是否已設定
 */

const requiredInProduction = [
    'JWT_SECRET',
    'ANSWER_TOKEN_SECRET',
    'ADMIN_PASSWORD'
];

const requiredAlways = [
    // [UNIFIED] GEMINI_API_KEY(S) 將在 validateEnv 邏輯中手動檢查
];

const optional = [
    'PORT',
    'NODE_ENV'
];

export function validateEnv() {
    const isProduction = process.env.NODE_ENV === 'production';
    const missing = [];
    const warnings = [];

    // 檢查必要變數
    for (const key of requiredAlways) {
        if (!process.env[key]) {
            warnings.push(key);
        }
    }

    // [UNIFIED] AI 金鑰池檢查
    const hasGeminiKey = [
        process.env.GEMINI_PAID_KEYS,
        process.env.GEMINI_FREE_KEYS,
        process.env.GEMINI_API_KEYS,
        process.env.GEMINI_API_KEY
    ].some(value => String(value || '').split(',').some(key => key.trim()));
    if (!hasGeminiKey) {
        warnings.push('GEMINI_PAID_KEYS 或 GEMINI_FREE_KEYS');
    }

    // 生產環境額外檢查
    if (isProduction) {
        for (const key of requiredInProduction) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }
    }

    // 輸出警告
    if (warnings.length > 0) {
        console.warn(`⚠️ 缺少環境變數（可能影響功能）: ${warnings.join(', ')}`);
    }

    // 生產環境缺少必要變數則終止
    if (missing.length > 0) {
        console.error(`❌ 生產環境缺少必要環境變數: ${missing.join(', ')}`);
        console.error('請在 .env 檔案中設定這些變數');
        process.exit(1);
    }

    // 顯示載入狀態
    console.log('✅ 環境變數檢查通過');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    const keyStatus = hasGeminiKey ? '已設定' : '未設定';
    console.log(`   GEMINI_API_SERVICE: ${keyStatus} (支援多金鑰輪換)`);
    if (isProduction) {
        console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '已設定' : '未設定'}`);
        console.log(`   ANSWER_TOKEN_SECRET: ${process.env.ANSWER_TOKEN_SECRET ? '已設定' : '未設定'}`);
        console.log(`   ADMIN_PASSWORD: ${process.env.ADMIN_PASSWORD ? '已設定' : '未設定'}`);
    }
}

export default validateEnv;
