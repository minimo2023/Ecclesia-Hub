const MAIN_SECTION = 'main';
const CHILDREN_SECTION = 'children';
const ACTIVE_STATUS = 'active';
const ARCHIVED_STATUS = 'archived';

const DEFAULT_MAIN_ROLES = new Set([
  '講員',
  '領會',
  '司琴',
  '配唱',
  '影音控制',
  '影音播放',
  '1F招待',
  '6F招待',
  '餅杯服事'
]);

export class SchedulePeriodError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'SchedulePeriodError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function cellRoleName(key) {
  const normalized = String(key || '').replace('|', '__');
  return normalized.split('__')[1] || '';
}

function isSectionCell(key, section) {
  const roleName = cellRoleName(key);
  if (section === CHILDREN_SECTION) {
    return roleName.includes('兒主') || roleName === 'extra';
  }
  return DEFAULT_MAIN_ROLES.has(roleName);
}

function filterDictionary(dictionary, section) {
  return Object.fromEntries(
    Object.entries(dictionary || {}).filter(([key]) => isSectionCell(key, section))
  );
}

function filterRules(rules, section) {
  return (Array.isArray(rules) ? rules : []).filter((rule) => {
    const scope = rule?.scope || rule?.originSection;
    return scope === section || scope === 'global';
  });
}

function normalizeNotes(notes, section) {
  if (!notes || typeof notes !== 'object') return { [section]: {} };
  if (notes.main || notes.children) {
    return { [section]: clone(notes[section] || {}) };
  }

  const suffix = `|${section}`;
  const scoped = {};
  for (const [key, value] of Object.entries(notes)) {
    if (key.endsWith(suffix)) {
      scoped[key.slice(0, -suffix.length)] = value;
    }
  }
  return { [section]: scoped };
}

export function parseSchedulePeriodId(scheduleId) {
  const match = String(scheduleId || '').match(/^(main|children)-(\d{4})-(H[12]|Q[1-4])$/);
  if (!match) {
    throw new SchedulePeriodError(
      'INVALID_SCHEDULE_ID',
      '檔期 ID 格式錯誤。',
      400,
      { scheduleId }
    );
  }

  const [, section, yearText, periodCode] = match;
  if (section === MAIN_SECTION && !periodCode.startsWith('H')) {
    throw new SchedulePeriodError('INVALID_SCHEDULE_ID', '大堂檔期必須使用 H1 或 H2。');
  }
  if (section === CHILDREN_SECTION && !periodCode.startsWith('Q')) {
    throw new SchedulePeriodError('INVALID_SCHEDULE_ID', '兒主檔期必須使用 Q1 至 Q4。');
  }

  const year = Number(yearText);
  const periodNumber = Number(periodCode.slice(1));
  const ordinal = section === MAIN_SECTION
    ? year * 2 + periodNumber
    : year * 4 + periodNumber;

  return {
    id: `${section}-${year}-${periodCode}`,
    section,
    year,
    periodCode,
    periodNumber,
    ordinal,
    displayLabel: section === MAIN_SECTION
      ? `大堂 ${year}/${periodNumber === 1 ? '01–06' : '07–12'}`
      : `兒主 ${year} 第${['一', '二', '三', '四'][periodNumber - 1]}季`
  };
}

export function schedulePeriodId(section, year, periodCode) {
  return parseSchedulePeriodId(`${section}-${year}-${periodCode}`).id;
}

export function linkedChildrenPeriodId(mainPeriodId) {
  const meta = parseSchedulePeriodId(mainPeriodId);
  if (meta.section !== MAIN_SECTION) {
    throw new SchedulePeriodError('INVALID_LINK_SOURCE', '只有大堂檔期可以聯動建立兒主檔期。');
  }
  return schedulePeriodId(
    CHILDREN_SECTION,
    meta.year,
    meta.periodCode === 'H1' ? 'Q1' : 'Q3'
  );
}

