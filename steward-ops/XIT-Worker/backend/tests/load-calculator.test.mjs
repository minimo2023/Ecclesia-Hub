import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateDeterministicTargets,
  calculateLoad,
  calculateRoleCoverage
} from '../scheduling/load-calculator.mjs';

const people = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
const matrix = [
  { date: '2026-08-09', roleId: 'r1', required: true, eligible: ['p1', 'p2'] },
  { date: '2026-08-09', roleId: 'r2', required: true, eligible: ['p1'] },
  { date: '2026-08-23', roleId: 'r1', required: true, eligible: ['p1', 'p2', 'p3'] }
];

describe('load-calculator 2.1 contract', () => {
  it('counts main and children baseline once per date', () => {
    const loads = calculateLoad({
      people,
      candidateMatrix: matrix,
      baselineAssignments: { '2026-08-02__r1': 'p1' },
      childrenReadOnlyReservations: { '2026-08-16': ['p1', 'p2'] },
      plannedAssignments: { '2026-08-09__r1': 'p2' }
    });
    assert.equal(loads.p1.baselineServiceCount, 2);
    assert.equal(loads.p2.assignedCount, 2);
  });

  it('caps opportunity weight at one per person and date', () => {
    const loads = calculateLoad({ people, candidateMatrix: matrix });
    assert.equal(loads.p1.opportunityWeight, 1.333333);
    assert.equal(loads.p2.opportunityWeight, 0.833333);
    assert.equal(loads.p3.opportunityWeight, 0.333333);
  });

  it('allocates deterministic targets to the required total', () => {
    const targets = allocateDeterministicTargets({ people, candidateMatrix: matrix });
    assert.equal(
      Object.values(targets).reduce((sum, target) => sum + target.plannedTarget, 0),
      3
    );
  });

  it('calculates the attainable distinct-person target for each role', () => {
    const coverage = calculateRoleCoverage({
      candidateMatrix: [
        { date: '2026-08-02', roleId: 'r1', required: true, eligible: ['p1', 'p2', 'p3'] },
        { date: '2026-08-09', roleId: 'r1', required: true, eligible: ['p1', 'p2', 'p3'] }
      ],
      plannedAssignments: {
        '2026-08-02__r1': 'p1',
        '2026-08-09__r1': 'p2'
      }
    });

    assert.equal(coverage[0].eligiblePersonCount, 3);
    assert.equal(coverage[0].targetDistinctCount, 2);
    assert.equal(coverage[0].achievedDistinctCount, 2);
    assert.equal(coverage[0].shortfall, 0);
    assert.deepEqual(coverage[0].uncoveredPersonIds, ['p3']);
  });

  it('reserves a minimum slot for rule-priority people before general balancing', () => {
    const rules = [{
      ruleId: 'only-p3',
      type: 'only_available',
      personId: 'p3',
      dates: ['2026-08-23']
    }];
    const targets = allocateDeterministicTargets({
      people,
      candidateMatrix: matrix,
      rules
    });
    const loads = calculateLoad({
      people,
      candidateMatrix: matrix,
      rules,
      personTargets: [{ personId: 'p3', periodTarget: 0 }]
    });

    assert.equal(targets.p3.rulePriorityMinimum, 1);
    assert.equal(targets.p3.plannedTarget, 1);
    assert.equal(loads.p3.periodTarget, 1);
    assert.equal(loads.p3.targetClamped, true);
    assert.equal(
      Object.values(targets).reduce(
        (sum, target) => sum + target.plannedTarget,
        0
      ),
      3
    );
  });

  it('clamps LLM targets and distinguishes main from global limits', () => {
    const main = calculateLoad({
      people,
      candidateMatrix: matrix,
      childrenReadOnlyReservations: { '2026-08-02': ['p1'] },
      personTargets: [{ personId: 'p1', periodTarget: 99 }],
      rules: [{
        ruleId: 'limit-main',
        type: 'limit',
        scope: 'main',
        personId: 'p1',
        maxCount: 1,
        period: { start: '2026-08-01', end: '2026-08-31' }
      }]
    });
    const global = calculateLoad({
      people,
      candidateMatrix: matrix,
      childrenReadOnlyReservations: { '2026-08-02': ['p1'] },
      rules: [{
        ruleId: 'limit-global',
        type: 'limit',
        scope: 'global',
        personId: 'p1',
        maxCount: 1,
        period: { start: '2026-08-01', end: '2026-08-31' }
      }]
    });
    assert.equal(main.p1.remainingCapacity, 1);
    assert.equal(main.p1.targetClamped, true);
    assert.equal(global.p1.remainingCapacity, 0);
  });
});
