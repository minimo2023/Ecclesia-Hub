import crypto from 'crypto';
import { isValidCalendarDate, isValidId } from './rule-schema.mjs';
import {
  assignmentRecords,
  cellKey,
  isDateInPeriod,
  isRuleActiveForDate,
  personIdOf,
  roleIdsOf,
  ruleMatchesRole
} from './rule-utils.mjs';

function addConflict(conflicts, seen, code, message, details = {}) {
  const fingerprint = JSON.stringify([code, details]);
  if (seen.has(fingerprint)) return;
  seen.add(fingerprint);
  conflicts.push({ code, message, ...details });
}

function canonicalize(input, conflicts, seen) {
  const result = {};
  if (Array.isArray(input)) {
    input.forEach((record, index) => {
      if (!record
        || !isValidCalendarDate(record.date)
        || !isValidId(record.roleId)
        || (record.personId !== null && !isValidId(record.personId))) {
        addConflict(conflicts, seen, 'INVALID_ASSIGNMENT', 'Invalid assignment record', {
          index
        });
        return;
      }
      const key = cellKey(record.date, record.roleId);
      if (Object.hasOwn(result, key)) {
        addConflict(conflicts, seen, 'DUPLICATE_CELL', `${key} appears more than once`, {
          cellKey: key
        });
        return;
      }
      result[key] = record.personId;
    });
    return result;
  }
  if (!input || typeof input !== 'object') {
    addConflict(conflicts, seen, 'INVALID_ASSIGNMENTS', 'assignments must be an object or array');
    return result;
  }
  for (const [key, personId] of Object.entries(input)) {
    const match = /^(\d{4}-\d{2}-\d{2})__(.+)$/.exec(key);
    if (!match
      || !isValidCalendarDate(match[1])
      || !isValidId(match[2])
      || (personId !== null && !isValidId(personId))) {
      addConflict(conflicts, seen, 'INVALID_ASSIGNMENT', `Invalid assignment: ${key}`, {
        cellKey: key
      });
      continue;
    }
    result[key] = personId;
  }
  return result;
}

function endpointAssigned(endpoint, date, mainAssignments, childrenAssignments) {
  const source = endpoint.section === 'children'
    ? childrenAssignments
    : mainAssignments;
  return source[cellKey(date, endpoint.roleId)] === endpoint.personId;
}

function validatedHash(snapshotHash, assignments) {
  const canonical = Object.entries(assignments)
    .filter(([, personId]) => Boolean(personId))
    .sort(([a], [b]) => a.localeCompare(b));
  return crypto.createHash('sha256')
    .update(`${snapshotHash}|${JSON.stringify(canonical)}`)
    .digest('hex');
}

