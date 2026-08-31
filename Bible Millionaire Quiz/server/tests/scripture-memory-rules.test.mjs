import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildStepOptions } from '../domains/scripture-tools/order-engine.js';
import {
    externalDistractorCount,
    SCRIPTURE_MEMORY_SPEED_COIN_FACTORS,
    scriptureMemoryCoinReward,
    scriptureMemoryCoinRewardBreakdown,
    scriptureRangeKey,
    validateMemoryLayout
} from '../domains/scripture-tools/scripture-memory-rules.js';
import {
    SCRIPTURE_RAIN_MOTION,
    buildContinuousRainFragments,
    rainCardMotion,
    rainExpectedReentryDelayMs,
    rainLaunchGapMs,
    rainOpeningDelayMs,
    rainReentryGapMs,
    rainVisibleCapacity
} from '../../src/features/scripture-rain/scriptureRainMotion.js';
import { isCorrectRainSelection } from '../domains/game/scripture-rain/engine.js';

test('difficulty rules use the agreed external distractor counts', () => {
    assert.equal(externalDistractorCount({ gridSize: 4, difficulty: 'SIMPLE' }), 0);
    assert.equal(externalDistractorCount({ gridSize: 4, difficulty: 'MEDIUM' }), 1);
    assert.equal(externalDistractorCount({ gridSize: 4, difficulty: 'HARD' }), 2);
    assert.equal(externalDistractorCount({ gridSize: 9, difficulty: 'MEDIUM' }), 4);
    assert.equal(externalDistractorCount({ gridSize: 9, difficulty: 'HARD' }), 6);
    assert.equal(externalDistractorCount({ game: 'rain', difficulty: 'HARD' }), 2);
});

test('four and nine grids enforce their minimum healthy fragment counts', () => {
    assert.equal(validateMemoryLayout({ gridSize: 4, fragmentCount: 3 }).code, 'FOUR_GRID_REQUIRES_4_FRAGMENTS');
    assert.equal(validateMemoryLayout({ gridSize: 4, fragmentCount: 4 }).valid, true);
    assert.equal(validateMemoryLayout({ gridSize: 9, fragmentCount: 11 }).valid, false);
    assert.equal(validateMemoryLayout({ gridSize: 9, fragmentCount: 12 }).ideal, false);
    assert.equal(validateMemoryLayout({ gridSize: 9, fragmentCount: 15 }).ideal, true);
});

test('order options contain the requested number of external fragments without revealing them publicly', () => {
    let token = 0;
    const fragments = Array.from({ length: 12 }, (_, index) => ({ id: `f${index}`, text: `本段${index}，` }));
    const external = Array.from({ length: 8 }, (_, index) => ({ id: `x${index}`, text: `外部${index}。`, external: true }));
    const options = buildStepOptions(fragments, 0, () => `t${token += 1}`, () => 0.42, null, 9, external, 6);
    assert.equal(options.length, 9);
    assert.equal(options.filter(item => item.external).length, 6);
    assert.equal(options.filter(item => item.isCorrect).length, 1);
});

