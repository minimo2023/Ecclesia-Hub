import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCandidateMatrix } from '../scheduling/candidate-matrix.mjs';

const people = [
  { id: 'p1', roleIds: ['main-speaker', 'main-leader'] },
  { id: 'p2', roleIds: ['main-piano'] },
  { id: 'p3', roleIds: ['main-speaker', 'main-piano'] }
];
const slots = [
  { date: '2026-08-09', roleId: 'main-speaker', required: true },
  { date: '2026-08-09', roleId: 'main-piano', required: true },
  { date: '2026-08-23', roleId: 'main-speaker', required: true }
];
const reasons = (cell, personId) => (
  cell.excluded.find((entry) => entry.personId === personId)?.reasonCodes || []
);

describe('candidate-matrix 2.1 contract', () => {
  it('uses immutable role qualifications and deterministic IDs', () => {
    const matrix = generateCandidateMatrix({ targetSlots: slots, people });
    assert.deepEqual(matrix[0].eligible, ['p1', 'p3']);
    assert.deepEqual(matrix[1].eligible, ['p2', 'p3']);
    assert.deepEqual(reasons(matrix[0], 'p2'), ['LACKS_QUALIFICATION']);
  });

  it('applies unavailable ranges and only_available in reverse', () => {
    const matrix = generateCandidateMatrix({
      targetSlots: slots,
      people,
      rules: [
        {
          ruleId: 'u1',
          type: 'unavailable',
          personId: 'p1',
          roleId: 'main-speaker',
          dateRange: { start: '2026-08-01', end: '2026-08-15' }
        },
        {
          ruleId: 'o1',
          type: 'only_available',
          personId: 'p3',
          dates: ['2026-08-23']
        }
      ]
    });
    assert.deepEqual(matrix[0].eligible, []);
    assert.ok(reasons(matrix[0], 'p1').includes('UNAVAILABLE'));
    assert.ok(reasons(matrix[0], 'p3').includes('OUTSIDE_ONLY_AVAILABLE'));
    assert.deepEqual(matrix[2].eligible, ['p1', 'p3']);
  });

  it('excludes children reservations and enforces fixed cells', () => {
    const matrix = generateCandidateMatrix({
      targetSlots: slots,
      people,
      childrenReadOnlyReservations: { '2026-08-09': ['p3'] },
      rules: [{
        ruleId: 'f1',
        type: 'fixed_assignment',
        personId: 'p2',
        date: '2026-08-09',
        roleId: 'main-piano'
      }]
    });
    assert.ok(reasons(matrix[0], 'p3').includes('CHILDREN_RESERVATION_SAME_DAY'));
    assert.deepEqual(matrix[1].eligible, ['p2']);
    assert.ok(reasons(matrix[1], 'p3').includes('FIXED_CELL_OTHER_PERSON'));
  });

  it('applies baseline limits and preserves soft-rule metadata', () => {
    const matrix = generateCandidateMatrix({
      targetSlots: slots,
      people,
      lockedAssignments: { '2026-08-02__main-speaker': 'p1' },
      rules: [
        {
          ruleId: 'l1',
          type: 'limit',
          scope: 'main',
          personId: 'p1',
          maxCount: 1,
          period: { start: '2026-08-01', end: '2026-08-31' }
        },
        {
          ruleId: 'p1',
          type: 'preferred',
          personId: 'p3',
          roleId: 'main-speaker',
          date: '2026-08-23'
        }
      ]
    });
    assert.ok(reasons(matrix[2], 'p1').includes('LIMIT_REACHED'));
    assert.deepEqual(matrix[2].softRuleIdsByPerson, [{
      personId: 'p3',
      ruleIds: ['p1']
    }]);
    assert.deepEqual(matrix[2].priorityCandidatePersonIds, ['p3']);
    assert.deepEqual(matrix[2].priorityRuleIdsByPerson, [{
      personId: 'p3',
      ruleIds: ['p1']
    }]);
  });
});
