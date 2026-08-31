import {
  assignmentRecords,
  isDateInPeriod,
  personIdOf
} from './rule-utils.mjs';

const round = (value) => Number(value.toFixed(6));

function buildServiceDates(assignments, childrenReservations = {}) {
  const result = new Map();
  for (const record of assignmentRecords(assignments)) {
    const dates = result.get(record.personId) || new Set();
    dates.add(record.date);
    result.set(record.personId, dates);
  }
  for (const [date, personIds] of Object.entries(childrenReservations)) {
    for (const personId of personIds || []) {
      const dates = result.get(personId) || new Set();
      dates.add(date);
      result.set(personId, dates);
    }
  }
  return result;
}

export function calculateRoleCoverage({
  candidateMatrix = [],
  baselineAssignments = {},
  plannedAssignments = {}
} = {}) {
  const candidatesByRole = new Map();
  const requiredCellsByRole = new Map();
  const baselineCellsByRole = new Map();
  const assignedByRole = new Map();

  for (const cell of candidateMatrix) {
    if (cell.required === false) continue;
    const candidates = candidatesByRole.get(cell.roleId) || new Set();
    for (const personId of cell.eligible || []) candidates.add(personId);
    candidatesByRole.set(cell.roleId, candidates);
    requiredCellsByRole.set(
      cell.roleId,
      (requiredCellsByRole.get(cell.roleId) || 0) + 1
    );
  }

  const records = new Map();
  for (const record of assignmentRecords(baselineAssignments)) {
    records.set(record.key, record);
    const cells = baselineCellsByRole.get(record.roleId) || new Set();
    cells.add(record.key);
    baselineCellsByRole.set(record.roleId, cells);
  }
  for (const record of assignmentRecords(plannedAssignments)) {
    records.set(record.key, record);
  }
  for (const record of records.values()) {
    const candidates = candidatesByRole.get(record.roleId) || new Set();
    candidates.add(record.personId);
    candidatesByRole.set(record.roleId, candidates);
    const assigned = assignedByRole.get(record.roleId) || new Set();
    assigned.add(record.personId);
    assignedByRole.set(record.roleId, assigned);
  }

  const roleIds = [...new Set([
    ...candidatesByRole.keys(),
    ...assignedByRole.keys()
  ])].sort();
  return roleIds.map((roleId) => {
    const candidates = candidatesByRole.get(roleId) || new Set();
    const assigned = assignedByRole.get(roleId) || new Set();
    const slotCapacity =
      (requiredCellsByRole.get(roleId) || 0)
      + (baselineCellsByRole.get(roleId)?.size || 0);
    const targetDistinctCount = Math.min(candidates.size, slotCapacity);
    const achievedDistinctCount = Math.min(assigned.size, targetDistinctCount);
    return {
      roleId,
      eligiblePersonCount: candidates.size,
      slotCapacity,
      targetDistinctCount,
      achievedDistinctCount,
      shortfall: Math.max(0, targetDistinctCount - achievedDistinctCount),
      uncoveredPersonIds: [...candidates]
        .filter((personId) => !assigned.has(personId))
        .sort()
    };
  });
}

function mergeDates(...maps) {
  const result = new Map();
  for (const map of maps) {
    for (const [personId, dates] of map) {
      const merged = result.get(personId) || new Set();
      for (const date of dates) merged.add(date);
      result.set(personId, merged);
    }
  }
  return result;
}