test('rain starts every passage fragment and keeps only the configured external distractors', () => {
    const fragments = Array.from({ length: 10 }, (_, index) => ({ id: `f${index}`, text: `本段${index}` }));
    const external = [
        { id: 'same', text: '本段0', external: true },
        ...Array.from({ length: 4 }, (_, index) => ({ id: `x${index}`, text: `外部${index}`, external: true }))
    ];
    const visible = buildContinuousRainFragments(fragments, external, 'HARD', 3);
    assert.equal(visible.length, 12);
    assert.equal(visible.filter(item => item.external).length, 2);
    assert.deepEqual(new Set(visible.filter(item => !item.external).map(item => item.id)), new Set(fragments.map(item => item.id)));
    assert.equal(visible.some(item => item.id === 'same'), false);
    assert.equal(SCRIPTURE_RAIN_MOTION.spawnPointCount, 20);
    assert.equal(SCRIPTURE_RAIN_MOTION.durations.fast * 2, SCRIPTURE_RAIN_MOTION.durations.slow);
    assert.deepEqual(SCRIPTURE_RAIN_MOTION.durations, { slow: 11.2, medium: 8.4, fast: 5.6 });
    const motion = rainCardMotion(visible[0], 0, 3);
    assert.equal(motion['--rain-angle'], '0deg');
    assert.notEqual(motion['--rain-start-left'], motion['--rain-end-left']);
    assert.ok(Math.abs(parseFloat(motion['--rain-start-left']) - parseFloat(motion['--rain-end-left'])) >= 5);
    assert.ok([2, 3, 4].includes(motion['--rain-z']));
    assert.ok(Number.parseFloat(motion['--rain-start-left']) >= 20);
    assert.ok(Number.parseFloat(motion['--rain-end-left']) <= 80);
    const compactMotion = rainCardMotion(visible[0], 0, 3, true);
    assert.ok(Number.parseFloat(compactMotion['--rain-start-left']) >= 22);
    assert.ok(Number.parseFloat(compactMotion['--rain-end-left']) <= 78);
    const compactStarts = Array.from({ length: 6 }, (_, index) => (
        Number.parseFloat(rainCardMotion({ id: `compact-${index}` }, index, 'compact-opening', true)['--rain-start-left'])
    ));
    const compactGaps = compactStarts.slice(1).map((value, index) => Math.abs(value - compactStarts[index]));
    assert.equal(new Set(compactStarts).size, 6);
    assert.ok(Math.max(...compactStarts) - Math.min(...compactStarts) >= 50);
    assert.equal(compactGaps.every(value => value >= 20), true);
    assert.equal(compactStarts.every(value => value <= 30 || value >= 70), true);
    const compactPaths = Array.from({ length: 18 }, (_, index) => (
        rainCardMotion({ id: `compact-path-${index}` }, index, 'compact-paths', true)
    ));
    assert.equal(compactPaths.every(motion => {
        const start = Number.parseFloat(motion['--rain-start-left']);
        const end = Number.parseFloat(motion['--rain-end-left']);
        return start < 50 ? end <= 38 : end >= 62;
    }), true);
    const groupedStarts = Array.from({ length: 8 }, (_, index) => (
        rainCardMotion({ id: `group-${index}` }, index, 'same-opening-wave')['--rain-start-left']
    ));
    assert.equal(new Set(groupedStarts).size, 8);
    const desktopStarts = Array.from({ length: 20 }, (_, index) => (
        Number.parseFloat(rainCardMotion({ id: `desktop-${index}` }, index, 'desktop-cycle')['--rain-start-left'])
    ));
    assert.equal(new Set(desktopStarts).size, SCRIPTURE_RAIN_MOTION.spawnPointCount);
    assert.equal(desktopStarts.every(value => value <= 38 || value >= 62), true);
    const desktopGaps = desktopStarts.slice(1).map((value, index) => Math.abs(value - desktopStarts[index]));
    assert.equal(desktopGaps.every(value => value >= 24), true);
});

test('rain randomizes the first falling slot instead of fixing the answer first', () => {
    const fragments = Array.from({ length: 10 }, (_, index) => ({ id: `f${index}`, text: `本段${index}` }));
    const positions = new Set();
    for (let seed = 0; seed < 20; seed += 1) {
        const visible = buildContinuousRainFragments(fragments, [], 'SIMPLE', `seed:${seed}`);
        positions.add(visible.findIndex(item => item.id === 'f0'));
    }
    assert.ok(positions.size > 1);
});

