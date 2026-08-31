import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';

let directory;
let child;
let baseUrl;
let databasePath;

function taipeiToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function createLegacyDatabase(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE schedules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE schedule_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      save_type TEXT NOT NULL DEFAULT 'completed',
      title TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person TEXT NOT NULL,
      sections TEXT NOT NULL,
      dates TEXT NOT NULL,
      message TEXT NOT NULL,
      ai_rules TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE TABLE attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_date TEXT UNIQUE NOT NULL,
      physical_count INTEGER DEFAULT 0,
      online_count INTEGER DEFAULT 0,
      special_event TEXT DEFAULT '',
      note TEXT DEFAULT '',
      recorded_by TEXT NOT NULL DEFAULT 'system',
      updated_at TEXT NOT NULL
    );
  `);
  const today = taipeiToday();
  const state = {
    periodYear: '2026',
    mainHalf: '1',
    childrenQuarter: '1',
    title: '測試班表',
    sectionDates: {
      main: ['2026-01-04', today],
      children: ['2026-01-04']
    },
    assignments: {
      '2026-01-04__領會': '大堂甲',
      '2026-01-04__兒主敬拜': '兒主甲',
      [`${today}__1F招待`]: '招待甲'
    },
    locked: {},
    notes: { main: {}, children: {} },
    ruleMemos: [],
    temporaryRules: []
  };
  db.prepare(`
    INSERT INTO schedules (id, title, state_json, updated_at)
    VALUES ('default', '', ?, ?)
  `).run(JSON.stringify(state), new Date().toISOString());
  db.prepare(`
    INSERT INTO attendance_records (
      service_date, physical_count, online_count, recorded_by, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run('2026-01-04', 40, 5, 'legacy', new Date().toISOString());
  db.close();
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json();
  return { response, payload };
}

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xit-period-routes-'));
  databasePath = path.join(directory, 'schedule.db');
  createLegacyDatabase(databasePath);
  const port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}/xit-worker`;
  child = spawn(process.execPath, ['backend/standalone-server.mjs'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      XIT_WORKER_PORT: String(port),
      XIT_WORKER_DB_FILE: databasePath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('test server start timeout')), 10000);
    const onData = (chunk) => {
      if (!String(chunk).includes('standalone server listening')) return;
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      resolve();
    };
    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`test server exited early: ${code}`));
    });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

describe('schedule period routes', () => {
  it('serves public period history and the active mobile aggregate', async () => {
    assert.equal(
      fs.existsSync(path.join(directory, 'schedule.before-schedule-periods.db')),
      true
    );
    const catalog = await request('/api/schedule-periods');
    assert.equal(catalog.response.status, 200);
    assert.deepEqual(catalog.payload.periods.map((period) => period.id).sort(), [
      'children-2026-Q1',
      'main-2026-H1'
    ]);

    const mobile = await request('/api/mobile/current-schedule');
    assert.equal(mobile.response.status, 200);
    assert.equal(mobile.payload.periods.main.id, 'main-2026-H1');
    assert.equal(mobile.payload.periods.children.id, 'children-2026-Q1');
    assert.equal(mobile.payload.state.assignments['2026-01-04__領會'], '大堂甲');
    assert.equal(mobile.payload.state.assignments['2026-01-04__兒主敬拜'], '兒主甲');

    const migratedAttendance = await request(
      '/api/attendance?scheduleId=main-2026-H1&start=2026-01-04&end=2026-01-04'
    );
    assert.equal(migratedAttendance.payload.data[0].scheduleId, 'main-2026-H1');
    assert.equal(migratedAttendance.payload.data[0].physical_count, 40);
  });

  it('writes mobile usher attendance into the shared attendance table', async () => {
    const today = taipeiToday();
    const denied = await request('/api/mobile/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person: '不是今日招待',
        date: today,
        physical_count: 51
      })
    });
    assert.equal(denied.response.status, 403);

    const submitted = await request('/api/mobile/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person: '招待甲',
        date: today,
        physical_count: 51,
        online_count: 7
      })
    });
    assert.equal(submitted.response.status, 200);
    assert.equal(submitted.payload.record.date, today);
    assert.equal(submitted.payload.record.physical_count, 51);
    assert.equal(submitted.payload.record.online_count, 7);
    assert.equal(submitted.payload.record.recorded_by, '招待甲');

    const attendance = await request(`/api/attendance?start=${today}&end=${today}`);
    assert.equal(attendance.response.status, 200);
    assert.deepEqual(attendance.payload.data, [submitted.payload.record]);

    const analytics = await request(
      '/api/analytics/growth?scheduleId=main-2026-H1'
    );
    assert.equal(analytics.response.status, 200);
    const todayTrend = analytics.payload.data.trends.find(
      (trend) => trend.date === today
    );
    assert.equal(todayTrend.physical_count, 51);
    assert.equal(todayTrend.online_count, 7);
    assert.equal(todayTrend.total_count, 58);

    const period = await request('/api/schedule-periods/main-2026-H1');
    assert.equal(
      period.payload.period.state.extraValues?.[`${today}__extra__實體人數`],
      undefined
    );
  });

  it('enforces write permission, revision and locked-cell protection', async () => {
    const current = await request('/api/schedule-periods/main-2026-H1');
    const period = current.payload.period;
    const unauthorized = await request('/api/schedule-periods/main-2026-H1/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: period.revision,
        state: period.state
      })
    });
    assert.equal(unauthorized.response.status, 403);

    const preparedState = structuredClone(period.state);
    preparedState.assignments['2026-01-04__司琴'] = '大堂乙';
    preparedState.notes.main['2026-01-04'] = '必須保留的備註';
    preparedState.ruleMemos = [{
      id: 'main-rule',
      scope: 'main',
      text: '必須保留的規則'
    }];
    const prepared = await request('/api/schedule-periods/main-2026-H1/state', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A000'
      },
      body: JSON.stringify({
        baseRevision: period.revision,
        state: preparedState
      })
    });
    assert.equal(prepared.response.status, 200);

    const locked = await request('/api/schedule-periods/main-2026-H1/cell-lock', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A001'
      },
      body: JSON.stringify({
        baseRevision: prepared.payload.period.revision,
        cellKey: '2026-01-04__領會',
        locked: true
      })
    });
    assert.equal(locked.response.status, 200);

    const changedState = structuredClone(locked.payload.period.state);
    changedState.assignments['2026-01-04__領會'] = '大堂乙';
    const lockedWrite = await request('/api/schedule-periods/main-2026-H1/state', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A001'
      },
      body: JSON.stringify({
        baseRevision: locked.payload.period.revision,
        state: changedState
      })
    });
    assert.equal(lockedWrite.response.status, 409);
    assert.equal(lockedWrite.payload.code, 'SCHEDULE_CELL_LOCKED');

    const cleared = await request('/api/schedule-periods/main-2026-H1/clear-unlocked', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A000'
      },
      body: JSON.stringify({
        baseRevision: locked.payload.period.revision
      })
    });
    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.payload.clearedCount, 2);
    assert.equal(cleared.payload.preservedLockedCount, 1);
    assert.deepEqual(cleared.payload.period.state.assignments, {
      '2026-01-04__領會': '大堂甲'
    });
    assert.equal(
      cleared.payload.period.state.notes.main['2026-01-04'],
      '必須保留的備註'
    );
    assert.equal(cleared.payload.period.state.ruleMemos[0].text, '必須保留的規則');
  });

  it('creates independent Q2 and then atomically links main H2 with children Q3', async () => {
    const currentChildren = await request('/api/schedule-periods/children-2026-Q1');
    const q2 = await request('/api/schedule-periods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A004'
      },
      body: JSON.stringify({ scheduleId: 'children-2026-Q2' })
    });
    assert.equal(q2.response.status, 201);
    assert.equal(q2.payload.created[0].id, 'children-2026-Q2');

    const archivedQ1 = await request('/api/schedule-periods/children-2026-Q1');
    assert.equal(archivedQ1.payload.period.status, 'archived');
    const archivedWrite = await request('/api/schedule-periods/children-2026-Q1/state', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A004'
      },
      body: JSON.stringify({
        baseRevision: currentChildren.payload.period.revision,
        state: currentChildren.payload.period.state
      })
    });
    assert.equal(archivedWrite.response.status, 423);

    const h2 = await request('/api/schedule-periods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A000'
      },
      body: JSON.stringify({ scheduleId: 'main-2026-H2' })
    });
    assert.equal(h2.response.status, 201);
    assert.deepEqual(h2.payload.created.map((period) => period.id), [
      'main-2026-H2',
      'children-2026-Q3'
    ]);

    const mobile = await request('/api/mobile/current-schedule');
    assert.equal(mobile.payload.periods.main.id, 'main-2026-H2');
    assert.equal(mobile.payload.periods.children.id, 'children-2026-Q3');

    const today = taipeiToday();
    const historicalAttendance = await request(
      `/api/attendance?scheduleId=main-2026-H1&start=${today}&end=${today}`
    );
    assert.equal(historicalAttendance.payload.data[0].physical_count, 51);
    assert.equal(historicalAttendance.payload.data[0].online_count, 7);

    const newAttendance = await request(
      `/api/attendance?scheduleId=main-2026-H2&start=${today}&end=${today}`
    );
    assert.deepEqual(newAttendance.payload.data, []);
    const newAnalytics = await request(
      '/api/analytics/growth?scheduleId=main-2026-H2'
    );
    assert.deepEqual(newAnalytics.payload.data.trends, []);

    const archivedAttendanceWrite = await request(`/api/attendance/${today}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Code': 'A000'
      },
      body: JSON.stringify({
        scheduleId: 'main-2026-H1',
        physical_count: 99
      })
    });
    assert.equal(archivedAttendanceWrite.response.status, 423);
  });
});
