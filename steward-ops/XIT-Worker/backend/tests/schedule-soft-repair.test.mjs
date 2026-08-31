import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findConsecutiveWarnings,
  repairConsecutiveDraft
} from '../scheduling/schedule-soft-repair.mjs';

const dates = ['2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26', '2026-08-02'];
const targetSlots = dates.map((date) => ({
  date,
  roleId: 'main-vocals',
  required: true
}));
const candidateMatrix = targetSlots.map((slot) => ({
  ...slot,
  key: `${slot.date}__${slot.roleId}`,
  eligible: ['p1', 'p2']
}));

describe('schedule soft repair', () => {
  it('removes an avoidable consecutive-week warning with one legal edit', () => {
    const result = repairConsecutiveDraft({
      draftAssignments: [
        { ...targetSlots[0], personId: 'p1' },
        { ...targetSlots[1], personId: 'p1' },
        { ...targetSlots[2], personId: 'p2' },
        { ...targetSlots[3], personId: 'p1' },
        { ...targetSlots[4], personId: 'p1' }
      ],
      targetSlots,
      candidateMatrix,
      validateDraft: () => ({ valid: true })
    });

    assert.equal(result.initialWarningCount, 2);
    assert.equal(result.remainingWarningCount, 0);
    assert.equal(result.changedCellCount, 1);
    assert.equal(findConsecutiveWarnings({
      assignments: result.assignments,
      targetSlots
    }).length, 0);
  });

  it('does not force a replacement rejected by hard-rule validation', () => {
    const result = repairConsecutiveDraft({
      draftAssignments: [
        { ...targetSlots[0], personId: 'p1' },
        { ...targetSlots[1], personId: 'p1' },
        { ...targetSlots[2], personId: 'p2' },
        { ...targetSlots[3], personId: 'p1' },
        { ...targetSlots[4], personId: 'p1' }
      ],
      targetSlots,
      candidateMatrix,
      validateDraft: ({ proposedAssignments }) => {
        const required = {
          '2026-07-05': 'p1',
          '2026-07-12': 'p1',
          '2026-07-19': 'p2',
          '2026-07-26': 'p1',
          '2026-08-02': 'p1'
        };
        return {
          valid: proposedAssignments.every((item) => (
            required[item.date] === item.personId
          ))
        };
      }
    });

    assert.equal(result.changedCellCount, 0);
    assert.equal(result.remainingWarningCount, 2);
  });

  it('honors an explicit allow_consecutive exception', () => {
    const warnings = findConsecutiveWarnings({
      assignments: [
        { ...targetSlots[0], personId: 'p1' },
        { ...targetSlots[1], personId: 'p1' }
      ],
      targetSlots,
      rules: [{
        type: 'allow_consecutive',
        personId: 'p1',
        roleId: 'main-vocals'
      }]
    });

    assert.equal(warnings.length, 0);
  });
});