export function validateSchedule({
  assignments = {},
  targetSlots = [],
  people = [],
  rules = [],
  lockedKeys = [],
  lockedAssignments = {},
  baselineAssignments = {},
  childrenReadOnlyReservations = {},
  childrenAssignments = {},
  snapshotHash = ''
} = {}) {
  const conflicts = [];
  const seen = new Set();
  const proposed = canonicalize(assignments, conflicts, seen);
  const targetByKey = new Map(targetSlots.map((slot) => [
    cellKey(slot.date, slot.roleId),
    { ...slot, required: slot.required !== false }
  ]));
  const lockedSet = new Set(lockedKeys);
  const peopleById = new Map(people.map((person) => [personIdOf(person), person]));

  for (const key of Object.keys(proposed)) {
    if (!targetByKey.has(key)) {
      addConflict(conflicts, seen, 'OUT_OF_SCOPE_CELL', `${key} is outside mutable cells`, {
        cellKey: key
      });
    }
    if (lockedSet.has(key)) {
      addConflict(conflicts, seen, 'LOCKED_CELL_WRITE', `${key} is locked`, {
        cellKey: key
      });
    }
  }

  const mainAssignments = { ...baselineAssignments, ...lockedAssignments };
  for (const [key, personId] of Object.entries(proposed)) {
    if (!lockedSet.has(key)) mainAssignments[key] = personId;
  }
  for (const [key, slot] of targetByKey) {
    const value = lockedSet.has(key) ? lockedAssignments[key] : proposed[key];
    if (slot.required && !value) {
      addConflict(conflicts, seen, 'REQUIRED_CELL_UNFILLED', `${key} is required`, {
        cellKey: key
      });
    }
  }

  const mainRecords = assignmentRecords(mainAssignments);
  for (const record of mainRecords) {
    const person = peopleById.get(record.personId);
    if (!person) {
      addConflict(conflicts, seen, 'UNKNOWN_PERSON', `Unknown person ${record.personId}`, {
        cellKey: record.key,
        personId: record.personId
      });
    } else if (!roleIdsOf(person).includes(record.roleId)) {
      addConflict(
        conflicts,
        seen,
        'QUALIFICATION_VIOLATION',
        `${record.personId} lacks ${record.roleId}`,
        { cellKey: record.key, personId: record.personId, roleId: record.roleId }
      );
    }
  }

  const services = new Map();
  for (const record of mainRecords) {
    const key = `${record.personId}__${record.date}`;
    const entries = services.get(key) || [];
    entries.push(record);
    services.set(key, entries);
  }
  for (const [date, personIds] of Object.entries(childrenReadOnlyReservations)) {
    for (const personId of personIds || []) {
      const key = `${personId}__${date}`;
      const entries = services.get(key) || [];
      entries.push({ date, personId, section: 'children', roleId: null });
      services.set(key, entries);
    }
  }
  for (const entries of services.values()) {
    if (entries.length <= 1) continue;
    const includesChildren = entries.some((entry) => entry.section === 'children');
    addConflict(
      conflicts,
      seen,
      includesChildren ? 'CHILDREN_RESERVATION_CONFLICT' : 'SAME_DAY_DUPLICATE',
      `${entries[0].personId} has multiple services on ${entries[0].date}`,
      {
        personId: entries[0].personId,
        date: entries[0].date,
        cells: entries.filter((entry) => entry.roleId).map((entry) => (
          cellKey(entry.date, entry.roleId)
        ))
      }
    );
  }

  for (const rule of rules.filter((item) => item.type === 'fixed_assignment')) {
    const key = cellKey(rule.date, rule.roleId);
    if (mainAssignments[key] !== rule.personId) {
      addConflict(conflicts, seen, 'FIXED_VIOLATION', `${key} must be ${rule.personId}`, {
        cellKey: key,
        expectedPersonId: rule.personId,
        actualPersonId: mainAssignments[key] || null,
        ruleIds: [rule.ruleId]
      });
    }
  }
  for (const record of mainRecords) {
    for (const rule of rules.filter((item) => item.type === 'unavailable')) {
      if (rule.personId === record.personId
        && ruleMatchesRole(rule, record.roleId)
        && isRuleActiveForDate(rule, record.date)) {
        addConflict(conflicts, seen, 'UNAVAILABLE_VIOLATION', `${record.key} unavailable`, {
          cellKey: record.key,
          personId: record.personId,
          ruleIds: [rule.ruleId]
        });
      }
    }
    for (const rule of rules.filter((item) => item.type === 'only_available')) {
      if (rule.personId === record.personId
        && ruleMatchesRole(rule, record.roleId)
        && !isRuleActiveForDate(rule, record.date)) {
        addConflict(
          conflicts,
          seen,
          'ONLY_AVAILABLE_VIOLATION',
          `${record.key} outside only_available`,
          { cellKey: record.key, personId: record.personId, ruleIds: [rule.ruleId] }
        );
      }
    }
  }
  for (const rule of rules.filter((item) => item.type === 'force_role')) {
    const key = cellKey(rule.date, rule.roleId);
    if (!mainAssignments[key]) {
      addConflict(conflicts, seen, 'FORCE_ROLE_VIOLATION', `${key} must be filled`, {
        cellKey: key,
        ruleIds: [rule.ruleId]
      });
    }
  }

  const exactChildren = assignmentRecords(childrenAssignments, 'children');
  const childServices = [...exactChildren];
  const exactPairs = new Set(exactChildren.map((record) => `${record.personId}__${record.date}`));
  for (const [date, personIds] of Object.entries(childrenReadOnlyReservations)) {
    for (const personId of personIds || []) {
      if (!exactPairs.has(`${personId}__${date}`)) {
        childServices.push({ date, roleId: null, personId, section: 'children' });
      }
    }
  }
  for (const rule of rules.filter((item) => item.type === 'limit')) {
    const records = [
      ...mainRecords,
      ...(rule.scope === 'global' ? childServices : [])
    ].filter((record) => (
      record.personId === rule.personId
      && (!rule.roleId || record.roleId === rule.roleId)
      && isDateInPeriod(record.date, rule.period)
    ));
    if (records.length > rule.maxCount) {
      addConflict(conflicts, seen, 'LIMIT_VIOLATION', `${rule.personId} exceeds limit`, {
        personId: rule.personId,
        actualCount: records.length,
        maxCount: rule.maxCount,
        ruleIds: [rule.ruleId]
      });
    }
  }

  const peopleByDate = new Map();
  const rolesByDate = new Map();
  for (const record of [...mainRecords, ...childServices]) {
    const peopleOnDate = peopleByDate.get(record.date) || new Set();
    peopleOnDate.add(record.personId);
    peopleByDate.set(record.date, peopleOnDate);
    if (record.roleId) {
      const rolesOnDate = rolesByDate.get(record.date) || new Set();
      rolesOnDate.add(record.roleId);
      rolesByDate.set(record.date, rolesOnDate);
    }
  }
  for (const rule of rules.filter((item) => item.type === 'exclusive_person')) {
    for (const [date, personIds] of peopleByDate) {
      if (rule.personIds.every((personId) => personIds.has(personId))) {
        addConflict(
          conflicts,
          seen,
          'EXCLUSIVE_PERSON_VIOLATION',
          `Exclusive people scheduled on ${date}`,
          { date, personIds: rule.personIds, ruleIds: [rule.ruleId] }
        );
      }
    }
  }
  for (const rule of rules.filter((item) => item.type === 'exclusive_role')) {
    for (const [date, roleIds] of rolesByDate) {
      if (rule.roleIds.every((roleId) => roleIds.has(roleId))) {
        addConflict(conflicts, seen, 'EXCLUSIVE_ROLE_VIOLATION', `Exclusive roles on ${date}`, {
          date,
          roleIds: rule.roleIds,
          ruleIds: [rule.ruleId]
        });
      }
    }
  }

  const relevantDates = new Set([
    ...targetSlots.map((slot) => slot.date),
    ...mainRecords.map((record) => record.date),
    ...exactChildren.map((record) => record.date)
  ]);
  for (const rule of rules.filter((item) => item.type === 'conditional')) {
    for (const date of relevantDates) {
      if (!isRuleActiveForDate(rule, date)) continue;
      if (endpointAssigned(rule.condition, date, mainAssignments, childrenAssignments)
        && !endpointAssigned(rule.action, date, mainAssignments, childrenAssignments)) {
        addConflict(conflicts, seen, 'CONDITIONAL_VIOLATION', `Conditional failed ${date}`, {
          date,
          condition: rule.condition,
          action: rule.action,
          ruleIds: [rule.ruleId]
        });
      }
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    errors: conflicts,
    assignments: proposed,
    validatedHash: conflicts.length
      ? null
      : validatedHash(snapshotHash, proposed)
  };
}
