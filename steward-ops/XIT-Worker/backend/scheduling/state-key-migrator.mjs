import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import DatabaseSync from 'better-sqlite3';
import { isValidCalendarDate, isValidId } from './rule-schema.mjs';

export const DEFAULT_STATE_KEY_MIGRATION_ID = 'scheduling-state-keys-v1';

function makeError(code, pathName, message, details = {}) {
  return { code, path: pathName, message, details };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeEmpty(value, report) {
  if (value === '' || value === '/') {
    report.emptyConversions += 1;
    return null;
  }
  return value;
}

function createRoleResolver(roleNameToId) {
  const entries = roleNameToId instanceof Map
    ? [...roleNameToId.entries()]
    : Object.entries(roleNameToId || {});
  const byName = new Map(entries);
  const knownIds = new Set(entries.map(([, roleId]) => roleId));

  return (roleToken) => {
    if (knownIds.has(roleToken)) return { roleId: roleToken, migrated: false };
    if (byName.has(roleToken)) {
      return { roleId: byName.get(roleToken), migrated: true };
    }
    return null;
  };
}

function parseCellKey(key, resolveRoleId, pathName, errors) {
  if (typeof key !== 'string') {
    errors.push(makeError(
      'AMBIGUOUS_LEGACY_KEY',
      pathName,
      'Cell key must be a string',
      { key }
    ));
    return null;
  }

  const match = /^(\d{4}-\d{2}-\d{2})(\||__)(.+)$/.exec(key);
  if (!match || !isValidCalendarDate(match[1]) || !match[3]) {
    errors.push(makeError(
      'AMBIGUOUS_LEGACY_KEY',
      pathName,
      `Cannot uniquely parse cell key: ${key}`,
      { key }
    ));
    return null;
  }

  const role = resolveRoleId(match[3]);
  if (!role || !isValidId(role.roleId)) {
    errors.push(makeError(
      'UNKNOWN_ROLE',
      pathName,
      `Cannot map role to roleId: ${match[3]}`,
      { key, role: match[3] }
    ));
    return null;
  }

  return {
    key: `${match[1]}__${role.roleId}`,
    delimiterMigrated: match[2] === '|',
    roleMigrated: role.migrated
  };
}

function assignWithoutCollision(target, key, value, pathName, report, errors) {
  if (!Object.hasOwn(target, key)) {
    target[key] = value;
    return;
  }
  if (Object.is(target[key], value)) {
    report.mergedCollisions += 1;
    return;
  }
  errors.push(makeError(
    'KEY_COLLISION',
    pathName,
    `Canonical key has conflicting values: ${key}`,
    {
      key,
      existingValue: target[key],
      incomingValue: value
    }
  ));
}

function migrateDictionary(source, {
  pathName,
  resolveRoleId,
  report,
  errors
}) {
  const target = {};
  if (source === undefined || source === null) return target;
  if (typeof source !== 'object' || Array.isArray(source)) {
    errors.push(makeError(
      'INVALID_STATE_DICTIONARY',
      pathName,
      `${pathName} must be an object`
    ));
    return target;
  }

  for (const [legacyKey, rawValue] of Object.entries(source)) {
    const parsed = parseCellKey(legacyKey, resolveRoleId, `${pathName}.${legacyKey}`, errors);
    if (!parsed) continue;
    if (parsed.delimiterMigrated || parsed.key !== legacyKey) report.keysMigrated += 1;
    if (parsed.roleMigrated) report.roleIdsMigrated += 1;
    const value = normalizeEmpty(rawValue, report);
    assignWithoutCollision(target, parsed.key, value, `${pathName}.${legacyKey}`, report, errors);
  }
  return target;
}

function collectLockEntries(state, context) {
  const lockKeys = new Set();
  const explicitAssignments = {};
  const addLockKey = (legacyKey, pathName) => {
    const parsed = parseCellKey(legacyKey, context.resolveRoleId, pathName, context.errors);
    if (!parsed) return null;
    if (parsed.delimiterMigrated || parsed.key !== legacyKey) context.report.keysMigrated += 1;
    if (parsed.roleMigrated) context.report.roleIdsMigrated += 1;
    lockKeys.add(parsed.key);
    return parsed.key;
  };

  if (Array.isArray(state.lockedKeys)) {
    state.lockedKeys.forEach((key, index) => {
      addLockKey(key, `lockedKeys[${index}]`);
    });
  } else if (state.lockedKeys !== undefined) {
    context.errors.push(makeError(
      'INVALID_LOCKED_KEYS',
      'lockedKeys',
      'lockedKeys must be an array'
    ));
  }

  if (state.lockedAssignments !== undefined) {
    const migrated = migrateDictionary(state.lockedAssignments, {
      ...context,
      pathName: 'lockedAssignments'
    });
    for (const [key, value] of Object.entries(migrated)) {
      lockKeys.add(key);
      if (value !== null) explicitAssignments[key] = value;
    }
  }

  if (Array.isArray(state.locked)) {
    state.locked.forEach((key, index) => {
      addLockKey(key, `locked[${index}]`);
    });
  } else if (state.locked && typeof state.locked === 'object') {
    for (const [legacyKey, rawValue] of Object.entries(state.locked)) {
      if (rawValue === false || rawValue === null) continue;
      const canonicalKey = addLockKey(legacyKey, `locked.${legacyKey}`);
      if (!canonicalKey) continue;
      const value = normalizeEmpty(rawValue, context.report);
      if (typeof value === 'string' && value) {
        assignWithoutCollision(
          explicitAssignments,
          canonicalKey,
          value,
          `locked.${legacyKey}`,
          context.report,
          context.errors
        );
      }
    }
  } else if (state.locked !== undefined && state.locked !== null) {
    context.errors.push(makeError(
      'INVALID_LOCKED_STATE',
      'locked',
      'locked must be an object or array'
    ));
  }

  return { lockKeys, explicitAssignments };
}

function emptyReport() {
  return {
    changed: false,
    keysMigrated: 0,
    roleIdsMigrated: 0,
    emptyConversions: 0,
    mergedCollisions: 0,
    assignmentCountBefore: 0,
    assignmentCountAfter: 0,
    lockedCountBefore: 0,
    lockedCountAfter: 0,
    beforeChecksum: null,
    afterChecksum: null
  };
}

export function planStateKeyMigration(state, { roleNameToId = {} } = {}) {
  const report = emptyReport();
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {
      ok: false,
      state: null,
      report,
      errors: [makeError('INVALID_STATE', '$', 'State must be an object')]
    };
  }

  const hasSchedulingFields = ['assignments', 'locked', 'lockedKeys', 'lockedAssignments']
    .some((field) => state[field] !== undefined);
  if (!hasSchedulingFields) {
    const cloned = structuredClone(state);
    report.beforeChecksum = sha256(stableStringify(cloned));
    report.afterChecksum = report.beforeChecksum;
    return { ok: true, state: cloned, report, errors: [] };
  }

  const resolveRoleId = createRoleResolver(roleNameToId);
  const nextState = structuredClone(state);
  report.beforeChecksum = sha256(stableStringify(state));
  report.assignmentCountBefore = Object.keys(state.assignments || {}).length;
  report.lockedCountBefore = Array.isArray(state.lockedKeys)
    ? state.lockedKeys.length
    : Object.keys(state.locked || {}).length;

  const context = { resolveRoleId, report, errors };
  const assignments = migrateDictionary(state.assignments || {}, {
    ...context,
    pathName: 'assignments'
  });
  const { lockKeys, explicitAssignments } = collectLockEntries(state, context);

  for (const key of lockKeys) {
    const assignedValue = assignments[key];
    const explicitValue = explicitAssignments[key];
    if (explicitValue !== undefined
      && assignedValue !== undefined
      && assignedValue !== null
      && explicitValue !== assignedValue) {
      errors.push(makeError(
        'LOCK_ASSIGNMENT_COLLISION',
        `lockedAssignments.${key}`,
        `Locked person conflicts with assignment for ${key}`,
        { key, assignedValue, explicitValue }
      ));
    }
  }

  if (errors.length > 0) {
    return { ok: false, state: null, report, errors };
  }

  const lockedAssignments = {};
  for (const key of [...lockKeys].sort()) {
    const value = explicitAssignments[key] ?? assignments[key];
    if (value !== undefined && value !== null) lockedAssignments[key] = value;
  }

  nextState.assignments = assignments;
  nextState.lockedKeys = [...lockKeys].sort();
  nextState.lockedAssignments = lockedAssignments;
  delete nextState.locked;

  report.assignmentCountAfter = Object.keys(assignments).length;
  report.lockedCountAfter = nextState.lockedKeys.length;
  report.afterChecksum = sha256(stableStringify(nextState));
  report.changed = report.beforeChecksum !== report.afterChecksum;

  return { ok: true, state: nextState, report, errors: [] };
}

