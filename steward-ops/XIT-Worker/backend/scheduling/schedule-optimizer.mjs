import { generateCandidateMatrix } from './candidate-matrix.mjs';
import {
  calculateLoad,
  calculateRoleCoverage
} from './load-calculator.mjs';
import { validateSchedule } from './schedule-validator.mjs';
import {
  assignmentRecords,
  cellKey,
  isDateInPeriod,
  toAssignmentMap
} from './rule-utils.mjs';

function compareScore(left, right) {
  if (!right) return -1;
  for (let index = 0; index < left.numeric.length; index += 1) {
    if (left.numeric[index] !== right.numeric[index]) {
      return left.numeric[index] - right.numeric[index];
    }
  }
  return left.canonical.localeCompare(right.canonical);
}

function variance(values) {
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - average) ** 2), 0);
}

function summarizeRoleCoverage(roles) {
  const targetDistinctCount = roles.reduce(
    (sum, role) => sum + role.targetDistinctCount,
    0
  );
  const achievedDistinctCount = roles.reduce(
    (sum, role) => sum + role.achievedDistinctCount,
    0
  );
  return {
    targetDistinctCount,
    achievedDistinctCount,
    shortfall: Math.max(0, targetDistinctCount - achievedDistinctCount),
    coverageRate: targetDistinctCount
      ? achievedDistinctCount / targetDistinctCount
      : 1,
    roles
  };
}

