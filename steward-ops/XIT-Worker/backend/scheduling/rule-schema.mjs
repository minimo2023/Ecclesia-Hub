export const RULE_SCHEMA_VERSION = 1;

export const RULE_TYPES = Object.freeze([
  'unavailable',
  'available',
  'preferred',
  'fixed_assignment',
  'only_available',
  'limit',
  'exclusive_role',
  'exclusive_person',
  'conditional',
  'force_role',
  'allow_consecutive'
]);

const RULE_TYPE_SET = new Set(RULE_TYPES);
const HARD_RULE_TYPES = new Set([
  'unavailable',
  'fixed_assignment',
  'only_available',
  'limit',
  'exclusive_role',
  'exclusive_person',
  'conditional',
  'force_role'
]);
const SOURCE_TYPES = new Set(['basic', 'manual_structured', 'ai_parsed_memo']);
const RULE_STATUSES = new Set(['draft_ai', 'confirmed', 'rejected', 'needs_review']);
const SCOPES = new Set(['main', 'children', 'global']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const ALLOWED_FIELDS = new Set([
  'ruleId',
  'type',
  'hard',
  'scope',
  'personId',
  'roleId',
  'personIds',
  'roleIds',
  'date',
  'dates',
  'dateRange',
  'maxCount',
  'period',
  'priority',
  'weight',
  'reason',
  'sourceMemoId',
  'sourceType',
  'createdByActorId',
  'createdAt',
  'confirmedByActorId',
  'confirmedAt',
  'status',
  'schemaVersion',
  'condition',
  'action'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function makeError(code, path, message) {
  return { code, path, message };
}

function validateId(value, path, errors, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) errors.push(makeError('REQUIRED_FIELD', path, `${path} is required`));
    return;
  }
  if (!isValidId(value)) {
    errors.push(makeError('INVALID_ID', path, `${path} must be an immutable ASCII ID`));
  }
}

function validateDate(value, path, errors, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) errors.push(makeError('REQUIRED_FIELD', path, `${path} is required`));
    return;
  }
  if (!isValidCalendarDate(value)) {
    errors.push(makeError('INVALID_DATE', path, `${path} must be a real YYYY-MM-DD date`));
  }
}

function validateDateRange(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) {
    errors.push(makeError('INVALID_DATE_RANGE', path, `${path} must be an object`));
    return;
  }

  validateDate(value.start, `${path}.start`, errors, { required: true });
  validateDate(value.end, `${path}.end`, errors, { required: true });
  if (isValidCalendarDate(value.start)
    && isValidCalendarDate(value.end)
    && value.start > value.end) {
    errors.push(makeError(
      'INVALID_DATE_RANGE',
      path,
      `${path}.start must not be after ${path}.end`
    ));
  }
}

function validateDates(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(makeError('INVALID_DATES', path, `${path} must be a non-empty array`));
    return;
  }
  value.forEach((date, index) => validateDate(date, `${path}[${index}]`, errors, {
    required: true
  }));
}

function hasTemporalSelector(rule) {
  return Boolean(
    rule.date
    || (Array.isArray(rule.dates) && rule.dates.length > 0)
    || rule.dateRange
  );
}

function validatePeriod(value, errors) {
  if (typeof value === 'string') {
    if (!MONTH_PATTERN.test(value)) {
      errors.push(makeError(
        'INVALID_PERIOD',
        'period',
        'period string must use YYYY-MM'
      ));
    }
    return;
  }

  if (!isPlainObject(value)) {
    errors.push(makeError(
      'INVALID_PERIOD',
      'period',
      'period must be YYYY-MM or a { start, end } date range'
    ));
    return;
  }
  validateDateRange(value, 'period', errors);
}

