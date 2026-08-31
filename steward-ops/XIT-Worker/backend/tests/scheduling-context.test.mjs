import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchedulingContext,
  toDisplayAssignments
} from '../scheduling/scheduling-context.mjs';

function payload() {
  return {
    sectionDates: {
      main: ['2026-07-05', '2026-07-12', '2026-07-19'],
      children: ['2026-07-05']
    },
    people: [
      { id: 'p1', name: '甲', categories: ['講員', '領會'] },
      { id: 'p2', name: '乙', categories: ['司琴', '兒主大班'] },
      { id: 'p3', name: '丙', categories: ['領會'] },
      { id: 'p4', name: '外請', categories: ['外請講員'] }
    ],
    assignments: {
      '2026-07-05|講員': '',
      '2026-07-05__兒主大班': '乙'
    },
    locked: {
      '2026-07-05__講員': true,
      '2026-07-12__講員': true,
      '2026-07-19__講員': true
    },
    temporaryRules: [
      {
        type: 'unavailable',
        person: '甲',
        role: '領會',
        dateRange: { start: '2026-07-05', end: '2026-07-12' },
        scope: 'main'
      },
      {
        type: 'fixed',
        person: '丙',
        role: '領會',
        date: '2026-07-12',
        reason: '人員指定可排日期',
        timestamp: 1
      },
      {
        type: 'fixed',
        person: '丙',
        role: '領會',
        date: '2026-07-19',
        reason: '人員指定可排日期',
        timestamp: 1
      }
    ]
  };
}

describe('scheduling-context', () => {
  it('builds main-only mutable cells and read-only children reservations', () => {
    const context = buildSchedulingContext(payload());

    assert.equal(context.targetSlots.some((slot) => slot.roleId.startsWith('children-')), false);
    assert.deepEqual(context.childrenReadOnlyReservations, {
      '2026-07-05': ['p2']
    });
    assert.equal(context.lockedAssignments['2026-07-05__main-speaker'], undefined);
    assert.equal(context.targetSlots.some((slot) => (
      slot.date === '2026-07-05' && slot.roleId === 'main-speaker'
    )), false);
    assert.deepEqual(
      context.people.find((person) => person.id === 'p4').roleIds,
      ['main-speaker']
    );
  });

  it('converts legacy unavailable and misparsed fixed rules safely', () => {
    const context = buildSchedulingContext(payload());
    const unavailable = context.rules.find((rule) => rule.type === 'unavailable');
    const onlyAvailable = context.rules.find((rule) => rule.type === 'only_available');

    assert.equal(unavailable.personId, 'p1');
    assert.equal(unavailable.roleId, 'main-leader');
    assert.equal(onlyAvailable.personId, 'p3');
    assert.deepEqual(onlyAvailable.dates, ['2026-07-12', '2026-07-19']);
    assert.equal(context.rules.some((rule) => rule.type === 'fixed_assignment'), false);
  });

  it('uses week-two communion activation and preserves force_role', () => {
    const base = buildSchedulingContext(payload());
    const communionDates = base.targetSlots
      .filter((slot) => slot.roleId === 'main-communion')
      .map((slot) => slot.date);
    const forcedPayload = payload();
    forcedPayload.temporaryRules.push({
      type: 'force_role',
      role: '餅杯服事',
      date: '2026-07-19'
    });
    const forced = buildSchedulingContext(forcedPayload);

    assert.deepEqual(communionDates, ['2026-07-12']);
    assert.ok(forced.targetSlots.some((slot) => (
      slot.date === '2026-07-19' && slot.roleId === 'main-communion'
    )));
  });

  it('recovers a legacy limit count from its Chinese reason text', () => {
    const legacyPayload = payload();
    legacyPayload.people.push({
      id: 'p5',
      name: '丁',
      categories: ['司琴']
    });
    legacyPayload.temporaryRules.push({
      type: 'limit',
      person: '丁',
      role: '司琴',
      dateRange: { start: '2026-07-05', end: '2026-07-19' },
      reason: '丁在這段期間可排一次'
    });
    const context = buildSchedulingContext(legacyPayload);
    const limit = context.rules.find((rule) => rule.type === 'limit');

    assert.equal(limit.maxCount, 1);
    assert.deepEqual(limit.period, {
      start: '2026-07-05',
      end: '2026-07-19'
    });
  });

  it('treats an undated unavailable rule as covering the active period', () => {
    const legacyPayload = payload();
    legacyPayload.temporaryRules.push({
      type: 'unavailable',
      person: '甲',
      role: '領會',
      reason: '本期不排'
    });
    const context = buildSchedulingContext(legacyPayload);
    const fullPeriodRule = context.rules.find((rule) => (
      rule.type === 'unavailable'
      && rule.reason === '本期不排'
    ));

    assert.deepEqual(fullPeriodRule.dates, legacyPayload.sectionDates.main);
  });

  it('skips availability rules outside the active target period', () => {
    const legacyPayload = payload();
    legacyPayload.temporaryRules.push({
      type: 'only_available',
      personId: 'p1',
      roleId: 'main-leader',
      date: '2026-08-02',
      reason: 'outside-target-period'
    });

    const context = buildSchedulingContext(legacyPayload);

    assert.equal(
      context.rules.some((rule) => rule.reason === 'outside-target-period'),
      false
    );
    assert.ok(context.warnings.some((warning) => (
      warning.code === 'AVAILABILITY_RULE_OUTSIDE_TARGET_PERIOD'
      && warning.personId === 'p1'
      && warning.roleId === 'main-leader'
    )));
  });

  it('maps canonical output back to display names without children writes', () => {
    const context = buildSchedulingContext(payload());
    const result = toDisplayAssignments({
      '2026-07-12__main-leader': 'p3'
    }, context);

    assert.deepEqual(result, { '2026-07-12__領會': '丙' });
  });
});
