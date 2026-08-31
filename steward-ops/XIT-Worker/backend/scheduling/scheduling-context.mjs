import crypto from 'crypto';
import { normalizeRules } from './rule-normalizer.mjs';
import { RULE_SCHEMA_VERSION } from './rule-schema.mjs';
import {
  cellKey,
  isRuleActiveForDate
} from './rule-utils.mjs';

export const ROLE_DEFINITIONS = Object.freeze([
  { roleId: 'main-speaker', name: '講員', section: 'main' },
  { roleId: 'main-leader', name: '領會', section: 'main' },
  { roleId: 'main-piano', name: '司琴', section: 'main' },
  { roleId: 'main-vocals', name: '配唱', section: 'main' },
  { roleId: 'main-video-control', name: '影音控制', section: 'main' },
  { roleId: 'main-video-playback', name: '影音播放', section: 'main' },
  { roleId: 'main-floor-1-host', name: '1F招待', section: 'main' },
  { roleId: 'main-floor-6-host', name: '6F招待', section: 'main' },
  { roleId: 'main-communion', name: '餅杯服事', section: 'main' },
  { roleId: 'children-worship', name: '兒主敬拜', section: 'children' },
  { roleId: 'children-piano', name: '兒主司琴', section: 'children' },
  { roleId: 'children-middle-young', name: '兒主中小', section: 'children' },
  { roleId: 'children-senior', name: '兒主大班', section: 'children' }
]);

const roleById = new Map(ROLE_DEFINITIONS.map((role) => [role.roleId, role]));
const roleByName = new Map(ROLE_DEFINITIONS.map((role) => [role.name, role]));
const roleAliases = new Map([
  ['外請講員', 'main-speaker']
]);

export class SchedulingContextError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SchedulingContextError';
    this.code = code;
    this.details = details;
  }
}

const stableId = (prefix, value) => `${prefix}-${crypto
  .createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex')
  .slice(0, 20)}`;

function resolveRole(value) {
  return roleById.get(value)
    || roleByName.get(value)
    || roleById.get(roleAliases.get(value))
    || null;
}

function parseRawCellKey(rawKey) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:__|\|)(.+)$/.exec(rawKey || '');
  if (!match) return null;
  const role = resolveRole(match[2]);
  return role ? { date: match[1], role, key: cellKey(match[1], role.roleId) } : null;
}

function buildPeople(rawPeople) {
  const byId = new Map();
  const byName = new Map();
  const canonical = [];
  for (const person of rawPeople || []) {
    if (!person?.id || !person?.name) continue;
    if (byName.has(person.name)) {
      throw new SchedulingContextError(
        'AMBIGUOUS_PERSON',
        `人員姓名重複，無法安全轉換：${person.name}`
      );
    }
    const roleIds = (person.roleIds || person.categories || [])
      .map((value) => resolveRole(value)?.roleId)
      .filter(Boolean);
    const normalized = {
      id: person.id,
      name: person.name,
      roleIds: [...new Set(roleIds)].sort()
    };
    canonical.push(normalized);
    byId.set(normalized.id, normalized);
    byName.set(normalized.name, normalized);
  }
  return { canonical, byId, byName };
}

function resolvePersonId(value, people) {
  if (!value) return null;
  return people.byId.get(value)?.id || people.byName.get(value)?.id || null;
}

function parseChineseCount(text) {
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (!text) return null;
  if (text === '十') return 10;
  if (text.includes('十')) {
    const [tens, units] = text.split('十');
    return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
  }
  return digits[text] ?? null;
}

function resolveLimitMaxCount(rawRule) {
  const direct = [
    rawRule.maxCount,
    rawRule.limit,
    rawRule.value,
    rawRule.maxTimes
  ].find((value) => value !== undefined && value !== null && value !== '');
  const numeric = Number(direct);
  if (Number.isInteger(numeric) && numeric >= 0) return numeric;

  const text = [
    rawRule.reason,
    rawRule.text,
    rawRule.message
  ].filter(Boolean).join(' ');
  const arabicMatch = text.match(/(\d+)\s*(?:次|回)/);
  if (arabicMatch) return Number(arabicMatch[1]);
  const chineseMatch = text.match(/([零一二兩三四五六七八九十]+)\s*(?:次|回)/);
  return parseChineseCount(chineseMatch?.[1]);
}

