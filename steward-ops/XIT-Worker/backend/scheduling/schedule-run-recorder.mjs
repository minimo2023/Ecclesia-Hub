const MAX_TEXT_LENGTH = 500;

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function redactText(value) {
  return String(value ?? '')
    .replace(/AIza[\w-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/(\b(?:(?:api|worker)[_-]?)?key\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
    .slice(0, MAX_TEXT_LENGTH);
}

function safeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key, value]) => (
        !/(?:api.?key|prompt|assignment|personIds?)/i.test(key)
        && ['string', 'number', 'boolean'].includes(typeof value)
      ))
      .map(([key, value]) => [
        key,
        typeof value === 'string' ? redactText(value) : value
      ])
  );
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapStep(row) {
  return {
    sequence: row.sequence,
    stage: row.stage,
    message: row.message,
    elapsedMs: row.elapsed_ms,
    createdAt: row.created_at,
    details: parseJson(row.details_json)
  };
}

function mapRun(row, steps = []) {
  return {
    runId: row.id,
    clientId: row.client_id,
    targetSection: row.target_section,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    modelName: row.model_name,
    llmUsed: row.llm_used === null ? null : Boolean(row.llm_used),
    mutableCellCount: row.mutable_cell_count,
    activeRuleCount: row.active_rule_count,
    optimizerStatus: row.optimizer_status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    steps
  };
}

export function createScheduleRunRecorder(db, {
  retentionLimit = 100,
  now = () => Date.now()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_runs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL DEFAULT 'unknown',
      target_section TEXT NOT NULL DEFAULT 'main',
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      model_name TEXT,
      llm_used INTEGER,
      mutable_cell_count INTEGER,
      active_rule_count INTEGER,
      optimizer_status TEXT,
      error_code TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_run_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES schedule_runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      stage TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      elapsed_ms INTEGER NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(run_id, sequence)
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_runs_started
      ON schedule_runs(started_at_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_schedule_run_steps_run
      ON schedule_run_steps(run_id, sequence);
  `);

  const readRun = db.prepare('SELECT * FROM schedule_runs WHERE id = ?');
  const nextSequence = db.prepare(`
    SELECT COALESCE(MAX(sequence), 0) + 1 AS value
    FROM schedule_run_steps
    WHERE run_id = ?
  `);
  const insertRun = db.prepare(`
    INSERT INTO schedule_runs (
      id, client_id, target_section, status, started_at, started_at_ms
    ) VALUES (?, ?, ?, 'running', ?, ?)
  `);
  const insertStep = db.prepare(`
    INSERT INTO schedule_run_steps (
      run_id, sequence, stage, message, elapsed_ms, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const finishRunStatement = db.prepare(`
    UPDATE schedule_runs
    SET status = ?,
        finished_at = ?,
        duration_ms = ?,
        model_name = ?,
        llm_used = ?,
        mutable_cell_count = ?,
        active_rule_count = ?,
        optimizer_status = ?,
        error_code = ?,
        error_message = ?
    WHERE id = ?
  `);
  const oldRunIds = db.prepare(`
    SELECT id
    FROM schedule_runs
    ORDER BY started_at_ms DESC
    LIMIT -1 OFFSET ?
  `);
  const deleteSteps = db.prepare('DELETE FROM schedule_run_steps WHERE run_id = ?');
  const deleteRun = db.prepare('DELETE FROM schedule_runs WHERE id = ?');

  function prune() {
    for (const { id } of oldRunIds.all(retentionLimit)) {
      deleteSteps.run(id);
      deleteRun.run(id);
    }
  }

  function recordStep(runId, stage, message = '', details = {}) {
    const run = readRun.get(runId);
    if (!run) return null;
    const currentMs = now();
    const sequence = nextSequence.get(runId).value;
    insertStep.run(
      runId,
      sequence,
      redactText(stage || 'unknown'),
      redactText(message),
      Math.max(0, currentMs - run.started_at_ms),
      JSON.stringify(safeDetails(details)),
      nowIso(currentMs)
    );
    return sequence;
  }

  function startRun({
    runId,
    clientId = 'unknown',
    targetSection = 'main'
  }) {
    const startedAtMs = now();
    insertRun.run(
      runId,
      redactText(clientId),
      targetSection === 'main' ? 'main' : 'unsupported',
      nowIso(startedAtMs),
      startedAtMs
    );
    recordStep(runId, 'request-received', '已收到大堂排班請求。');
    prune();
    return runId;
  }

  function finishRun(runId, {
    status,
    result = null,
    error = null
  }) {
    const run = readRun.get(runId);
    if (!run) return false;
    const finishedAtMs = now();
    const llmSummary = result?.llmSummary || {};
    finishRunStatement.run(
      status,
      nowIso(finishedAtMs),
      Math.max(0, finishedAtMs - run.started_at_ms),
      llmSummary.modelName || null,
      result ? (llmSummary.used ? 1 : 0) : null,
      result?.mutableCellCount ?? null,
      result?.ruleSummary?.activeRules ?? null,
      result?.optimizerStatus || null,
      error?.code || null,
      error ? redactText(error.message || error) : null,
      runId
    );
    recordStep(
      runId,
      status === 'completed' ? 'run-completed' : `run-${status}`,
      status === 'completed'
        ? '排班執行完成並通過最終驗證。'
        : redactText(error?.message || `排班執行狀態：${status}`),
      {
        errorCode: error?.code || '',
        mutableCellCount: result?.mutableCellCount ?? 0,
        llmUsed: Boolean(llmSummary.used),
        llmCoverage: result?.qualityMetrics?.llmCoverage ?? 0,
        cspContributionRate:
          result?.qualityMetrics?.cspContributionRate ?? 0,
        rulePrioritySatisfactionRate:
          result?.qualityMetrics?.rulePrioritySatisfactionRate ?? 0,
        hardConflictCount: result?.qualityMetrics?.hardConflictCount ?? 0
      }
    );
    return true;
  }

  function listRuns(limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
    const runs = db.prepare(`
      SELECT *
      FROM schedule_runs
      ORDER BY started_at_ms DESC
      LIMIT ?
    `).all(safeLimit);
    const readSteps = db.prepare(`
      SELECT *
      FROM schedule_run_steps
      WHERE run_id = ?
      ORDER BY sequence
    `);
    return runs.map((run) => mapRun(run, readSteps.all(run.id).map(mapStep)));
  }

  return {
    startRun,
    recordStep,
    finishRun,
    listRuns
  };
}
