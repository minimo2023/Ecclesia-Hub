import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const authModal = read('../../src/features/auth/AuthModal.jsx');
const gameOver = read('../../src/features/game/components/GameOverScreen.jsx');
const speedResults = read('../../src/features/game/components/SpeedResultsScreen.jsx');
const readingCatalog = read('../../src/features/reading-plans/ReadingPlansCatalog.jsx');
const readingPlan = read('../../src/features/reading-plans/MyReadingPlan.jsx');
const readingWizard = read('../../src/features/reading-plans/hooks/useReadingPlanWizard.js');
const mobileStart = read('../../src/features/game/components/mobile/MobileStartScreen.jsx');
const mobileBookSelector = read('../../src/features/game/components/mobile/MobileBookSelector.jsx');
const voiceBlessings = read('../../src/features/scripture-recording/MyVoiceBlessings.jsx');
const profile = read('../../mobile-app/src/pages/ProfilePage.jsx');
const diary = read('../../mobile-app/src/pages/member/DiaryHistoryPage.jsx');
const stats = read('../../mobile-app/src/pages/member/StatsPage.jsx');
const history = read('../../mobile-app/src/pages/member/HistoryPage.jsx');

test('secondary mobile pages use the shared page and topbar language', () => {
    for (const page of [diary, stats, history]) assert.match(page, /app-page/);
    for (const page of [diary, stats, history]) assert.match(page, /app-topbar/);
    assert.match(readingCatalog, /bg-slate-50/);
    assert.match(readingPlan, /bg-slate-50/);
    assert.doesNotMatch(readingCatalog, /bg-\[#F8FAFC\]/);
    assert.doesNotMatch(readingPlan, /bg-\[#F8FAFC\]/);
});

test('authentication and progress copy use consistent Traditional Chinese', () => {
    assert.match(authModal, /帳號名稱/);
    assert.match(authModal, /驗證身分/);
    assert.doesNotMatch(authModal, /用戶名|驗證身份|\.\.\./);
    assert.match(readingPlan, /第 \{planData\?\.currentDay\} 天／共/);
    assert.doesNotMatch(readingPlan, /接下來\.\.\.|取消中\.\.\.|處理中\.\.\./);
    assert.match(readingWizard, /暫時無法預覽排程，請稍後再試。/);
});

test('supporting messages avoid technical or misleading language', () => {
    assert.doesNotMatch(history, /智能錯題系統開發中|即將推出的功能/);
    assert.match(history, /錯題回顧功能準備中/);
    assert.doesNotMatch(diary, /未知的錯誤|刪除發生錯誤/);
    assert.doesNotMatch(gameOver, /Speed Round Complete|警告：訪客資料/);
    assert.doesNotMatch(speedResults, /Speed Round Complete/);
    assert.doesNotMatch(mobileStart, /請至少選擇.+！/);
    assert.match(mobileBookSelector, /全選／取消/);
    assert.doesNotMatch(mobileBookSelector, /全選\/取消/);
    assert.doesNotMatch(voiceBlessings, /(?:loadError|playError|revokeError|deleteError)\.message/);
    assert.match(profile, /密碼使用天數/);
    assert.match(profile, /暱稱修改間隔/);
    assert.match(stats, /replace\(\/\\s\*\\\(\(\[\^\)\]\+\)\\\)\/g, '（\$1）'\)/);
});
