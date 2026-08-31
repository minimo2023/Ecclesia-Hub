import {
  assignmentRecords,
  cellKey,
  isDateInPeriod,
  isRuleActiveForDate,
  personIdOf,
  roleIdsOf,
  ruleMatchesRole
} from './rule-utils.mjs';

function baselineRecords(baselineAssignments, lockedAssignments, childrenReservations) {
  const records = new Map();
  for (const record of [
    ...assignmentRecords(baselineAssignments),
    ...assignmentRecords(lockedAssignments)
  ]) records.set(record.key, record);

  for (const [date, personIds] of Object.entries(childrenReservations || {})) {
    for (const personId of personIds || []) {
      records.set(`children:${date}:${personId}`, {
        key: `children:${date}:${personId}`,
        date,
        roleId: null,
        personId,
        section: 'children'
      });
    }
  }
  return [...records.values()];
}

function addReason(map, code, ruleId) {
  const entry = map.get(code) || { code, ruleIds: new Set() };
  if (ruleId) entry.ruleIds.add(ruleId);
  map.set(code, entry);
}

export function generateCandidateMatrix({
  targetSlots = [],
  people = [],
  rules = [],
  lockedKeys = [],
  lockedAssignments = {},
  baselineAssignments = {},
  childrenReadOnlyReservations = {}
} = {}) {
  const workers = [...people].sort((a, b) => (
    String(personIdOf(a)).localeCompare(String(personIdOf(b)))
  ));
  const lockedSet = new Set(lockedKeys);
  const baseline = baselineRecords(
    baselineAssignments,
    lockedAssignments,
    childrenReadOnlyReservations
  );
  const reservationsByDate = new Map();
  for (const record of baseline) {
    const entries = reservationsByDate.get(record.date) || [];
    entries.push(record);
    reservationsByDate.set(record.date, entries);
  }

  const fixedRules = rules.filter((rule) => rule.type === 'fixed_assignment');
  const unavailableRules = rules.filter((rule) => rule.type === 'unavailable');
  const onlyAvailableRules = rules.filter((rule) => rule.type === 'only_available');
  const limitRules = rules.filter((rule) => rule.type === 'limit');
  const exclusivePersonRules = rules.filter((rule) => rule.type === 'exclusive_person');
  const exclusiveRoleRules = rules.filter((rule) => rule.type === 'exclusive_role');
  const softRules = rules.filter((rule) => ['available', 'preferred'].includes(rule.type));
  const priorityRules = rules.filter((rule) => [
    'fixed_assignment',
    'only_available',
    'available',
    'preferred'
  ].includes(rule.type));

  return targetSlots.map((slot) => {
    const key = cellKey(slot.date, slot.roleId);
    const fixedForCell = fixedRules.filter((rule) => (
      rule.date === slot.date && rule.roleId === slot.roleId
    ));
    const reservedToday = reservationsByDate.get(slot.date) || [];
    const eligible = [];
    const excluded = [];
    const softRuleIdsByPerson = [];
    const priorityRuleIdsByPerson = [];

    for (const person of workers) {
      const personId = personIdOf(person);
      if (!personId) continue;
      const reasons = new Map();

      if (!roleIdsOf(person).includes(slot.roleId)) {
        addReason(reasons, 'LACKS_QUALIFICATION');
      }
      if (lockedSet.has(key)) {
        const lockedPersonId = lockedAssignments[key];
        if (!lockedPersonId) addReason(reasons, 'BLANK_LOCKED_CELL', 'locked-cell');
        else if (lockedPersonId !== personId) {
          addReason(reasons, 'LOCKED_CELL_OTHER_PERSON', 'locked-cell');
        }
      }
      for (const reservation of reservedToday) {
        if (reservation.personId !== personId) continue;
        if (reservation.section === 'children') {
          addReason(reasons, 'CHILDREN_RESERVATION_SAME_DAY');
        } else if (reservation.key !== key) {
          addReason(reasons, 'RESERVED_OTHER_ROLE_SAME_DAY', 'locked-cell');
        }
      }

      const fixedToday = fixedRules.find((rule) => (
        rule.personId === personId && rule.date === slot.date
      ));
      if (fixedToday && fixedToday.roleId !== slot.roleId) {
        addReason(reasons, 'FIXED_OTHER_ROLE_SAME_DAY', fixedToday.ruleId);
      }
      for (const rule of fixedForCell) {
        if (rule.personId !== personId) {
          addReason(reasons, 'FIXED_CELL_OTHER_PERSON', rule.ruleId);
        }
      }
      for (const rule of unavailableRules) {
        if (rule.personId === personId
          && ruleMatchesRole(rule, slot.roleId)
          && isRuleActiveForDate(rule, slot.date)) {
          addReason(reasons, 'UNAVAILABLE', rule.ruleId);
        }
      }
      for (const rule of onlyAvailableRules) {
        if (rule.personId === personId
          && ruleMatchesRole(rule, slot.roleId)
          && !isRuleActiveForDate(rule, slot.date)) {
          addReason(reasons, 'OUTSIDE_ONLY_AVAILABLE', rule.ruleId);
        }
      }
      for (const rule of limitRules) {
        if (rule.personId !== personId
          || !ruleMatchesRole(rule, slot.roleId)
          || !isDateInPeriod(slot.date, rule.period)) continue;
        const used = baseline.filter((record) => (
          record.personId === personId
          && (rule.scope === 'global' || record.section !== 'children')
          && (!rule.roleId || record.roleId === rule.roleId)
          && isDateInPeriod(record.date, rule.period)
        )).length;
        if (used >= rule.maxCount) addReason(reasons, 'LIMIT_REACHED', rule.ruleId);
      }
      for (const rule of exclusivePersonRules) {
        if (!rule.personIds?.includes(personId)) continue;
        const other = rule.personIds.find((id) => id !== personId);
        if (reservedToday.some((record) => record.personId === other)) {
          addReason(reasons, 'EXCLUSIVE_PERSON_RESERVED', rule.ruleId);
        }
      }
      for (const rule of exclusiveRoleRules) {
        if (!rule.roleIds?.includes(slot.roleId)) continue;
        const conflicting = new Set(rule.roleIds.filter((roleId) => roleId !== slot.roleId));
        if (reservedToday.some((record) => conflicting.has(record.roleId))) {
          addReason(reasons, 'EXCLUSIVE_ROLE_RESERVED', rule.ruleId);
        }
      }

      if (reasons.size === 0) {
        eligible.push(personId);
        const ruleIds = softRules
          .filter((rule) => (
            rule.personId === personId
            && ruleMatchesRole(rule, slot.roleId)
            && isRuleActiveForDate(rule, slot.date)
          ))
          .map((rule) => rule.ruleId)
          .filter(Boolean)
          .sort();
        if (ruleIds.length) softRuleIdsByPerson.push({ personId, ruleIds });
        const priorityRuleIds = priorityRules
          .filter((rule) => (
            rule.personId === personId
            && ruleMatchesRole(rule, slot.roleId)
            && isRuleActiveForDate(rule, slot.date)
          ))
          .map((rule) => rule.ruleId)
          .filter(Boolean)
          .sort();
        if (priorityRuleIds.length) {
          priorityRuleIdsByPerson.push({
            personId,
            ruleIds: priorityRuleIds
          });
        }
      } else {
        const entries = [...reasons.values()].sort((a, b) => a.code.localeCompare(b.code));
        excluded.push({
          personId,
          reasonCodes: entries.map((entry) => entry.code),
          ruleIds: [...new Set(entries.flatMap((entry) => [...entry.ruleIds]))].sort()
        });
      }
    }

    return {
      key,
      date: slot.date,
      roleId: slot.roleId,
      required: slot.required !== false,
      eligible,
      excluded,
      softRuleIdsByPerson,
      priorityRuleIdsByPerson,
      priorityCandidatePersonIds:
        priorityRuleIdsByPerson.map((entry) => entry.personId)
    };
  });
}