test('rain relaunches every landed card, prioritizes the expected fragment, and never treats landing as a miss', async () => {
    const source = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.jsx', import.meta.url), 'utf8');
    const styles = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.css', import.meta.url), 'utf8');
    assert.match(source, /previous\.filter\(card => card\.rainInstanceId !== removedInstanceId\)/);
    assert.match(source, /key=\{`\$\{fragment\.rainInstanceId\}:\$\{fragment\.rainCycle \|\| 0\}`\}/);
    assert.match(source, /animationIterationCount: '1'/);
    assert.match(source, /漏過的下一片會優先回到畫面；只有點錯才失去生命/);
    assert.match(source, /onAnimationEnd=/);
    assert.match(source, /recycleRainCard/);
    assert.match(source, /rainSpawnOrdinalRef\.current \+= 1/);
    assert.match(source, /reserveRainLaunch/);
    assert.match(source, /const isExpectedCard = Boolean\(expectedFragment && recycledCard\)/);
    assert.match(source, /isExpectedCard\s*\? rainExpectedReentryDelayMs\(compactStage, challengeSpeed\)\s*:\s*reserveRainLaunch\(challengeSpeed\)/);
    assert.doesNotMatch(source, /type: 'miss'/);
    assert.doesNotMatch(source, /replaceRainCard|nextExpectedSpawnDelay/);
    assert.match(styles, /100%\s*\{\s*top:\s*100%/);
    assert.doesNotMatch(styles, /translate3d\(-50%,\s*112vh/);
});

test('rain assembles every correct fragment on screen with its original punctuation', async () => {
    const source = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.jsx', import.meta.url), 'utf8');
    assert.match(source, /const assembledFragments = session\.fragments\.slice\(0, currentIndex\)/);
    assert.match(source, /className="scripture-rain__assembly"/);
    assert.match(source, /\{fragment\.text\}/);
    assert.match(source, /startsVerse/);
});

test('rain sizes its three-to-six-card sliding window from the usable stage', async () => {
    const source = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.jsx', import.meta.url), 'utf8');
    const service = await readFile(new URL('../domains/game/scripture-rain/service.js', import.meta.url), 'utf8');
    assert.match(service, /verse: Number\(verses\[verseIndex\]\.verse\)/);
    assert.match(source, /rainVisibleCapacity\(\s*stageMetrics\.width,\s*stageMetrics\.height,\s*stageMetrics\.reservedTop/);
    assert.match(source, /const visibleCapacity = visibleRainCapacity/);
    assert.match(source, /observer\.observe\(stage\)/);
    assert.match(source, /observer\.observe\(assembly\)/);
    assert.match(source, /nextSession\.fragments\.slice\(nextIndex, nextIndex \+ sourceCapacity\)/);
    assert.match(source, /const openingCards = createRainWindowCards\(preparedSession, preparedSession\.currentIndex \|\| 0\)/);
    assert.match(source, /replenishRainWindow/);
    assert.match(source, /entryDelayMs \/ 1000/);
    assert.match(source, /rainOpeningDelayMs\(slotIndex, randomSeed, compactStage, speed, openingGapLimit\)/);
    assert.match(source, /entryDelay && !entryDelay\.startsWith\('-'\)/);
    assert.match(source, /--rain-entry-top/);
    assert.match(source, /第 \$\{previousVerse\} 節完成，接著進入第 \$\{nextVerse\} 節/);

    assert.equal(rainVisibleCapacity(390, 520, 170), 3);
    assert.equal(rainVisibleCapacity(460, 770, 170), 4);
    assert.equal(rainVisibleCapacity(1024, 520, 120), 4);
    assert.equal(rainVisibleCapacity(1365, 760, 120), 6);
    for (const dimensions of [[320, 300, 160], [430, 900, 170], [1920, 1080, 125]]) {
        const capacity = rainVisibleCapacity(...dimensions);
        assert.ok(capacity >= 3 && capacity <= 6);
    }
});

test('rain keeps cards hidden until countdown finishes and then releases a spaced opening wave', async () => {
    const source = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.jsx', import.meta.url), 'utf8');
    const styles = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.css', import.meta.url), 'utf8');
    assert.match(source, /screen === 'playing' \? rainCards\.map/);
    assert.match(source, /倒數結束後，片段才會從上方依序落下/);
    assert.doesNotMatch(source, /slotIndex \* 320/);
    assert.match(styles, /\.scripture-rain__card\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?animation-fill-mode:\s*backwards;/);
    const delays = Array.from({ length: 6 }, (_, index) => rainOpeningDelayMs(index, 'opening-wave'));
    const gaps = delays.slice(1).map((value, index) => value - delays[index]);
    assert.equal(delays[0], 0);
    assert.equal(gaps.every(value => value >= 900 && value <= 1250), true);
    assert.ok(new Set(gaps).size > 1);
    const compactDelays = Array.from({ length: 4 }, (_, index) => rainOpeningDelayMs(index, 'compact-opening', true));
    const compactDelayGaps = compactDelays.slice(1).map((value, index) => value - compactDelays[index]);
    assert.equal(compactDelayGaps.every(value => value >= 1200 && value <= 1550), true);
    assert.equal(rainReentryGapMs(true, 'MEDIUM'), 1100);
    assert.equal(rainReentryGapMs(true, 'SLOW') > rainReentryGapMs(true, 'MEDIUM'), true);
    assert.equal(rainReentryGapMs(true, 'FAST') < rainReentryGapMs(true, 'MEDIUM'), true);
    for (const compact of [false, true]) {
        for (const speed of ['SLOW', 'MEDIUM', 'FAST']) {
            const delay = rainExpectedReentryDelayMs(compact, speed);
            assert.ok(delay >= 0 && delay <= 1500, `expected fragment delay ${delay}ms exceeded the 1.5s cap`);
        }
    }
    assert.equal(rainExpectedReentryDelayMs(true, 'MEDIUM'), 900);
    assert.equal(rainExpectedReentryDelayMs(false, 'MEDIUM'), 650);
    assert.ok(rainLaunchGapMs(770, 170, 4, true) < rainReentryGapMs(true, 'MEDIUM'));
    assert.ok(rainLaunchGapMs(420, 170, 3, true) <= rainReentryGapMs(true, 'MEDIUM'));
});

test('rain defaults new games to slow speed while keeping faster choices available', async () => {
    const setup = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainSetup.jsx', import.meta.url), 'utf8');
    const api = await readFile(new URL('../../src/features/scripture-rain/scriptureRainApi.js', import.meta.url), 'utf8');
    const service = await readFile(new URL('../domains/game/scripture-rain/service.js', import.meta.url), 'utf8');
    assert.match(setup, /useState\('SLOW'\)/);
    assert.match(api, /challengeSpeed: source\?\.challengeSpeed \|\| 'SLOW'/);
    assert.match(service, /input\?\.challengeSpeed \|\| 'SLOW'/);
    assert.match(setup, /onSpeedChange=\{setChallengeSpeed\}/);
});

test('rain passage selection keeps one explicit sticky action across all three steps', async () => {
    const source = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainSetup.jsx', import.meta.url), 'utf8');
    const styles = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.css', import.meta.url), 'utf8');
    assert.match(source, /aria-label="確認經文與遊戲設定"/);
    assert.match(source, /下一步：預覽經文/);
    assert.match(source, /下一步：遊戲模式/);
    assert.match(source, /開始挑戰/);
    assert.match(source, /validateScriptureOrderRange\(customSelection, \{ min: 1, max: 20 \}\)/);
    assert.match(source, /previewScriptureRainPassage/);
    assert.match(source, /setupStage === 'select' && !canPrepare/);
    assert.match(styles, /\.scripture-rain__custom-confirm\s*\{[\s\S]*?position: sticky/);
});

test('both scripture memory games count down before the server starts timing', async () => {
    const rain = await readFile(new URL('../../src/features/scripture-rain/ScriptureRainGame.jsx', import.meta.url), 'utf8');
    const order = await readFile(new URL('../../src/features/scripture-order/ScriptureOrderGame.jsx', import.meta.url), 'utf8');
    assert.match(rain, /setScreen\('countdown'\)[\s\S]*?await runStartCountdown\(setCountdown[^)]*\)[\s\S]*?startScriptureRainSession/);
    assert.match(rain, /createRainWindowCards\(preparedSession, preparedSession\.currentIndex \|\| 0\)/);
    assert.match(order, /setScreen\('countdown'\)[\s\S]*?await runStartCountdown\(setCountdown[^)]*\)[\s\S]*?createScriptureOrderSession/);
    assert.match(rain, /\[3, 2, 1\]/);
    assert.match(order, /\[3, 2, 1\]/);
});

test('rain accepts another passage fragment with identical visible text but never an unknown id', () => {
    const fragments = [
        { id: 'f0', text: '你們要喜樂！' },
        { id: 'f1', text: '你們要喜樂。' },
        { id: 'f2', text: '常常禱告。' }
    ];
    assert.equal(isCorrectRainSelection(fragments, 0, 'f0'), true);
    assert.equal(isCorrectRainSelection(fragments, 0, 'f1'), true);
    assert.equal(isCorrectRainSelection(fragments, 0, 'external-same-text'), false);
    assert.equal(isCorrectRainSelection(fragments, 0, 'f2'), false);
});

test('same exact range shares one reward key while overlapping ranges differ', () => {
    const base = { book: 'Psalms', chapter: 1, verseStart: 1, verseEnd: 3 };
    assert.equal(scriptureRangeKey(base), scriptureRangeKey({ ...base }));
    assert.notEqual(scriptureRangeKey(base), scriptureRangeKey({ ...base, verseEnd: 2 }));
    assert.equal(scriptureMemoryCoinReward({ elapsedMs: 1_000, fragmentCount: 10, mistakes: 0 }), 4);
    assert.equal(scriptureMemoryCoinReward({ elapsedMs: 100_000, fragmentCount: 10, mistakes: 2 }), 1);
});

test('scripture memory speed rewards', () => {
    const base = scriptureMemoryCoinReward({ elapsedMs: 1_000, fragmentCount: 12, correctCoins: 12, mistakes: 0, challengeSpeed: 'MEDIUM' });
    const slow = scriptureMemoryCoinReward({ elapsedMs: 1_000, fragmentCount: 12, correctCoins: 12, mistakes: 0, challengeSpeed: 'SLOW' });
    const fast = scriptureMemoryCoinReward({ elapsedMs: 1_000, fragmentCount: 12, correctCoins: 12, mistakes: 0, challengeSpeed: 'FAST' });
    assert.equal(base, slow);
    assert.equal(fast, Math.ceil(base * SCRIPTURE_MEMORY_SPEED_COIN_FACTORS.FAST));
    assert.equal(SCRIPTURE_MEMORY_SPEED_COIN_FACTORS.FAST, 1.2);
});

test('correct fragments are base coins and completion bonuses settle separately', () => {
    const completed = scriptureMemoryCoinRewardBreakdown({
        elapsedMs: 1_000,
        fragmentCount: 12,
        correctCoins: 12,
        mistakes: 0,
        challengeSpeed: 'MEDIUM'
    });
    assert.equal(completed.correctCoins, 12);
    assert.equal(completed.completionCoins, 1);
    assert.equal(completed.timeBonus, 2);
    assert.equal(completed.uninterruptedBonus, 1);
    assert.equal(completed.baseCoins, 16);
    assert.equal(completed.coins, 16);
});

test('fast speed bonus always rounds up in the player favour', () => {
    const threeCoinBase = scriptureMemoryCoinRewardBreakdown({
        elapsedMs: 1_000,
        fragmentCount: 12,
        mistakes: 1,
        challengeSpeed: 'FAST'
    });
    const fourCoinBase = scriptureMemoryCoinRewardBreakdown({
        elapsedMs: 1_000,
        fragmentCount: 12,
        mistakes: 0,
        challengeSpeed: 'FAST'
    });
    assert.equal(threeCoinBase.baseCoins, 3);
    assert.equal(threeCoinBase.coins, 4);
    assert.equal(fourCoinBase.baseCoins, 4);
    assert.equal(fourCoinBase.coins, 5);
    assert.equal(fourCoinBase.rounding, 'CEIL');
});
