import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import DatabaseSync from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  migrateStateKeys,
  planStateKeyMigration
} from '../scheduling/state-key-migrator.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const createdFiles = new Set();
const roleNameToId = {
  講員: 'main-speaker',
  領會: 'main-leader',
  司琴: 'main-piano'
};

function createDatabase(state, suffix) {
  const dbPath = path.join(testDirectory, `.state-key-migrator-${process.pid}-${suffix}.db`);
  const backupPath = `${dbPath}.backup`;
  createdFiles.add(dbPath);
  createdFiles.add(backupPath);

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE schedules (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO schedules (id, state_json, updated_at) VALUES (?, ?, ?)')
    .run('default', JSON.stringify(state), '2026-07-01T00:00:00.000Z');
  db.close();

  return { dbPath, backupPath };
}

afterEach(() => {
  for (const filePath of createdFiles) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${filePath}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
  }
  createdFiles.clear();
});

describe('state-key-migrator', () => {
  it('plans delimiter, role ID, lock separation, and null migration without mutating input', () => {
    const state = {
      assignments: {
        '2026-07-05|講員': 'person-001',
        '2026-07-12|領會': '',
        '2026-07-19__main-piano': '/'
      },
      locked: {
        '2026-07-05__講員': true,
        '2026-07-19|司琴': true
      }
    };
    const original = structuredClone(state);

    const result = planStateKeyMigration(state, { roleNameToId });

    assert.equal(result.ok, true);
    assert.deepEqual(state, original);
    assert.deepEqual(result.state.assignments, {
      '2026-07-05__main-speaker': 'person-001',
      '2026-07-12__main-leader': null,
      '2026-07-19__main-piano': null
    });
    assert.deepEqual(result.state.lockedKeys, [
      '2026-07-05__main-speaker',
      '2026-07-19__main-piano'
    ]);
    assert.deepEqual(result.state.lockedAssignments, {
      '2026-07-05__main-speaker': 'person-001'
    });
    assert.equal('locked' in result.state, false);
    assert.equal(result.report.emptyConversions, 2);
  });

  it('aborts on different-value collisions but merges identical collisions', () => {
    const conflict = planStateKeyMigration({
      assignments: {
        '2026-07-05|講員': 'person-001',
        '2026-07-05__main-speaker': 'person-002'
      }
    }, { roleNameToId });
    const identical = planStateKeyMigration({
      assignments: {
        '2026-07-05|講員': 'person-001',
        '2026-07-05__main-speaker': 'person-001'
      }
    }, { roleNameToId });

    assert.equal(conflict.ok, false);
    assert.ok(conflict.errors.some((error) => error.code === 'KEY_COLLISION'));
    assert.equal(identical.ok, true);
    assert.deepEqual(identical.state.assignments, {
      '2026-07-05__main-speaker': 'person-001'
    });
    assert.equal(identical.report.mergedCollisions, 1);
  });

  it('rejects unknown roles and malformed legacy keys', () => {
    const result = planStateKeyMigration({
      assignments: {
        '2026-07-05|不存在職位': 'person-001',
        'not-a-date|講員': 'person-002'
      }
    }, { roleNameToId });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_ROLE'));
    assert.ok(result.errors.some((error) => error.code === 'AMBIGUOUS_LEGACY_KEY'));
  });

  it('supports a non-mutating database dry-run', async () => {
    const initialState = {
      assignments: { '2026-07-05|講員': 'person-001' },
      locked: {}
    };
    const { dbPath } = createDatabase(initialState, 'dry-run');

    const result = await migrateStateKeys(dbPath, {
      dryRun: true,
      roleNameToId
    });
    const db = new DatabaseSync(dbPath, { readonly: true });
    const row = db.prepare('SELECT state_json FROM schedules WHERE id = ?').get('default');
    const migrationTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
    ).get();
    db.close();

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.deepEqual(JSON.parse(row.state_json), initialState);
    assert.equal(migrationTable, undefined);
  });

  it('commits with a SQLite backup and is idempotent on rerun', async () => {
    const { dbPath, backupPath } = createDatabase({
      assignments: {
        '2026-07-05|講員': 'person-001',
        '2026-07-12|領會': ''
      },
      locked: {
        '2026-07-05|講員': true
      }
    }, 'commit');

    const first = await migrateStateKeys(dbPath, {
      dryRun: false,
      backupPath,
      migrationId: 'phase1-state-keys-v1',
      roleNameToId,
      now: () => '2026-07-01T01:00:00.000Z'
    });
    const second = await migrateStateKeys(dbPath, {
      dryRun: false,
      backupPath,
      migrationId: 'phase1-state-keys-v1',
      roleNameToId,
      now: () => '2026-07-01T02:00:00.000Z'
    });

    const db = new DatabaseSync(dbPath, { readonly: true });
    const state = JSON.parse(
      db.prepare('SELECT state_json FROM schedules WHERE id = ?').get('default').state_json
    );
    const migrationCount = db.prepare(
      'SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?'
    ).get('phase1-state-keys-v1').count;
    db.close();

    assert.equal(first.success, true);
    assert.equal(first.dryRun, false);
    assert.equal(fs.existsSync(backupPath), true);
    assert.match(first.backupSha256, /^[a-f0-9]{64}$/);
    assert.equal(second.success, true);
    assert.equal(second.alreadyApplied, true);
    assert.equal(migrationCount, 1);
    assert.deepEqual(state.lockedKeys, ['2026-07-05__main-speaker']);
  });
});
