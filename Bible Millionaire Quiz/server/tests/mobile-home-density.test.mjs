import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const homePage = read('../../mobile-app/src/pages/HomePage.jsx');
const profilePage = read('../../mobile-app/src/pages/ProfilePage.jsx');

test('mobile home header keeps only the compact brand and asset balance', () => {
    assert.match(homePage, />聖經智匯<\/span>/);
    assert.match(homePage, /aria-label=\{`金幣 \$\{coins\}，點數 \$\{aiCredits\}`\}/);
    assert.doesNotMatch(homePage, /查看通知|<Bell|showAuthModal|AuthModal/);
});

test('mobile home keeps devotion navigation while removing the large call-to-action', () => {
    assert.match(homePage, /onClick=\{\(\) => navigate\('\/devotion'\)\}/);
    assert.match(homePage, /min-h-\[230px\]/);
    assert.doesNotMatch(homePage, /查看今日靈修/);
});

test('guest authentication remains available from the member page', () => {
    assert.match(profilePage, /登入帳號/);
    assert.match(profilePage, /註冊新帳號/);
    assert.match(profilePage, /openAuth\('login'\)/);
    assert.match(profilePage, /openAuth\('register'\)/);
});