function periodDateRange(meta) {
  if (meta.section === MAIN_SECTION) {
    return meta.periodCode === 'H1'
      ? [`${meta.year}-01-01`, `${meta.year}-06-30`]
      : [`${meta.year}-07-01`, `${meta.year}-12-31`];
  }

  const startMonth = (meta.periodNumber - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(Date.UTC(meta.year, endMonth, 0)).getUTCDate();
  return [
    `${meta.year}-${String(startMonth).padStart(2, '0')}-01`,
    `${meta.year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
  ];
}

function sundayDates(meta) {
  const [startText, endText] = periodDateRange(meta);
  const start = new Date(`${startText}T00:00:00Z`);
  const end = new Date(`${endText}T00:00:00Z`);
  const dates = [];
  const firstSundayOffset = (7 - start.getUTCDay()) % 7;
  start.setUTCDate(start.getUTCDate() + firstSundayOffset);
  while (start <= end) {
    dates.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() + 7);
  }
  return dates;
}

export function extractSectionState(state, section, scheduleId = null) {
  const source = state && typeof state === 'object' ? state : {};
  const meta = scheduleId ? parseSchedulePeriodId(scheduleId) : null;
  if (meta && meta.section !== section) {
    throw new SchedulePeriodError('SECTION_MISMATCH', '檔期區域與排班資料不一致。');
  }

  const dates = clone(source.sectionDates?.[section] || source.dates || []);
  const scoped = {
    periodYear: String(meta?.year ?? source.periodYear ?? ''),
    title: String(source.title || ''),
    mainRolesText: String(source.mainRolesText || ''),
    childrenRolesText: String(source.childrenRolesText || ''),
    rolesText: String(source.rolesText || ''),
    unavailableText: String(source.unavailableText || ''),
    dates,
    sectionDates: { [section]: dates },
    assignments: filterDictionary(source.assignments, section),
    locked: filterDictionary(source.locked, section),
    notes: normalizeNotes(source.notes, section),
    ruleMemos: filterRules(source.ruleMemos, section),
    temporaryRules: filterRules(source.temporaryRules, section)
  };

  if (section === MAIN_SECTION) {
    scoped.mainHalf = meta?.periodNumber
      ? String(meta.periodNumber)
      : String(source.mainHalf || '1');
  } else {
    scoped.childrenQuarter = meta?.periodNumber
      ? String(meta.periodNumber)
      : String(source.childrenQuarter || '1');
    scoped.extraColumns = clone(source.extraColumns || {
      beforeBigClass: [],
      afterBigClass: []
    });
    scoped.extraValues = clone(source.extraValues || {});
    scoped.childrenRoster = clone(source.childrenRoster || {});
  }

  return scoped;
}

export function mergeSectionStates(mainState = {}, childrenState = {}) {
  const main = extractSectionState(mainState, MAIN_SECTION);
  const children = extractSectionState(childrenState, CHILDREN_SECTION);
  const ruleMemos = new Map();
  for (const memo of [...(main.ruleMemos || []), ...(children.ruleMemos || [])]) {
    const key = memo?.id || JSON.stringify(memo);
    ruleMemos.set(key, memo);
  }

  return {
    ...main,
    periodYear: main.periodYear || children.periodYear,
    childrenQuarter: children.childrenQuarter || '1',
    dates: [...new Set([
      ...(main.sectionDates?.main || []),
      ...(children.sectionDates?.children || [])
    ])].sort(),
    sectionDates: {
      main: clone(main.sectionDates?.main || []),
      children: clone(children.sectionDates?.children || [])
    },
    assignments: {
      ...(main.assignments || {}),
      ...(children.assignments || {})
    },
    locked: {
      ...(main.locked || {}),
      ...(children.locked || {})
    },
    notes: {
      main: clone(main.notes?.main || {}),
      children: clone(children.notes?.children || {})
    },
    extraColumns: clone(children.extraColumns || {
      beforeBigClass: [],
      afterBigClass: []
    }),
    extraValues: { ...clone(main.extraValues || {}), ...clone(children.extraValues || {}) },
    childrenRoster: clone(children.childrenRoster || {}),
    ruleMemos: [...ruleMemos.values()],
    temporaryRules: [
      ...(main.temporaryRules || []),
      ...(children.temporaryRules || [])
    ]
  };
}

function blankSectionState(meta, template = {}) {
  const dates = sundayDates(meta);
  const state = extractSectionState({
    ...template,
    periodYear: String(meta.year),
    mainHalf: meta.section === MAIN_SECTION ? String(meta.periodNumber) : undefined,
    childrenQuarter: meta.section === CHILDREN_SECTION ? String(meta.periodNumber) : undefined,
    title: `台中基督徒西屯禮拜堂 ${meta.year}年主日服事輪值表`,
    unavailableText: '',
    dates,
    sectionDates: { [meta.section]: dates },
    assignments: {},
    locked: {},
    notes: { [meta.section]: {} },
    ruleMemos: [],
    temporaryRules: [],
    extraValues: {},
    childrenRoster: {}
  }, meta.section, meta.id);
  return state;
}

function rowToPeriod(row, includeState = false) {
  if (!row) return null;
  const result = {
    id: row.id,
    section: row.section,
    year: row.year,
    periodCode: row.period_code,
    displayLabel: row.display_label,
    status: row.status,
    readOnly: row.status === ARCHIVED_STATUS,
    revision: row.revision,
    predecessorId: row.predecessor_id || null,
    createdAt: row.created_at,
    createdBy: row.created_by || null,
    archivedAt: row.archived_at || null,
    archivedBy: row.archived_by || null,
    updatedAt: row.updated_at
  };
  if (includeState) {
    try {
      result.state = JSON.parse(row.state_json);
    } catch {
      result.state = {};
    }
  }
  return result;
}

function roleAllowed(cellKeyValue, allowedRoles) {
  if (allowedRoles === '*') return true;
  return allowedRoles instanceof Set && allowedRoles.has(cellRoleName(cellKeyValue));
}

export function createSchedulePeriodStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_periods (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL CHECK (section IN ('main', 'children')),
      year INTEGER NOT NULL,
      period_code TEXT NOT NULL,
      display_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      predecessor_id TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT,
      archived_at TEXT,
      archived_by TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (section, year, period_code)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_schedule_period_active_section
    ON schedule_periods(section)
    WHERE status = 'active';

    CREATE TABLE IF NOT EXISTS schedule_period_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      save_type TEXT NOT NULL,
      actor_code TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (schedule_id, revision)
    );

    CREATE TABLE IF NOT EXISTS schedule_period_migrations (
      migration_key TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    );
  `);

  const selectPeriod = db.prepare(`
    SELECT *
    FROM schedule_periods
    WHERE id = ?
  `);
  const selectActive = db.prepare(`
    SELECT *
    FROM schedule_periods
    WHERE section = ? AND status = 'active'
    LIMIT 1
  `);
  const insertPeriod = db.prepare(`
    INSERT INTO schedule_periods (
      id, section, year, period_code, display_label, status, state_json,
      revision, predecessor_id, created_at, created_by, archived_at,
      archived_by, updated_at
    ) VALUES (
      @id, @section, @year, @periodCode, @displayLabel, @status, @stateJson,
      @revision, @predecessorId, @createdAt, @createdBy, NULL, NULL, @updatedAt
    )
  `);
  const insertRevision = db.prepare(`
    INSERT OR IGNORE INTO schedule_period_revisions (
      schedule_id, revision, state_json, save_type, actor_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  function get(scheduleId) {
    parseSchedulePeriodId(scheduleId);
    return rowToPeriod(selectPeriod.get(scheduleId), true);
  }

  function list(section = null) {
    if (section && ![MAIN_SECTION, CHILDREN_SECTION].includes(section)) {
      throw new SchedulePeriodError('INVALID_SECTION', '排班區域錯誤。');
    }
    const rows = section
      ? db.prepare(`
          SELECT *
          FROM schedule_periods
          WHERE section = ?
          ORDER BY year DESC, period_code DESC
        `).all(section)
      : db.prepare(`
          SELECT *
          FROM schedule_periods
          ORDER BY section, year DESC, period_code DESC
        `).all();
    return rows.map((row) => rowToPeriod(row));
  }

  function active(section, includeState = true) {
    if (![MAIN_SECTION, CHILDREN_SECTION].includes(section)) {
      throw new SchedulePeriodError('INVALID_SECTION', '排班區域錯誤。');
    }
    return rowToPeriod(selectActive.get(section), includeState);
  }

  function migrateLegacyDefault() {
    const migrationKey = 'legacy-default-to-schedule-periods-v1';
    if (db.prepare(`
      SELECT migration_key
      FROM schedule_period_migrations
      WHERE migration_key = ?
    `).get(migrationKey)) {
      return { migrated: false, reason: 'already-completed' };
    }

    if (db.prepare('SELECT COUNT(*) AS count FROM schedule_periods').get().count > 0) {
      db.prepare(`
        INSERT INTO schedule_period_migrations (migration_key, completed_at, details_json)
        VALUES (?, ?, ?)
      `).run(migrationKey, nowIso(), JSON.stringify({ skipped: 'periods-already-exist' }));
      return { migrated: false, reason: 'periods-already-exist' };
    }

    const legacy = db.prepare(`
      SELECT state_json
      FROM schedules
      WHERE id = 'default'
    `).get();
    if (!legacy) return { migrated: false, reason: 'no-default-state' };

    let state;
    try {
      state = JSON.parse(legacy.state_json);
    } catch {
      throw new SchedulePeriodError(
        'LEGACY_STATE_INVALID',
        '既有 default 排班資料無法解析，已停止遷移。',
        500
      );
    }

    const year = Number(state.periodYear);
    const mainHalf = Number(state.mainHalf);
    const childrenQuarter = Number(state.childrenQuarter);
    if (!Number.isInteger(year) || ![1, 2].includes(mainHalf) || ![1, 2, 3, 4].includes(childrenQuarter)) {
      throw new SchedulePeriodError(
        'LEGACY_PERIOD_INVALID',
        '既有排班資料缺少有效年份、半年或季度，已停止遷移。',
        500
      );
    }

    const mainMeta = parseSchedulePeriodId(`main-${year}-H${mainHalf}`);
    const childrenMeta = parseSchedulePeriodId(`children-${year}-Q${childrenQuarter}`);
    const timestamp = nowIso();

    const transaction = db.transaction(() => {
      const created = [];
      for (const meta of [mainMeta, childrenMeta]) {
        const sectionState = extractSectionState(state, meta.section, meta.id);
        const stateJson = JSON.stringify(sectionState);
        insertPeriod.run({
          ...meta,
          status: ACTIVE_STATUS,
          stateJson,
          revision: 1,
          predecessorId: null,
          createdAt: timestamp,
          createdBy: 'migration',
          updatedAt: timestamp
        });
        insertRevision.run(meta.id, 1, stateJson, 'migration', 'migration', timestamp);
        created.push(meta.id);
      }

      db.prepare(`
        INSERT INTO schedule_period_migrations (migration_key, completed_at, details_json)
        VALUES (?, ?, ?)
      `).run(migrationKey, timestamp, JSON.stringify({ created }));
      return created;
    });

    return { migrated: true, created: transaction() };
  }

  function createOne(meta, actorCode, predecessor, template, timestamp) {
    const state = blankSectionState(meta, template);
    const stateJson = JSON.stringify(state);
    insertPeriod.run({
      ...meta,
      status: ACTIVE_STATUS,
      stateJson,
      revision: 1,
      predecessorId: predecessor?.id || null,
      createdAt: timestamp,
      createdBy: actorCode,
      updatedAt: timestamp
    });
    insertRevision.run(meta.id, 1, stateJson, 'created', actorCode, timestamp);
    return rowToPeriod(selectPeriod.get(meta.id), true);
  }

  function archiveCurrent(section, actorCode, timestamp) {
    const current = selectActive.get(section);
    if (!current) return null;
    db.prepare(`
      UPDATE schedule_periods
      SET status = 'archived',
          archived_at = ?,
          archived_by = ?,
          updated_at = ?
      WHERE id = ?
    `).run(timestamp, actorCode, timestamp, current.id);
    return rowToPeriod(current, true);
  }

  function assertFutureTarget(targetMeta, current) {
    if (!current) return;
    const currentMeta = parseSchedulePeriodId(current.id);
    if (targetMeta.ordinal <= currentMeta.ordinal) {
      throw new SchedulePeriodError(
        'PERIOD_NOT_AFTER_ACTIVE',
        '新檔期必須晚於目前作用中檔期。',
        409,
        { activePeriodId: current.id, targetPeriodId: targetMeta.id }
      );
    }
  }

  function createNext(scheduleId, actorCode) {
    const target = parseSchedulePeriodId(scheduleId);
    const actor = String(actorCode || '');
    const timestamp = nowIso();
    if (selectPeriod.get(target.id)) {
      throw new SchedulePeriodError('PERIOD_EXISTS', '目標檔期已存在，不能覆蓋。', 409);
    }

    const transaction = db.transaction(() => {
      const currentTargetSection = selectActive.get(target.section);
      assertFutureTarget(target, currentTargetSection);

      if (target.section === MAIN_SECTION) {
        const linked = parseSchedulePeriodId(linkedChildrenPeriodId(target.id));
        if (selectPeriod.get(linked.id)) {
          throw new SchedulePeriodError(
            'LINKED_PERIOD_EXISTS',
            '對應的兒主檔期已存在，已停止聯動建立。',
            409,
            { linkedPeriodId: linked.id }
          );
        }
        const currentChildren = selectActive.get(CHILDREN_SECTION);
        assertFutureTarget(linked, currentChildren);
        const archivedMain = archiveCurrent(MAIN_SECTION, actor, timestamp);
        const archivedChildren = archiveCurrent(CHILDREN_SECTION, actor, timestamp);
        const mainPeriod = createOne(target, actor, archivedMain, archivedMain?.state, timestamp);
        const childrenPeriod = createOne(
          linked,
          actor,
          archivedChildren,
          archivedChildren?.state,
          timestamp
        );
        return {
          created: [mainPeriod, childrenPeriod],
          archived: [archivedMain, archivedChildren].filter(Boolean)
        };
      }

      if (!['Q2', 'Q4'].includes(target.periodCode)) {
        throw new SchedulePeriodError(
          'CHILDREN_PERIOD_LINKED_TO_MAIN',
          '兒主第一季與第三季必須由大堂新檔期聯動建立。',
          409
        );
      }
      const archivedChildren = archiveCurrent(CHILDREN_SECTION, actor, timestamp);
      const childrenPeriod = createOne(
        target,
        actor,
        archivedChildren,
        archivedChildren?.state,
        timestamp
      );
      return {
        created: [childrenPeriod],
        archived: [archivedChildren].filter(Boolean)
      };
    });

    return transaction();
  }

  function saveState(scheduleId, incomingState, {
    baseRevision,
    actorCode,
    allowedRoles = '*',
    saveType = 'draft'
  } = {}) {
    const meta = parseSchedulePeriodId(scheduleId);
    const transaction = db.transaction(() => {
      const row = selectPeriod.get(meta.id);
      if (!row) {
        throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定檔期。', 404);
      }
      if (row.status !== ACTIVE_STATUS) {
        throw new SchedulePeriodError(
          'SCHEDULE_PERIOD_READ_ONLY',
          '此檔期已封存，僅供歷史查閱。',
          423
        );
      }
      if (Number(baseRevision) !== Number(row.revision)) {
        throw new SchedulePeriodError(
          'REVISION_CONFLICT',
          '檔期已有較新的變更，請重新載入。',
          409,
          { expectedRevision: row.revision, receivedRevision: baseRevision }
        );
      }

      const previousState = JSON.parse(row.state_json);
      const incoming = extractSectionState(incomingState, meta.section, meta.id);
      let nextState = incoming;

      if (allowedRoles !== '*') {
        nextState = clone(previousState);
        const assignmentKeys = new Set([
          ...Object.keys(previousState.assignments || {}),
          ...Object.keys(incoming.assignments || {})
        ]);
        for (const key of assignmentKeys) {
          if (!roleAllowed(key, allowedRoles)) continue;
          if (Object.hasOwn(incoming.assignments || {}, key)) {
            nextState.assignments[key] = incoming.assignments[key];
          } else {
            delete nextState.assignments[key];
          }
        }
      }

      const changedAssignmentKeys = new Set([
        ...Object.keys(previousState.assignments || {}),
        ...Object.keys(nextState.assignments || {})
      ]);
      for (const key of changedAssignmentKeys) {
        if ((previousState.assignments || {})[key] === (nextState.assignments || {})[key]) continue;
        if ((previousState.locked || {})[key]) {
          throw new SchedulePeriodError(
            'SCHEDULE_CELL_LOCKED',
            '此排班格已鎖定，請先解除鎖定。',
            409,
            { cellKey: key }
          );
        }
        if (!roleAllowed(key, allowedRoles)) {
          throw new SchedulePeriodError(
            'ROLE_WRITE_FORBIDDEN',
            '此帳號沒有修改該職務的權限。',
            403,
            { cellKey: key }
          );
        }
      }

      nextState.locked = clone(previousState.locked || {});
      const nextRevision = row.revision + 1;
      const timestamp = nowIso();
      const stateJson = JSON.stringify(nextState);
      db.prepare(`
        UPDATE schedule_periods
        SET state_json = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(stateJson, nextRevision, timestamp, meta.id);
      insertRevision.run(
        meta.id,
        nextRevision,
        stateJson,
        saveType,
        actorCode || null,
        timestamp
      );
      return rowToPeriod(selectPeriod.get(meta.id), true);
    });
    return transaction();
  }

  function setCellLocks(scheduleId, cells, {
    baseRevision,
    actorCode,
    allowedRoles = '*'
  } = {}) {
    const meta = parseSchedulePeriodId(scheduleId);
    const updates = Array.isArray(cells) ? cells : [];
    if (!updates.length) {
      throw new SchedulePeriodError('LOCK_CELLS_REQUIRED', '未提供要變更的鎖定格。');
    }
    for (const update of updates) {
      if (!isSectionCell(update?.cellKey, meta.section)) {
        throw new SchedulePeriodError('CELL_SECTION_MISMATCH', '格子不屬於指定檔期。');
      }
      if (!roleAllowed(update.cellKey, allowedRoles)) {
        throw new SchedulePeriodError('ROLE_WRITE_FORBIDDEN', '此帳號沒有修改該職務的權限。', 403);
      }
    }

    const transaction = db.transaction(() => {
      const row = selectPeriod.get(meta.id);
      if (!row) throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定檔期。', 404);
      if (row.status !== ACTIVE_STATUS) {
        throw new SchedulePeriodError(
          'SCHEDULE_PERIOD_READ_ONLY',
          '此檔期已封存，不能變更鎖定。',
          423
        );
      }
      if (Number(baseRevision) !== Number(row.revision)) {
        throw new SchedulePeriodError('REVISION_CONFLICT', '檔期已有較新的變更，請重新載入。', 409, {
          expectedRevision: row.revision,
          receivedRevision: baseRevision
        });
      }
      const state = JSON.parse(row.state_json);
      state.locked ||= {};
      for (const update of updates) {
        if (update.locked) state.locked[update.cellKey] = true;
        else delete state.locked[update.cellKey];
      }

      const nextRevision = row.revision + 1;
      const timestamp = nowIso();
      const stateJson = JSON.stringify(state);
      db.prepare(`
        UPDATE schedule_periods
        SET state_json = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(stateJson, nextRevision, timestamp, meta.id);
      insertRevision.run(
        meta.id,
        nextRevision,
        stateJson,
        updates.length === 1
          ? (updates[0].locked ? 'lock' : 'unlock')
          : 'bulk-lock',
        actorCode || null,
        timestamp
      );
      return rowToPeriod(selectPeriod.get(meta.id), true);
    });
    return transaction();
  }

  function setCellLock(scheduleId, cellKeyValue, locked, options = {}) {
    return setCellLocks(scheduleId, [{ cellKey: cellKeyValue, locked }], options);
  }

  function clearUnlocked(scheduleId, { actorCode, baseRevision } = {}) {
    const meta = parseSchedulePeriodId(scheduleId);
    const transaction = db.transaction(() => {
      const row = selectPeriod.get(meta.id);
      if (!row) throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定檔期。', 404);
      if (row.status !== ACTIVE_STATUS) {
        throw new SchedulePeriodError(
          'SCHEDULE_PERIOD_READ_ONLY',
          '此檔期已封存，不能清空排班。',
          423
        );
      }
      if (Number(baseRevision) !== Number(row.revision)) {
        throw new SchedulePeriodError('REVISION_CONFLICT', '檔期已有較新的變更，請重新載入。', 409, {
          expectedRevision: row.revision,
          receivedRevision: baseRevision
        });
      }

      const state = JSON.parse(row.state_json);
      const nextAssignments = {};
      let clearedCount = 0;
      let preservedLockedCount = 0;
      for (const [key, value] of Object.entries(state.assignments || {})) {
        if (state.locked?.[key]) {
          nextAssignments[key] = value;
          preservedLockedCount += 1;
        } else {
          clearedCount += 1;
        }
      }
      state.assignments = nextAssignments;

      const nextRevision = row.revision + 1;
      const timestamp = nowIso();
      const stateJson = JSON.stringify(state);
      db.prepare(`
        UPDATE schedule_periods
        SET state_json = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(stateJson, nextRevision, timestamp, meta.id);
      insertRevision.run(
        meta.id,
        nextRevision,
        stateJson,
        'clear-unlocked',
        actorCode || null,
        timestamp
      );
      return {
        period: rowToPeriod(selectPeriod.get(meta.id), true),
        clearedCount,
        preservedLockedCount
      };
    });
    return transaction();
  }

  function revisions(scheduleId, limit = 50) {
    parseSchedulePeriodId(scheduleId);
    return db.prepare(`
      SELECT id, schedule_id, revision, save_type, actor_code, created_at
      FROM schedule_period_revisions
      WHERE schedule_id = ?
      ORDER BY revision DESC
      LIMIT ?
    `).all(scheduleId, Math.max(1, Math.min(Number(limit) || 50, 200)));
  }

  return {
    migrateLegacyDefault,
    list,
    get,
    active,
    createNext,
    saveState,
    setCellLock,
    setCellLocks,
    clearUnlocked,
    revisions
  };
}
