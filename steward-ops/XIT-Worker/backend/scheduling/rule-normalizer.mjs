import crypto from 'crypto';
import {
  RULE_SCHEMA_VERSION,
  isValidId,
  validateRule
} from './rule-schema.mjs';

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function deterministicRuleId(rule) {
  const hash = crypto
    .createHash('sha256')
    .update(stableStringify(rule))
    .digest('hex')
    .slice(0, 20);
  return `rule-${hash}`;
}

function buildLookup(items, idFields, nameField = 'name') {
  const byId = new Map();
  const byName = new Map();

  for (const item of items || []) {
    if (!item || typeof item !== 'object') continue;
    const id = idFields.map((field) => item[field]).find(Boolean);
    if (id) byId.set(id, item);
    
    const namesToIndex = [item[nameField], item.nickname, item.displayName].filter(Boolean);
    for (const name of namesToIndex) {
      const matches = byName.get(name) || [];
      if (!matches.includes(item)) {
        matches.push(item);
        byName.set(name, matches);
      }
    }
  }
  return { byId, byName };
}

function normalizerError(code, index, path, message, rawRule) {
  return { code, index, path, message, rawRule };
}

function resolveReference({
  explicitId,
  legacyName,
  lookup,
  idFields,
  kind,
  index,
  path,
  rawRule,
  errors
}) {
  if (explicitId) {
    if (!isValidId(explicitId)) {
      errors.push(normalizerError(
        'INVALID_ID',
        index,
        path,
        `${path} must be an immutable ASCII ID`,
        rawRule
      ));
      return null;
    }
    if (lookup.byId.size > 0 && !lookup.byId.has(explicitId)) {
      errors.push(normalizerError(
        `UNKNOWN_${kind.toUpperCase()}`,
        index,
        path,
        `Unknown ${kind} ID: ${explicitId}`,
        rawRule
      ));
      return null;
    }
    return explicitId;
  }

  if (!legacyName) return undefined;
  const matches = lookup.byName.get(legacyName) || [];
  if (matches.length === 0) {
    errors.push(normalizerError(
      `UNKNOWN_${kind.toUpperCase()}`,
      index,
      path,
      `Cannot resolve ${kind} display name: ${legacyName}`,
      rawRule
    ));
    return null;
  }
  if (matches.length > 1) {
    errors.push(normalizerError(
      `AMBIGUOUS_${kind.toUpperCase()}`,
      index,
      path,
      `Display name maps to multiple ${kind} IDs: ${legacyName}`,
      rawRule
    ));
    return null;
  }

  return idFields.map((field) => matches[0][field]).find(Boolean);
}

function normalizeScope(rawRule) {
  if (rawRule.scope && rawRule.scope !== 'section') return rawRule.scope;
  if (rawRule.originSection) return rawRule.originSection;
  return 'main';
}

