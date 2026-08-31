import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRulePriorityReservations } from '../scheduling/rule-priority-planner.mjs';

const matrix = [
  {
    date: '2026-07-05',
    roleId: 'r1',
    eligible: ['priority', 'general'],
    priorityRuleIdsByPerson: [{
      personId: 'priority',
      ruleIds: ['only-1']
    }]
  },
  {
    date: '2026-07-12',
    roleId: 'r1',
    eligible: ['priority', 'general'],
    priorityRuleIdsByPerson: [{
      personId: 'priority',
      ruleIds: ['only-1']
    }]
  }
];

describe('rule priority planner', () => {
  it('reserves a legal cell for every rule-priority minimum', () => {
    const result = buildRulePriorityReservations({
      candidateMatrix: matrix,
      loadSummary: {
        priority: {
          personId: 'priority',
          rulePriorityMinimum: 1,
          rulePriorityTypes: ['only_available']
        },
        general: {
          personId: 'general',
          rulePriorityMinimum: 0,
          rulePriorityTypes: []
        }
      }
    });

    assert.equal(result.success, true);
    assert.equal(result.requirementPersonCount, 1);
    assert.equal(result.reservations.length, 1);
    assert.equal(result.reservations[0].personId, 'priority');
  });

  it('uses different dates when one person has multiple required assignments', () => {
    const result = buildRulePriorityReservations({
      candidateMatrix: matrix,
      loadSummary: {
        priority: {
          personId: 'priority',
          rulePriorityMinimum: 2,
          rulePriorityTypes: ['fixed_assignment']
        }
      }
    });

    assert.equal(result.success, true);
    assert.deepEqual(
      result.reservations.map((item) => item.date).sort(),
      ['2026-07-05', '2026-07-12']
    );
  });

  it('reports an impossible priority requirement before LLM planning', () => {
    const result = buildRulePriorityReservations({
      candidateMatrix: matrix.slice(0, 1),
      loadSummary: {
        priority: {
          personId: 'priority',
          rulePriorityMinimum: 2,
          rulePriorityTypes: ['fixed_assignment']
        }
      }
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.unsatisfiedPeople, ['priority']);
  });
});
