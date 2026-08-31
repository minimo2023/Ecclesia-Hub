export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export const RECOMMENDED_GEMINI_MODELS = Object.freeze([
    DEFAULT_GEMINI_MODEL,
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
]);

// Google 公告的是「最早停用日期」。到達該日期後即不再送出新請求，
// 避免端點在當日關閉時才由使用者遇到 404。
export const FLASH_MODEL_SHUTDOWN_DATES = Object.freeze({
    'gemini-3.1-flash-lite': '2027-05-07',
    'gemini-3.1-flash-lite-preview': '2026-05-25',
    'gemini-2.5-flash': '2026-10-16',
    'gemini-2.5-flash-lite': '2026-10-16',
    'gemini-2.5-flash-lite-preview-09-2025': '2026-03-31',
    'gemini-2.5-flash-preview-05-20': '2025-11-18',
    'gemini-2.5-flash-preview-09-25': '2026-02-17',
    'gemini-2.0-flash': '2026-06-01',
    'gemini-2.0-flash-001': '2026-06-01',
    'gemini-2.0-flash-lite': '2026-06-01',
    'gemini-2.0-flash-lite-001': '2026-06-01',
    'gemini-2.0-flash-lite-preview': '2025-12-09',
    'gemini-2.0-flash-lite-preview-02-05': '2025-12-09'
});

const GENERAL_FLASH_MODEL_PATTERN =
    /^gemini-(?:flash-latest|\d+(?:\.\d+)*-flash(?:-lite)?(?:-(?:(?:preview|exp|latest)(?:-[a-z0-9]+)*|\d{3}))?)$/;

function normalizeModelName(modelName) {
    return typeof modelName === 'string'
        ? modelName.trim().toLowerCase()
        : '';
}

function normalizePolicyDate(asOf = new Date()) {
    if (typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}/.test(asOf)) {
        return asOf.slice(0, 10);
    }
    const parsed = asOf instanceof Date ? asOf : new Date(asOf);
    const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return safeDate.toISOString().slice(0, 10);
}

function getShutdownDate(modelName) {
    if (FLASH_MODEL_SHUTDOWN_DATES[modelName]) {
        return FLASH_MODEL_SHUTDOWN_DATES[modelName];
    }
    // Gemini 2.0 通用 Flash 家族已全數停用，連未知的版本別名也不可放行。
    if (modelName.startsWith('gemini-2.0-flash')) {
        return '2026-06-01';
    }
    return null;
}

export function isGeneralPurposeFlashModel(modelName) {
    const normalizedModel = normalizeModelName(modelName);
    if (!GENERAL_FLASH_MODEL_PATTERN.test(normalizedModel)) return false;

    const version = normalizedModel.match(/^gemini-(\d+(?:\.\d+)*?)-flash/)?.[1];
    if (version && Number(version) < 2) return false;
    return true;
}

export function isAllowedGeminiModel(modelName, { asOf = new Date() } = {}) {
    const normalizedModel = normalizeModelName(modelName);
    if (!isGeneralPurposeFlashModel(normalizedModel)) return false;

    const shutdownDate = getShutdownDate(normalizedModel);
    return !shutdownDate || normalizePolicyDate(asOf) < shutdownDate;
}

export function resolveGeminiModel(modelName, options = {}) {
    const normalizedModel = normalizeModelName(modelName);
    return isAllowedGeminiModel(normalizedModel, options)
        ? normalizedModel
        : DEFAULT_GEMINI_MODEL;
}

export function filterAllowedGeminiModels(modelNames = [], options = {}) {
    const filteredModels = modelNames
        .map(normalizeModelName)
        .filter((modelName) => isAllowedGeminiModel(modelName, options));

    return [...new Set(filteredModels)];
}

export function getRecommendedGeminiModels(options = {}) {
    return filterAllowedGeminiModels(RECOMMENDED_GEMINI_MODELS, options);
}
