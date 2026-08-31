import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeSchedule } from '../scheduling/schedule-optimizer.mjs';
import { validateSchedule } from '../scheduling/schedule-validator.mjs';

const people = [
  { id: 'p1', roleIds: ['r1', 'r2'] },
  { id: 'p2', roleIds: ['r2', 'r3'] },
  { id: 'p3', roleIds: ['r1'] }
];
const validate = (result, input) => validateSchedule({
  assignments: result.assignments,
  targetSlots: input.targetSlots,
  people: input.people,
  rules: input.rules || [],
  childrenReadOnlyReservations: input.childrenReadOnlyReservations || {}
});

describe('schedule-optimizer 2.1 contract', () => {
  it('finds a complete legal schedule', () => {
    const input = {
      targetSlots: [
        { date: '2026-08-09', roleId: 'r1', required: true },
        { date: '2026-08-09', roleId: 'r2', required: true },
        { date: '2026-08-09', roleId: 'r3', required: true }
      ],
      people
    };
    const result = optimizeSchedule(input);
    assert.equal(result.success, true);
    assert.equal(validate(result, input).valid, true);
    assert.equal(Object.keys(result.assignments).length, 3);
  });

  it('retains a legal draft and minimally repairs a duplicate draft', () => {
    const slots = [
      { date: '2026-08-09', roleId: 'r1', required: true },
      { date: '2026-08-09', roleId: 'r2', required: true }
    ];
    const legal = optimizeSchedule({
      targetSlots: slots,
      people,
      draftAssignments: {
        '2026-08-09__r1': 'p3',
        '2026-08-09__r2': 'p2'
      }
    });
    const duplicate = optimizeSchedule({
      targetSlots: slots,
      people,
      draftAssignments: {
        '2026-08-09__r1': 'p1',
        '2026-08-09__r2': 'p1'
      }
    });
    assert.equal(legal.repairSummary.changedByOptimizer, 0);
    assert.equal(duplicate.success, true);
    assert.equal(duplicate.repairSummary.changedByOptimizer, 1);
  });

  it('uses every feasible person in a populous role before repeating assignments', () => {
    const workers = Array.from({ length: 4 }, (_, index) => ({
      id: `p${index + 1}`,
      roleIds: ['r1', 'r2']
    }));
    const targetSlots = [
      ...Array.from({ length: 4 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        roleId: 'r1',
        required: true
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        date: `2026-08-${String(index + 11).padStart(2, '0')}`,
        roleId: 'r2',
        required: true
      }))
    ];
    const result = optimizeSchedule({
      targetSlots,
      people: workers,
      draftAssignments: {
        '2026-08-01__r1': 'p1',
        '2026-08-02__r1': 'p2',
        '2026-08-03__r1': 'p1',
        '2026-08-04__r1': 'p2',
        '2026-08-11__r2': 'p3',
        '2026-08-12__r2': 'p4',
        '2026-08-13__r2': 'p3',
        '2026-08-14__r2': 'p4'
      }
    });

    assert.equal(result.success, true);
    assert.equal(result.roleCoverageSummary.shortfall, 0);
    assert.equal(result.roleCoverageSummary.coverageRate, 1);
    assert.deepEqual(
      result.roleCoverageSummary.roles.map((role) => [
        role.roleId,
        role.achievedDistinctCount
      ]),
      [['r1', 4], ['r2', 4]]
    );
  });

  it('never changes an exact rule-priority reservation', () => {
    const result = optimizeSchedule({
      targetSlots: [
        { date: '2026-08-09', roleId: 'r1', required: true },
        { date: '2026-08-09', roleId: 'r2', required: true }
      ],
      people,
      draftAssignments: {
        '2026-08-09__r1': 'p1',
        '2026-08-09__r2': 'p1'
      },
      requiredDraftAssignments: {
        '2026-08-09__r1': 'p1'
      }
    });

    assert.equal(result.success, true);
    assert.equal(result.assignments['2026-08-09__r1'], 'p1');
    assert.equal(result.assignments['2026-08-09__r2'], 'p2');
  });

  it('never returns a partial required schedule as success', () => {
    const result = optimizeSchedule({
      targetSlots: [{ date: '2026-08-09', roleId: 'r3', required: true }],
      people: [{ id: 'p1', roleIds: ['r1'] }]
    });
    assert.equal(result.success, false);
    assert.equal(result.status, 'HARD_UNSAT');
    assert.deepEqual(result.assignments, {});
  });

  it('permits only explicitly optional cells to remain empty', () => {
    const input = {
      targetSlots: [{ date: '2026-08-09', roleId: 'r3', required: false }],
      people: [{ id: 'p1', roleIds: ['r1'] }]
    };
    const result = optimizeSchedule(input);
    assert.equal(result.success, true);
    assert.equal(validate(result, input).valid, true);
    assert.equal(result.unfilled[0].reasonCode, 'NO_LEGAL_CANDIDATE');
  });

  it('supports deadline and cancellation without leaking partial assignments', () => {
    const input = {
      targetSlots: [{ date: '2026-08-09', roleId: 'r1', required: true }],
      people
    };
    const controller = new AbortController();
    controller.abort();
    const canceled = optimizeSchedule({ ...input, signal: controller.signal });
    const timedOut = optimizeSchedule({ ...input, timeLimitMs: 0 });
    assert.equal(canceled.status, 'CANCELED');
    assert.deepEqual(canceled.assignments, {});
    assert.equal(timedOut.status, 'SOLVER_TIMEOUT_NO_INCUMBENT');
    assert.deepEqual(timedOut.assignments, {});
  });

  it('is deterministic and handles 250 cells under two seconds', () => {
    const workers = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index}`,
      roleIds: ['r1']
    }));
    const slots = Array.from({ length: 250 }, (_, index) => ({
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(
        (index % 28) + 1
      ).padStart(2, '0')}`,
      roleId: 'r1',
      required: true
    }));
    const started = performance.now();
    const first = optimizeSchedule({ targetSlots: slots, people: workers, timeLimitMs: 1500 });
    const elapsed = performance.now() - started;
    const second = optimizeSchedule({ targetSlots: slots, people: workers, timeLimitMs: 1500 });
    assert.equal(first.success, true);
    assert.deepEqual(first.assignments, second.assignments);
    assert.equal(Object.keys(first.assignments).length, 250);
    assert.ok(elapsed < 2000, `elapsed=${elapsed}`);
  });
});
