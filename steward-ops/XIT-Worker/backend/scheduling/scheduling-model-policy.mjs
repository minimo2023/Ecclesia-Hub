export const DEFAULT_SCHEDULING_MODEL = 'gemini-3.6-flash';

export const RECOMMENDED_SCHEDULING_MODELS = Object.freeze([
  DEFAULT_SCHEDULING_MODEL,
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite'
]);

export const SCHEDULING_MODEL_SHUTDOWN_DATES = Object.freeze({
  'gemini-3.1-flash-lite': '2027-05-07',
  'gemini-3.1-flash-lite-preview': '2026-05-25',
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
  if (SCHEDULING_MODEL_SHUTDOWN_DATES[modelName]) {
    return SCHEDULING_MODEL_SHUTDOWN_DATES[modelName];
  }
  if (modelName.startsWith('gemini-2.0-flash')) {
    return '2026-06-01';
  }
  return null;
}

export function isSchedulingFlashModel(modelName) {
  const normalizedModel = normalizeModelName(modelName);
  if (!GENERAL_FLASH_MODEL_PATTERN.test(normalizedModel)) return false;

  const version = normalizedModel.match(/^gemini-(\d+(?:\.\d+)*?)-flash/)?.[1];
  return !version || Number(version) >= 2;
}

export function isAllowedSchedulingModel(modelName, { asOf = new Date() } = {}) {
  const normalizedModel = normalizeModelName(modelName);
  if (!isSchedulingFlashModel(normalizedModel)) return false;

  const shutdownDate = getShutdownDate(normalizedModel);
  return !shutdownDate || normalizePolicyDate(asOf) < shutdownDate;
}

export function resolveSchedulingModel(
  requestedModel = process.env.GEMINI_SCHEDULING_MODEL,
  options = {}
) {
  const normalizedModel = normalizeModelName(requestedModel);
  return isAllowedSchedulingModel(normalizedModel, options)
    ? normalizedModel
    : DEFAULT_SCHEDULING_MODEL;
}

export function getSchedulingModelCandidates(
  requestedModel = process.env.GEMINI_SCHEDULING_MODEL,
  options = {}
) {
  const candidates = [
    normalizeModelName(requestedModel),
    ...RECOMMENDED_SCHEDULING_MODELS
  ].filter((modelName) => isAllowedSchedulingModel(modelName, options));

  return [...new Set(candidates)];
}
