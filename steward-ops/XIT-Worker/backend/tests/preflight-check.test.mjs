import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPreflightConflicts } from '../scheduling/preflight-check.mjs';

const people = [
  { id: 'person-001', roleIds: ['main-speaker'] },
  { id: 'person-002', roleIds: ['main-piano', 'main-leader'] },
  { id: 'person-003', roleIds: ['children-senior'] }
];

function fixed(ruleId, personId, date, roleId) {
  return { ruleId, type: 'fixed_assignment', personId, date, roleId };
}

function check(normalizedRules, overrides = {}) {
  return checkPreflightConflicts({
    normalizedRules,
    lockedAssignments: {},
    lockedKeys: [],
    childrenReadOnlyReservations: {},
    existingAssignments: {},
    people,
    ...overrides
  });
}

describe('preflight-check', () => {
  it('detects one person fixed into multiple roles on the same day', () => {
    const result = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano'),
      fixed('fixed-2', 'person-002', '2026-08-09', 'main-leader')
    ]);

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.some((conflict) => conflict.code === 'MULTIPLE_FIXED_ROLES'));
  });

  it('detects different people fixed into the same cell', () => {
    const result = check([
      fixed('fixed-1', 'person-001', '2026-08-09', 'main-speaker'),
      fixed('fixed-2', 'person-002', '2026-08-09', 'main-speaker')
    ]);

    assert.ok(result.conflicts.some((conflict) => conflict.code === 'MULTIPLE_FIXED_PEOPLE'));
  });

  it('detects fixed assignment conflicts with unavailable date ranges', () => {
    const result = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano'),
      {
        ruleId: 'unavailable-1',
        type: 'unavailable',
        personId: 'person-002',
        roleId: 'main-piano',
        dateRange: { start: '2026-08-01', end: '2026-08-31' }
      }
    ]);

    assert.ok(result.conflicts.some(
      (conflict) => conflict.code === 'FIXED_UNAVAILABLE_CONFLICT'
    ));
  });

  it('detects locked-person and blank-lock conflicts', () => {
    const personConflict = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano')
    ], {
      lockedKeys: ['2026-08-09__main-piano'],
      lockedAssignments: { '2026-08-09__main-piano': 'person-001' }
    });
    const blankConflict = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano')
    ], {
      lockedKeys: ['2026-08-09__main-piano']
    });

    assert.ok(personConflict.conflicts.some(
      (conflict) => conflict.code === 'FIXED_LOCKED_CONFLICT'
    ));
    assert.ok(blankConflict.conflicts.some(
      (conflict) => conflict.code === 'FIXED_BLANK_LOCK'
    ));
  });

  it('rejects fixed people without the required role qualification', () => {
    const result = check([
      fixed('fixed-1', 'person-001', '2026-08-09', 'main-piano')
    ]);

    assert.ok(result.conflicts.some(
      (conflict) => conflict.code === 'FIXED_LACKS_QUALIFICATION'
    ));
  });

  it('detects only_available and limit contradictions', () => {
    const onlyAvailable = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano'),
      {
        ruleId: 'only-1',
        type: 'only_available',
        personId: 'person-002',
        dates: ['2026-08-23']
      }
    ]);
    const limit = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano'),
      fixed('fixed-2', 'person-002', '2026-08-23', 'main-piano'),
      {
        ruleId: 'limit-1',
        type: 'limit',
        personId: 'person-002',
        roleId: 'main-piano',
        maxCount: 1,
        period: { start: '2026-08-01', end: '2026-08-31' }
      }
    ]);

    assert.ok(onlyAvailable.conflicts.some(
      (conflict) => conflict.code === 'FIXED_OUTSIDE_ONLY_AVAILABLE'
    ));
    assert.ok(limit.conflicts.some(
      (conflict) => conflict.code === 'LIMIT_BELOW_REQUIRED_COUNT'
    ));
  });

  it('detects exclusive people fixed on the same day', () => {
    const result = check([
      fixed('fixed-1', 'person-001', '2026-08-09', 'main-speaker'),
      fixed('fixed-2', 'person-002', '2026-08-09', 'main-piano'),
      {
        ruleId: 'exclusive-1',
        type: 'exclusive_person',
        personIds: ['person-001', 'person-002']
      }
    ]);

    assert.ok(result.conflicts.some(
      (conflict) => conflict.code === 'EXCLUSIVE_FIXED_CONFLICT'
    ));
  });

  it('detects force_role against a blank lock and children reservations', () => {
    const forceConflict = check([{
      ruleId: 'force-1',
      type: 'force_role',
      date: '2026-08-09',
      roleId: 'main-piano'
    }], {
      lockedKeys: ['2026-08-09__main-piano']
    });
    const childrenConflict = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano')
    ], {
      childrenReadOnlyReservations: {
        '2026-08-09': ['person-002']
      }
    });

    assert.ok(forceConflict.conflicts.some(
      (conflict) => conflict.code === 'FORCE_ROLE_BLANK_LOCK'
    ));
    assert.ok(childrenConflict.conflicts.some(
      (conflict) => conflict.code === 'FIXED_CHILDREN_RESERVATION_CONFLICT'
    ));
  });

  it('detects conditional cycles and unsatisfied manual children actions', () => {
    const cycle = check([
      {
        ruleId: 'conditional-1',
        type: 'conditional',
        condition: {
          section: 'main',
          personId: 'person-001',
          roleId: 'main-speaker'
        },
        action: {
          section: 'main',
          personId: 'person-002',
          roleId: 'main-piano'
        }
      },
      {
        ruleId: 'conditional-2',
        type: 'conditional',
        condition: {
          section: 'main',
          personId: 'person-002',
          roleId: 'main-piano'
        },
        action: {
          section: 'main',
          personId: 'person-001',
          roleId: 'main-speaker'
        }
      }
    ]);
    const childrenAction = check([{
      ruleId: 'conditional-children',
      type: 'conditional',
      date: '2026-08-09',
      condition: {
        section: 'main',
        personId: 'person-001',
        roleId: 'main-speaker'
      },
      action: {
        section: 'children',
        personId: 'person-003',
        roleId: 'children-senior'
      }
    }]);

    assert.ok(cycle.conflicts.some(
      (conflict) => conflict.code === 'CONDITIONAL_CYCLE'
    ));
    assert.ok(childrenAction.conflicts.some(
      (conflict) => conflict.code === 'MANUAL_CHILDREN_ACTION_REQUIRED'
    ));
  });

  it('passes a compatible set of rules', () => {
    const result = check([
      fixed('fixed-1', 'person-002', '2026-08-09', 'main-piano'),
      {
        ruleId: 'only-1',
        type: 'only_available',
        personId: 'person-002',
        dates: ['2026-08-09', '2026-08-23']
      }
    ]);

    assert.equal(result.valid, true);
    assert.deepEqual(result.conflicts, []);
  });
});
