import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import DatabaseSync from 'better-sqlite3';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  auditSchedule,
  validateAuditSuggestion
} from './scheduling/llm-schedule-auditor.mjs';
import { runOrchestrator } from './scheduling/schedule-orchestrator.mjs';
import { createScheduleRunRecorder } from './scheduling/schedule-run-recorder.mjs';
import { resolveSchedulingModel } from './scheduling/scheduling-model-policy.mjs';
import {
  createSchedulePeriodStore,
  mergeSectionStates,
  SchedulePeriodError
} from './scheduling/schedule-period-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerRoot = path.resolve(__dirname, '..');
const dataFile = path.join(workerRoot, 'schedule-data.json');
const dbFile = process.env.XIT_WORKER_DB_FILE
  ? path.resolve(process.env.XIT_WORKER_DB_FILE)
  : path.join(workerRoot, 'schedule.db');

dotenv.config({
  path: path.resolve(workerRoot, '.env'),
  override: true
});

const router = express.Router();
const clients = new Set();
const db = new DatabaseSync(dbFile);
const fixedMainRoleNames = [
  '講員',
  '領會',
  '司琴',
  '配唱',
  '影音控制',
  '影音播放',
  '1F招待',
  '6F招待',
  '餅杯服事',
];
const fixedChildrenRoleNames = [
  '兒主敬拜',
  '兒主司琴',
  '兒主中小',
  '兒主大班',
];
const fixedMainRolesText = fixedMainRoleNames.join('\n');
const fixedChildrenRolesText = fixedChildrenRoleNames.join('\n');
// [ISOLATION] 啟用 WAL 模式：允許讀寫並行，大幅降低對 Node.js Event Loop 的同步阻塞影響
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    sections TEXT NOT NULL,
    dates TEXT NOT NULL,
    message TEXT NOT NULL,
    ai_rules TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
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
const attendanceColumns = db.prepare(`PRAGMA table_info(attendance_records)`).all();
if (!attendanceColumns.some((column) => column.name === 'schedule_id')) {
  db.exec(`ALTER TABLE attendance_records ADD COLUMN schedule_id TEXT`);
}
db.exec(`
  CREATE INDEX IF NOT EXISTS ix_attendance_records_schedule_date
  ON attendance_records(schedule_id, service_date)
`);
const scheduleRunRecorder = createScheduleRunRecorder(db);
const schedulePeriodStore = createSchedulePeriodStore(db);

const revisionColumns = db.prepare(`PRAGMA table_info(schedule_revisions)`).all();
if (!revisionColumns.some((column) => column.name === 'save_type')) {
  db.exec(`ALTER TABLE schedule_revisions ADD COLUMN save_type TEXT NOT NULL DEFAULT 'completed'`);
}
if (!revisionColumns.some((column) => column.name === 'title')) {
  db.exec(`ALTER TABLE schedule_revisions ADD COLUMN title TEXT NOT NULL DEFAULT ''`);
}

function migrateJsonFile() {
  const existing = db.prepare('SELECT id FROM schedules WHERE id = ?').get('default');
  if (existing || !fs.existsSync(dataFile)) return;

  try {
    const state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    writeState('default', state);
  } catch {
    // Ignore legacy JSON parse failures.
  }
}

function cleanLegacyPeopleAndAssignments(state) {
  if (!state) return;

  if (Array.isArray(state.people)) {
    state.people = state.people
      .filter((person) => person && person.name)
      .map((person) => ({
        ...person,
        id: person.id || crypto.randomUUID(),
        sections: Array.isArray(person.sections)
          ? person.sections
          : (person.category ? [person.category] : []),
        categories: Array.isArray(person.categories)
          ? person.categories
          : (Array.isArray(person.details) ? person.details : [])
      }));
  }
}

function hasVisibleCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''));
}

function readScheduleRow(id) {
  return db.prepare('SELECT state_json FROM schedules WHERE id = ?').get(id);
}

function sanitizeScheduleState(state) {
  const nextState = { ...(state || {}) };
  delete nextState.people;
  delete nextState.serviceDetails;
  nextState.mainRolesText = fixedMainRolesText;
  nextState.childrenRolesText = fixedChildrenRolesText;
  nextState.rolesText = [fixedMainRolesText, fixedChildrenRolesText].join('\n');
  return nextState;
}

function sanitizePeopleState(state) {
  const people = Array.isArray(state?.people) ? state.people : [];
  const serviceDetails = Array.isArray(state?.serviceDetails) ? state.serviceDetails : [];
  const nextState = { people, serviceDetails };
  cleanLegacyPeopleAndAssignments(nextState);
  return nextState;
}

function readState() {
  const row = readScheduleRow('default');
  if (!row) return {};

  try {
    const state = JSON.parse(row.state_json);
    return sanitizeScheduleState(state);
  } catch {
    return {};
  }
}

function readPeopleStateFromRevisions() {
  const rows = db.prepare(`
    SELECT state_json
    FROM schedule_revisions
    WHERE schedule_id = ?
    ORDER BY id DESC
  `).all('default');

  for (const row of rows) {
    try {
      const state = JSON.parse(row.state_json);
      const peopleState = sanitizePeopleState(state);
      const sample = (peopleState.people || []).slice(0, 5).map((person) => person?.name || '').join('');
      if (peopleState.people.length && hasVisibleCjk(sample)) {
        return peopleState;
      }
    } catch {
      // ignore bad revision payloads
    }
  }

  return { people: [], serviceDetails: [] };
}

function readScheduleStateFromRevisions() {
  const rows = db.prepare(`
    SELECT state_json
    FROM schedule_revisions
    WHERE schedule_id = ?
    ORDER BY id DESC
  `).all('default');

  for (const row of rows) {
    try {
      const state = sanitizeScheduleState(JSON.parse(row.state_json));
      const sample = [
        state.title || '',
        state.mainRolesText || '',
        state.childrenRolesText || '',
      ].join(' ');
      if (hasVisibleCjk(sample)) {
        return state;
      }
    } catch {
      // ignore bad revision payloads
    }
  }

  return null;
}

function readPeopleState() {
  const row = readScheduleRow('people');
  if (!row) return readPeopleStateFromRevisions();

  try {
    return sanitizePeopleState(JSON.parse(row.state_json));
  } catch {
    return readPeopleStateFromRevisions();
  }
}

function maybeRepairPersistedState() {
  const currentSchedule = readState();
  const scheduleSample = [
    currentSchedule.title || '',
    currentSchedule.mainRolesText || '',
    currentSchedule.childrenRolesText || '',
  ].join(' ');
  if (!hasVisibleCjk(scheduleSample)) {
    const fallbackSchedule = readScheduleStateFromRevisions();
    if (fallbackSchedule) {
      writeState('default', fallbackSchedule);
    }
  }

  const currentPeople = readPeopleState();
  const peopleSample = (currentPeople.people || []).slice(0, 5).map((person) => person?.name || '').join('');
  const peopleRow = readScheduleRow('people');
  if (!peopleRow || !hasVisibleCjk(peopleSample)) {
    const fallbackPeople = readPeopleStateFromRevisions();
    if ((fallbackPeople.people || []).length) {
      writeState('people', fallbackPeople);
    }
  }
}

