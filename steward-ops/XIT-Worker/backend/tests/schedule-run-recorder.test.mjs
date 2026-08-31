import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { createScheduleRunRecorder } from '../scheduling/schedule-run-recorder.mjs';

describe('schedule-run-recorder', () => {
  it('records ordered, durable, sanitized scheduling steps', () => {
    const db = new Database(':memory:');
    let timestamp = Date.parse('2026-07-03T10:00:00.000Z');
    const recorder = createScheduleRunRecorder(db, {
      now: () => timestamp
    });

    recorder.startRun({ runId: 'run-1', clientId: 'dev-client' });
    timestamp += 125;
    recorder.recordStep(
      'run-1',
      'planning-global-draft',
      '使用 key=secret AIza123456789012345678901234567890 進行規劃',
      {
        mutableCellCount: 214,
        prompt: 'must not persist',
        apiKey: 'must not persist'
      }
    );
    timestamp += 375;
    recorder.finishRun('run-1', {
      status: 'completed',
      result: {
        mutableCellCount: 214,
        optimizerStatus: 'OPTIMAL',
        ruleSummary: { activeRules: 5 },
        llmSummary: {
          used: true,
          modelName: 'gemini-2.5-flash'
        }
      }
    });

    const [run] = recorder.listRuns();
    assert.equal(run.status, 'completed');
    assert.equal(run.durationMs, 500);
    assert.equal(run.mutableCellCount, 214);
    assert.equal(run.modelName, 'gemini-2.5-flash');
    assert.deepEqual(
      run.steps.map((step) => step.stage),
      ['request-received', 'planning-global-draft', 'run-completed']
    );
    assert.equal(run.steps[1].elapsedMs, 125);
    assert.equal(run.steps[1].message.includes('secret'), false);
    assert.equal(run.steps[1].message.includes('AIza'), false);
    assert.equal(Object.hasOwn(run.steps[1].details, 'prompt'), false);
    assert.equal(Object.hasOwn(run.steps[1].details, 'apiKey'), false);
  });

  it('retains only the newest configured number of runs', () => {
    const db = new Database(':memory:');
    let timestamp = 1;
    const recorder = createScheduleRunRecorder(db, {
      retentionLimit: 2,
      now: () => timestamp++
    });

    recorder.startRun({ runId: 'run-1' });
    recorder.startRun({ runId: 'run-2' });
    recorder.startRun({ runId: 'run-3' });

    assert.deepEqual(
      recorder.listRuns().map((run) => run.runId),
      ['run-3', 'run-2']
    );
  });
});