function buildOpportunityStats(
  people,
  candidateMatrix,
  baselineDates,
  baselineMainDates,
  rules
) {
  const stats = {};
  const dailyWeights = new Map();
  for (const person of people) {
    const personId = personIdOf(person);
    if (personId) stats[personId] = { eligibleDates: new Set(), opportunityWeight: 0 };
  }
  for (const cell of candidateMatrix) {
    if (!cell.eligible?.length) continue;
    const contribution = 1 / cell.eligible.length;
    for (const personId of cell.eligible) {
      if (!stats[personId]) continue;
      stats[personId].eligibleDates.add(cell.date);
      const key = `${personId}__${cell.date}`;
      dailyWeights.set(key, (dailyWeights.get(key) || 0) + contribution);
    }
  }

  for (const [personId, value] of Object.entries(stats)) {
    value.opportunityWeight = round([...value.eligibleDates].reduce((sum, date) => (
      sum + Math.min(1, dailyWeights.get(`${personId}__${date}`) || 0)
    ), 0));
    const occupied = baselineDates.get(personId) || new Set();
    let capacity = [...value.eligibleDates].filter((date) => !occupied.has(date)).length;
    for (const rule of rules.filter((candidate) => (
      candidate.type === 'limit'
      && candidate.personId === personId
      && !candidate.roleId
    ))) {
      const countedDates = rule.scope === 'global'
        ? occupied
        : baselineMainDates.get(personId) || new Set();
      const used = [...countedDates].filter((date) => isDateInPeriod(date, rule.period)).length;
      const inside = [...value.eligibleDates].filter((date) => (
        !occupied.has(date) && isDateInPeriod(date, rule.period)
      )).length;
      const outside = [...value.eligibleDates].filter((date) => (
        !occupied.has(date) && !isDateInPeriod(date, rule.period)
      )).length;
      capacity = Math.min(capacity, outside + Math.max(0, Math.min(
        inside,
        rule.maxCount - used
      )));
    }
    value.remainingCapacity = Math.max(0, capacity);
  }
  return stats;
}

function buildRulePriorityRequirements(rules = []) {
  const requirements = new Map();
  const fixedDates = new Map();
  for (const rule of rules) {
    if (!rule.personId) continue;
    const entry = requirements.get(rule.personId) || {
      minimum: 0,
      types: new Set()
    };
    if (rule.type === 'fixed_assignment') {
      const dates = fixedDates.get(rule.personId) || new Set();
      if (rule.date) dates.add(rule.date);
      fixedDates.set(rule.personId, dates);
      entry.types.add(rule.type);
    } else if (['only_available', 'available', 'preferred'].includes(rule.type)) {
      entry.minimum = Math.max(entry.minimum, 1);
      entry.types.add(rule.type);
    }
    requirements.set(rule.personId, entry);
  }
  for (const [personId, dates] of fixedDates) {
    const entry = requirements.get(personId);
    entry.minimum = Math.max(entry.minimum, dates.size);
  }
  return requirements;
}

function allocate(people, stats, baselineDates, requiredCount, rules = []) {
  const ruleRequirements = buildRulePriorityRequirements(rules);
  const targets = {};
  for (const person of people) {
    const personId = personIdOf(person);
    if (!personId || !stats[personId]) continue;
    const baseline = baselineDates.get(personId)?.size || 0;
    targets[personId] = {
      personId,
      plannedTarget: 0,
      periodTarget: baseline,
      remainingCapacity: stats[personId].remainingCapacity,
      opportunityWeight: stats[personId].opportunityWeight,
      rulePriorityMinimum: ruleRequirements.get(personId)?.minimum || 0,
      rulePriorityTypes: [
        ...(ruleRequirements.get(personId)?.types || [])
      ].sort()
    };
  }
  let allocatedCount = 0;
  const priorityTargets = Object.values(targets)
    .filter((target) => target.rulePriorityMinimum > 0)
    .sort((left, right) => (
      Number(!left.rulePriorityTypes.includes('fixed_assignment'))
      - Number(!right.rulePriorityTypes.includes('fixed_assignment'))
      || (stats[left.personId]?.eligibleDates.size || 0)
        - (stats[right.personId]?.eligibleDates.size || 0)
      || left.personId.localeCompare(right.personId)
    ));
  for (const target of priorityTargets) {
    while (
      target.plannedTarget < target.rulePriorityMinimum
      && target.plannedTarget < target.remainingCapacity
      && allocatedCount < requiredCount
    ) {
      target.plannedTarget += 1;
      target.periodTarget += 1;
      allocatedCount += 1;
    }
  }

  for (let index = allocatedCount; index < requiredCount; index += 1) {
    const candidates = Object.values(targets)
      .filter((target) => target.plannedTarget < target.remainingCapacity)
      .sort((a, b) => {
        const projectedA = (a.periodTarget + 1) / Math.max(a.opportunityWeight, 0.25);
        const projectedB = (b.periodTarget + 1) / Math.max(b.opportunityWeight, 0.25);
        return projectedA - projectedB
          || b.opportunityWeight - a.opportunityWeight
          || a.personId.localeCompare(b.personId);
      });
    if (!candidates.length) break;
    candidates[0].plannedTarget += 1;
    candidates[0].periodTarget += 1;
  }
  return targets;
}

