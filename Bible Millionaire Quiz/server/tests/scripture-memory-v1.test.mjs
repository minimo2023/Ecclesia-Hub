import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { arrangeOptionSlots, planOptionRefill } from '../../src/features/scripture-order/optionLayout.js';
import {
  scriptureOrderRangeFromRows,
  updateScriptureOrderRange,
  validateScriptureOrderRange
} from '../../src/features/scripture-order/scriptureOrderSelection.js';

const root = new URL('../../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('scripture order exposes shared source, layout and difficulty controls', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const api = await read('src/features/scripture-order/scriptureOrderApi.js');
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');

  assert.match(shared, /常用經文/);
  assert.match(shared, /自選範圍/);
  assert.match(shared, /四宮格/);
  assert.match(shared, /九宮格/);
  assert.match(shared, /challengeDifficulty|難度/);
  assert.match(api, /mode: 'practice'/);
  assert.match(api, /gridSize/);
  assert.match(api, /challengeDifficulty/);
  assert.match(api, /\/custom-preview/);
  assert.doesNotMatch(`${ui}\n${api}`, /lab-leaderboard|\/publish|\/demo/);
});

test('memory game entrances show custom range first and select it by default', async () => {
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');
  const order = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const rain = await read('src/features/scripture-rain/ScriptureRainSetup.jsx');

  assert.ok(shared.indexOf('自選範圍') < shared.indexOf('常用經文'));
  assert.match(order, /const \[sourceType, setSourceType\] = useState\('custom'\)/);
  assert.match(rain, /const \[sourceType, setSourceType\] = useState\('custom'\)/);
});

test('desktop and mobile expose a responsive illustrated scripture-memory guide', async () => {
  const guide = await read('src/features/scripture-memory/ScriptureMemoryGuide.jsx');
  const css = await read('src/features/scripture-memory/ScriptureMemoryGuide.css');
  const desktopEntry = await read('src/features/game/components/GameModeSelector.jsx');
  const desktopApp = await read('src/App.jsx');
  const mobileEntry = await read('mobile-app/src/pages/GamesPage.jsx');
  const mobileApp = await read('mobile-app/src/App.jsx');

  assert.match(guide, /經文記憶玩法指南|經文記憶玩法/);
  assert.match(guide, /<picture>/);
  assert.match(guide, /desktop-selection\.png/);
  assert.match(guide, /mobile-selection\.png/);
  assert.match(guide, /經文四宮格/);
  assert.match(guide, /經文雨/);
  assert.match(guide, /三顆愛心/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /--marker-mobile-x/);
  assert.match(desktopEntry, /scripture-memory-guide/);
  assert.match(desktopApp, /case 'scripture-memory-guide'/);
  assert.match(mobileEntry, /\/games\/scripture-memory-guide/);
  assert.match(mobileApp, /path="\/games\/scripture-memory-guide"/);

  const images = [
    'desktop-selection.png',
    'mobile-selection.png',
    'desktop-setup.png',
    'mobile-setup.png',
    'desktop-order-play.png',
    'mobile-order-play.png',
    'desktop-rain-play.png',
    'mobile-rain-play.png'
  ];
  await Promise.all(images.flatMap(name => [
    access(new URL(`public/images/game-guides/scripture-memory/${name}`, root)),
    access(new URL(`mobile-app/public/images/game-guides/scripture-memory/${name}`, root))
  ]));
});

