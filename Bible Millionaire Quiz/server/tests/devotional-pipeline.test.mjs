import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { LogosEngineService } from '../infrastructure/ai/LogosEngine.js';
import { TASK_SCHEMAS } from '../infrastructure/ai/logos/schemas.js';
import { validateUnifiedDevotional, getTaiwanDateKey } from '../domains/content/devotional/devotional.js';
import { ensureDevotionalForDate, manualTrigger } from '../domains/content/devotional/scheduler.js';

const PIPELINE_TASKS = [
    'scripture_selector',
    'theology_extractor',
    'prose_formatter',
    'layout_formatter'
];

test('devotional pipeline task keys have matching prompts and schemas', () => {
    const engine = new LogosEngineService();

    for (const taskType of PIPELINE_TASKS) {
        const promptPath = engine._findPromptPath(taskType);
        assert.equal(existsSync(promptPath), true, `${taskType}.md must exist`);
        assert.ok(readFileSync(promptPath, 'utf8').trim().length > 100, `${taskType}.md must not be empty`);
        assert.equal(TASK_SCHEMAS[taskType]?.type, 'object', `${taskType} schema must exist`);

        const instruction = engine._buildSystemInstruction(taskType, { book: '約翰福音' });
        assert.match(instruction, new RegExp(`## TASK: ${taskType}`));
        assert.match(instruction, /## SCHEMA/);
        assert.ok(instruction.includes(JSON.stringify(TASK_SCHEMAS[taskType])));
    }
});

test('devotional pipeline order remains selector to layout formatter', () => {
    assert.deepEqual(PIPELINE_TASKS, [
        'scripture_selector',
        'theology_extractor',
        'prose_formatter',
        'layout_formatter'
    ]);
});

test('production devotional runtime remains one unified call and never invokes the four-stage tasks', () => {
    const source = readFileSync(new URL('../domains/content/devotional/devotional.js', import.meta.url), 'utf8');
    assert.equal((source.match(/askBrain\('unified_devotional'/g) || []).length, 1);
    for (const task of PIPELINE_TASKS) assert.equal(source.includes(`askBrain('${task}'`), false);
    assert.match(source, /pg_try_advisory_xact_lock/);
});

test('unified schema validation rejects incomplete candidates before persistence', () => {
    const valid = {
        selected_index: 1,
        title: '標題',
        scripture: '經文',
        scriptureReference: '約翰福音 3:16',
        understanding: '理解',
        meditation: '默想',
        prayer: '禱告',
        closingWord: '結語'
    };
    assert.equal(validateUnifiedDevotional(valid, 2), 1);
    assert.throws(() => validateUnifiedDevotional({ ...valid, prayer: '' }, 2), /prayer/);
    assert.throws(() => validateUnifiedDevotional({ ...valid, selected_index: 3 }, 2), /selected_index/);
    assert.equal(getTaiwanDateKey(new Date('2026-08-15T16:30:00Z')), '2026-08-16');
});

test('parallel scheduler requests call unified generation at most once per date', async () => {
    let calls = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const fakeDb = { getDevotional: async () => null };
    const fakeService = {
        generateDevotional: async () => {
            calls += 1;
            await gate;
        }
    };
    const first = ensureDevotionalForDate(fakeDb, fakeService, '2026-08-15', 'manual-trigger');
    await new Promise(resolve => setImmediate(resolve));
    const second = await ensureDevotionalForDate(fakeDb, fakeService, '2026-08-15', 'manual-trigger');
    release();
    await first;
    assert.equal(calls, 1);
    assert.equal(second.action, 'generating');
});

test('force regeneration never deletes the existing devotional before generation succeeds', async () => {
    let deleted = false;
    const fakeDb = {
        deleteDevotional: async () => { deleted = true; },
        getDevotional: async () => ({ content: { title: '原文章' } })
    };
    const result = await manualTrigger(fakeDb, {
        generateDevotional: async () => { throw new Error('AI unavailable'); }
    }, '2026-08-14', true);
    assert.equal(result.success, false);
    assert.equal(deleted, false);
});