function validateIdArray(value, path, errors, {
  exactLength,
  minimumLength = 1
} = {}) {
  if (!Array.isArray(value)
    || value.length < minimumLength
    || (exactLength !== undefined && value.length !== exactLength)) {
    errors.push(makeError(
      path === 'personIds' ? 'INVALID_PERSON_IDS' : 'INVALID_ROLE_IDS',
      path,
      exactLength !== undefined
        ? `${path} must contain exactly ${exactLength} IDs`
        : `${path} must contain at least ${minimumLength} IDs`
    ));
    return;
  }

  value.forEach((id, index) => validateId(id, `${path}[${index}]`, errors, {
    required: true
  }));
  if (new Set(value).size !== value.length) {
    errors.push(makeError(
      path === 'personIds' ? 'INVALID_PERSON_IDS' : 'INVALID_ROLE_IDS',
      path,
      `${path} must not contain duplicate IDs`
    ));
  }
}

function validateConditionalEndpoint(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(makeError('INVALID_CONDITIONAL_ENDPOINT', path, `${path} must be an object`));
    return;
  }

  validateId(value.personId, `${path}.personId`, errors, { required: true });
  validateId(value.roleId, `${path}.roleId`, errors, { required: true });
  if (!SCOPES.has(value.section)) {
    errors.push(makeError(
      'INVALID_SCOPE',
      `${path}.section`,
      `${path}.section must be main or children`
    ));
  }
  for (const key of Object.keys(value)) {
    if (!['section', 'personId', 'roleId'].includes(key)) {
      errors.push(makeError(
        'UNKNOWN_FIELD',
        `${path}.${key}`,
        `Unknown conditional endpoint field: ${key}`
      ));
    }
  }
}

function normalizeRule(rule, hard) {
  const normalized = structuredClone(rule);
  normalized.hard = hard;
  normalized.priority = Number.isInteger(rule.priority)
    ? rule.priority
    : hard
      ? 100
      : rule.type === 'preferred'
        ? 20
        : rule.type === 'available'
          ? 10
          : 0;

  if (rule.weight === undefined && rule.type === 'preferred') normalized.weight = 2;
  if (rule.weight === undefined && rule.type === 'available') normalized.weight = 1;
  if (Array.isArray(normalized.dates)) {
    normalized.dates = [...new Set(normalized.dates)].sort();
  }

  for (const key of Object.keys(normalized)) {
    if (normalized[key] === undefined) delete normalized[key];
  }
  return normalized;
}

