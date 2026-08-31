import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runOrchestrator } from '../scheduling/schedule-orchestrator.mjs';
import { optimizeSchedule } from '../scheduling/schedule-optimizer.mjs';
import { ROLE_DEFINITIONS } from '../scheduling/scheduling-context.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../schedule.db');
const mainRoles = ROLE_DEFINITIONS.filter((role) => role.section === 'main');

function sundays(count) {
  const result = [];
  const date = new Date('2026-07-05T00:00:00Z');
  for (let index = 0; index < count; index += 1) {
    result.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 7);
  }
  return result;
}

function constrainedHalfYearPayload() {
  const dates = sundays(26);
  const people = [];
  for (const role of mainRoles) {
    for (let index = 0; index < 10; index += 1) {
      people.push({
        id: `${role.roleId}-p${index}`,
        name: `${role.roleId}-worker-${index}`,
        categories: [
          role.name,
          ...(role.roleId === 'main-leader' && index === 0
            ? ['兒主大班']
            : [])
        ],
        sections: ['main']
      });
    }
  }
  const assignments = {
    [`${dates[0]}__兒主大班`]: 'main-leader-worker-0'
  };
  const locked = {};
  for (const [index, date] of dates.entries()) {
    assignments[`${date}__講員`] = `main-speaker-worker-${index % 10}`;
    locked[`${date}__講員`] = true;
  }
  return {
    targetSection: 'main',
    sectionDates: {
      main: dates,
      children: [dates[0]]
    },
    people,
    assignments,
    locked,
    temporaryRules: [
      {
        type: 'unavailable',
        person: 'main-leader-worker-1',
        role: '領會',
        date: dates[1],
        scope: 'main',
        reason: '壓力測試請假'
      },
      {
        type: 'fixed',
        person: 'main-piano-worker-1',
        role: '司琴',
        date: dates[2],
        scope: 'main',
        reason: '指定服事'
      },
      {
        type: 'limit',
        person: 'main-vocals-worker-1',
        role: '配唱',
        value: 1,
        dateRange: { start: dates[0], end: dates[3] },
        scope: 'main',
        reason: '區間最多一次'
      },
      {
        type: 'exclusive_person',
        person: 'main-video-control-worker-1',
        action: { person: 'main-video-playback-worker-1' },
        scope: 'main',
        reason: '兩人錯開'
      }
    ]
  };
}

function assertNoSameDayDuplicates(assignments) {
  const byDate = new Map();
  for (const [key, personId] of Object.entries(assignments)) {
    const date = key.slice(0, 10);
    const people = byDate.get(date) || [];
    people.push(personId);
    byDate.set(date, people);
  }
  for (const [date, people] of byDate) {
    assert.equal(
      new Set(people).size,
      people.length,
      `same-day duplicate on ${date}`
    );
  }
}

describe('Phase 6 scheduling acceptance', () => {
  it('solves exactly 188 constrained mutable main cells', async () => {
    const payload = constrainedHalfYearPayload();
    const result = await runOrchestrator(
      payload,
      [],
      () => {},
      { solverTimeLimitMs: 2000, requireLlm: false }
    );

    assert.equal(result.ok, true);
    assert.equal(result.mutableCellCount, 188);
    assert.equal(Object.keys(result.assignments).length, 188);
    assert.equal(result.unfilled.length, 0);
    assert.equal(
      Object.keys(result.assignments).some((key) => key.includes('兒主')),
      false
    );
    assert.equal(
      result.canonicalAssignments[
        `${payload.sectionDates.main[2]}__main-piano`
      ],
      'main-piano-p1'
    );
    assert.notEqual(
      result.canonicalAssignments[
        `${payload.sectionDates.main[0]}__main-leader`
      ],
      'main-leader-p0'
    );
    assertNoSameDayDuplicates(result.canonicalAssignments);
  });

  it('runs the current real half-year data without hard conflicts', {
    skip: !fs.existsSync(dbPath)
  }, async () => {
    const db = new Database(dbPath, { readonly: true });
    const read = (id) => JSON.parse(
      db.prepare('SELECT state_json FROM schedules WHERE id = ?')
        .get(id).state_json
    );
    const schedule = read('default');
    const peopleState = read('people');
    db.close();

    const result = await runOrchestrator(
      {
        ...schedule,
        people: peopleState.people,
        targetSection: 'main'
      },
      [],
      () => {},
      { solverTimeLimitMs: 2000, requireLlm: false }
    );

    assert.equal(result.ok, true);
    assert.ok(
      result.mutableCellCount > 0,
      'real-data stress case must contain at least one mutable cell'
    );
    assert.equal(
      Object.keys(result.assignments).length,
      result.mutableCellCount
    );
    assert.equal(
      Object.keys(result.assignments).length,
      result.mutableCellCount
    );
    assert.equal(result.unfilled.length, 0);
    assertNoSameDayDuplicates(result.canonicalAssignments);
  });

  it('keeps 250-cell deterministic CSP P95 below two seconds', () => {
    const people = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index}`,
      roleIds: ['r1']
    }));
    const start = new Date('2026-01-01T00:00:00Z');
    const targetSlots = Array.from({ length: 250 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        roleId: 'r1',
        required: true
      };
    });
    const durations = [];
    for (let run = 0; run < 12; run += 1) {
      const startedAt = performance.now();
      const result = optimizeSchedule({
        targetSlots,
        people,
        timeLimitMs: 1500
      });
      durations.push(performance.now() - startedAt);
      assert.equal(result.success, true);
      assert.equal(Object.keys(result.assignments).length, 250);
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    assert.ok(p95 < 2000, `P95 must be < 2000ms; measured ${p95}ms`);
  });
});
