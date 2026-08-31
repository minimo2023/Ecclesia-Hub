import { isValidCalendarDate, isValidId } from './rule-schema.mjs';

export function cellKey(date, roleId) {
  return `${date}__${roleId}`;
}

export function parseCellKey(key) {
  if (typeof key !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:__|\|)(.+)$/.exec(key);
  if (!match || !isValidCalendarDate(match[1]) || !isValidId(match[2])) return null;
  return {
    date: match[1],
    roleId: match[2],
    key: cellKey(match[1], match[2])
  };
}

export function isRuleActiveForDate(rule, date) {
  if (rule.date) return rule.date === date;
  if (Array.isArray(rule.dates)) return rule.dates.includes(date);
  if (rule.dateRange) return date >= rule.dateRange.start && date <= rule.dateRange.end;
  return true;
}

export function isDateInPeriod(date, period) {
  if (typeof period === 'string') return date.startsWith(`${period}-`);
  return Boolean(period && date >= period.start && date <= period.end);
}

export function ruleMatchesRole(rule, roleId) {
  return !rule.roleId || rule.roleId === roleId;
}

export function personIdOf(person) {
  return person?.id || person?.personId || null;
}

export function roleIdsOf(person) {
  return person?.roleIds || person?.categories || [];
}

export function assignmentRecords(assignments = {}, section = 'main') {
  return Object.entries(assignments)
    .filter(([, personId]) => Boolean(personId))
    .map(([rawKey, personId]) => {
      const parsed = parseCellKey(rawKey);
      return parsed ? { ...parsed, personId, section } : null;
    })
    .filter(Boolean);
}

export function toAssignmentMap(assignments = {}) {
  if (!Array.isArray(assignments)) return { ...(assignments || {}) };
  const result = {};
  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== 'object') continue;
    result[cellKey(assignment.date, assignment.roleId)] = assignment.personId;
  }
  return result;
}
