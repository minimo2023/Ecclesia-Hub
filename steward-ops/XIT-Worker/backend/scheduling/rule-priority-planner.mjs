export function buildRulePriorityReservations({
  candidateMatrix = [],
  loadSummary = {}
} = {}) {
  const requirements = Object.values(loadSummary)
    .filter((load) => load.rulePriorityMinimum > 0)
    .map((load) => {
      const priorityCells = candidateMatrix
        .map((cell, cellIndex) => ({
          cell,
          cellIndex,
          priority: cell.priorityRuleIdsByPerson?.some(
            (entry) => entry.personId === load.personId
          )
        }))
        .filter(({ cell }) => cell.eligible.includes(load.personId))
        .sort((left, right) => (
          Number(right.priority) - Number(left.priority)
          || right.cell.eligible.length - left.cell.eligible.length
          || left.cell.date.localeCompare(right.cell.date)
          || left.cell.roleId.localeCompare(right.cell.roleId)
        ));
      return {
        personId: load.personId,
        minimumAssignments: load.rulePriorityMinimum,
        ruleTypes: load.rulePriorityTypes || [],
        candidates: priorityCells
      };
    })
    .sort((left, right) => (
      left.candidates.length - right.candidates.length
      || right.minimumAssignments - left.minimumAssignments
      || left.personId.localeCompare(right.personId)
    ));

  const tasks = requirements.flatMap((requirement) => (
    Array.from({ length: requirement.minimumAssignments }, (_, occurrence) => ({
      ...requirement,
      occurrence
    }))
  )).sort((left, right) => (
    left.candidates.length - right.candidates.length
    || left.personId.localeCompare(right.personId)
    || left.occurrence - right.occurrence
  ));
  const selectedCells = new Set();
  const selectedDatesByPerson = new Map();
  const reservations = [];

  function assign(taskIndex) {
    if (taskIndex >= tasks.length) return true;
    const task = tasks[taskIndex];
    const usedDates = selectedDatesByPerson.get(task.personId) || new Set();
    for (const candidate of task.candidates) {
      if (
        selectedCells.has(candidate.cellIndex)
        || usedDates.has(candidate.cell.date)
      ) {
        continue;
      }
      selectedCells.add(candidate.cellIndex);
      usedDates.add(candidate.cell.date);
      selectedDatesByPerson.set(task.personId, usedDates);
      reservations.push({
        cellIndex: candidate.cellIndex,
        date: candidate.cell.date,
        roleId: candidate.cell.roleId,
        personId: task.personId,
        ruleTypes: task.ruleTypes
      });
      if (assign(taskIndex + 1)) return true;
      reservations.pop();
      selectedCells.delete(candidate.cellIndex);
      usedDates.delete(candidate.cell.date);
      if (!usedDates.size) selectedDatesByPerson.delete(task.personId);
    }
    return false;
  }

  const success = assign(0);
  return {
    success,
    reservations: success
      ? [...reservations].sort((left, right) => (
          left.cellIndex - right.cellIndex
        ))
      : [],
    requirementPersonCount: requirements.length,
    requiredAssignmentCount: tasks.length,
    unsatisfiedPeople: success
      ? []
      : requirements
          .filter((requirement) => (
            requirement.candidates.length < requirement.minimumAssignments
          ))
          .map((requirement) => requirement.personId)
  };
}