export function optimizeSchedule({
  targetSlots = [],
  people = [],
  rules = [],
  lockedKeys = [],
  lockedAssignments = {},
  baselineAssignments = {},
  childrenReadOnlyReservations = {},
  childrenAssignments = {},
  draftAssignments = {},
  requiredDraftAssignments = {},
  personTargets = [],
  candidateMatrix,
  timeLimitMs,
  timeoutMs,
  nodeLimit = 250000,
  signal,
  now = () => performance.now()
} = {}) {
  const budgetMs = timeLimitMs ?? timeoutMs ?? 2000;
  const startedAt = now();
  const safetyMargin = Math.min(25, Math.max(0, budgetMs * 0.02));
  const deadline = startedAt + Math.max(0, budgetMs - safetyMargin);
  const draft = toAssignmentMap(draftAssignments);
  const requiredDraft = toAssignmentMap(requiredDraftAssignments);
  const baseResult = (status, extra = {}) => ({
    success: false,
    status,
    assignments: {},
    unfilled: [],
    repairSummary: {
      draftCells: Object.values(draft).filter(Boolean).length,
      changedByOptimizer: 0,
      changeRate: 0
    },
    roleCoverageSummary: summarizeRoleCoverage([]),
    metrics: {
      nodes: 0,
      elapsedMs: Math.max(0, now() - startedAt),
      firstIncumbentMs: null
    },
    ...extra
  });
  if (signal?.aborted) return baseResult('CANCELED');
  if (budgetMs <= 0) return baseResult('SOLVER_TIMEOUT_NO_INCUMBENT');

  const matrix = candidateMatrix || generateCandidateMatrix({
    targetSlots,
    people,
    rules,
    lockedKeys,
    lockedAssignments,
    baselineAssignments,
    childrenReadOnlyReservations
  });
  const lockedSet = new Set(lockedKeys);
  const variables = matrix
    .filter((cell) => !lockedSet.has(cell.key))
    .map((cell) => ({
      ...cell,
      domain: requiredDraft[cell.key]
        ? cell.eligible.includes(requiredDraft[cell.key])
          ? [requiredDraft[cell.key]]
          : []
        : cell.required === false
          ? [...cell.eligible, null]
          : [...cell.eligible]
    }));
  const impossible = variables.filter((cell) => cell.required && !cell.domain.length);
  if (impossible.length) {
    return baseResult('HARD_UNSAT', {
      conflicts: impossible.map((cell) => ({
        code: 'NO_LEGAL_CANDIDATE',
        cellKey: cell.key,
        excluded: cell.excluded
      }))
    });
  }

  const protectedAssignments = { ...baselineAssignments, ...lockedAssignments };
  const protectedRecords = assignmentRecords(protectedAssignments);
  const usedPeople = new Map();
  const usedRoles = new Map();
  const rolePersonCounts = new Map();
  const remainingDraftRoleCounts = new Map();
  const rolePersonKey = (roleId, personId) => `${roleId}__${personId}`;
  for (const record of protectedRecords) {
    const peopleOnDate = usedPeople.get(record.date) || new Set();
    peopleOnDate.add(record.personId);
    usedPeople.set(record.date, peopleOnDate);
    const rolesOnDate = usedRoles.get(record.date) || new Set();
    rolesOnDate.add(record.roleId);
    usedRoles.set(record.date, rolesOnDate);
    const coverageKey = rolePersonKey(record.roleId, record.personId);
    rolePersonCounts.set(
      coverageKey,
      (rolePersonCounts.get(coverageKey) || 0) + 1
    );
  }
  for (const variable of variables) {
    const draftPersonId = draft[variable.key];
    if (!draftPersonId || !variable.domain.includes(draftPersonId)) continue;
    const coverageKey = rolePersonKey(variable.roleId, draftPersonId);
    remainingDraftRoleCounts.set(
      coverageKey,
      (remainingDraftRoleCounts.get(coverageKey) || 0) + 1
    );
  }
  for (const [date, personIds] of Object.entries(childrenReadOnlyReservations)) {
    const peopleOnDate = usedPeople.get(date) || new Set();
    for (const personId of personIds || []) peopleOnDate.add(personId);
    usedPeople.set(date, peopleOnDate);
  }

  const limits = rules.filter((rule) => rule.type === 'limit');
  const exclusivePeople = rules.filter((rule) => rule.type === 'exclusive_person');
  const exclusiveRoles = rules.filter((rule) => rule.type === 'exclusive_role');
  const childRecords = Object.entries(childrenReadOnlyReservations).flatMap(
    ([date, personIds]) => (personIds || []).map((personId) => ({
      date,
      roleId: null,
      personId,
      section: 'children'
    }))
  );
  const limitCounts = new Map(limits.map((rule) => {
    const source = rule.scope === 'global'
      ? [...protectedRecords, ...childRecords]
      : protectedRecords;
    return [rule.ruleId, source.filter((record) => (
      record.personId === rule.personId
      && (!rule.roleId || record.roleId === rule.roleId)
      && isDateInPeriod(record.date, rule.period)
    )).length];
  }));
  const initialLoads = calculateLoad({
    people,
    rules,
    candidateMatrix: matrix,
    baselineAssignments: protectedAssignments,
    childrenReadOnlyReservations,
    personTargets
  });
  const plannedCounts = new Map(Object.keys(initialLoads).map((personId) => [personId, 0]));
  const assignments = {};

  function dynamicViolation(variable, personId) {
    if (personId === null) return false;
    if (usedPeople.get(variable.date)?.has(personId)) return true;
    for (const rule of limits) {
      if (rule.personId === personId
        && (!rule.roleId || rule.roleId === variable.roleId)
        && isDateInPeriod(variable.date, rule.period)
        && (limitCounts.get(rule.ruleId) || 0) + 1 > rule.maxCount) return true;
    }
    for (const rule of exclusivePeople) {
      if (!rule.personIds?.includes(personId)) continue;
      const other = rule.personIds.find((id) => id !== personId);
      if (usedPeople.get(variable.date)?.has(other)) return true;
    }
    for (const rule of exclusiveRoles) {
      if (!rule.roleIds?.includes(variable.roleId)) continue;
      if (rule.roleIds.some((roleId) => (
        roleId !== variable.roleId && usedRoles.get(variable.date)?.has(roleId)
      ))) return true;
    }
    return false;
  }
  const domainFor = (variable) => variable.domain.filter((personId) => (
    !dynamicViolation(variable, personId)
  ));
  function softWeight(variable, personId) {
    const ids = variable.softRuleIdsByPerson
      ?.find((entry) => entry.personId === personId)?.ruleIds || [];
    return ids.reduce((sum, ruleId) => {
      const rule = rules.find((item) => item.ruleId === ruleId);
      return sum + (rule?.weight || (rule?.type === 'preferred' ? 2 : 1));
    }, 0);
  }
  function orderedDomain(variable, domain) {
    return [...domain].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      const draftA = draft[variable.key] === a ? 1 : 0;
      const draftB = draft[variable.key] === b ? 1 : 0;
      const softA = softWeight(variable, a);
      const softB = softWeight(variable, b);
      if (softA !== softB) return softB - softA;
      const coverageKeyA = rolePersonKey(variable.roleId, a);
      const coverageKeyB = rolePersonKey(variable.roleId, b);
      const uncoveredA = !rolePersonCounts.has(coverageKeyA);
      const uncoveredB = !rolePersonCounts.has(coverageKeyB);
      const remainingDraftA = remainingDraftRoleCounts.get(coverageKeyA) || 0;
      const remainingDraftB = remainingDraftRoleCounts.get(coverageKeyB) || 0;
      const preservesUniqueDraftCoverageA =
        draftA && uncoveredA && remainingDraftA === 1 ? 1 : 0;
      const preservesUniqueDraftCoverageB =
        draftB && uncoveredB && remainingDraftB === 1 ? 1 : 0;
      if (preservesUniqueDraftCoverageA !== preservesUniqueDraftCoverageB) {
        return preservesUniqueDraftCoverageB - preservesUniqueDraftCoverageA;
      }
      const needsNewCoverageA =
        uncoveredA && remainingDraftA === 0 ? 1 : 0;
      const needsNewCoverageB =
        uncoveredB && remainingDraftB === 0 ? 1 : 0;
      if (needsNewCoverageA !== needsNewCoverageB) {
        return needsNewCoverageB - needsNewCoverageA;
      }
      if (draftA !== draftB) return draftB - draftA;
      const loadA = initialLoads[a];
      const loadB = initialLoads[b];
      const gapA = (loadA?.periodTarget || 0)
        - (loadA?.baselineServiceCount || 0)
        - (plannedCounts.get(a) || 0);
      const gapB = (loadB?.periodTarget || 0)
        - (loadB?.baselineServiceCount || 0)
        - (plannedCounts.get(b) || 0);
      if (gapA !== gapB) return gapB - gapA;
      const projectedA = (
        (loadA?.baselineServiceCount || 0) + (plannedCounts.get(a) || 0) + 1
      ) / Math.max(loadA?.opportunityWeight || 0, 0.25);
      const projectedB = (
        (loadB?.baselineServiceCount || 0) + (plannedCounts.get(b) || 0) + 1
      ) / Math.max(loadB?.opportunityWeight || 0, 0.25);
      return projectedA - projectedB || a.localeCompare(b);
    });
  }
  function apply(variable, personId) {
    const draftPersonId = draft[variable.key];
    if (draftPersonId && variable.domain.includes(draftPersonId)) {
      const draftCoverageKey = rolePersonKey(variable.roleId, draftPersonId);
      const nextDraftCount =
        (remainingDraftRoleCounts.get(draftCoverageKey) || 1) - 1;
      if (nextDraftCount > 0) {
        remainingDraftRoleCounts.set(draftCoverageKey, nextDraftCount);
      } else {
        remainingDraftRoleCounts.delete(draftCoverageKey);
      }
    }
    assignments[variable.key] = personId;
    if (personId === null) return;
    const peopleOnDate = usedPeople.get(variable.date) || new Set();
    peopleOnDate.add(personId);
    usedPeople.set(variable.date, peopleOnDate);
    const rolesOnDate = usedRoles.get(variable.date) || new Set();
    rolesOnDate.add(variable.roleId);
    usedRoles.set(variable.date, rolesOnDate);
    const coverageKey = rolePersonKey(variable.roleId, personId);
    rolePersonCounts.set(
      coverageKey,
      (rolePersonCounts.get(coverageKey) || 0) + 1
    );
    plannedCounts.set(personId, (plannedCounts.get(personId) || 0) + 1);
    for (const rule of limits) {
      if (rule.personId === personId
        && (!rule.roleId || rule.roleId === variable.roleId)
        && isDateInPeriod(variable.date, rule.period)) {
        limitCounts.set(rule.ruleId, (limitCounts.get(rule.ruleId) || 0) + 1);
      }
    }
  }
  function undo(variable, personId) {
    delete assignments[variable.key];
    if (personId !== null) {
      usedPeople.get(variable.date)?.delete(personId);
      if (!usedPeople.get(variable.date)?.size) usedPeople.delete(variable.date);
      usedRoles.get(variable.date)?.delete(variable.roleId);
      if (!usedRoles.get(variable.date)?.size) usedRoles.delete(variable.date);
      const coverageKey = rolePersonKey(variable.roleId, personId);
      const nextCoverageCount = (rolePersonCounts.get(coverageKey) || 1) - 1;
      if (nextCoverageCount > 0) {
        rolePersonCounts.set(coverageKey, nextCoverageCount);
      } else {
        rolePersonCounts.delete(coverageKey);
      }
      plannedCounts.set(personId, (plannedCounts.get(personId) || 1) - 1);
      for (const rule of limits) {
        if (rule.personId === personId
          && (!rule.roleId || rule.roleId === variable.roleId)
          && isDateInPeriod(variable.date, rule.period)) {
          limitCounts.set(rule.ruleId, (limitCounts.get(rule.ruleId) || 1) - 1);
        }
      }
    }
    const draftPersonId = draft[variable.key];
    if (draftPersonId && variable.domain.includes(draftPersonId)) {
      const draftCoverageKey = rolePersonKey(variable.roleId, draftPersonId);
      remainingDraftRoleCounts.set(
        draftCoverageKey,
        (remainingDraftRoleCounts.get(draftCoverageKey) || 0) + 1
      );
    }
  }

  function score(solution) {
    const loads = Object.values(calculateLoad({
      people,
      rules,
      candidateMatrix: matrix,
      baselineAssignments: protectedAssignments,
      childrenReadOnlyReservations,
      plannedAssignments: solution,
      personTargets
    }));
    const guardrail = loads.reduce((sum, load) => (
      sum + Math.max(0, load.assignedCount - load.periodTarget - 1)
    ), 0);
    const draftVariables = variables.filter((variable) => draft[variable.key]);
    const changes = draftVariables.filter((variable) => (
      solution[variable.key] !== draft[variable.key]
    )).length;
    const roleCoverage = calculateRoleCoverage({
      candidateMatrix: matrix,
      baselineAssignments: protectedAssignments,
      plannedAssignments: solution
    });
    const roleCoverageShortfall = roleCoverage.reduce(
      (sum, role) => sum + role.shortfall,
      0
    );
    const gap = loads.reduce((sum, load) => sum + Math.abs(load.targetGap), 0);
    const loadVariance = Number(variance(loads.map((load) => load.normalizedLoad)).toFixed(6));
    return {
      numeric: [guardrail, roleCoverageShortfall, changes, gap, loadVariance],
      canonical: JSON.stringify(Object.entries(solution).sort(([a], [b]) => a.localeCompare(b)))
    };
  }

  let nodes = 0;
  let firstIncumbentMs = null;
  let best = null;
  let bestScore = null;
  let stopReason = null;
  let constructiveFailure = null;
  function shouldStop() {
    if (signal?.aborted) stopReason = 'CANCELED';
    else if (now() >= deadline) stopReason = 'DEADLINE';
    else if (nodes >= nodeLimit) stopReason = 'NODE_LIMIT';
    return Boolean(stopReason);
  }
  function recordIncumbent(proposed) {
    const validation = validateSchedule({
      assignments: proposed,
      targetSlots,
      people,
      rules,
      lockedKeys,
      lockedAssignments,
      baselineAssignments,
      childrenReadOnlyReservations,
      childrenAssignments
    });
    if (!validation.valid) {
      constructiveFailure = {
        stage: 'validation',
        conflicts: validation.conflicts.slice(0, 20)
      };
      return false;
    }
    const candidateScore = score(proposed);
    if (compareScore(candidateScore, bestScore) < 0) {
      best = { ...proposed };
      bestScore = candidateScore;
      if (firstIncumbentMs === null) firstIncumbentMs = now() - startedAt;
    }
    return true;
  }

  function buildConstructiveIncumbent() {
    const byDate = new Map();
    for (const variable of variables) {
      const group = byDate.get(variable.date) || [];
      group.push(variable);
      byDate.set(variable.date, group);
    }
    const applied = [];
    function fillDate(remaining) {
      if (shouldStop()) return false;
      nodes += 1;
      if (!remaining.length) return true;
      const domains = remaining.map((variable) => ({
        variable,
        domain: domainFor(variable)
      }));
      if (domains.some(({ variable, domain }) => variable.required && !domain.length)) {
        return false;
      }
      domains.sort((a, b) => (
        a.domain.length - b.domain.length
        || a.variable.roleId.localeCompare(b.variable.roleId)
      ));
      const selected = domains[0];
      const next = remaining.filter((variable) => variable.key !== selected.variable.key);
      for (const personId of orderedDomain(selected.variable, selected.domain)) {
        if (shouldStop()) return false;
        apply(selected.variable, personId);
        applied.push([selected.variable, personId]);
        const deadEnd = next.some((variable) => (
          variable.required && !domainFor(variable).length
        ));
        if (!deadEnd && fillDate(next)) return true;
        applied.pop();
        undo(selected.variable, personId);
      }
      return false;
    }

    let complete = true;
    for (const [date, dateVariables] of [...byDate.entries()].sort(([a], [b]) => (
      a.localeCompare(b)
    ))) {
      if (!fillDate(dateVariables)) {
        complete = false;
        constructiveFailure = { stage: 'date-matching', date };
        break;
      }
    }
    if (complete) {
      const proposed = Object.fromEntries(
        Object.entries(assignments).filter(([, personId]) => Boolean(personId))
      );
      recordIncumbent(proposed);
    }
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      undo(applied[index][0], applied[index][1]);
    }
  }

  function search(remaining) {
    if (shouldStop()) return;
    nodes += 1;
    if (!remaining.length) {
      const proposed = Object.fromEntries(
        Object.entries(assignments).filter(([, personId]) => Boolean(personId))
      );
      if (!recordIncumbent(proposed)) return;
      if (bestScore?.numeric.every((value) => value === 0)) {
        stopReason = 'PROVEN_LOWER_BOUND';
      }
      return;
    }
    const domains = remaining.map((variable) => ({
      variable,
      domain: domainFor(variable)
    }));
    if (domains.some(({ variable, domain }) => variable.required && !domain.length)) return;
    domains.sort((a, b) => (
      a.domain.length - b.domain.length
      || a.variable.date.localeCompare(b.variable.date)
      || a.variable.roleId.localeCompare(b.variable.roleId)
    ));
    const selected = domains[0];
    const next = remaining.filter((variable) => variable.key !== selected.variable.key);
    for (const personId of orderedDomain(selected.variable, selected.domain)) {
      if (shouldStop() || stopReason === 'PROVEN_LOWER_BOUND') return;
      apply(selected.variable, personId);
      const deadEnd = next.some((variable) => variable.required && !domainFor(variable).length);
      if (!deadEnd) search(next);
      undo(selected.variable, personId);
    }
  }
  buildConstructiveIncumbent();
  if (stopReason === 'DEADLINE' && best) stopReason = null;
  search(variables);

  const elapsedMs = Math.max(0, now() - startedAt);
  if (stopReason === 'CANCELED') {
    return {
      ...baseResult('CANCELED'),
      metrics: { nodes, elapsedMs, firstIncumbentMs, constructiveFailure }
    };
  }
  if (!best) {
    const status = stopReason === 'DEADLINE'
      ? 'SOLVER_TIMEOUT_NO_INCUMBENT'
      : stopReason === 'NODE_LIMIT'
        ? 'SOLVER_NODE_LIMIT_NO_INCUMBENT'
        : 'HARD_UNSAT';
    return {
      ...baseResult(status),
      metrics: { nodes, elapsedMs, firstIncumbentMs, constructiveFailure }
    };
  }

  const unfilled = variables.filter((variable) => !best[variable.key]).map((variable) => ({
    date: variable.date,
    roleId: variable.roleId,
    reasonCode: variable.eligible.length ? 'OPTIONAL_NOT_SELECTED' : 'NO_LEGAL_CANDIDATE'
  }));
  const draftCells = variables.filter((variable) => draft[variable.key]).length;
  const changed = variables.filter((variable) => (
    draft[variable.key] && best[variable.key] !== draft[variable.key]
  )).length;
  const roleCoverageSummary = summarizeRoleCoverage(calculateRoleCoverage({
    candidateMatrix: matrix,
    baselineAssignments: protectedAssignments,
    plannedAssignments: best
  }));
  return {
    success: true,
    status: ['DEADLINE', 'NODE_LIMIT'].includes(stopReason)
      ? 'BEST_BEFORE_DEADLINE'
      : 'OPTIMAL',
    assignments: best,
    unfilled,
    score: bestScore.numeric,
    roleCoverageSummary,
    repairSummary: {
      draftCells,
      changedByOptimizer: changed,
      changeRate: draftCells ? changed / draftCells : 0
    },
    metrics: { nodes, elapsedMs, firstIncumbentMs, constructiveFailure }
  };
}