function writeState(id, state, options = {}) {
  const normalizedState = id === 'people'
    ? sanitizePeopleState(state)
    : sanitizeScheduleState(state);
  const now = new Date().toISOString();
  const title = typeof normalizedState.title === 'string' ? normalizedState.title : '';
  const stateJson = JSON.stringify(normalizedState);
  const saveType = options.saveType || null;

  db.prepare(`
    INSERT INTO schedules (id, title, state_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(id, title, stateJson, now);

  if (saveType && id === 'default') {
    db.prepare(`
      INSERT INTO schedule_revisions (schedule_id, state_json, created_at, save_type, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('default', stateJson, now, saveType, title);
  }
}

function readHistory() {
  return db.prepare(`
    SELECT id, created_at, save_type, title
    FROM schedule_revisions
    WHERE schedule_id = ?
    ORDER BY id DESC
    LIMIT 50
  `).all('default');
}

function readRevision(id) {
  const row = db.prepare(`
    SELECT id, schedule_id, state_json, created_at, save_type, title
    FROM schedule_revisions
    WHERE id = ? AND schedule_id = ?
  `).get(Number(id), 'default');
  if (!row) return null;

  try {
    const state = JSON.parse(row.state_json);
    cleanLegacyPeopleAndAssignments(state);
    return {
      id: row.id,
      created_at: row.created_at,
      save_type: row.save_type,
      title: row.title,
      state
    };
  } catch {
    return null;
  }
}

function broadcast(eventName, clientId, state) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify({ clientId, state })}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function normalizeIsoDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return text;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function buildPrompt(payload) {
  const {
    dates = [],
    sectionDates = {},
    roles = [],
    unavailableText = '',
    locked = {},
    assignments = {},
    flagDuplicates,
    avoidAdjacent,
    balanceLoad,
    maxPerDay,
    aiPrompt,
    relatedAiPrompt,
    temporaryRules = []
  } = payload;

  const mainDates = sectionDates.main || [];
  const childrenDates = sectionDates.children || [];

  const rolesInfo = roles.map((role) => {
    const sectionName = role.section === 'children' ? '兒童' : '主堂';
    return `- ${role.name} (${sectionName}): ${(role.people || []).join(', ')}`;
  }).join('\n');

  const unavailableMap = new Map();
  unavailableText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [name, datesText = ''] = line.split(/[：:]/);
      const parsedDates = datesText
        .split(/[、,，\s]+/)
        .map((value) => normalizeIsoDate(value))
        .filter(Boolean);
      if (!unavailableMap.has(name.trim())) unavailableMap.set(name.trim(), []);
      unavailableMap.set(name.trim(), Array.from(new Set([
        ...unavailableMap.get(name.trim()),
        ...parsedDates
      ])));
    });

  const unavailableInfo = unavailableMap.size
    ? Array.from(unavailableMap.entries()).map(([name, blockedDates]) => `- ${name}: ${blockedDates.join(', ')}`).join('\n')
    : '- 無額外不可排日期';

  const lockedInfo = Object.keys(locked)
    .filter((key) => locked[key] && assignments[key])
    .map((key) => `- ${key}: ${assignments[key]}`)
    .join('\n') || '- 無鎖定欄位';

  const rules = [
    `每位同工每天最多可被安排 ${Number(maxPerDay) || 2} 次。`,
    '若某人被安排為講員，當天不可再安排任何其他服事。',
    '若某人被安排為司琴，當天不可再安排任何其他服事。',
    '主堂與兒主必須絕對互斥，同一位同工同一天不可同時出現在兩邊。',
    '兒主司琴與主堂司琴不可為同一人；由於主堂與兒主本來就互斥，請直接視為不可同日重複安排。',
    '兒主司琴與兒主課程不互斥，可安排為同一人。',
    '【優先與覆蓋規則】：當多條備忘規則衝突時，請以列表後方的規則為優先（依回饋或建立時間排序，越後面的越新，權限越大）。',
    '【可排與不可排聯動】：若某同工有明確指定「可排（必須優先安排）」的日期，請優先將他排入該日期，並自動將他視為「其他沒有被提到的日期皆不可排」，除非有更新的覆蓋規則指出他在其他日期也要排。',
    '【嚴格留白邏輯】：你的任務是「依據明確規則」進行填寫。對於備忘錄中「沒有明確指定」要填入的人員與格子，請完全留白，絕對不要為了填滿排班表而自動分配任何人！'
  ];
  if (avoidAdjacent) rules.push('避免同一位同工在相鄰日期擔任相同角色。');
  if (balanceLoad) rules.push('盡量平均分配各同工的服事次數。');
  if (flagDuplicates) rules.push('若同一天同一位同工被排到多個角色，請盡量避免。');

  const sortedTemporaryRules = [...(temporaryRules || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const tempRuleLines = sortedTemporaryRules.map(rule => {
    let scopeText = rule.scope === 'global' ? '【全域限制，跨區生效】' : `【區域限制】`;
    let dateText = rule.dateRange ? `${rule.dateRange.start} ~ ${rule.dateRange.end}` : (rule.date || '所有日期');

    if (rule.type === 'conditional') {
      return `- ${dateText}: 【連動排班】若 ${rule.condition?.person} 被排定為 ${rule.condition?.role}，則同一天必須安排 ${rule.action?.person} 為 ${rule.action?.role} ${scopeText}。理由: ${rule.reason || '無'}`;
    }
    if (rule.type === 'force_role') {
      return `- ${dateText}: 【強制開啟職位】必須安排一名同工擔任 ${rule.role} ${scopeText}。理由: ${rule.reason || '無'}`;
    }

    let typeText = rule.type === 'unavailable' ? '不可排 (絕對互斥)' : (rule.type === 'fixed' ? '必須優先安排' : rule.type);
    return `- ${dateText}: ${rule.person} ${typeText} ${rule.role ? `(${rule.role})` : ''} ${scopeText}。理由: ${rule.reason || '無'}`;
  });

  const promptNotes = [
    `目前頁面備忘：${aiPrompt || '無'}`,
    `另一頁相關備忘（服事人員可能重疊，請一併考量）：${relatedAiPrompt || '無'}`,
    tempRuleLines.length > 0 ? `\n### 🔴 AI 嚴格臨時規則 (最高優先權，必須絕對遵守) ###\n${tempRuleLines.join('\n')}` : ''
  ].join('\n');

  return `
你是教會排班助理。請根據提供的日期、角色、同工名單、不可排日期與鎖定欄位，輸出 JSON 排班結果。

日期區間：
- 主堂：${mainDates.join(', ') || '無'}
- 兒童：${childrenDates.join(', ') || '無'}

所有日期：
${dates.join(', ')}

角色與可排同工：
${rolesInfo || '- 無'}

不可排日期：
${unavailableInfo}

已鎖定欄位：
${lockedInfo}

規則：
${rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}

額外要求：
${promptNotes}

請只輸出以下格式的 JSON，不要包含任何解釋文字：
{
  "assignments": {
    "YYYY-MM-DD__角色名稱": "同工姓名"
  }
}
`;
}

function getApiKeys() {
  const workerKey = process.env.GEMINI_WORKER_KEY;
  if (!workerKey) {
    throw new Error('Missing GEMINI_WORKER_KEY for XIT-Worker AI.');
  }
  return workerKey.split(',').map((k) => k.trim()).filter(Boolean);
}

async function runAiScheduling(payload, progressCallback, { signal } = {}) {
  const keys = getApiKeys();
  if (!keys.length) {
    throw new Error('Missing GEMINI_WORKER_KEY');
  }

  const schedulingPayload = { ...payload };
  if (!schedulingPayload.people) {
    const peopleState = readPeopleState();
    schedulingPayload.people = peopleState.people || [];
  }

  const emitProgress = progressCallback || ((stage, message) => {
    const eventData = JSON.stringify({ type: 'ai_progress', stage, message });
    for (const client of clients) {
      client.write(`data: ${eventData}\n\n`);
    }
  });

  return await runOrchestrator(schedulingPayload, keys, emitProgress, { signal });
}

const periodWriteProfiles = {
  A000: { main: '*', children: '*' },
  A001: { main: new Set(['領會', '司琴', '配唱']) },
  A002: { main: new Set(['影音控制', '影音播放']) },
  A003: { main: new Set(['1F招待', '6F招待']) },
  A004: { children: '*' }
};

function requestAccountCode(req) {
  return String(req.header('X-Account-Code') || '').trim().toUpperCase();
}

function allowedPeriodRoles(req, section) {
  const accountCode = requestAccountCode(req);
  return {
    accountCode,
    allowedRoles: periodWriteProfiles[accountCode]?.[section] || null
  };
}

function requirePeriodManager(req, section) {
  const { accountCode, allowedRoles } = allowedPeriodRoles(req, section);
  if (allowedRoles !== '*') {
    throw new SchedulePeriodError(
      'PERIOD_MANAGE_FORBIDDEN',
      '此帳號沒有管理該區域檔期的權限。',
      403
    );
  }
  return accountCode;
}

function sendSchedulePeriodError(res, error) {
  const status = Number(error?.status) || 500;
  res.status(status).json({
    ok: false,
    code: error?.code || 'SCHEDULE_PERIOD_ERROR',
    error: error?.message || '檔期操作失敗',
    details: error?.details || {}
  });
}

function activePeriodWorkspace() {
  const mainPeriod = schedulePeriodStore.active('main');
  const childrenPeriod = schedulePeriodStore.active('children');
  if (!mainPeriod && !childrenPeriod) return null;
  return {
    periods: {
      main: mainPeriod ? { ...mainPeriod, state: undefined } : null,
      children: childrenPeriod ? { ...childrenPeriod, state: undefined } : null
    },
    state: mergeSectionStates(mainPeriod?.state || {}, childrenPeriod?.state || {})
  };
}

function schedulePeriodEventState(period) {
  return {
    section: period.section,
    scheduleId: period.id,
    revision: period.revision,
    period
  };
}

function backfillAttendanceScheduleIds() {
  const activeMain = schedulePeriodStore.active('main', false);
  if (!activeMain) return 0;
  return db.prepare(`
    UPDATE attendance_records
    SET schedule_id = ?
    WHERE schedule_id IS NULL OR schedule_id = ''
  `).run(activeMain.id).changes;
}

function ensureSchedulePeriodMigrationBackup() {
  const legacy = db.prepare(`
    SELECT id
    FROM schedules
    WHERE id = 'default'
  `).get();
  const periodCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM schedule_periods
  `).get().count;
  const migrationDone = db.prepare(`
    SELECT migration_key
    FROM schedule_period_migrations
    WHERE migration_key = 'legacy-default-to-schedule-periods-v1'
  `).get();
  if (!legacy || periodCount > 0 || migrationDone) return null;

  db.pragma('wal_checkpoint(FULL)');
  const extension = path.extname(dbFile) || '.db';
  const backupPath = `${dbFile.slice(0, -extension.length)}.before-schedule-periods${extension}`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(dbFile, backupPath);
  }
  return backupPath;
}

function inferParsedLimitCount(rule, sourceText = '') {
  const direct = Number(
    rule.maxCount ?? rule.limit ?? rule.value ?? rule.maxTimes
  );
  if (Number.isInteger(direct) && direct >= 0) return direct;
  const text = `${rule.reason || ''} ${sourceText}`;
  const arabicMatch = text.match(/(\d+)\s*(?:次|回)/);
  if (arabicMatch) return Number(arabicMatch[1]);
  const chineseDigits = {
    零: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  const chineseMatch = text.match(/([零一二兩三四五六七八九十]+)\s*(?:次|回)/);
  const value = chineseMatch?.[1];
  if (!value) return null;
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, units] = value.split('十');
    return (tens ? chineseDigits[tens] : 1) * 10
      + (units ? chineseDigits[units] : 0);
  }
  return chineseDigits[value] ?? null;
}

function buildRoleStructuredRuleEntries(aiPrompt, activeRolesInfo) {
  const roleNames = Object.values(activeRolesInfo || {})
    .flatMap(value => Array.isArray(value) ? value : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const roleNameMap = new Map(roleNames.map(role => [role.replace(/\s+/g, ''), role]));
  const entries = [];
  let currentRole = null;

  String(aiPrompt || '').split(/\r?\n/).forEach((rawLine, index) => {
    let line = rawLine.trim();
    if (!line) return;

    const headingMatch = line.match(/^([^：:]{1,40})[：:]\s*(.*)$/);
    if (headingMatch) {
      const role = roleNameMap.get(headingMatch[1].trim().replace(/\s+/g, ''));
      if (role) {
        currentRole = role;
        line = headingMatch[2].trim();
        if (!line) return;
      }
    }

    const personMatch = line.match(/^([^：:]{1,40})[：:]\s*(.+)$/);
    if (personMatch) {
      entries.push({
        sourceLineId: `L${index + 1}`,
        role: currentRole,
        personLabel: personMatch[1].trim(),
        instruction: personMatch[2].trim()
      });
      return;
    }

    const previousEntry = entries.at(-1);
    if (previousEntry && previousEntry.role === currentRole) {
      previousEntry.instruction += `\n${line}`;
      return;
    }

    entries.push({
      sourceLineId: `L${index + 1}`,
      role: currentRole,
      personLabel: null,
      instruction: line
    });
  });

  return entries;
}

async function runAiRuleParsing(payload) {
  const { aiPrompt, scope, selectedRoles, peopleListWithRoles, activeRolesInfo, datesWithNotes, year } = payload;
  const keys = getApiKeys();
  if (!keys.length) {
    throw new Error('Missing GEMINI_WORKER_KEY');
  }

  const selectedRolesStr = selectedRoles && selectedRoles.length ? selectedRoles.join(', ') : '無指定，請自行判斷';
  const structuredRuleEntries = buildRoleStructuredRuleEntries(aiPrompt, activeRolesInfo);
  const structuredEntryBySourceLineId = new Map(
    structuredRuleEntries.map(entry => [entry.sourceLineId, entry])
  );
  const inheritedRoleBySourceLineId = new Map(
    structuredRuleEntries
      .filter(entry => entry.role)
      .map(entry => [entry.sourceLineId, entry.role])
  );

  const promptText = `
你是一個排班規則解析器。請將使用者輸入的自然語言備忘錄轉換為嚴格的 JSON 規則陣列。

目前排班年份：${year || '2026'} 年
使用者指定的套用區域 (scope)：${scope === 'children' ? '兒童主日學 (children)' : (scope === 'main' ? '大堂主日崇拜 (main)' : '全域跨區 (global)')}
使用者指定影響的職位：${selectedRolesStr}

【當前有效職位庫】
${JSON.stringify(activeRolesInfo, null, 2)}

【同工嚴格編制名冊】
(格式：姓名 [大堂指定職位] [兒主指定職位])
${peopleListWithRoles.join('\n')}

【目前檔期日期與節日備註】
(格式：YYYY-MM-DD 備註：文字)
${(datesWithNotes || []).join('\n')}

自然語言備忘：
"${aiPrompt || ''}"

【依職務預先分區的規則明細】
以下資料已由系統依照職務標題切割。role 是該行所屬的權威職務，不得因名冊資格或同名人員而改成其他職務。
${JSON.stringify(structuredRuleEntries, null, 2)}

【轉換規則】
1. 針對一般人員排班限制，必須且只能從「同工嚴格編制名冊」中挑選人名。嚴禁捏造名單外的人名！若備忘錄中使用暱稱，請務必對照名冊並輸出「正式姓名」。
2. 判斷限制的「影響範圍 (scope)」：若使用者指定了套用區域，請盡量符合其指定。若為全域請輸出 "global"。
2.1 「依職務預先分區的規則明細」中只要 role 有值，每一筆輸出都必須：
   - 原樣回傳對應的 sourceLineId。
   - 使用該筆資料的 role，不得自行改用此人在名冊中的其他職務。
   - 同一人若出現在不同 role，必須視為兩組獨立規則，不可合併或省略。
3. 支援的規則類型 (type)：
   - "unavailable" (不可排)
   - "fixed" (固定指派)
   - "limit" (次數限制：僅用於每月/每年總次數限制。絕對不可用於「連續排班」！)
   - "exclusive_role" (排他性職位)
   - "exclusive_person" (人員互斥：當要求 A 與 B 不能在同日服事時使用。例如「與某人錯開」。必須輸出 person(填寫A) 與 action(格式 {"person":"B"}))
   - "force_role" (強制開啟職位：當使用者要求在特定節日「加開/增加」平時不一定有的職位時使用。不需要填寫 person，只需填 date 和 role 即可。)
   - "allow_consecutive" (允許連續排班：當備註包含「可連排」、「不受連排限制」時使用。絕對不可把連排當作 limit！必須填寫 person，如果有指定職位可填 role。)
   - "conditional" (條件觸發連動排班：例如「如果A是大堂領會，則B必須是兒主大班」。必須輸出 \`condition\` 與 \`action\` 兩個物件。例如：{"type":"conditional", "condition":{"person":"A", "role":"領會"}, "action":{"person":"B", "role":"兒主大班老師"}})
4. 當備忘錄中提到特定的節日、活動名稱，或「遇到錯字/寫錯日期（如 8/30 但其實週日是 8/31）」時：
   - 請務必對照上方提供的【目前檔期日期與節日備註】。
   - 若備忘錄寫的日期不在檔期名單內，請自動尋找同週最接近的「有效日期 (YYYY-MM-DD)」進行糾錯替換，不可輸出無效日期。
5. 【可排日期處理規則】當備忘中出現「可排」、「可以排」、「有空」、「可以服事」等正面可用語意時：
   - 若備忘中有明確提到服事項目（例如「司琴，8/16 可以排」），請使用該服事項目作為 role，產生 type: "fixed" 規則。
   - 若備忘中沒有明確服事項目，請從「同工嚴格編制名冊」查詢該人在對應 scope 區域（大堂或兒主）的指定職位，取第一個職位作為 role，產生 type: "fixed" 規則。
   - "fixed" 規則代表這是一條「可排/必須優先排入」的強規則。
   - 若使用者明確表示某人「只有」某天可排，或者「指定排在某天」，請直接轉換為 "fixed" 即可，不需為其他日期手動產生不可排規則，後續排班引擎會自動將其餘日期視為不可排。
6. 輸出格式必須是一個 JSON 陣列，每個物件包含以下欄位：
   - sourceLineId: 對應「依職務預先分區的規則明細」中的來源行號
   - type: 上述七種之一
   - person: 同工姓名 (對於 "force_role" 或 "conditional" 可不填)
   - dateRange: 若有日期區間，格式為 { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
   - date: 若為單一日期，格式為 "YYYY-MM-DD"
   - role: 針對特定角色 (例如 "餅杯服事"、"領會" 等)
   - scope: "${scope}"
    - reason: 簡短的理由說明
    - maxCount: 僅 type="limit" 時必填，必須是 0 以上整數。例如「最多一次」輸出 1
   - condition: 僅 type="conditional" 時需要，格式 {"person":"姓名", "role":"職位"}
   - action: 僅 type="conditional" 或 type="exclusive_person" 時需要，格式 {"person":"姓名", "role":"職位"} (exclusive_person 可不填 role)

【強制年份規則與範例】
若使用者輸入的日期「沒有指明」年份，你必須一律使用目前排班年份 (${year || '2026'}) 來填充 YYYY！絕對不可以使用 2024！

請只輸出 JSON 陣列，不要包含任何額外的解釋文字或 Markdown 標籤。
  `;

  let lastError = null;

  for (const apiKey of keys) {
    try {
      const genAI = new GoogleGenAI({ apiKey });
      const modelName = resolveSchedulingModel();
      const majorVersion = Number(
        modelName.match(/^gemini-(\d+)(?:\.|-)?.*flash/)?.[1]
      );
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: majorVersion >= 3
            ? { thinkingLevel: 'minimal' }
            : { thinkingBudget: 0 }
        }
      });

      let rawText = response.text;
      rawText = rawText.replace(/^```json/mi, '').replace(/```$/m, '').trim();
      let parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        const hasInvalidSourceLineId = structuredRuleEntries.length > 0 && parsed.some(r => (
          !structuredEntryBySourceLineId.has(String(r.sourceLineId || ''))
        ));
        if (hasInvalidSourceLineId) {
          throw new Error('AI 規則缺少有效的職務區塊來源行號');
        }
        parsed = parsed.map(r => {
          const sourceLineId = String(r.sourceLineId || '');
          const inheritedRole = inheritedRoleBySourceLineId.get(sourceLineId);
          let ruleScope = r.scope;
          if (ruleScope === 'section' || !ruleScope) {
            ruleScope = scope;
          }
          const maxCount = r.type === 'limit'
            ? inferParsedLimitCount(r, aiPrompt)
            : null;
          const parsedRule = { ...r };
          delete parsedRule.sourceLineId;
          return {
            ...parsedRule,
            ...(inheritedRole ? { role: inheritedRole } : {}),
            scope: ruleScope,
            originSection: scope,
            ...(r.type === 'limit' && maxCount !== null
              ? { maxCount }
              : {})
          };
        });
      }
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('AI parsing failed');
}

