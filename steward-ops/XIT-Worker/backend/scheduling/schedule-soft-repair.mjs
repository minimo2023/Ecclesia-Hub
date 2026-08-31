import { cellKey, toAssignmentMap } from './rule-utils.mjs';

export const CONSECUTIVE_WARNING_ROLE_IDS = Object.freeze([
  'main-leader',
  'main-piano',
  'main-vocals'
]);

function assignmentRecordsByKey(assignments = []) {
  if (!Array.isArray(assignments)) return new Map();
  return new Map(assignments.map((assignment) => [
    cellKey(assignment.date, assignment.roleId),
    assignment
  ]));
}

function dateCoveredByRule(rule, date) {
  if (rule.date) return rule.date === date;
  if (rule.dateRange) {
    return date >= rule.dateRange.start && date <= rule.dateRange.end;
  }
  return true;
}

function consecutiveAllowed(rules, personId, roleId, leftDate, rightDate) {
  return rules.some((rule) => (
    rule.type === 'allow_consecutive'
    && (!rule.personId || rule.personId === personId)
    && (!rule.roleId || rule.roleId === roleId)
    && (
      dateCoveredByRule(rule, leftDate)
      || dateCoveredByRule(rule, rightDate)
    )
  ));
}

export function findConsecutiveWarnings({
  assignments = {},
  targetSlots = [],
  rules = [],
  roleIds = CONSECUTIVE_WARNING_ROLE_IDS
} = {}) {
  const map = toAssignmentMap(assignments);
  const dates = [...new Set(targetSlots.map((slot) => slot.date))].sort();
  const warnings = [];
  for (const roleId of roleIds) {
    const personPairs = {};
    for (let index = 0; index < dates.length - 1; index += 1) {
      const leftDate = dates[index];
      const rightDate = dates[index + 1];
      const personId = map[cellKey(leftDate, roleId)];
      if (
        personId
        && personId !== '空班'
        && personId === map[cellKey(rightDate, roleId)]
        && !consecutiveAllowed(rules, personId, roleId, leftDate, rightDate)
      ) {
        personPairs[personId] = (personPairs[personId] || 0) + 1;
      }
    }

    for (let index = 0; index < dates.length - 1; index += 1) {
      const leftDate = dates[index];
      const rightDate = dates[index + 1];
      const personId = map[cellKey(leftDate, roleId)];
      if (
        personId
        && personId !== '空班'
        && personId === map[cellKey(rightDate, roleId)]
        && !consecutiveAllowed(rules, personId, roleId, leftDate, rightDate)
      ) {
        if (personPairs[personId] > 1) {
          warnings.push({
            type: 'CONSECUTIVE_WARNING',
            roleId,
            personId,
            leftDate,
            rightDate,
            repairKeys: [
              cellKey(leftDate, roleId),
              cellKey(rightDate, roleId)
            ]
          });
        }
      }
    }
  }
  return warnings;
}

export function repairConsecutiveDraft({
  draftAssignments = [],
  targetSlots = [],
  rules = [],
  candidateMatrix = [],
  baselineAssignments = {},
  validateDraft = () => ({ valid: true }),
  loadSummary = {},
  maxChanges = 50
} = {}) {
  const originalRecords = assignmentRecordsByKey(draftAssignments);
  const draft = toAssignmentMap(draftAssignments);
  const matrixByKey = new Map(candidateMatrix.map((cell) => [cell.key, cell]));
  const combined = () => ({ ...baselineAssignments, ...draft });
  const initialWarningCount = findConsecutiveWarnings({
    assignments: combined(),
    targetSlots,
    rules
  }).length;
  let changedCellCount = 0;
  const changedKeys = [];

  while (changedCellCount < maxChanges) {
    const warnings = findConsecutiveWarnings({
      assignments: combined(),
      targetSlots,
      rules
    });
    if (!warnings.length) break;

    let bestRepair = null;
    for (const warning of warnings) {
      for (const repairKey of warning.repairKeys) {
        const cell = matrixByKey.get(repairKey);
        if (!cell || !draft[repairKey]) continue;

        for (const personId of cell.eligible) {
          if (personId === draft[repairKey]) continue;
          const proposal = {
            ...draft,
            [repairKey]: personId
          };
          const proposalRecords = Object.entries(proposal).map(([key, value]) => {
            const [date, roleId] = key.split('__');
            return {
              ...(originalRecords.get(key) || {}),
              date,
              roleId,
              personId: value
            };
          });
          if (!validateDraft({ proposedAssignments: proposalRecords }).valid) {
            continue;
          }
          const warningCount = findConsecutiveWarnings({
            assignments: { ...baselineAssignments, ...proposal },
            targetSlots,
            rules
          }).length;
          if (warningCount >= warnings.length) continue;

          const load = loadSummary[personId] || {};
          const projectedLoad =
            (load.baselineServiceCount || 0)
            + (load.assignedCount || 0)
            + 1;
          const targetDeviation = Math.abs(
            projectedLoad - (load.periodTarget || projectedLoad)
          );
          const candidate = {
            key: repairKey,
            personId,
            warningCount,
            targetDeviation
          };
          if (
            !bestRepair
            || candidate.warningCount < bestRepair.warningCount
            || (
              candidate.warningCount === bestRepair.warningCount
              && candidate.targetDeviation < bestRepair.targetDeviation
            )
            || (
              candidate.warningCount === bestRepair.warningCount
              && candidate.targetDeviation === bestRepair.targetDeviation
              && candidate.personId.localeCompare(bestRepair.personId) < 0
            )
          ) {
            bestRepair = candidate;
          }
        }
      }
    }

    if (!bestRepair) break;
    draft[bestRepair.key] = bestRepair.personId;
    changedCellCount += 1;
    if (!changedKeys.includes(bestRepair.key)) changedKeys.push(bestRepair.key);
  }

  const assignments = Object.entries(draft).map(([key, personId]) => {
    const [date, roleId] = key.split('__');
    return {
      ...(originalRecords.get(key) || {}),
      date,
      roleId,
      personId
    };
  });
  const remainingWarningCount = findConsecutiveWarnings({
    assignments: { ...baselineAssignments, ...draft },
    targetSlots,
    rules
  }).length;

  return {
    assignments,
    initialWarningCount,
    remainingWarningCount,
    changedCellCount,
    changedKeys
  };
}
