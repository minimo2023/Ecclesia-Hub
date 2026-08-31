import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const styles = read('../../mobile-app/src/index.css');
const pageHeader = read('../../mobile-app/src/components/layout/PageHeader.jsx');
const homePage = read('../../mobile-app/src/pages/HomePage.jsx');
const gamesPage = read('../../mobile-app/src/pages/GamesPage.jsx');
const biblePage = read('../../mobile-app/src/pages/BiblePage.jsx');
const profilePage = read('../../mobile-app/src/pages/ProfilePage.jsx');
const devotionArticle = read('../../mobile-app/src/components/devotion/DevotionArticle.jsx');
const historyPage = read('../../mobile-app/src/pages/member/HistoryPage.jsx');
const avatarSelector = read('../../mobile-app/src/components/profile/AvatarSelectorModal.jsx');
const devotionCard = read('../../src/features/devotion/components/DevotionCard.jsx');

test('mobile pages share the same visual foundation', () => {
    for (const className of ['app-page', 'app-topbar', 'app-card', 'app-supporting', 'app-segmented']) {
        assert.match(styles, new RegExp(`\\.${className}\\b`));
    }

    assert.match(pageHeader, /app-topbar/);
    for (const page of [homePage, gamesPage, biblePage, profilePage]) {
        assert.match(page, /app-page/);
    }
});

test('member tabs use one active visual language', () => {
    assert.match(profilePage, /bg-indigo-600 text-white shadow-sm/);
    assert.doesNotMatch(profilePage, /bg-amber-500 text-white/);
    assert.doesNotMatch(profilePage, /bg-emerald-600 text-white/);
    assert.doesNotMatch(profilePage, /bg-purple-600 text-white/);
    assert.doesNotMatch(profilePage, /bg-rose-600 text-white/);
});

test('supporting copy stays clear and does not expose technical errors', () => {
    assert.doesNotMatch(gamesPage, /！/);
    assert.doesNotMatch(devotionArticle, /err\.message/);
    assert.match(devotionArticle, /暫時無法載入靈修內容，請稍後再試。/);
    assert.doesNotMatch(historyPage, /✅/);
    assert.match(historyPage, /錯題本與學習分析功能正在準備中。/);
    assert.doesNotMatch(avatarSelector, /err\.message/);
    assert.match(homePage, /每日節奏/);
    assert.match(devotionCard, /今日經文/);
    assert.match(devotionCard, /今日提醒/);
    assert.doesNotMatch(devotionCard, /TODAY'S SCRIPTURE|Closing Thought/);
});