function ruleBase(rawRule, type, suffix = '') {
  return {
    ruleId: rawRule.ruleId
      || rawRule.id
      || stableId('runtime-rule', [rawRule, type, suffix]),
    type,
    scope: rawRule.scope === 'global' || rawRule.scope === 'children'
      ? rawRule.scope
      : 'main',
    sourceType: 'manual_structured',
    status: 'confirmed',
    schemaVersion: RULE_SCHEMA_VERSION,
    reason: rawRule.reason || 'legacy-compatible-runtime-rule'
  };
}

function normalizeRuntimeRules(rawRules, people, targetDates) {
  const canonical = [];
  const warnings = [];
  const availabilityGroups = new Map();

  const addAvailabilityDate = (rawRule, type) => {
    const personId = resolvePersonId(rawRule.personId || rawRule.person, people);
    const role = resolveRole(rawRule.roleId || rawRule.role);
    if (!personId) {
      warnings.push({
        code: 'UNKNOWN_RULE_PERSON',
        person: rawRule.person || rawRule.personId || '未指定',
        message: `規則人員無法對應：${rawRule.person || rawRule.personId || '未指定'}`
      });
      return;
    }
    const key = JSON.stringify([
      type,
      personId,
      role?.roleId || null,
      rawRule.scope || 'main',
      rawRule.timestamp || rawRule.sourceMemoId || ''
    ]);
    const group = availabilityGroups.get(key) || {
      rawRule,
      type,
      personId,
      roleId: role?.roleId,
      dates: new Set()
    };
    for (const date of targetDates) {
      if (isRuleActiveForDate(rawRule, date)) group.dates.add(date);
    }
    availabilityGroups.set(key, group);
  };

  for (const rawRule of rawRules || []) {
    if (!rawRule?.type) continue;
    const rawType = rawRule.type;
    if (rawType === 'fixed'
      && /可排|可以排|可服事|可安排/.test(rawRule.reason || '')) {
      addAvailabilityDate(rawRule, 'only_available');
      warnings.push({
        code: 'LEGACY_FIXED_CONVERTED_TO_ONLY_AVAILABLE',
        person: rawRule.person,
        role: rawRule.role
      });
      continue;
    }
    if (rawType === 'only_available') {
      addAvailabilityDate(rawRule, 'only_available');
      continue;
    }

    const personId = resolvePersonId(rawRule.personId || rawRule.person, people);
    const role = resolveRole(rawRule.roleId || rawRule.role);
    if (['unavailable', 'available', 'preferred', 'fixed', 'fixed_assignment', 'limit']
      .includes(rawType) && !personId) {
      warnings.push({
        code: 'UNKNOWN_RULE_PERSON',
        person: rawRule.person || rawRule.personId || '未指定',
        message: `規則人員無法對應：${rawRule.person || rawRule.personId || '未指定'}`
      });
      continue;
    }

    if (['unavailable', 'available', 'preferred'].includes(rawType)) {
      const hasTemporalSelector =
        rawRule.date
        || (Array.isArray(rawRule.dates) && rawRule.dates.length)
        || rawRule.dateRange;
      canonical.push({
        ...ruleBase(rawRule, rawType),
        personId,
        ...(role ? { roleId: role.roleId } : {}),
        ...(rawRule.date ? { date: rawRule.date } : {}),
        ...(rawRule.dates ? { dates: rawRule.dates } : {}),
        ...(rawRule.dateRange ? { dateRange: rawRule.dateRange } : {}),
        ...(!hasTemporalSelector ? { dates: [...targetDates] } : {})
      });
    } else if (rawType === 'fixed' || rawType === 'fixed_assignment') {
      const dates = targetDates.filter((date) => isRuleActiveForDate(rawRule, date));
      for (const date of dates) {
        canonical.push({
          ...ruleBase(rawRule, 'fixed_assignment', date),
          personId,
          roleId: role?.roleId,
          date
        });
      }
    } else if (rawType === 'limit') {
      const maxCount = resolveLimitMaxCount(rawRule);
      canonical.push({
        ...ruleBase(rawRule, 'limit'),
        personId,
        ...(role ? { roleId: role.roleId } : {}),
        maxCount,
        period: rawRule.period || rawRule.dateRange || {
          start: targetDates[0],
          end: targetDates.at(-1)
        }
      });
    } else if (rawType === 'exclusive_person') {
      const first = resolvePersonId(
        rawRule.personIds?.[0] || rawRule.personId || rawRule.person,
        people
      );
      const second = resolvePersonId(
        rawRule.personIds?.[1] || rawRule.action?.personId || rawRule.action?.person,
        people
      );
      canonical.push({
        ...ruleBase(rawRule, 'exclusive_person'),
        personIds: [first, second].filter(Boolean)
      });
    } else if (rawType === 'conditional') {
      const conditionRole = resolveRole(rawRule.condition?.roleId || rawRule.condition?.role);
      const actionRole = resolveRole(rawRule.action?.roleId || rawRule.action?.role);
      canonical.push({
        ...ruleBase(rawRule, 'conditional'),
        ...(rawRule.date ? { date: rawRule.date } : {}),
        ...(rawRule.dateRange ? { dateRange: rawRule.dateRange } : {}),
        condition: {
          section: rawRule.condition?.section || conditionRole?.section,
          personId: resolvePersonId(
            rawRule.condition?.personId || rawRule.condition?.person,
            people
          ),
          roleId: conditionRole?.roleId
        },
        action: {
          section: rawRule.action?.section || actionRole?.section,
          personId: resolvePersonId(
            rawRule.action?.personId || rawRule.action?.person,
            people
          ),
          roleId: actionRole?.roleId
        }
      });
    } else if (rawType === 'force_role') {
      canonical.push({
        ...ruleBase(rawRule, 'force_role'),
        date: rawRule.date,
        roleId: role?.roleId
      });
    } else if (rawType === 'allow_consecutive') {
      canonical.push({
        ...ruleBase(rawRule, 'allow_consecutive'),
        ...(personId ? { personId } : {}),
        ...(role ? { roleId: role.roleId } : {}),
        ...(rawRule.date ? { date: rawRule.date } : {}),
        ...(rawRule.dateRange ? { dateRange: rawRule.dateRange } : {})
      });
    }
  }

  for (const group of availabilityGroups.values()) {
    if (group.dates.size === 0) {
      warnings.push({
        code: 'AVAILABILITY_RULE_OUTSIDE_TARGET_PERIOD',
        personId: group.personId,
        roleId: group.roleId,
        reason: group.rawRule.reason
      });
      continue;
    }

    canonical.push({
      ...ruleBase(group.rawRule, group.type),
      personId: group.personId,
      ...(group.roleId ? { roleId: group.roleId } : {}),
      dates: [...group.dates].sort()
    });
  }

  const normalized = normalizeRules(canonical, {
    people: people.canonical,
    roles: ROLE_DEFINITIONS
  });
  if (!normalized.success) {
    throw new SchedulingContextError(
      'RULE_NORMALIZATION_FAILED',
      '規則正規化失敗',
      { errors: normalized.errors }
    );
  }
  return { rules: normalized.normalizedRules, warnings };
}

