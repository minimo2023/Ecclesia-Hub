function cellKey(date, roleId) {
  return `${date}__${roleId}`;
}

function endpointKey(endpoint) {
  return `${endpoint.section}:${endpoint.personId}:${endpoint.roleId}`;
}

function dateMatchesRule(date, rule) {
  if (rule.date) return rule.date === date;
  if (Array.isArray(rule.dates)) return rule.dates.includes(date);
  if (rule.dateRange) {
    return date >= rule.dateRange.start && date <= rule.dateRange.end;
  }
  return true;
}

function dateMatchesPeriod(date, period) {
  if (typeof period === 'string') return date.startsWith(`${period}-`);
  return Boolean(period && date >= period.start && date <= period.end);
}

function rolesMatch(ruleRoleId, assignmentRoleId) {
  return !ruleRoleId || ruleRoleId === assignmentRoleId;
}

function addConflict(conflicts, seen, code, message, details = {}) {
  const fingerprint = JSON.stringify([code, details]);
  if (seen.has(fingerprint)) return;
  seen.add(fingerprint);
  conflicts.push({ code, message, ...details });
}

function findConditionalCycle(conditionalRules) {
  const graph = new Map();
  const edgeRules = new Map();

  for (const rule of conditionalRules) {
    const from = endpointKey(rule.condition);
    const to = endpointKey(rule.action);
    const neighbours = graph.get(from) || [];
    neighbours.push(to);
    graph.set(from, neighbours);
    const edgeKey = `${from}->${to}`;
    const ruleIds = edgeRules.get(edgeKey) || [];
    ruleIds.push(rule.ruleId);
    edgeRules.set(edgeKey, ruleIds);
    if (!graph.has(to)) graph.set(to, []);
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(node) {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      const nodes = [...stack.slice(cycleStart), node];
      const ruleIds = [];
      for (let index = 0; index < nodes.length - 1; index += 1) {
        ruleIds.push(...(edgeRules.get(`${nodes[index]}->${nodes[index + 1]}`) || []));
      }
      return { nodes, ruleIds: [...new Set(ruleIds)] };
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    stack.push(node);
    for (const neighbour of graph.get(node) || []) {
      const cycle = visit(neighbour);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function buildRequiredAssignments(fixedRules, lockedAssignments) {
  const records = new Map();
  for (const rule of fixedRules) {
    records.set(cellKey(rule.date, rule.roleId), {
      date: rule.date,
      roleId: rule.roleId,
      personId: rule.personId,
      ruleIds: [rule.ruleId]
    });
  }
  for (const [key, personId] of Object.entries(lockedAssignments || {})) {
    if (!personId) continue;
    const match = /^(\d{4}-\d{2}-\d{2})__(.+)$/.exec(key);
    if (!match) continue;
    if (records.has(key)) {
      const record = records.get(key);
      record.ruleIds.push('locked-cell');
      continue;
    }
    records.set(key, {
      date: match[1],
      roleId: match[2],
      personId,
      ruleIds: ['locked-cell']
    });
  }
  return [...records.values()];
}

function isChildrenActionSatisfied(rule, existingAssignments) {
  if (!rule.date) return false;
  const key = cellKey(rule.date, rule.action.roleId);
  return existingAssignments?.[key] === rule.action.personId;
}

export function checkPreflightConflicts({
  normalizedRules = [],
  lockedAssignments = {},
  lockedKeys = [],
  childrenReadOnlyReservations = {},
  existingAssignments = {},
  people = []
} = {}) {
  const conflicts = [];
  const seen = new Set();
  const rules = Array.isArray(normalizedRules) ? normalizedRules : [];
  const peopleById = new Map(
    (people || [])
      .filter((person) => person && (person.id || person.personId))
      .map((person) => [person.id || person.personId, person])
  );
  const lockedKeySet = new Set(lockedKeys || []);
  const fixedRules = rules.filter((rule) => rule.type === 'fixed_assignment');
  const unavailableRules = rules.filter((rule) => rule.type === 'unavailable');
  const onlyAvailableRules = rules.filter((rule) => rule.type === 'only_available');
  const limitRules = rules.filter((rule) => rule.type === 'limit');
  const exclusivePersonRules = rules.filter((rule) => rule.type === 'exclusive_person');
  const conditionalRules = rules.filter((rule) => rule.type === 'conditional');
  const forceRoleRules = rules.filter((rule) => rule.type === 'force_role');

  const fixedByPersonDate = new Map();
  const fixedByCell = new Map();
  for (const rule of fixedRules) {
    const personDate = `${rule.personId}__${rule.date}`;
    const personDateRules = fixedByPersonDate.get(personDate) || [];
    personDateRules.push(rule);
    fixedByPersonDate.set(personDate, personDateRules);

    const key = cellKey(rule.date, rule.roleId);
    const cellRules = fixedByCell.get(key) || [];
    cellRules.push(rule);
    fixedByCell.set(key, cellRules);
  }

  for (const [personDate, personDateRules] of fixedByPersonDate) {
    const roleIds = [...new Set(personDateRules.map((rule) => rule.roleId))];
    if (roleIds.length > 1) {
      addConflict(
        conflicts,
        seen,
        'MULTIPLE_FIXED_ROLES',
        `${personDateRules[0].personId} 在 ${personDateRules[0].date} 被固定到多個職位`,
        {
          personId: personDateRules[0].personId,
          date: personDateRules[0].date,
          roleIds,
          ruleIds: personDateRules.map((rule) => rule.ruleId)
        }
      );
    }
  }

  for (const [key, cellRules] of fixedByCell) {
    const personIds = [...new Set(cellRules.map((rule) => rule.personId))];
    if (personIds.length > 1) {
      addConflict(
        conflicts,
        seen,
        'MULTIPLE_FIXED_PEOPLE',
        `${key} 被固定給多位人員`,
        {
          cellKey: key,
          personIds,
          ruleIds: cellRules.map((rule) => rule.ruleId)
        }
      );
    }
  }

  for (const fixedRule of fixedRules) {
    const key = cellKey(fixedRule.date, fixedRule.roleId);
    for (const unavailableRule of unavailableRules) {
      if (fixedRule.personId === unavailableRule.personId
        && rolesMatch(unavailableRule.roleId, fixedRule.roleId)
        && dateMatchesRule(fixedRule.date, unavailableRule)) {
        addConflict(
          conflicts,
          seen,
          'FIXED_UNAVAILABLE_CONFLICT',
          `${fixedRule.personId} 的固定指派與不可排規則衝突`,
          {
            personId: fixedRule.personId,
            date: fixedRule.date,
            roleId: fixedRule.roleId,
            cellKey: key,
            ruleIds: [fixedRule.ruleId, unavailableRule.ruleId]
          }
        );
      }
    }

    if (lockedKeySet.has(key)) {
      const lockedPersonId = lockedAssignments?.[key];
      if (!lockedPersonId) {
        addConflict(
          conflicts,
          seen,
          'FIXED_BLANK_LOCK',
          `${key} 是空白鎖定格，不能套用固定指派`,
          {
            cellKey: key,
            personId: fixedRule.personId,
            ruleIds: [fixedRule.ruleId, 'locked-cell']
          }
        );
      } else if (lockedPersonId !== fixedRule.personId) {
        addConflict(
          conflicts,
          seen,
          'FIXED_LOCKED_CONFLICT',
          `${key} 的鎖定人員與固定指派不同`,
          {
            cellKey: key,
            fixedPersonId: fixedRule.personId,
            lockedPersonId,
            ruleIds: [fixedRule.ruleId, 'locked-cell']
          }
        );
      }
    }

    const person = peopleById.get(fixedRule.personId);
    if (!person) {
      addConflict(
        conflicts,
        seen,
        'FIXED_UNKNOWN_PERSON',
        `固定指派使用未知人員 ID：${fixedRule.personId}`,
        {
          personId: fixedRule.personId,
          ruleIds: [fixedRule.ruleId]
        }
      );
    } else {
      const qualifiedRoleIds = person.roleIds || person.categories || [];
      if (!qualifiedRoleIds.includes(fixedRule.roleId)) {
        addConflict(
          conflicts,
          seen,
          'FIXED_LACKS_QUALIFICATION',
          `${fixedRule.personId} 不具備 ${fixedRule.roleId} 資格`,
          {
            personId: fixedRule.personId,
            roleId: fixedRule.roleId,
            ruleIds: [fixedRule.ruleId]
          }
        );
      }
    }

    for (const onlyAvailableRule of onlyAvailableRules) {
      if (onlyAvailableRule.personId === fixedRule.personId
        && rolesMatch(onlyAvailableRule.roleId, fixedRule.roleId)
        && !dateMatchesRule(fixedRule.date, onlyAvailableRule)) {
        addConflict(
          conflicts,
          seen,
          'FIXED_OUTSIDE_ONLY_AVAILABLE',
          `${fixedRule.personId} 的固定日期不在 only_available 範圍內`,
          {
            personId: fixedRule.personId,
            date: fixedRule.date,
            roleId: fixedRule.roleId,
            ruleIds: [fixedRule.ruleId, onlyAvailableRule.ruleId]
          }
        );
      }
    }

    if ((childrenReadOnlyReservations?.[fixedRule.date] || []).includes(fixedRule.personId)) {
      addConflict(
        conflicts,
        seen,
        'FIXED_CHILDREN_RESERVATION_CONFLICT',
        `${fixedRule.personId} 在 ${fixedRule.date} 已被兒主排定`,
        {
          personId: fixedRule.personId,
          date: fixedRule.date,
          roleId: fixedRule.roleId,
          ruleIds: [fixedRule.ruleId, 'children-read-only-reservation']
        }
      );
    }
  }

  const requiredAssignments = buildRequiredAssignments(fixedRules, lockedAssignments);
  for (const limitRule of limitRules) {
    const matchingAssignments = requiredAssignments.filter((assignment) => (
      assignment.personId === limitRule.personId
      && rolesMatch(limitRule.roleId, assignment.roleId)
      && dateMatchesPeriod(assignment.date, limitRule.period)
    ));
    if (matchingAssignments.length > limitRule.maxCount) {
      addConflict(
        conflicts,
        seen,
        'LIMIT_BELOW_REQUIRED_COUNT',
        `${limitRule.personId} 的必要指派已超過 limit`,
        {
          personId: limitRule.personId,
          maxCount: limitRule.maxCount,
          requiredCount: matchingAssignments.length,
          cells: matchingAssignments.map((assignment) => cellKey(
            assignment.date,
            assignment.roleId
          )),
          ruleIds: [
            limitRule.ruleId,
            ...matchingAssignments.flatMap((assignment) => assignment.ruleIds)
          ]
        }
      );
    }
  }

  for (const exclusiveRule of exclusivePersonRules) {
    const [firstPersonId, secondPersonId] = exclusiveRule.personIds || [];
    if (!firstPersonId || !secondPersonId) continue;
    const firstDates = new Set(
      requiredAssignments
        .filter((assignment) => assignment.personId === firstPersonId)
        .map((assignment) => assignment.date)
    );
    for (const assignment of requiredAssignments) {
      if (assignment.personId === secondPersonId && firstDates.has(assignment.date)) {
        addConflict(
          conflicts,
          seen,
          'EXCLUSIVE_FIXED_CONFLICT',
          `互斥人員在 ${assignment.date} 同時具有必要指派`,
          {
            date: assignment.date,
            personIds: [firstPersonId, secondPersonId],
            ruleIds: [exclusiveRule.ruleId]
          }
        );
      }
    }
  }

  for (const forceRoleRule of forceRoleRules) {
    const key = cellKey(forceRoleRule.date, forceRoleRule.roleId);
    if (lockedKeySet.has(key) && !lockedAssignments?.[key]) {
      addConflict(
        conflicts,
        seen,
        'FORCE_ROLE_BLANK_LOCK',
        `${key} 同時是強制開啟職位與空白鎖定格`,
        {
          cellKey: key,
          ruleIds: [forceRoleRule.ruleId, 'locked-cell']
        }
      );
    }
  }

  const cycle = findConditionalCycle(conditionalRules);
  if (cycle) {
    addConflict(
      conflicts,
      seen,
      'CONDITIONAL_CYCLE',
      'conditional 規則形成硬性循環依賴',
      {
        nodes: cycle.nodes,
        ruleIds: cycle.ruleIds
      }
    );
  }

  for (const conditionalRule of conditionalRules) {
    if (conditionalRule.condition?.section === 'main'
      && conditionalRule.action?.section === 'children'
      && !isChildrenActionSatisfied(conditionalRule, existingAssignments)) {
      addConflict(
        conflicts,
        seen,
        'MANUAL_CHILDREN_ACTION_REQUIRED',
        'conditional 的兒主動作尚未由人工完成',
        {
          date: conditionalRule.date || null,
          action: conditionalRule.action,
          ruleIds: [conditionalRule.ruleId]
        }
      );
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    errors: conflicts
  };
}
