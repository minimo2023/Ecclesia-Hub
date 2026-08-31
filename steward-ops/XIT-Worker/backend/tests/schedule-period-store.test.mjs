import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import {
  createSchedulePeriodStore,
  extractSectionState,
  linkedChildrenPeriodId,
  mergeSectionStates,
  parseSchedulePeriodId
} from '../scheduling/schedule-period-store.mjs';

const temporaryDirectories = [];
const openDatabases = [];

function createDatabase(legacyState = null) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xit-period-store-'));
  temporaryDirectories.push(directory);
  const db = new Database(path.join(directory, 'schedule.db'));
  openDatabases.push(db);
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
  `);
  if (legacyState) {
    db.prepare(`
      INSERT INTO schedules (id, title, state_json, updated_at)
      VALUES ('default', '', ?, ?)
    `).run(JSON.stringify(legacyState), new Date().toISOString());
  }
  return { db, store: createSchedulePeriodStore(db) };
}

function legacyState() {
  return {
    periodYear: '2026',
    mainHalf: '1',
    childrenQuarter: '1',
    title: '2026 班表',
    sectionDates: {
      main: ['2026-01-04', '2026-01-11'],
      children: ['2026-01-04']
    },
    assignments: {
      '2026-01-04__領會': '大堂同工',
      '2026-01-04__兒主敬拜': '兒主同工'
    },
    locked: {
      '2026-01-04__領會': true,
      '2026-01-04__兒主敬拜': true
    },
    notes: {
      main: { '2026-01-04': '大堂備註' },
      children: { '2026-01-04': '兒主備註' }
    },
    ruleMemos: [
      { id: 'main-rule', scope: 'main' },
      { id: 'children-rule', scope: 'children' }
    ],
    extraValues: { '2026-01-04__extra__程序': '內容' },
    childrenRoster: { '2026-01-04__程序': '內容' }
  };
}

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    db.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('schedule period store', () => {
  it('validates IDs and links main halves to children Q1/Q3', () => {
    assert.deepEqual(parseSchedulePeriodId('main-2026-H2'), {
      id: 'main-2026-H2',
      section: 'main',
      year: 2026,
      periodCode: 'H2',
      periodNumber: 2,
      ordinal: 4054,
      displayLabel: '大堂 2026/07–12'
    });
    assert.equal(linkedChildrenPeriodId('main-2026-H1'), 'children-2026-Q1');
    assert.equal(linkedChildrenPeriodId('main-2026-H2'), 'children-2026-Q3');
    assert.throws(() => parseSchedulePeriodId('main-2026-Q1'), {
      code: 'INVALID_SCHEDULE_ID'
    });
  });

  it('migrates legacy default into independent active main and children periods', () => {
    const { db, store } = createDatabase(legacyState());
    const result = store.migrateLegacyDefault();
    assert.deepEqual(result, {
      migrated: true,
      created: ['main-2026-H1', 'children-2026-Q1']
    });

    const main = store.get('main-2026-H1');
    const children = store.get('children-2026-Q1');
    assert.equal(main.status, 'active');
    assert.deepEqual(main.state.assignments, {
      '2026-01-04__領會': '大堂同工'
    });
    assert.deepEqual(children.state.assignments, {
      '2026-01-04__兒主敬拜': '兒主同工'
    });
    assert.deepEqual(children.state.extraValues, {
      '2026-01-04__extra__程序': '內容'
    });
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM schedules WHERE id = 'default'`).get().count, 1);
    assert.equal(store.migrateLegacyDefault().reason, 'already-completed');
  });

  it('atomically archives both sections when creating a new main period', () => {
    const { store } = createDatabase(legacyState());
    store.migrateLegacyDefault();

    const result = store.createNext('main-2026-H2', 'A000');
    assert.deepEqual(result.created.map((period) => period.id), [
      'main-2026-H2',
      'children-2026-Q3'
    ]);
    assert.equal(store.get('main-2026-H1').status, 'archived');
    assert.equal(store.get('children-2026-Q1').status, 'archived');
    assert.equal(store.active('main').id, 'main-2026-H2');
    assert.equal(store.active('children').id, 'children-2026-Q3');
    assert.equal(store.active('main').state.assignments['2026-01-04__領會'], undefined);
    assert.equal(store.active('main').state.unavailableText, '');
    assert.deepEqual(store.active('main').state.ruleMemos, []);
    assert.deepEqual(store.active('children').state.childrenRoster, {});
  });

  it('rolls back the linked creation when the target children period already exists', () => {
    const { db, store } = createDatabase(legacyState());
    store.migrateLegacyDefault();
    const timestamp = new Date().toISOString();
    db.prepare(`
      INSERT INTO schedule_periods (
        id, section, year, period_code, display_label, status, state_json,
        revision, predecessor_id, created_at, created_by, archived_at,
        archived_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(
      'children-2026-Q3',
      'children',
      2026,
      'Q3',
      '兒主 2026 第三季',
      'archived',
      '{}',
      1,
      timestamp,
      'test',
      timestamp,
      'test',
      timestamp
    );

    assert.throws(() => store.createNext('main-2026-H2', 'A000'), {
      code: 'LINKED_PERIOD_EXISTS'
    });
    assert.equal(store.active('main').id, 'main-2026-H1');
    assert.equal(store.active('children').id, 'children-2026-Q1');
  });

  it('creates children Q2/Q4 independently and rejects standalone Q1/Q3', () => {
    const { store } = createDatabase(legacyState());
    store.migrateLegacyDefault();

    const result = store.createNext('children-2026-Q2', 'A004');
    assert.deepEqual(result.created.map((period) => period.id), ['children-2026-Q2']);
    assert.equal(store.active('main').id, 'main-2026-H1');
    assert.equal(store.active('children').id, 'children-2026-Q2');
    assert.throws(() => store.createNext('children-2026-Q3', 'A004'), {
      code: 'CHILDREN_PERIOD_LINKED_TO_MAIN'
    });
  });

  it('preserves locked assignments during clear and rejects writes to locked cells', () => {
    const state = legacyState();
    state.assignments['2026-01-11__司琴'] = '可清除同工';
    const { store } = createDatabase(state);
    store.migrateLegacyDefault();
    const main = store.get('main-2026-H1');

    const changed = {
      ...main.state,
      assignments: {
        ...main.state.assignments,
        '2026-01-04__領會': '另一位同工'
      }
    };
    assert.throws(() => store.saveState(main.id, changed, {
      baseRevision: main.revision,
      actorCode: 'A000'
    }), {
      code: 'SCHEDULE_CELL_LOCKED'
    });

    const cleared = store.clearUnlocked(main.id, {
      actorCode: 'A000',
      baseRevision: main.revision
    });
    assert.deepEqual(cleared.period.state.assignments, {
      '2026-01-04__領會': '大堂同工'
    });
    assert.equal(cleared.period.state.locked['2026-01-04__領會'], true);
    assert.deepEqual(cleared.period.state.notes.main, {
      '2026-01-04': '大堂備註'
    });
    assert.equal(cleared.clearedCount, 1);
    assert.equal(cleared.preservedLockedCount, 1);
  });

  it('allows an authorized unlock before changing a formerly locked cell', () => {
    const { store } = createDatabase(legacyState());
    store.migrateLegacyDefault();
    const main = store.get('main-2026-H1');
    const unlocked = store.setCellLock(main.id, '2026-01-04__領會', false, {
      actorCode: 'A001',
      baseRevision: main.revision,
      allowedRoles: new Set(['領會'])
    });
    const nextState = {
      ...unlocked.state,
      assignments: {
        ...unlocked.state.assignments,
        '2026-01-04__領會': '另一位同工'
      }
    };
    const saved = store.saveState(main.id, nextState, {
      actorCode: 'A001',
      baseRevision: unlocked.revision,
      allowedRoles: new Set(['領會'])
    });
    assert.equal(saved.state.assignments['2026-01-04__領會'], '另一位同工');
  });

  it('merges independently stored section states for the desktop workspace', () => {
    const { store } = createDatabase(legacyState());
    store.migrateLegacyDefault();
    const merged = mergeSectionStates(
      store.active('main').state,
      store.active('children').state
    );
    assert.deepEqual(merged.sectionDates, {
      main: ['2026-01-04', '2026-01-11'],
      children: ['2026-01-04']
    });
    assert.equal(merged.assignments['2026-01-04__領會'], '大堂同工');
    assert.equal(merged.assignments['2026-01-04__兒主敬拜'], '兒主同工');
  });

  it('keeps the available section usable when the other active section is missing', () => {
    const mainOnly = extractSectionState(legacyState(), 'main', 'main-2026-H1');
    const merged = mergeSectionStates(mainOnly, {});
    assert.deepEqual(merged.sectionDates, {
      main: ['2026-01-04', '2026-01-11'],
      children: []
    });
    assert.equal(merged.assignments['2026-01-04__領會'], '大堂同工');
    assert.equal(merged.assignments['2026-01-04__兒主敬拜'], undefined);
  });
});