function aggregateReports(plans) {
  const aggregate = emptyReport();
  aggregate.beforeChecksum = sha256(plans.map((plan) => plan.report.beforeChecksum).join('|'));
  aggregate.afterChecksum = sha256(plans.map((plan) => plan.report.afterChecksum).join('|'));
  for (const { report } of plans) {
    aggregate.changed ||= report.changed;
    for (const field of [
      'keysMigrated',
      'roleIdsMigrated',
      'emptyConversions',
      'mergedCollisions',
      'assignmentCountBefore',
      'assignmentCountAfter',
      'lockedCountBefore',
      'lockedCountAfter'
    ]) {
      aggregate[field] += report[field];
    }
  }
  return aggregate;
}

function migrationTableExists(db) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
  ).get());
}

function migrationAlreadyApplied(db, migrationId) {
  if (!migrationTableExists(db)) return false;
  return Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(migrationId));
}

function hasRevisionColumn(db) {
  return db.prepare('PRAGMA table_info(schedules)')
    .all()
    .some((column) => column.name === 'revision');
}

export async function migrateStateKeys(dbPath, {
  dryRun = true,
  roleNameToId = {},
  migrationId = DEFAULT_STATE_KEY_MIGRATION_ID,
  backupPath = `${dbPath}.${migrationId}.backup`,
  now = () => new Date().toISOString()
} = {}) {
  const resolvedDbPath = path.resolve(dbPath);
  const resolvedBackupPath = path.resolve(backupPath);
  const db = new DatabaseSync(resolvedDbPath);

  try {
    if (migrationAlreadyApplied(db, migrationId)) {
      return {
        success: true,
        dryRun,
        alreadyApplied: true,
        migrationId
      };
    }

    const rows = db.prepare('SELECT id, state_json FROM schedules ORDER BY id').all();
    const plans = [];
    const errors = [];
    for (const row of rows) {
      let state;
      try {
        state = JSON.parse(row.state_json);
      } catch (error) {
        errors.push(makeError(
          'INVALID_STATE_JSON',
          `schedules.${row.id}.state_json`,
          `Schedule ${row.id} contains invalid JSON`,
          { scheduleId: row.id, cause: error.message }
        ));
        continue;
      }

      const plan = planStateKeyMigration(state, { roleNameToId });
      if (!plan.ok) {
        for (const error of plan.errors) {
          errors.push({
            ...error,
            details: { ...error.details, scheduleId: row.id }
          });
        }
        continue;
      }
      plans.push({ id: row.id, ...plan });
    }

    const report = aggregateReports(plans);
    if (errors.length > 0) {
      return {
        success: false,
        dryRun,
        migrationId,
        report,
        errors
      };
    }
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        migrationId,
        report,
        schedules: plans.map(({ id, report: scheduleReport }) => ({
          id,
          report: scheduleReport
        }))
      };
    }

    if (fs.existsSync(resolvedBackupPath)) {
      return {
        success: false,
        dryRun: false,
        migrationId,
        report,
        errors: [makeError(
          'BACKUP_ALREADY_EXISTS',
          'backupPath',
          `Refusing to overwrite existing backup: ${resolvedBackupPath}`
        )]
      };
    }

    await db.backup(resolvedBackupPath);
    const backupSha256 = sha256(fs.readFileSync(resolvedBackupPath));
    const migrationTime = now();
    const revisionColumnExists = hasRevisionColumn(db);
    const updateSql = revisionColumnExists
      ? 'UPDATE schedules SET state_json = ?, updated_at = ?, revision = revision + 1 WHERE id = ?'
      : 'UPDATE schedules SET state_json = ?, updated_at = ? WHERE id = ?';

    const commit = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL,
          backup_path TEXT NOT NULL,
          backup_sha256 TEXT NOT NULL,
          report_json TEXT NOT NULL
        )
      `);

      const update = db.prepare(updateSql);
      for (const plan of plans) {
        if (!plan.report.changed) continue;
        update.run(JSON.stringify(plan.state), migrationTime, plan.id);
      }
      db.prepare(`
        INSERT INTO schema_migrations (
          id,
          applied_at,
          backup_path,
          backup_sha256,
          report_json
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        migrationId,
        migrationTime,
        resolvedBackupPath,
        backupSha256,
        JSON.stringify(report)
      );
    });
    commit();

    return {
      success: true,
      dryRun: false,
      alreadyApplied: false,
      migrationId,
      backupPath: resolvedBackupPath,
      backupSha256,
      report
    };
  } catch (error) {
    return {
      success: false,
      dryRun,
      migrationId,
      errors: [makeError('MIGRATION_FAILED', '$', error.message)]
    };
  } finally {
    db.close();
  }
}