export function validateRule(rule, { mode = 'scheduling' } = {}) {
  const errors = [];
  if (!isPlainObject(rule)) {
    const error = makeError('INVALID_RULE', '$', 'Rule must be an object');
    return { valid: false, error: error.message, errors: [error] };
  }

  for (const key of Object.keys(rule)) {
    if (!ALLOWED_FIELDS.has(key)) {
      errors.push(makeError('UNKNOWN_FIELD', key, `Unknown rule field: ${key}`));
    }
  }

  if (!RULE_TYPE_SET.has(rule.type)) {
    errors.push(makeError(
      'UNKNOWN_RULE_TYPE',
      'type',
      `Unknown rule type: ${String(rule.type)}`
    ));
  }

  validateId(rule.ruleId, 'ruleId', errors, { required: true });
  if (!SCOPES.has(rule.scope)) {
    errors.push(makeError('INVALID_SCOPE', 'scope', 'scope must be main, children, or global'));
  }
  if (!SOURCE_TYPES.has(rule.sourceType)) {
    errors.push(makeError('INVALID_SOURCE_TYPE', 'sourceType', 'sourceType is invalid'));
  }
  if (!RULE_STATUSES.has(rule.status)) {
    errors.push(makeError('INVALID_RULE_STATUS', 'status', 'status is invalid'));
  }
  if (rule.schemaVersion !== RULE_SCHEMA_VERSION) {
    errors.push(makeError(
      'UNSUPPORTED_SCHEMA_VERSION',
      'schemaVersion',
      `schemaVersion must be ${RULE_SCHEMA_VERSION}`
    ));
  }
  if (mode === 'scheduling' && rule.status !== 'confirmed') {
    errors.push(makeError(
      'RULE_CONFIRMATION_REQUIRED',
      'status',
      'Only confirmed rules may participate in scheduling'
    ));
  }

  validateId(rule.personId, 'personId', errors);
  validateId(rule.roleId, 'roleId', errors);
  validateDate(rule.date, 'date', errors);
  validateDates(rule.dates, 'dates', errors);
  validateDateRange(rule.dateRange, 'dateRange', errors);
  if (rule.sourceMemoId !== undefined) {
    validateId(rule.sourceMemoId, 'sourceMemoId', errors);
  }
  if (rule.createdByActorId !== undefined) {
    validateId(rule.createdByActorId, 'createdByActorId', errors);
  }
  if (rule.confirmedByActorId !== undefined) {
    validateId(rule.confirmedByActorId, 'confirmedByActorId', errors);
  }
  if (rule.priority !== undefined
    && (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1000)) {
    errors.push(makeError(
      'INVALID_PRIORITY',
      'priority',
      'priority must be an integer from 0 to 1000'
    ));
  }
  if (rule.weight !== undefined
    && (typeof rule.weight !== 'number' || !Number.isFinite(rule.weight) || rule.weight < 0)) {
    errors.push(makeError('INVALID_WEIGHT', 'weight', 'weight must be a non-negative number'));
  }

  if (RULE_TYPE_SET.has(rule.type)) {
    switch (rule.type) {
      case 'unavailable':
      case 'available':
      case 'preferred':
        validateId(rule.personId, 'personId', errors, { required: true });
        if (!hasTemporalSelector(rule)) {
          errors.push(makeError(
            'REQUIRED_TEMPORAL_SELECTOR',
            'date',
            `${rule.type} requires date, dates, or dateRange`
          ));
        }
        break;
      case 'fixed_assignment':
        validateId(rule.personId, 'personId', errors, { required: true });
        validateDate(rule.date, 'date', errors, { required: true });
        validateId(rule.roleId, 'roleId', errors, { required: true });
        break;
      case 'only_available':
        validateId(rule.personId, 'personId', errors, { required: true });
        if (!hasTemporalSelector(rule)) {
          errors.push(makeError(
            'REQUIRED_TEMPORAL_SELECTOR',
            'dates',
            'only_available requires date, dates, or dateRange'
          ));
        }
        break;
      case 'limit':
        validateId(rule.personId, 'personId', errors, { required: true });
        if (!Number.isInteger(rule.maxCount) || rule.maxCount < 0) {
          errors.push(makeError(
            'INVALID_MAX_COUNT',
            'maxCount',
            'maxCount must be a non-negative integer'
          ));
        }
        validatePeriod(rule.period, errors);
        break;
      case 'exclusive_role':
        validateIdArray(rule.roleIds, 'roleIds', errors, { minimumLength: 2 });
        break;
      case 'exclusive_person':
        validateIdArray(rule.personIds, 'personIds', errors, {
          exactLength: 2,
          minimumLength: 2
        });
        break;
      case 'conditional':
        validateConditionalEndpoint(rule.condition, 'condition', errors);
        validateConditionalEndpoint(rule.action, 'action', errors);
        break;
      case 'force_role':
        validateDate(rule.date, 'date', errors, { required: true });
        validateId(rule.roleId, 'roleId', errors, { required: true });
        break;
      case 'allow_consecutive':
        if (!rule.personId && !rule.roleId) {
          errors.push(makeError(
            'REQUIRED_FIELD',
            'personId',
            'allow_consecutive requires personId or roleId'
          ));
        }
        break;
      default:
        break;
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: errors[0].message,
      errors
    };
  }

  return {
    valid: true,
    normalized: normalizeRule(rule, HARD_RULE_TYPES.has(rule.type)),
    errors: []
  };
}