export function buildSchedulingContext(payload = {}) {
  const people = buildPeople(payload.people || []);
  const targetDates = [...new Set(payload.sectionDates?.main || [])].sort();
  if (!targetDates.length) {
    throw new SchedulingContextError('NO_MAIN_DATES', '沒有可排的大堂日期');
  }

  const assignments = {};
  const warnings = [];
  const datesWithNotes = new Set();
  for (const [rawKey, rawPerson] of Object.entries(payload.assignments || {})) {
    if (rawKey.endsWith('__備註') && rawPerson && typeof rawPerson === 'string' && rawPerson.trim() !== '') {
      datesWithNotes.add(rawKey.slice(0, 10));
    }
    const parsed = parseRawCellKey(rawKey);
    if (!parsed) continue;
    const personId = resolvePersonId(rawPerson, people);
    if (!personId && rawPerson && rawPerson !== '/') {
      warnings.push({ code: 'UNKNOWN_EXISTING_PERSON', rawKey, person: rawPerson });
      continue;
    }
    assignments[parsed.key] = personId;
  }

  const lockedKeys = [];
  const lockedAssignments = {};
  for (const [rawKey, value] of Object.entries(payload.locked || {})) {
    if (!value) continue;
    const parsed = parseRawCellKey(rawKey);
    if (!parsed || parsed.role.section !== 'main') continue;
    lockedKeys.push(parsed.key);
    if (assignments[parsed.key]) lockedAssignments[parsed.key] = assignments[parsed.key];
  }

  const childrenAssignments = {};
  const childrenReadOnlyReservations = {};
  for (const [key, personId] of Object.entries(assignments)) {
    const roleId = key.slice(key.indexOf('__') + 2);
    const role = roleById.get(roleId);
    if (role?.section !== 'children' || !personId) continue;
    childrenAssignments[key] = personId;
    const date = key.slice(0, 10);
    const reservations = childrenReadOnlyReservations[date] || [];
    if (!reservations.includes(personId)) reservations.push(personId);
    childrenReadOnlyReservations[date] = reservations.sort();
  }

  const normalizedRules = normalizeRuntimeRules(
    payload.temporaryRules || [],
    people,
    targetDates
  );
  warnings.push(...normalizedRules.warnings);
  const forcedCells = new Set(normalizedRules.rules
    .filter((rule) => rule.type === 'force_role')
    .map((rule) => cellKey(rule.date, rule.roleId)));
  const targetSlots = [];
  for (const date of targetDates) {
    for (const role of ROLE_DEFINITIONS.filter((item) => item.section === 'main')) {
      const key = cellKey(date, role.roleId);
      if (lockedKeys.includes(key)) continue;
      if (role.roleId === 'main-communion') {
        const week = Math.ceil(Number(date.slice(-2)) / 7);
        if (week !== 2 && !forcedCells.has(key) && !datesWithNotes.has(date)) continue;
      }
      targetSlots.push({ date, roleId: role.roleId, required: true });
    }
  }

  const mutableKeySet = new Set(targetSlots.map((slot) => cellKey(slot.date, slot.roleId)));
  const draftPreferences = Object.fromEntries(
    Object.entries(assignments).filter(([key, personId]) => (
      mutableKeySet.has(key) && personId
    ))
  );
  const idToName = Object.fromEntries(people.canonical.map((person) => [
    person.id,
    person.name
  ]));
  const roleIdToName = Object.fromEntries(ROLE_DEFINITIONS.map((role) => [
    role.roleId,
    role.name
  ]));

  return {
    targetSlots,
    people: people.canonical,
    rules: normalizedRules.rules,
    lockedKeys: [...new Set(lockedKeys)].sort(),
    lockedAssignments,
    baselineAssignments: lockedAssignments,
    childrenAssignments,
    childrenReadOnlyReservations,
    draftPreferences,
    warnings,
    idToName,
    roleIdToName,
    snapshotHash: crypto.createHash('sha256').update(JSON.stringify({
      targetSlots,
      rules: normalizedRules.rules,
      lockedKeys,
      lockedAssignments,
      childrenAssignments,
      people: people.canonical
    })).digest('hex')
  };
}

export function toDisplayAssignments(assignments, context) {
  const result = {};
  for (const [key, personId] of Object.entries(assignments || {})) {
    const roleId = key.slice(key.indexOf('__') + 2);
    const date = key.slice(0, 10);
    const roleName = context.roleIdToName[roleId];
    const personName = context.idToName[personId];
    if (roleName && personName) result[`${date}__${roleName}`] = personName;
  }
  return result;
}
