import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchedule } from '../scheduling/schedule-validator.mjs';

const people = [
  { id: 'p1', roleIds: ['r1', 'r2'] },
  { id: 'p2', roleIds: ['r3'] },
  { id: 'p3', roleIds: ['cr1'] }
];
const targetSlots = [
  { date: '2026-08-09', roleId: 'r1', required: true },
  { date: '2026-08-09', roleId: 'r3', required: true },
  { date: '2026-08-23', roleId: 'r1', required: false }
];
const run = (assignments, overrides = {}) => validateSchedule({
  assignments,
  targetSlots,
  people,
  rules: [],
  ...overrides
});

describe('schedule-validator 2.1 contract', () => {
  it('accepts a complete legal patch with stable array/object hash', () => {
    const objectResult = run({
      '2026-08-09__r1': 'p1',
      '2026-08-09__r3': 'p2'
    });
    const arrayResult = run([
      { date: '2026-08-09', roleId: 'r3', personId: 'p2' },
      { date: '2026-08-09', roleId: 'r1', personId: 'p1' }
    ]);
    assert.equal(objectResult.valid, true);
    assert.equal(objectResult.validatedHash, arrayResult.validatedHash);
  });

  it('rejects missing required, duplicate, out-of-scope and locked writes', () => {
    const result = run([
      { date: '2026-08-09', roleId: 'r1', personId: 'p1' },
      { date: '2026-08-09', roleId: 'r1', personId: 'p1' },
      { date: '2026-08-09', roleId: 'cr1', personId: 'p3' }
    ], { lockedKeys: ['2026-08-09__r1'] });
    for (const code of [
      'DUPLICATE_CELL',
      'OUT_OF_SCOPE_CELL',
      'LOCKED_CELL_WRITE',
      'REQUIRED_CELL_UNFILLED'
    ]) assert.ok(result.conflicts.some((conflict) => conflict.code === code), code);
  });

  it('enforces global same-day uniqueness including children', () => {
    const result = run({
      '2026-08-09__r1': 'p1',
      '2026-08-09__r3': 'p2'
    }, { childrenReadOnlyReservations: { '2026-08-09': ['p1'] } });
    assert.ok(result.conflicts.some(
      (conflict) => conflict.code === 'CHILDREN_RESERVATION_CONFLICT'
    ));
  });

  it('enforces hard rules including only_available and limit', () => {
    const result = run({
      '2026-08-09__r1': 'p1',
      '2026-08-09__r3': 'p2'
    }, {
      rules: [
        { ruleId: 'u', type: 'unavailable', personId: 'p2', date: '2026-08-09' },
        { ruleId: 'o', type: 'only_available', personId: 'p1', dates: ['2026-08-23'] },
        {
          ruleId: 'l',
          type: 'limit',
          personId: 'p1',
          maxCount: 0,
          period: { start: '2026-08-01', end: '2026-08-31' }
        },
        { ruleId: 'force', type: 'force_role', date: '2026-08-23', roleId: 'r1' }
      ]
    });
    for (const code of [
      'UNAVAILABLE_VIOLATION',
      'ONLY_AVAILABLE_VIOLATION',
      'LIMIT_VIOLATION',
      'FORCE_ROLE_VIOLATION'
    ]) assert.ok(result.conflicts.some((conflict) => conflict.code === code), code);
  });

  it('enforces conditional and exclusive-person rules', () => {
    const result = run({
      '2026-08-09__r1': 'p1',
      '2026-08-09__r3': 'p2'
    }, {
      rules: [
        { ruleId: 'x', type: 'exclusive_person', personIds: ['p1', 'p2'] },
        {
          ruleId: 'c',
          type: 'conditional',
          date: '2026-08-09',
          condition: { section: 'main', personId: 'p1', roleId: 'r1' },
          action: { section: 'children', personId: 'p3', roleId: 'cr1' }
        }
      ]
    });
    assert.ok(result.conflicts.some(
      (conflict) => conflict.code === 'EXCLUSIVE_PERSON_VIOLATION'
    ));
    assert.ok(result.conflicts.some(
      (conflict) => conflict.code === 'CONDITIONAL_VIOLATION'
    ));
  });
});