function normalizeCreatedAt(rawRule) {
  if (rawRule.createdAt) return rawRule.createdAt;
  if (Number.isFinite(rawRule.timestamp)) {
    const date = new Date(rawRule.timestamp);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function copyDefined(target, source, fields) {
  for (const field of fields) {
    if (source[field] !== undefined) target[field] = structuredClone(source[field]);
  }
}

function resolveEndpoint(endpoint, context) {
  if (!endpoint || typeof endpoint !== 'object') return endpoint;
  const personId = resolveReference({
    explicitId: endpoint.personId,
    legacyName: endpoint.person,
    lookup: context.peopleLookup,
    idFields: ['id', 'personId'],
    kind: 'person',
    index: context.index,
    path: `${context.path}.personId`,
    rawRule: context.rawRule,
    errors: context.errors
  });
  const roleId = resolveReference({
    explicitId: endpoint.roleId,
    legacyName: endpoint.role,
    lookup: context.rolesLookup,
    idFields: ['roleId', 'id'],
    kind: 'role',
    index: context.index,
    path: `${context.path}.roleId`,
    rawRule: context.rawRule,
    errors: context.errors
  });

  return {
    section: endpoint.section || context.defaultSection,
    ...(personId ? { personId } : {}),
    ...(roleId ? { roleId } : {})
  };
}

function hasLegacyShape(rawRule) {
  return rawRule.type === 'fixed'
    || rawRule.person !== undefined
    || rawRule.role !== undefined
    || rawRule.limit !== undefined
    || rawRule.action?.person !== undefined
    || rawRule.condition?.person !== undefined;
}

function normalizeOne(rawRule, index, options, errors) {
  if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
    errors.push(normalizerError(
      'INVALID_RULE',
      index,
      '$',
      'Rule must be an object',
      rawRule
    ));
    return null;
  }

  const peopleLookup = options.peopleLookup;
  const rolesLookup = options.rolesLookup;
  const legacyFixed = rawRule.type === 'fixed';
  const type = legacyFixed ? 'fixed_assignment' : rawRule.type;
  const scope = normalizeScope(rawRule);

  const personId = resolveReference({
    explicitId: rawRule.personId,
    legacyName: rawRule.person,
    lookup: peopleLookup,
    idFields: ['id', 'personId'],
    kind: 'person',
    index,
    path: 'personId',
    rawRule,
    errors
  });
  const roleId = resolveReference({
    explicitId: rawRule.roleId,
    legacyName: rawRule.role,
    lookup: rolesLookup,
    idFields: ['roleId', 'id'],
    kind: 'role',
    index,
    path: 'roleId',
    rawRule,
    errors
  });

  const sourceType = rawRule.sourceType
    || (hasLegacyShape(rawRule) ? 'ai_parsed_memo' : 'manual_structured');
  let status = rawRule.status
    || (sourceType === 'basic' ? 'confirmed' : 'draft_ai');
  if (legacyFixed) status = 'needs_review';

  const normalized = {
    type,
    scope,
    sourceType,
    status,
    schemaVersion: RULE_SCHEMA_VERSION
  };

  if (personId) normalized.personId = personId;
  if (roleId) normalized.roleId = roleId;
  copyDefined(normalized, rawRule, [
    'date',
    'dates',
    'dateRange',
    'priority',
    'weight',
    'reason',
    'sourceMemoId',
    'createdByActorId',
    'confirmedByActorId',
    'confirmedAt'
  ]);

  const createdAt = normalizeCreatedAt(rawRule);
  if (createdAt) normalized.createdAt = createdAt;
  if (!normalized.createdByActorId && rawRule.creator && isValidId(rawRule.creator)) {
    normalized.createdByActorId = rawRule.creator;
  }

  if (type === 'limit') {
    normalized.maxCount = rawRule.maxCount ?? rawRule.limit;
    normalized.period = structuredClone(rawRule.period || rawRule.dateRange);
    delete normalized.dateRange;
  }

  if (type === 'exclusive_person') {
    const rawPersonIds = Array.isArray(rawRule.personIds) ? rawRule.personIds : [];
    const firstPersonId = rawPersonIds[0] || personId;
    const secondPersonId = rawPersonIds[1] || resolveReference({
      explicitId: rawRule.action?.personId,
      legacyName: rawRule.action?.person,
      lookup: peopleLookup,
      idFields: ['id', 'personId'],
      kind: 'person',
      index,
      path: 'personIds[1]',
      rawRule,
      errors
    });
    normalized.personIds = [firstPersonId, secondPersonId].filter(Boolean);
    delete normalized.personId;
  }

  if (type === 'exclusive_role') {
    const rawRoleIds = Array.isArray(rawRule.roleIds) ? rawRule.roleIds : [];
    const legacyRoleNames = Array.isArray(rawRule.roles) ? rawRule.roles : [];
    const references = rawRoleIds.length > 0
      ? rawRoleIds.map((id) => ({ explicitId: id }))
      : legacyRoleNames.map((name) => ({ legacyName: name }));
    if (references.length === 0 && roleId) references.push({ explicitId: roleId });
    normalized.roleIds = references.map((reference, roleIndex) => resolveReference({
      ...reference,
      lookup: rolesLookup,
      idFields: ['roleId', 'id'],
      kind: 'role',
      index,
      path: `roleIds[${roleIndex}]`,
      rawRule,
      errors
    })).filter(Boolean);
    delete normalized.roleId;
  }

  if (type === 'conditional') {
    normalized.condition = resolveEndpoint(rawRule.condition, {
      peopleLookup,
      rolesLookup,
      index,
      rawRule,
      errors,
      path: 'condition',
      defaultSection: rawRule.condition?.section || scope
    });
    normalized.action = resolveEndpoint(rawRule.action, {
      peopleLookup,
      rolesLookup,
      index,
      rawRule,
      errors,
      path: 'action',
      defaultSection: rawRule.action?.section || scope
    });
    delete normalized.personId;
    delete normalized.roleId;
  }

  const explicitRuleId = rawRule.ruleId || rawRule.id;
  normalized.ruleId = explicitRuleId || deterministicRuleId(normalized);
  return normalized;
}

function sortRules(rules) {
  return rules.sort((left, right) => {
    if (left.hard !== right.hard) return left.hard ? -1 : 1;
    if (left.priority !== right.priority) return right.priority - left.priority;
    const leftCreated = left.createdAt || '';
    const rightCreated = right.createdAt || '';
    if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);
    return left.ruleId.localeCompare(right.ruleId);
  });
}