migrateJsonFile();
maybeRepairPersistedState();
try {
  const periodBackupPath = ensureSchedulePeriodMigrationBackup();
  const periodMigration = schedulePeriodStore.migrateLegacyDefault();
  if (periodBackupPath) {
    console.log(`[XIT-Worker] schedule period migration backup: ${periodBackupPath}`);
  }
  if (periodMigration.migrated) {
    console.log(
      `[XIT-Worker] migrated legacy schedule periods: ${periodMigration.created.join(', ')}`
    );
  }
  const attendanceBackfillCount = backfillAttendanceScheduleIds();
  if (attendanceBackfillCount > 0) {
    console.log(
      `[XIT-Worker] linked ${attendanceBackfillCount} attendance records to the active main period`
    );
  }
} catch (error) {
  console.error('[XIT-Worker] schedule period migration failed:', error);
}

router.get('/api/state', (req, res) => {
  if (req.query.scheduleId) {
    try {
      const period = schedulePeriodStore.get(String(req.query.scheduleId));
      if (!period) {
        res.status(404).json({ ok: false, code: 'PERIOD_NOT_FOUND', error: '找不到指定檔期。' });
        return;
      }
      res.json(period.state);
      return;
    } catch (error) {
      sendSchedulePeriodError(res, error);
      return;
    }
  }
  const workspace = activePeriodWorkspace();
  res.json(workspace?.state || readState());
});