export function allocateDeterministicTargets({
  people = [],
  candidateMatrix = [],
  baselineAssignments = {},
  childrenReadOnlyReservations = {},
  rules = []
} = {}) {
  const baselineDates = buildServiceDates(
    baselineAssignments,
    childrenReadOnlyReservations
  );
  const baselineMainDates = buildServiceDates(baselineAssignments);
  const stats = buildOpportunityStats(
    people,
    candidateMatrix,
    baselineDates,
    baselineMainDates,
    rules
  );
  return allocate(
    people,
    stats,
    baselineDates,
    candidateMatrix.filter((cell) => cell.required !== false).length,
    rules
  );
}

export function calculateLoad({
  assignments,
  baselineAssignments = assignments || {},
  plannedAssignments = {},
  people = [],
  rules = [],
  candidateMatrix = [],
  childrenReadOnlyReservations = {},
  personTargets = []
} = {}) {
  const baselineDates = buildServiceDates(
    baselineAssignments,
    childrenReadOnlyReservations
  );
  const baselineMainDates = buildServiceDates(baselineAssignments);
  const plannedDates = buildServiceDates(plannedAssignments);
  const mainDates = mergeDates(baselineMainDates, plannedDates);
  const allDates = mergeDates(baselineDates, plannedDates);
  const stats = buildOpportunityStats(
    people,
    candidateMatrix,
    baselineDates,
    baselineMainDates,
    rules
  );
  const deterministic = allocate(
    people,
    stats,
    baselineDates,
    candidateMatrix.filter((cell) => cell.required !== false).length,
    rules
  );
  const supplied = new Map(personTargets.map((target) => [target.personId, target]));
  const result = {};

  for (const person of people) {
    const personId = personIdOf(person);
    if (!personId) continue;
    const baseline = baselineDates.get(personId) || new Set();
    const planned = plannedDates.get(personId) || new Set();
    const assigned = allDates.get(personId) || new Set();
    const opportunity = stats[personId] || {
      eligibleDates: new Set(),
      opportunityWeight: 0,
      remainingCapacity: 0
    };
    const requested = supplied.get(personId)?.periodTarget
      ?? deterministic[personId]?.periodTarget
      ?? baseline.size;
    const rulePriorityMinimum =
      deterministic[personId]?.rulePriorityMinimum || 0;
    const minimum = baseline.size + rulePriorityMinimum;
    const maximum = baseline.size + opportunity.remainingCapacity;
    const periodTarget = Math.max(minimum, Math.min(maximum, requested));
    const matchingLimits = rules.filter((rule) => (
      rule.type === 'limit' && rule.personId === personId
    ));

    result[personId] = {
      personId,
      baselineServiceCount: baseline.size,
      plannedMainCount: [...planned].filter((date) => !baseline.has(date)).length,
      assignedCount: assigned.size,
      count: assigned.size,
      monthlyCounts: [...assigned].reduce((counts, date) => {
        const month = date.slice(0, 7);
        counts[month] = (counts[month] || 0) + 1;
        return counts;
      }, {}),
      eligibleDateCount: opportunity.eligibleDates.size,
      opportunityWeight: opportunity.opportunityWeight,
      normalizedLoad: round(assigned.size / Math.max(opportunity.opportunityWeight, 0.25)),
      remainingCapacity: opportunity.remainingCapacity,
      periodTarget,
      plannedTarget: Math.max(0, periodTarget - baseline.size),
      targetGap: periodTarget - assigned.size,
      rulePriorityMinimum,
      rulePriorityTypes:
        deterministic[personId]?.rulePriorityTypes || [],
      rulePriorityFeasible:
        (deterministic[personId]?.remainingCapacity || 0)
        >= (deterministic[personId]?.rulePriorityMinimum || 0),
      targetClamped: Boolean(supplied.has(personId) && periodTarget !== requested),
      limits: matchingLimits.map((rule) => ({
        ruleId: rule.ruleId,
        roleId: rule.roleId || null,
        period: rule.period,
        maxCount: rule.maxCount
      })),
      isAtLimit: matchingLimits.some((rule) => {
        const source = rule.scope === 'global'
          ? assigned
          : mainDates.get(personId) || new Set();
        return [...source].filter((date) => isDateInPeriod(date, rule.period)).length
          >= rule.maxCount;
      })
    };
  }
  return result;
}
