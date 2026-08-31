import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    SCRIPTURE_RAIN_PASSAGES,
    scoreScriptureRainCorrect,
    scriptureRainDurationMs,
    splitScriptureRainText,
    stripRainEditorialAnnotations,
    verifyScriptureRainFragments
} from '../domains/game/scripture-rain/engine.js';

test('scripture rain has a bounded curated CUV passage set', () => {
    assert.equal(SCRIPTURE_RAIN_PASSAGES.length, 20);
    assert.equal(new Set(SCRIPTURE_RAIN_PASSAGES.map(item => item.id)).size, 20);
    assert.ok(SCRIPTURE_RAIN_PASSAGES.every(item => item.verseEnd >= item.verseStart));
});

test('scripture rain removes marked editorial notes but preserves parenthetical scripture', () => {
    const text = stripRainEditorialAnnotations('你們禱告要這樣說：（有古卷作）我們在天上的父，願人都尊你的名為聖。');
    assert.equal(text, '你們禱告要這樣說：我們在天上的父，願人都尊你的名為聖。');
    assert.equal(stripRainEditorialAnnotations('生命（原文作道）在他裡頭。'), '生命在他裡頭。');
    assert.equal(stripRainEditorialAnnotations('這生命（生命原與父同在）已經顯現。'), '這生命（生命原與父同在）已經顯現。');
    const fragments = splitScriptureRainText(text.repeat(5));
    assert.ok(fragments.length >= 8 && fragments.length <= 16);
    assert.equal(verifyScriptureRainFragments(text.repeat(5), fragments), true);
});

test('scripture rain scoring raises the next multiplier every third correct fragment', () => {
    let state = { score: 0, streak: 0, multiplier: 1 };
    state = scoreScriptureRainCorrect(state);
    state = scoreScriptureRainCorrect(state);
    state = scoreScriptureRainCorrect(state);
    assert.equal(state.score, 300);
    assert.equal(state.multiplier, 2);
    state = scoreScriptureRainCorrect(state);
    assert.equal(state.score, 500);
});

test('scripture rain timer stays within the lab bounds', () => {
    assert.equal(scriptureRainDurationMs(1), 55_000);
    assert.ok(scriptureRainDurationMs(16) <= 120_000);
});

test('member hints use authenticated idempotent asset-ledger spending', async () => {
    const routes = await readFile(new URL('../domains/game/scripture-rain/routes.js', import.meta.url), 'utf8');
    const service = await readFile(new URL('../domains/game/scripture-rain/service.js', import.meta.url), 'utf8');
    assert.match(routes, /authenticateToken/);
    assert.match(service, /applyCoinDeltaTx/);
    assert.match(service, /scripture-rain:hint:/);
    assert.match(service, /spend_scripture_rain_hint/);
    assert.match(service, /resolvePassageSegmentation/);
    assert.match(service, /validateCustomRange/);
});