router.get('/api/people-state', (req, res) => {
  res.json(readPeopleState());
});

router.get('/api/history', (req, res) => {
  res.json(readHistory());
});

router.get('/api/schedule-periods', (req, res) => {
  try {
    res.json({
      ok: true,
      periods: schedulePeriodStore.list(req.query.section || null)
    });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.get('/api/schedule-periods/:scheduleId/revisions', (req, res) => {
  try {
    res.json({
      ok: true,
      revisions: schedulePeriodStore.revisions(req.params.scheduleId, req.query.limit)
    });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.get('/api/schedule-periods/:scheduleId', (req, res) => {
  try {
    const period = schedulePeriodStore.get(req.params.scheduleId);
    if (!period) {
      res.status(404).json({
        ok: false,
        code: 'PERIOD_NOT_FOUND',
        error: '找不到指定檔期。'
      });
      return;
    }
    res.json({ ok: true, period });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.post('/api/schedule-periods', (req, res) => {
  try {
    const scheduleId = String(req.body?.scheduleId || '');
    const section = scheduleId.startsWith('children-') ? 'children' : 'main';
    const accountCode = requirePeriodManager(req, section);
    const result = schedulePeriodStore.createNext(scheduleId, accountCode);
    broadcast('schedule-periods', req.header('X-Client-Id') || 'unknown', result);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.patch('/api/schedule-periods/:scheduleId/state', (req, res) => {
  try {
    const existing = schedulePeriodStore.get(req.params.scheduleId);
    if (!existing) {
      throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定檔期。', 404);
    }
    const { accountCode, allowedRoles } = allowedPeriodRoles(req, existing.section);
    if (!allowedRoles) {
      throw new SchedulePeriodError(
        'PERIOD_WRITE_FORBIDDEN',
        '此帳號沒有修改該檔期的權限。',
        403
      );
    }
    const period = schedulePeriodStore.saveState(
      existing.id,
      req.body?.state || {},
      {
        baseRevision: req.body?.baseRevision,
        actorCode: accountCode,
        allowedRoles,
        saveType: req.body?.saveType || 'draft'
      }
    );
    broadcast(
      'schedule-period',
      req.header('X-Client-Id') || 'unknown',
      schedulePeriodEventState(period)
    );
    res.json({ ok: true, period });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.patch('/api/schedule-periods/:scheduleId/cell-lock', (req, res) => {
  try {
    const existing = schedulePeriodStore.get(req.params.scheduleId);
    if (!existing) {
      throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定檔期。', 404);
    }
    const { accountCode, allowedRoles } = allowedPeriodRoles(req, existing.section);
    if (!allowedRoles) {
      throw new SchedulePeriodError(
        'PERIOD_WRITE_FORBIDDEN',
        '此帳號沒有修改該檔期的權限。',
        403
      );
    }
    const period = Array.isArray(req.body?.cells)
      ? schedulePeriodStore.setCellLocks(existing.id, req.body.cells, {
        baseRevision: req.body?.baseRevision,
        actorCode: accountCode,
        allowedRoles
      })
      : schedulePeriodStore.setCellLock(
        existing.id,
        String(req.body?.cellKey || ''),
        Boolean(req.body?.locked),
        {
          baseRevision: req.body?.baseRevision,
          actorCode: accountCode,
          allowedRoles
        }
      );
    broadcast(
      'schedule-period',
      req.header('X-Client-Id') || 'unknown',
      schedulePeriodEventState(period)
    );
    res.json({ ok: true, period });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.post('/api/schedule-periods/:scheduleId/clear-unlocked', (req, res) => {
  try {
    const existing = schedulePeriodStore.get(req.params.scheduleId);
    if (!existing) {
      throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定檔期。', 404);
    }
    const accountCode = requirePeriodManager(req, existing.section);
    const result = schedulePeriodStore.clearUnlocked(existing.id, {
      actorCode: accountCode,
      baseRevision: req.body?.baseRevision
    });
    broadcast(
      'schedule-period',
      req.header('X-Client-Id') || 'unknown',
      schedulePeriodEventState(result.period)
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.get('/api/mobile/current-schedule', (req, res) => {
  try {
    const workspace = activePeriodWorkspace();
    if (!workspace) {
      res.json({
        ok: true,
        periods: { main: null, children: null },
        state: {}
      });
      return;
    }
    res.json({ ok: true, ...workspace });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

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

function attendanceRecordForClient(row) {
  if (!row) return null;
  const {
    service_date: serviceDate,
    schedule_id: scheduleId,
    ...record
  } = row;
  return { date: serviceDate, scheduleId, ...record };
}

function upsertAttendanceRecord({
  scheduleId,
  date,
  physicalCount = null,
  onlineCount = null,
  specialEvent,
  note,
  recordedBy
}) {
  const timestamp = new Date().toISOString();
  db.prepare(`
    INSERT INTO attendance_records (
      schedule_id, service_date, physical_count, online_count, special_event,
      note, recorded_by, updated_at
    )
    VALUES (?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, ?, ?, ?)
    ON CONFLICT(service_date) DO UPDATE SET
      schedule_id = COALESCE(attendance_records.schedule_id, excluded.schedule_id),
      physical_count = COALESCE(?, attendance_records.physical_count),
      online_count = COALESCE(?, attendance_records.online_count),
      special_event = COALESCE(?, attendance_records.special_event),
      note = COALESCE(?, attendance_records.note),
      recorded_by = COALESCE(?, attendance_records.recorded_by),
      updated_at = ?
  `).run(
    scheduleId,
    date,
    physicalCount,
    onlineCount,
    specialEvent ?? '',
    note ?? '',
    recordedBy || 'system',
    timestamp,
    physicalCount,
    onlineCount,
    specialEvent ?? null,
    note ?? null,
    recordedBy || null,
    timestamp
  );
  return attendanceRecordForClient(
    db.prepare(`
      SELECT *
      FROM attendance_records
      WHERE schedule_id = ? AND service_date = ?
    `).get(scheduleId, date)
  );
}

function broadcastAttendanceUpdate(scheduleId, date) {
  const eventData = JSON.stringify({
    type: 'attendance_update',
    scheduleId,
    date
  });
  for (const client of clients) {
    client.write(`data: ${eventData}\n\n`);
  }
}

// Mobile attendance: 招待同工當日快速登記人數
// Uses the same attendance_records source as the desktop schedule columns.
router.post('/api/mobile/attendance', (req, res) => {
  try {
    const { person, date, physical_count, online_count } = req.body || {};

    // 1. date must be provided and must match today
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: '日期格式錯誤，請使用 YYYY-MM-DD。' });
    }
    const today = taipeiToday();
    if (date !== today) {
      return res.status(403).json({ ok: false, error: '只能登記今日人數，補登請使用網頁版。' });
    }

    // 2. Get active main period
    const mainPeriod = schedulePeriodStore.active('main');
    if (!mainPeriod) {
      return res.status(404).json({ ok: false, error: '找不到作用中的大堂檔期。' });
    }

    // 3. Verify this person has a 招待 service on that date
    const assignments = mainPeriod.state?.assignments || {};
    const hasUsherOnDate = Object.entries(assignments).some(([key, assignedPerson]) => {
      const [assignedDate, role] = key.split('__');
      if (assignedDate !== date) return false;
      if (!role.includes('\u62db\u5f85')) return false;
      const personName = typeof person === 'string' ? person : '';
      if (!personName || !assignedPerson) return false;
      // simple name match: exact or one contains the other (length >= 2)
      if (assignedPerson === personName) return true;
      if (assignedPerson.endsWith(personName) && personName.length >= 2) return true;
      if (personName.endsWith(assignedPerson) && assignedPerson.length >= 2) return true;
      return false;
    });

    if (!hasUsherOnDate) {
      return res.status(403).json({ ok: false, error: '您今日沒有招待服事，無法登記人數。' });
    }

    // 4. Validate attendance counts
    const pCount = physical_count !== undefined && physical_count !== ''
      ? Number(physical_count)
      : null;
    const oCount = online_count !== undefined && online_count !== ''
      ? Number(online_count)
      : null;

    if (pCount !== null && (!Number.isInteger(pCount) || pCount < 0)) {
      return res.status(400).json({ ok: false, error: '實體人數必須為非負整數。' });
    }
    if (oCount !== null && (!Number.isInteger(oCount) || oCount < 0)) {
      return res.status(400).json({ ok: false, error: '線上人數必須為非負整數。' });
    }

    if (pCount === null && oCount === null) {
      return res.status(400).json({ ok: false, error: '請至少提供實體人數或線上人數。' });
    }

    // 5. Write to the shared attendance table and notify desktop clients
    const record = upsertAttendanceRecord({
      scheduleId: mainPeriod.id,
      date,
      physicalCount: pCount,
      onlineCount: oCount,
      recordedBy: person
    });
    broadcastAttendanceUpdate(mainPeriod.id, date);

    res.json({ ok: true, record });
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: 'MOBILE_ATTENDANCE_WRITE_FAILED',
      error: error?.message || '人數登記失敗'
    });
  }
});

router.get('/api/schedule-runs', (req, res) => {
  try {
    res.json({
      ok: true,
      runs: scheduleRunRecorder.listRuns(req.query.limit)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: 'SCHEDULE_RUN_LOG_READ_FAILED',
      error: error.message
    });
  }
});

router.post('/api/state', (req, res) => {
  try {
    const state = req.body || {};
    const scheduleState = sanitizeScheduleState(state);
    writeState('default', scheduleState);
    broadcast('schedule', req.header('X-Client-Id') || 'unknown', scheduleState);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post('/api/people-state', (req, res) => {
  try {
    const peopleState = sanitizePeopleState(req.body || {});
    writeState('people', peopleState);
    broadcast('people', req.header('X-Client-Id') || 'unknown', peopleState);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post('/api/complete', (req, res) => {
  try {
    const state = req.body || {};
    const scheduleState = sanitizeScheduleState(state);
    writeState('default', scheduleState, { saveType: 'completed' });
    broadcast('schedule', req.header('X-Client-Id') || 'unknown', scheduleState);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get('/api/history/:id', (req, res) => {
  const revision = readRevision(req.params.id);
  if (!revision) {
    res.status(404).json({ ok: false, error: 'Revision not found' });
    return;
  }
  res.json(revision);
});

router.post('/api/history/:id/restore', (req, res) => {
  const revision = readRevision(req.params.id);
  if (!revision) {
    res.status(404).json({ ok: false, error: 'Revision not found' });
    return;
  }

  try {
    writeState('default', revision.state);
    broadcast('schedule', req.header('X-Client-Id') || 'unknown', sanitizeScheduleState(revision.state));
    res.json({ ok: true, state: revision.state });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post('/api/schedule-ai', async (req, res) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const clientId = req.header('X-Client-Id') || req.body?.clientId || 'unknown';
  let schedulingPayload;
  try {
    const accountCode = requirePeriodManager(req, 'main');
    const scheduleId = String(req.body?.scheduleId || '');
    const mainPeriod = schedulePeriodStore.get(scheduleId);
    if (!mainPeriod || mainPeriod.section !== 'main') {
      throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定的大堂檔期。', 404);
    }
    if (mainPeriod.status !== 'active') {
      throw new SchedulePeriodError(
        'SCHEDULE_PERIOD_READ_ONLY',
        '歷史檔期不能執行 AI 排班。',
        423
      );
    }
    const activeChildren = schedulePeriodStore.active('children');
    schedulingPayload = {
      ...(req.body || {}),
      ...mergeSectionStates(mainPeriod.state, activeChildren?.state || {}),
      scheduleId: mainPeriod.id,
      baseRevision: mainPeriod.revision,
      actorCode: accountCode,
      targetSection: 'main',
      people: req.body?.people || []
    };
  } catch (error) {
    let errorMessage = error.message;
    if (error.code === 'RULE_NORMALIZATION_FAILED' && error.details?.errors) {
      const detailsText = error.details.errors.map((e) => e.message).join('; ');
      errorMessage = `${error.message}: ${detailsText}`;
    }
    sendSchedulePeriodError(res, {
      code: error.code,
      message: errorMessage,
      status: error.status || 500,
      details: error.details || null
    });
    return;
  }
  try {
    scheduleRunRecorder.startRun({
      runId: requestId,
      clientId,
      targetSection: 'main'
    });
  } catch (error) {
    console.warn(
      `[XIT-Worker][AI schedule:${requestId}] trace start failed: ${error.message}`
    );
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const controller = new AbortController();
  let finished = false;
  const writeEvent = (eventName, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeat);
    if (!finished) controller.abort(new Error('Client disconnected'));
  });

  writeEvent('open', { ok: true, targetSection: 'main', runId: requestId });
  console.log(`[XIT-Worker][AI schedule:${requestId}] started client=${clientId}`);
  try {
    const result = await runAiScheduling(
      schedulingPayload,
      (stage, message, details = {}) => {
        console.log(`[XIT-Worker][AI schedule:${requestId}] ${stage}: ${message}`);
        try {
          scheduleRunRecorder.recordStep(requestId, stage, message, details);
        } catch (traceError) {
          console.warn(
            `[XIT-Worker][AI schedule:${requestId}] trace step failed: ${traceError.message}`
          );
        }
        writeEvent('progress', { stage, message, details, runId: requestId });
      },
      { signal: controller.signal }
    );
    try {
      scheduleRunRecorder.finishRun(requestId, {
        status: 'completed',
        result
      });
    } catch (traceError) {
      console.warn(
        `[XIT-Worker][AI schedule:${requestId}] trace finish failed: ${traceError.message}`
      );
    }
    writeEvent('progress', {
      stage: 'run-completed',
      message: '排班執行完成並通過最終驗證。',
      details: result.qualityMetrics || {},
      runId: requestId
    });
    writeEvent('completed', { ...result, runId: requestId });
    console.log(
      `[XIT-Worker][AI schedule:${requestId}] completed `
      + `cells=${result.mutableCellCount} llm=${result.llmSummary?.used ? 'used' : 'fallback'}`
    );
  } catch (error) {
    const runStatus = controller.signal.aborted || error.code === 'CANCELED'
      ? 'cancelled'
      : 'failed';
    try {
      scheduleRunRecorder.finishRun(requestId, {
        status: runStatus,
        error
      });
    } catch (traceError) {
      console.warn(
        `[XIT-Worker][AI schedule:${requestId}] trace failure failed: ${traceError.message}`
      );
    }
    console.error(
      `[XIT-Worker][AI schedule:${requestId}] failed `
      + `code=${error.code || 'AI_SCHEDULING_FAILED'} message=${error.message}`
    );
    writeEvent('progress', {
      stage: 'run-failed',
      message: error.message,
      details: { errorCode: error.code || 'AI_SCHEDULING_FAILED' },
      runId: requestId
    });
    writeEvent('failed', {
      ok: false,
      code: error.code || 'AI_SCHEDULING_FAILED',
      error: error.message,
      details: error.details || null,
      runId: requestId
    });
  } finally {
    finished = true;
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

router.post('/api/generate-ai', async (req, res) => {
  try {
    const result = await runAiScheduling(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/api/audit-schedule', async (req, res) => {
  try {
    requirePeriodManager(req, 'main');
    const mainPeriod = schedulePeriodStore.get(String(req.body?.scheduleId || ''));
    if (!mainPeriod || mainPeriod.section !== 'main') {
      throw new SchedulePeriodError('PERIOD_NOT_FOUND', '找不到指定的大堂檔期。', 404);
    }
    if (mainPeriod.status !== 'active') {
      throw new SchedulePeriodError(
        'SCHEDULE_PERIOD_READ_ONLY',
        '歷史檔期不能執行排班稽核。',
        423
      );
    }
    const keys = getApiKeys();
    if (!keys.length) throw new Error('Missing GEMINI_WORKER_KEY');
    const activeChildren = schedulePeriodStore.active('children');
    const payload = {
      ...(req.body || {}),
      ...mergeSectionStates(mainPeriod.state, activeChildren?.state || {}),
      targetSection: 'main'
    };
    if (!payload.people) {
      payload.people = readPeopleState().people || [];
    }
    const result = await auditSchedule({
      payload,
      apiKey: keys[0]
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SchedulePeriodError) {
      sendSchedulePeriodError(res, error);
      return;
    }
    const isOptionalAuditUnavailable = [
      'AUDIT_LLM_QUOTA_EXCEEDED',
      'AUDIT_TIMEOUT',
      'AUDIT_API_KEY_MISSING',
      'AUDIT_TOOL_CALL_INVALID'
    ].includes(error.code);
    const isClientError = [
      'AUDIT_SOURCE_INVALID',
      'RULE_NORMALIZATION_FAILED',
      'NO_MAIN_DATES'
    ].includes(error.code);
    const status = isOptionalAuditUnavailable
      ? 200
      : isClientError
        ? 422
        : 500;

    let errorMessage = error.message;
    if (error.code === 'RULE_NORMALIZATION_FAILED' && error.details?.errors) {
      const detailsText = error.details.errors.map((e) => e.message).join('; ');
      errorMessage = `${error.message}: ${detailsText}`;
    }

    console.error(
      `[XIT-Worker][schedule audit] failed `
      + `code=${error.code || 'AUDIT_FAILED'} message=${errorMessage}`
    );
    res.status(status).json({
      ok: false,
      code: error.code || 'AUDIT_FAILED',
      error: errorMessage,
      unavailable: isOptionalAuditUnavailable,
      details: error.details || null
    });
  }
});

router.post('/api/audit-schedule/validate', (req, res) => {
  try {
    const request = req.body || {};
    const payload = { ...(request.payload || {}), targetSection: 'main' };
    if (!payload.people) {
      payload.people = readPeopleState().people || [];
    }
    const result = validateAuditSuggestion({
      payload,
      suggestion: request.suggestion,
      expectedSourceScheduleHash: request.sourceScheduleHash
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.code === 'AUDIT_SUGGESTION_STALE'
      ? 409
      : 422;
    res.status(status).json({
      ok: false,
      code: error.code || 'AUDIT_SUGGESTION_INVALID',
      error: error.message,
      details: error.details || null
    });
  }
});

router.post('/api/parse-rules-ai', async (req, res) => {
  try {
    const result = await runAiRuleParsing(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

const MAX_SSE_CLIENTS = 20;

router.get('/api/events', (req, res) => {
  // [ISOLATION] 防止 SSE 長連線無限增長，消耗主伺服器的 file descriptor 資源
  if (clients.size >= MAX_SSE_CLIENTS) {
    res.status(503).json({ ok: false, error: '即時連線已達上限，請稍後再試或重新整理頁面。' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  res.write('retry: 5000\nevent: open\ndata: {}\n\n');
  clients.add(res);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);
  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(res);
  };
  req.once('close', cleanup);
  res.once('close', cleanup);
  res.once('error', cleanup);
});

// --- 公告頁回饋系統 API ---
router.get('/api/feedbacks', (req, res) => {
  try {
    const records = db.prepare(`SELECT * FROM feedbacks WHERE status = 'pending' ORDER BY created_at DESC`).all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/api/feedbacks', async (req, res) => {
  try {
    const { person, sections, dates, message } = req.body;
    if (!person || !sections || !dates || !message) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO feedbacks (person, sections, dates, message, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const info = insertStmt.run(person, JSON.stringify(sections), JSON.stringify(dates), message);
    const feedbackId = info.lastInsertRowid;

    const eventData = JSON.stringify({ type: 'feedback_update', id: feedbackId });
    for (const client of clients) {
      client.write(`data: ${eventData}\n\n`);
    }

    res.json({ ok: true, id: feedbackId });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/api/feedbacks/:id/apply', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`UPDATE feedbacks SET status = 'applied' WHERE id = ?`).run(id);

    const eventData = JSON.stringify({ type: 'feedback_update', id });
    for (const client of clients) {
      client.write(`data: ${eventData}\n\n`);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/api/feedbacks/:id/dismiss', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`UPDATE feedbacks SET status = 'dismissed' WHERE id = ?`).run(id);

    const eventData = JSON.stringify({ type: 'feedback_update', id });
    for (const client of clients) {
      client.write(`data: ${eventData}\n\n`);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// --- 人數統計與紀錄系統 API ---

router.get('/api/attendance', (req, res) => {
  try {
    const { start, end } = req.query;
    const scheduleId = String(
      req.query.scheduleId || schedulePeriodStore.active('main', false)?.id || ''
    );
    if (!scheduleId) {
      return res.json({ ok: true, data: [] });
    }
    const period = schedulePeriodStore.get(scheduleId);
    if (!period || period.section !== 'main') {
      throw new SchedulePeriodError(
        'PERIOD_NOT_FOUND',
        '找不到指定的大堂檔期。',
        404
      );
    }
    let query = `SELECT * FROM attendance_records WHERE schedule_id = ?`;
    const params = [scheduleId];

    if (start && end) {
      query += ` AND service_date >= ? AND service_date <= ?`;
      params.push(start, end);
    } else if (start) {
      query += ` AND service_date >= ?`;
      params.push(start);
    } else if (end) {
      query += ` AND service_date <= ?`;
      params.push(end);
    }

    query += ` ORDER BY service_date ASC`;
    const records = db.prepare(query).all(...params).map(attendanceRecordForClient);
    res.json({ ok: true, data: records });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.put('/api/attendance/:date', (req, res) => {
  try {
    const { date } = req.params;
    const {
      scheduleId: requestedScheduleId,
      physical_count,
      online_count,
      special_event,
      note,
      recorded_by
    } = req.body;
    const scheduleId = String(
      requestedScheduleId || schedulePeriodStore.active('main', false)?.id || ''
    );
    const period = scheduleId ? schedulePeriodStore.get(scheduleId) : null;
    if (!period || period.section !== 'main') {
      throw new SchedulePeriodError(
        'PERIOD_NOT_FOUND',
        '找不到指定的大堂檔期。',
        404
      );
    }
    if (period.status !== 'active') {
      throw new SchedulePeriodError(
        'SCHEDULE_PERIOD_READ_ONLY',
        '歷史檔期的人數紀錄僅供查閱。',
        423
      );
    }
    const accountCode = requestAccountCode(req);
    if (!['A000', 'A003'].includes(accountCode)) {
      throw new SchedulePeriodError(
        'ATTENDANCE_WRITE_FORBIDDEN',
        '此帳號沒有登記聚會人數的權限。',
        403
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'Invalid date format, expected YYYY-MM-DD' });
    }

    const pCount = physical_count !== undefined && physical_count !== null
      ? Number(physical_count)
      : null;
    const oCount = online_count !== undefined && online_count !== null
      ? Number(online_count)
      : null;

    if (
      (pCount !== null && (!Number.isInteger(pCount) || pCount < 0))
      || (oCount !== null && (!Number.isInteger(oCount) || oCount < 0))
    ) {
      return res.status(400).json({ ok: false, error: 'Counts must be non-negative integers' });
    }

    const record = upsertAttendanceRecord({
      scheduleId,
      date,
      physicalCount: pCount,
      onlineCount: oCount,
      specialEvent: special_event,
      note,
      recordedBy: recorded_by || accountCode
    });
    broadcastAttendanceUpdate(scheduleId, date);

    res.json({ ok: true, record });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.get('/api/analytics/growth', (req, res) => {
  try {
    const scheduleId = String(req.query.scheduleId || '').trim();
    if (scheduleId) {
      const period = schedulePeriodStore.get(scheduleId);
      if (!period || period.section !== 'main') {
        throw new SchedulePeriodError(
          'PERIOD_NOT_FOUND',
          '找不到指定的大堂檔期。',
          404
        );
      }
    }
    const records = scheduleId
      ? db.prepare(`
          SELECT *
          FROM attendance_records
          WHERE schedule_id = ?
          ORDER BY service_date ASC
        `).all(scheduleId)
      : db.prepare(`
          SELECT *
          FROM attendance_records
          ORDER BY service_date ASC
        `).all();

    if (!records.length) {
      return res.json({ ok: true, data: { trends: [], summary: {} } });
    }

    // 計算平均值與總人數
    const trends = records.map((row) => ({
      ...attendanceRecordForClient(row),
      total_count: row.physical_count + row.online_count
    }));

    // 簡單的最近一季（取最近 13 筆有資料的紀錄當作一季）
    const recentQuarter = trends.slice(-13);
    const prevQuarter = trends.slice(-26, -13);

    const calculateAvg = (arr, key) => arr.length ? Math.round(arr.reduce((sum, item) => sum + item[key], 0) / arr.length) : 0;

    const summary = {
      recent_physical_avg: calculateAvg(recentQuarter, 'physical_count'),
      recent_online_avg: calculateAvg(recentQuarter, 'online_count'),
      recent_total_avg: calculateAvg(recentQuarter, 'total_count'),
      prev_physical_avg: calculateAvg(prevQuarter, 'physical_count'),
      prev_online_avg: calculateAvg(prevQuarter, 'online_count'),
      prev_total_avg: calculateAvg(prevQuarter, 'total_count'),
    };

    res.json({ ok: true, data: { trends, summary } });
  } catch (error) {
    sendSchedulePeriodError(res, error);
  }
});

router.use(express.static(workerRoot, {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(workerRoot, 'index.html'));
});

export default router;

// Graceful shutdown to merge SQLite WAL file
function closeDb() {
  try {
    db.close();
    console.log('[XIT-Worker] Database connection closed.');
  } catch (err) {
    console.error('[XIT-Worker] Error closing database:', err);
  }
}
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT', () => { closeDb(); process.exit(0); });