export function normalizeRules(rawRules = [], {
  people = [],
  roles = []
} = {}) {
  if (!Array.isArray(rawRules)) {
    return {
      success: false,
      normalizedRules: [],
      reviewRules: [],
      ignoredRules: [],
      errors: [normalizerError(
        'INVALID_RULE_LIST',
        -1,
        '$',
        'Rules must be an array',
        rawRules
      )]
    };
  }

  const errors = [];
  const normalizedRules = [];
  const reviewRules = [];
  const ignoredRules = [];
  const seenRuleIds = new Set();
  const options = {
    peopleLookup: buildLookup(people, ['id', 'personId']),
    rolesLookup: buildLookup(roles, ['roleId', 'id'])
  };

  rawRules.forEach((rawRule, index) => {
    const errorCountBefore = errors.length;
    const candidate = normalizeOne(rawRule, index, options, errors);
    if (!candidate || errors.length > errorCountBefore) return;

    if (seenRuleIds.has(candidate.ruleId)) {
      errors.push(normalizerError(
        'DUPLICATE_RULE_ID',
        index,
        'ruleId',
        `Duplicate ruleId: ${candidate.ruleId}`,
        rawRule
      ));
      return;
    }
    seenRuleIds.add(candidate.ruleId);

    const storageValidation = validateRule(candidate, { mode: 'storage' });
    if (!storageValidation.valid) {
      for (const validationError of storageValidation.errors) {
        errors.push(normalizerError(
          validationError.code,
          index,
          validationError.path,
          validationError.message,
          rawRule
        ));
      }
      return;
    }

    const storedRule = storageValidation.normalized;
    if (storedRule.status === 'rejected') {
      ignoredRules.push(storedRule);
      return;
    }
    if (storedRule.status !== 'confirmed') {
      reviewRules.push(storedRule);
      errors.push(normalizerError(
        storedRule.status === 'needs_review'
          ? 'RULE_REVIEW_REQUIRED'
          : 'RULE_CONFIRMATION_REQUIRED',
        index,
        'status',
        storedRule.status === 'needs_review'
          ? 'Legacy rule requires explicit review'
          : 'AI parsed rule requires explicit confirmation',
        rawRule
      ));
      return;
    }

    const schedulingValidation = validateRule(storedRule);
    if (!schedulingValidation.valid) {
      for (const validationError of schedulingValidation.errors) {
        errors.push(normalizerError(
          validationError.code,
          index,
          validationError.path,
          validationError.message,
          rawRule
        ));
      }
      return;
    }
    normalizedRules.push(schedulingValidation.normalized);
  });

  return {
    success: errors.length === 0,
    normalizedRules: sortRules(normalizedRules),
    reviewRules: sortRules(reviewRules),
    ignoredRules: sortRules(ignoredRules),
    errors
  };
}