test('both memory games expose opt-in voice input without changing server answer contracts', async () => {
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');
  const hook = await read('src/features/scripture-memory/useScriptureVoiceInput.js');
  const order = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const rain = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const rainSetup = await read('src/features/scripture-rain/ScriptureRainSetup.jsx');
  const server = await read('server/index.js');

  assert.match(shared, /type="checkbox"[\s\S]*?<strong>語音模式<\/strong>/);
  assert.match(hook, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(hook, /import\('\.\/scriptureVoiceMatcher'\)/);
  assert.doesNotMatch(hook, /localStorage|sessionStorage|fetch\(/);
  assert.match(order, /onSelect: chooseOption/);
  assert.match(rain, /onSelect: handleFragment/);
  assert.match(order, /ScriptureVoiceModeControl voice=\{voice\}/);
  assert.match(rainSetup, /setupStage === 'mode'[\s\S]*?<ScriptureVoiceModeControl voice=\{voice\}/);
  assert.doesNotMatch(rain, /ScriptureVoiceModeControl|scripture-rain__voice-control/);
  assert.match(server, /Permissions-Policy', 'microphone=\(self\)'/);
});

test('rain uses select, full-text preview, then mode as three explicit steps', async () => {
  const rain = await read('src/features/scripture-rain/ScriptureRainSetup.jsx');

  assert.equal((rain.match(/<ScriptureMemoryModePicker/g) || []).length, 1);
  assert.match(rain, /const \[setupStage, setSetupStage\] = useState\('select'\)/);
  assert.match(rain, /setupStage === 'preview'/);
  assert.match(rain, /setupStage === 'mode'/);
  assert.match(rain, /scripture-order-text-preview/);
  assert.match(rain, /下一步：預覽經文/);
  assert.match(rain, /下一步：遊戲模式/);
  assert.match(rain, /aria-label="確認經文與遊戲設定"/);
  assert.doesNotMatch(rain, /<ScriptureMemoryPrimaryAction/);
});

test('order previews either passage source before exposing the mode step', async () => {
  const order = await read('src/features/scripture-order/ScriptureOrderGame.jsx');

  assert.equal((order.match(/<ScriptureMemoryModePicker/g) || []).length, 1);
  assert.match(order, /const \[featuredStage, setFeaturedStage\] = useState\('select'\)/);
  assert.match(order, /previewFeaturedPassage/);
  assert.match(order, /featuredStage === 'preview'/);
  assert.match(order, /下一步：預覽經文/);
  assert.match(order, /下一步：遊戲模式/);
  assert.match(order, /aria-label="確認經文與遊戲設定"/);
  assert.match(order, /請先選擇經文範圍/);
});

test('both memory games share one common-passage catalogue and an in-card menu', async () => {
  const rainEngine = await read('server/domains/game/scripture-rain/engine.js');
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');
  assert.match(rainEngine, /SEED_PASSAGES\.map/);
  assert.doesNotMatch(rainEngine, /rain-psa-23-1-6/);
  assert.match(shared, /scripture-memory-passage-picker__menu/);
  assert.match(shared, /目前選擇：\$\{selected\.title\}/);
  assert.match(shared, /menu\.current\.open = false/);
});

test('desktop and mobile expose a dedicated scripture-order route', async () => {
  const desktop = await read('src/App.jsx');
  const mobile = await read('mobile-app/src/App.jsx');

  assert.match(desktop, /case 'scripture-order'/);
  assert.match(desktop, /ScriptureOrderGame/);
  assert.match(mobile, /path="\/game\/scripture-order"/);
  assert.match(mobile, /ScriptureOrderPage/);
});

test('the client follows the server-owned random slots after a correct answer', () => {
  const option = (key, slot) => ({ key, token: `token-${key}`, text: key, slot });
  const previousSlots = ['A', 'B', 'C', 'D'].map((key, slot) => option(key, slot));
  const nextOptions = [option('B', 2), option('C', 3), option('D', 0), option('E', 1)];

  const next = arrangeOptionSlots({ previousSlots, nextOptions, transition: 'correct' });
  assert.deepEqual(next.map(item => item?.key), ['D', 'E', 'B', 'C']);
});

test('correct transition shuffles retained cards before filling incoming cards', () => {
  const option = (key, slot) => ({ key, token: `token-${key}`, text: key, slot });
  const previousSlots = ['A', 'B', 'C', 'D'].map((key, slot) => option(key, slot));
  const nextOptions = [option('B', 2), option('C', 3), option('D', 0), option('E', 1)];
  const plan = planOptionRefill(previousSlots, nextOptions);

  assert.equal(plan.shuffledSlots.filter(Boolean).length, 3);
  assert.deepEqual(new Set(plan.shuffledSlots.filter(Boolean).map(item => item.key)), new Set(['B', 'C', 'D']));
  assert.deepEqual(plan.shuffledSlots.map(item => item?.key || null), ['D', null, 'B', 'C']);
  assert.equal(plan.shuffledSlots.some(item => item?.key === 'E'), false);
  assert.deepEqual(plan.finalSlots.map(item => item.key), ['D', 'E', 'B', 'C']);
  assert.deepEqual(plan.incomingKeys, ['E']);
});

test('wrong answers replace only their server-owned slot', () => {
  const option = (key, slot) => ({ key, token: `token-${key}`, text: key, slot });
  const previousSlots = ['A', 'B', 'C', 'D'].map((key, slot) => option(key, slot));
  const nextOptions = [option('A', 0), option('E', 1), option('C', 2), option('D', 3)];
  const next = arrangeOptionSlots({ previousSlots, nextOptions, transition: 'wrong' });
  assert.deepEqual(next.map(item => item?.key), ['A', 'E', 'C', 'D']);
});

test('formal entry keeps random count-up play with configurable external distractors', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const service = await read('server/domains/scripture-tools/order-service.js');
  assert.match(ui, /隨機洗牌/);
  assert.match(ui, /ScriptureMemoryModePicker/);
  assert.match(ui, /常用經文/);
  assert.match(ui, /依完成次數排列/);
  assert.match(service, /mode: row\.mode === 'practice' \? 'countup' : 'countdown'/);
  assert.match(service, /practiceRankings/);
  assert.match(service, /自選經文挑戰/);
  assert.doesNotMatch(service, /需要有效的實驗訪客識別碼|自選經文只供單關練習|這次練習已無法繼續/);
  assert.match(service, /externalDistractorCount/);
  assert.match(service, /awardScriptureMemoryProgress/);
});

test('order setup hides speed controls while rain keeps its speed selector', async () => {
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');
  const order = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const rain = await read('src/features/scripture-rain/ScriptureRainSetup.jsx');
  assert.match(shared, /\{rain \? \([\s\S]*?<span>速度<\/span>/);
  assert.doesNotMatch(order, /onSpeedChange=/);
  assert.match(rain, /onSpeedChange=\{setChallengeSpeed\}/);
});

test('custom passage flow uses the shared book selector, direct verse selection, preview, then explicit start', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const api = await read('src/features/scripture-order/scriptureOrderApi.js');
  const routes = await read('server/domains/scripture-tools/order.routes.js');
  const service = await read('server/domains/scripture-tools/order-service.js');

  assert.match(ui, /ScriptureBookChapterSelector/);
  assert.match(ui, /ScriptureOrderRangePicker/);
  assert.match(ui, /下一步：預覽經文/);
  assert.match(ui, /下一步：遊戲模式/);
  assert.match(ui, /customStage === 'preview'/);
  assert.match(ui, /minimumVerses=\{1\}/);
  assert.match(ui, /maximumVerses=\{20\}/);
  assert.match(ui, /四宮格至少需要 4 片/);
  assert.match(ui, /scripture-order-text-preview/);
  assert.match(ui, /customPreview\.verses/);
  assert.match(ui, /!selectedHasEnoughFragments \|\| !selectedHasSafeFragmentLengths/);
  assert.match(service, /sourceVerses/);
  assert.match(service, /maximumVisibleLength: 10/);
  assert.match(service, /withinMemoryLimit: fragments\.every/);
  assert.doesNotMatch(ui, /type="number"/);
  assert.match(api, /\/chapter\?/);
  assert.match(routes, /router\.get\('\/chapter'/);
  assert.match(service, /validateCustomRange\(input, \{ min: 1, max: 20 \}\)/);
});

test('unfinished practice is replaced only when the player starts a fresh challenge', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');

  assert.doesNotMatch(ui, /繼續上次挑戰/);
  assert.doesNotMatch(ui, /放棄舊局/);
  assert.doesNotMatch(ui, /中途可續玩/);
  assert.match(ui, /失敗就重來/);
  assert.match(ui, /showHelp \?/);
  assert.match(ui, /if \(previousSession\?\.id\) \{[\s\S]*?await abandonScriptureOrderSession\(previousSession\.id\)/);
  assert.match(ui, /session\.status === 'failed' \? '重新挑戰' : '再挑戰一段'/);
  const leaveFunction = ui.match(/const leave = \(\) => \{[\s\S]*?\n    \};/)?.[0] || '';
  assert.doesNotMatch(leaveFunction, /abandonScriptureOrderSession/);
});

test('both scripture memory games return to their category or go directly home', async () => {
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');
  const desktop = await read('src/App.jsx');
  const orderMobile = await read('mobile-app/src/pages/ScriptureOrderPage.jsx');
  const rainMobile = await read('mobile-app/src/pages/ScriptureRainPage.jsx');

  assert.match(shared, /<strong>返回<\/strong><small>回到經文記憶<\/small>/);
  assert.match(shared, /<strong>回首頁<\/strong>/);
  assert.doesNotMatch(shared, /上一個頁面|遊戲選單/);
  assert.match(desktop, /<ScriptureOrderGame[\s\S]*?onBack=\{\(\) => returnToGameHub\('memory'\)\}[\s\S]*?onHome=/);
  assert.match(desktop, /<ScriptureRainGame[\s\S]*?onBack=\{\(\) => returnToGameHub\('memory'\)\}[\s\S]*?onHome=/);
  for (const page of [orderMobile, rainMobile]) {
    assert.match(page, /onBack=\{\(\) => navigate\('\/games', \{ state: \{ section: 'memory' \} \}\)\}/);
    assert.match(page, /onHome=\{\(\) => navigate\('\/'\)\}/);
  }
});

test('guest coin warning stays above the scripture memory exit menu', async () => {
  const sharedStyles = await read('src/features/scripture-memory/ScriptureMemorySetup.css');
  const guestDialog = await read('src/features/game/components/shared/GuestGameExitDialog.jsx');
  const memoryExitZIndex = Number(sharedStyles.match(/\.scripture-memory-exit-backdrop\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
  const guestExitZIndex = Number(guestDialog.match(/z-\[(\d+)\]/)?.[1]);

  assert.ok(Number.isFinite(memoryExitZIndex), 'scripture memory exit menu must define a numeric z-index');
  assert.ok(Number.isFinite(guestExitZIndex), 'guest coin warning must define a numeric z-index');
  assert.ok(
    guestExitZIndex > memoryExitZIndex,
    `guest coin warning (${guestExitZIndex}) must render above memory exit menu (${memoryExitZIndex})`
  );
});

test('leaving an active memory game requires confirmation and settles the current run as failed', async () => {
  const shared = await read('src/features/scripture-memory/ScriptureMemorySetup.jsx');
  const orderUi = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const orderApi = await read('src/features/scripture-order/scriptureOrderApi.js');
  const orderRoutes = await read('server/domains/scripture-tools/order.routes.js');
  const orderService = await read('server/domains/scripture-tools/order-service.js');
  const rainUi = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const rainApi = await read('src/features/scripture-rain/scriptureRainApi.js');
  const rainRoutes = await read('server/domains/game/scripture-rain/routes.js');
  const rainService = await read('server/domains/game/scripture-rain/service.js');

  assert.match(shared, /已答對片段的金幣保留，不發放通關加成/);
  assert.match(shared, /繼續遊戲/);
  assert.match(orderUi, /screen === 'playing' && session\?\.status === 'active'/);
  assert.match(orderUi, /await forfeitScriptureOrderSession\(session\.id\)/);
  assert.match(rainUi, /screen === 'playing' && session\?\.status === 'active'/);
  assert.match(rainUi, /await forfeitScriptureRainSession\(session\.id\)/);
  assert.match(orderApi, /\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/forfeit/);
  assert.match(rainApi, /\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/forfeit/);
  assert.match(orderRoutes, /router\.post\('\/sessions\/:id\/forfeit'/);
  assert.match(rainRoutes, /router\.post\('\/sessions\/:sessionId\/forfeit'/);
  assert.match(orderService, /type: 'forfeit'[\s\S]*?row\.status !== 'active'[\s\S]*?status: 'failed'/);
  assert.match(rainService, /type: 'forfeit'[\s\S]*?row\.status !== 'active'[\s\S]*?SET status = 'failed'/);
  assert.match(orderService, /else if \(state\.reward\)[\s\S]*?awardedNow: false/);
  assert.match(rainService, /let reward = jsonValue\(row\.reward, null\)/);
  assert.match(orderUi, /const immersive = \['countdown', 'starting', 'playing'\]\.includes\(screen\)/);
  assert.match(orderUi, /<ScriptureMemoryGameHud[\s\S]*?onLeave=\{leave\}/);
  assert.match(rainUi, /<ScriptureMemoryGameHud[\s\S]*?onLeave=\{\(\) => setShowExitMenu\(true\)\}/);
});

test('both scripture memory modes share one HUD and deduct the same three hearts', async () => {
  const hud = await read('src/features/scripture-memory/ScriptureMemoryGameHud.jsx');
  const hudStyles = await read('src/features/scripture-memory/ScriptureMemoryGameHud.css');
  const orderUi = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const orderService = await read('server/domains/scripture-tools/order-service.js');
  const rainUi = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const rainService = await read('server/domains/game/scripture-rain/service.js');

  assert.match(hud, /\[0, 1, 2\]\.map/);
  assert.match(hud, /剩餘 \$\{remainingLives\} 顆愛心/);
  assert.match(hud, /生命[\s\S]*?倍率[\s\S]*?連續[\s\S]*?時間/);
  assert.match(hudStyles, /grid-template-columns: minmax\(92px, 0\.85fr\) repeat\(5, minmax\(70px, 1fr\)\)/);
  assert.match(hudStyles, /@media \(max-width: 640px\)[\s\S]*?grid-template-columns: 48px repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(orderUi, /lives=\{session\.lives\}[\s\S]*?multiplier=\{session\.multiplier\}[\s\S]*?streak=\{session\.streak\}/);
  assert.match(rainUi, /lives=\{lives\}[\s\S]*?multiplier=\{multiplier\}[\s\S]*?streak=\{streak\}/);
  assert.match(orderService, /const lives = Math\.max\(0, Number\(row\.lives \?\? MAX_LIVES\) - 1\)/);
  assert.match(rainService, /const lives = correct \? Number\(row\.lives\) : Math\.max\(0, Number\(row\.lives\) - 1\)/);
});

test('game routes preserve the owning category and category back returns home', async () => {
  const desktop = await read('src/App.jsx');
  const desktopHub = await read('src/features/game/components/GameModeSelector.jsx');
  const mobileHub = await read('mobile-app/src/pages/GamesPage.jsx');
  const mobilePlay = await read('mobile-app/src/pages/GamePlayPage.jsx');
  const mobileResult = await read('mobile-app/src/pages/GameResultPage.jsx');

  assert.match(desktopHub, /initialSection = 'quiz'/);
  assert.match(desktop, /initialSection=\{gameHubSection\}/);
  assert.match(desktop, /const handleReturnToMenu =[\s\S]*?returnToGameHub\('quiz'\)/);
  assert.match(mobileHub, /location\.state\?\.section/);
  assert.match(mobileHub, /showBack onBack=\{\(\) => requestGuestGameExit\(\(\) => navigate\('\/'\)\)\}/);
  assert.match(mobileHub, /\{guestGameExitDialog\}/);
  assert.match(mobilePlay, /navigate\('\/games', \{ replace: true, state: \{ section: 'quiz' \} \}\)/);
  assert.match(mobileResult, /state: \{ section: 'quiz' \}/);
});

test('result and personal history use owner-scoped data and ledger-backed daily range rewards', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const settlement = await read('src/features/scripture-memory/ScriptureMemorySettlement.jsx');
  const routes = await read('server/domains/scripture-tools/order.routes.js');
  const service = await read('server/domains/scripture-tools/order-service.js');
  const rewards = await read('server/domains/scripture-tools/scripture-memory-reward-service.js');

  assert.match(ui, /完成時間/);
  assert.match(ui, /我的挑戰紀錄/);
  assert.match(ui, /個人最佳/);
  assert.match(routes, /router\.get\('\/history'/);
  assert.match(service, /s\.owner_key = \$1/);
  assert.match(service, /MIN\(r\.duration_ms\) FILTER \(WHERE r\.assisted = FALSE\) AS best_duration_ms/);
  assert.match(ui, /ScriptureMemorySettlement/);
  assert.match(settlement, /獲得.*智匯金幣/);
  assert.match(settlement, /快速 20% 進位/);
  assert.match(service, /awardScriptureMemoryProgress/);
  assert.match(service, /settleScriptureMemoryCompletion/);
  assert.match(rewards, /ON CONFLICT \(user_id, reward_date, range_key\) DO NOTHING/);
  assert.match(rewards, /WHERE user_id = \$1 AND reward_date = \$2 AND range_key = \$3[\s\S]*?FOR UPDATE/);
  assert.match(rewards, /earn_scripture_memory_correct_fragment/);
  assert.match(rewards, /earn_scripture_memory_completion_bonus/);
  assert.match(rewards, /claim\.sessionId !== sessionId/);
});

test('shared settlement and database support immediate fragment coins without a five-coin ceiling', async () => {
  const orderUi = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const rainUi = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const settlement = await read('src/features/scripture-memory/ScriptureMemorySettlement.jsx');
  const schema = await read('server/database/schemas/scripture_order_lab.js');
  const rainService = await read('server/domains/game/scripture-rain/service.js');
  const rewardService = await read('server/domains/scripture-tools/scripture-memory-reward-service.js');

  assert.match(orderUi, /ScriptureMemorySettlement/);
  assert.match(rainUi, /ScriptureMemorySettlement/);
  assert.match(settlement, /金幣計算明細/);
  assert.match(settlement, /答對片段/);
  assert.match(schema, /coins INTEGER NOT NULL CHECK \(coins >= 0\)/);
  assert.match(schema, /correct_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /completed BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(schema, /DROP CONSTRAINT IF EXISTS scripture_memory_daily_rewards_coins_check/);
  assert.match(rainService, /awardScriptureMemoryProgress/);
  assert.match(rainService, /settleScriptureMemoryCompletion/);
  assert.match(rewardService, /scripture-memory:progress:/);
  assert.match(rewardService, /scripture-memory:completion:/);
  assert.match(rewardService, /awardedNow/);
});

test('both scripture memory game HUDs show the shared live coin balance', async () => {
  const orderUi = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const rainUi = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const hud = await read('src/features/scripture-memory/ScriptureMemoryGameHud.jsx');
  const balance = await read('src/features/scripture-memory/ScriptureMemoryCoinBalance.jsx');

  assert.match(orderUi, /<ScriptureMemoryGameHud[\s\S]*?coins=\{coinSystem\.coins\}/);
  assert.match(rainUi, /<ScriptureMemoryGameHud[\s\S]*?coins=\{coinSystem\.coins\}/);
  assert.match(hud, /<ScriptureMemoryCoinBalance coins=\{coins\} variant="dark"/);
  assert.match(balance, /金幣庫存/);
  assert.match(balance, /智匯金幣庫存/);
});

test('mobile memory games keep hint controls inside the dynamic visual viewport', async () => {
  const orderUi = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const orderStyles = await read('src/features/scripture-order/ScriptureOrderGame.css');
  const rainUi = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const rainStyles = await read('src/features/scripture-rain/ScriptureRainGame.css');
  const mobileApp = await read('mobile-app/src/App.jsx');

  assert.match(orderUi, /scripture-order-root\$\{immersive \? ' is-immersive' : ''\}/);
  assert.match(orderStyles, /\.scripture-order-root\.is-immersive\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(orderStyles, /\.scripture-order-root\.is-immersive \.scripture-order-game-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(orderStyles, /padding-bottom:\s*max\(10px, env\(safe-area-inset-bottom\)\)/);
  assert.match(rainUi, /<footer className="scripture-rain__controls/);
  assert.match(rainStyles, /\.scripture-rain__stage\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1;/);
  assert.match(rainStyles, /\.scripture-rain__controls\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?safe-area-inset-bottom/);
  assert.match(mobileApp, /function FocusLayout\(\)[\s\S]*?h-\[100dvh\][^"\n]*min-h-0[^"\n]*overflow-hidden/);
});

test('mobile rain animation uses its card-width safe edge for every falling keyframe', async () => {
  const css = await read('src/features/scripture-rain/ScriptureRainGame.css');

  assert.match(css, /--rain-safe-min: var\(--rain-safe-edge\)/);
  assert.match(css, /--rain-safe-max: calc\(100% - var\(--rain-safe-edge\)\)/);
  assert.match(css, /@keyframes scripture-rain-fall[\s\S]*?clamp\(var\(--rain-safe-min\), var\(--rain-start-left\), var\(--rain-safe-max\)\)/);
  assert.match(css, /@keyframes scripture-rain-fall[\s\S]*?clamp\(var\(--rain-safe-min\), var\(--rain-end-left\), var\(--rain-safe-max\)\)/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?width: min\(160px, 52vw\)/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?overflow-wrap: anywhere/);
});

test('desktop rain cards grow by about thirty percent without changing mobile sizing', async () => {
  const css = await read('src/features/scripture-rain/ScriptureRainGame.css');

  assert.match(css, /\.scripture-rain__card\s*\{[\s\S]*?min-width:\s*clamp\(265px, 31vw, 367px\);[\s\S]*?max-width:\s*min\(585px, 39vw\);[\s\S]*?min-height:\s*125px;/);
  assert.match(css, /\.scripture-rain__card-inner\s*\{[\s\S]*?min-height:\s*125px;[\s\S]*?font-size:\s*clamp\(21px, 2\.2vw, 30px\);[\s\S]*?padding:\s*18px 26px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__card\s*\{[\s\S]*?min-width:\s*177px;[\s\S]*?max-width:\s*58vw;[\s\S]*?min-height:\s*75px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__card-inner\s*\{[\s\S]*?min-height:\s*75px;[\s\S]*?font-size:\s*18px;[\s\S]*?padding:\s*11px 16px;/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?font-size:\s*clamp\(15px, 4\.8vw, 17px\)/);
});

test('mobile rain enlarges the assembled scripture by about seventy percent', async () => {
  const css = await read('src/features/scripture-rain/ScriptureRainGame.css');

  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__assembly header\s*\{[\s\S]*?font-size:\s*17px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__assembly-title strong\s*\{\s*font-size:\s*19px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__assembly-title small\s*\{[\s\S]*?font-size:\s*15px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__assembly-text\s*\{[\s\S]*?max-height:\s*116px;[\s\S]*?font-size:\s*20px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.scripture-rain__assembled-fragment sup\s*\{[\s\S]*?font-size:\s*15px;/);
});

test('mobile order play keeps nine-grid fragments readable while compacting short screens', async () => {
  const css = await read('src/features/scripture-order/ScriptureOrderGame.css');
  const hudCss = await read('src/features/scripture-memory/ScriptureMemoryGameHud.css');

  assert.match(hudCss, /@media \(max-width: 640px\)[\s\S]*?min-height: 58px/);
  assert.match(css, /\.scripture-order-options > button > strong \{ font-size: clamp\(17px, 5vw, 20px\);/);
  assert.match(css, /\.scripture-order-options\.is-grid-9 > button > strong \{ font-size: clamp\(14px, 4vw, 16px\);/);
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 560px\)/);
  assert.match(css, /scripture-order-built[\s\S]*?max-height: 12dvh/);
  assert.match(css, /scripture-order-options > button > strong[\s\S]*?overflow-wrap: anywhere;[\s\S]*?font-size: clamp\(15px, 4\.6vw, 17px\);/);
  assert.match(css, /\.scripture-order-root\.is-immersive \.scripture-order-options\.is-grid-9 > button > strong \{ font-size: clamp\(12px, 3\.8vw, 14px\);/);
});

test('rain setup, preview and result remain independently scrollable outside active play', async () => {
  const rainUi = await read('src/features/scripture-rain/ScriptureRainGame.jsx');
  const rainStyles = await read('src/features/scripture-rain/ScriptureRainGame.css');

  assert.match(rainUi, /scripture-rain scripture-rain--setup scripture-rain--scrollable/);
  assert.equal((rainUi.match(/scripture-rain scripture-rain--scrollable/g) || []).length, 2);
  assert.match(rainStyles, /\.scripture-rain--scrollable\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(rainStyles, /\.scripture-rain--scrollable \.scripture-rain__shell\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
});

test('subtle highlight hint uses the existing idempotent coin ledger and never AI', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const api = await read('src/features/scripture-order/scriptureOrderApi.js');
  const routes = await read('server/domains/scripture-tools/order.routes.js');
  const service = await read('server/domains/scripture-tools/order-service.js');

  assert.match(ui, /高光提示/);
  assert.match(ui, /is-hinted/);
  assert.doesNotMatch(ui, /<i className="is-hint"/);
  assert.match(api, /memory-hint/);
  assert.match(routes, /router\.post\('\/sessions\/:id\/hints'/);
  assert.match(service, /applyCoinDeltaTx/);
  assert.match(service, /delta: -cost/);
  assert.match(service, /spend_scripture_order_hint/);
  assert.match(service, /type: 'hint'/);
  assert.match(service, /lastHintedFragmentIndex/);
  assert.match(service, /alreadyRevealed: true/);
  assert.match(service, /charged: false/);
  assert.match(ui, /未重複扣除金幣/);
  assert.doesNotMatch(`${ui}\n${api}\n${service}`, /LogosEngine|askBrain|Gemini/i);
});

test('scripture-order verse selection always remains one continuous range', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    verseStart: index + 1,
    verseEnd: index + 1,
    coveredVerses: [index + 1]
  }));
  let range = updateScriptureOrderRange(null, rows[4]);
  range = updateScriptureOrderRange(range, rows[9]);
  assert.deepEqual(range, { start: 5, end: 10, count: 6 });

  range = updateScriptureOrderRange(range, rows[5]);
  assert.deepEqual(range, { start: 7, end: 10, count: 4 });

  range = updateScriptureOrderRange(range, rows[11]);
  assert.deepEqual(range, { start: 7, end: 12, count: 6 });
  assert.equal(validateScriptureOrderRange(range).valid, true);
});

test('drag selection includes merged verse coverage and allows 1 to 20 verses', () => {
  const merged = { verseStart: 1, verseEnd: 2, coveredVerses: [1, 2] };
  const end = { verseStart: 6, verseEnd: 6, coveredVerses: [6] };
  assert.deepEqual(scriptureOrderRangeFromRows(merged, end), { start: 1, end: 6, count: 6 });
  assert.equal(validateScriptureOrderRange({ start: 4, end: 4 }).valid, true);
  assert.equal(validateScriptureOrderRange({ start: 1, end: 20 }).valid, true);
  assert.equal(validateScriptureOrderRange({ start: 1, end: 21 }).code, 'PASSAGE_RANGE_TOO_LONG');
});

test('scripture-order interaction remains keyboard accessible and respects reduced motion', async () => {
  const ui = await read('src/features/scripture-order/ScriptureOrderGame.jsx');
  const css = await read('src/features/scripture-order/ScriptureOrderGame.css');

  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-keyshortcuts/);
  assert.match(ui, /handleGameKeyDown/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /event\.key === 'Escape'/);
  assert.match(ui, /helpCloseButton/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('scripture-order has an independent formal production-off feature flag', async () => {
  const routes = await read('server/domains/scripture-tools/routes.js');
  const desktop = await read('src/features/game/components/GameModeSelector.jsx');
  const mobile = await read('mobile-app/src/pages/GamesPage.jsx');
  const compose = await read('../docker-compose.yml');

  assert.match(routes, /SCRIPTURE_ORDER_ENABLED === 'true'/);
  assert.match(routes, /NODE_ENV !== 'production'/);
  assert.match(routes, /router\.use\('\/order', orderLabRoutes\)/);
  assert.match(routes, /SCRIPTURE_ORDER_DISABLED/);
  assert.match(desktop, /VITE_SCRIPTURE_ORDER_ENABLED/);
  assert.match(mobile, /VITE_SCRIPTURE_ORDER_ENABLED/);
  assert.match(compose, /SCRIPTURE_ORDER_ENABLED=\$\{SCRIPTURE_ORDER_ENABLED:-false\}/);
});

test('legacy segmentation preview cache maps medium confidence into the reviewable low state', async () => {
  const review = await read('server/domains/scripture-tools/segmentation-review-service.js');
  assert.match(review, /machine\.confidence === 'HIGH' \? 'HIGH' : 'LOW'/);
});

test('segmentation cruise never treats source placeholders as scripture fragments', async () => {
  const cruise = await read('server/domains/scripture-tools/segmentation-cruise-service.js');
  assert.match(cruise, /'MERGED_WITH_PREVIOUS'/);
  assert.match(cruise, /'SOURCE_TEXT_UNAVAILABLE'/);
  assert.match(cruise, /'NON_SCRIPTURE_ARTIFACT'/);
  assert.match(cruise, /LOWER\(BTRIM\(COALESCE\(text, ''\)\)\) NOT IN \('', 'a'\)/);
});
