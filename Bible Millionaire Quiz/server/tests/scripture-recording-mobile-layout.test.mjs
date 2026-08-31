import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sharePageSource = readFileSync(
    new URL('../../src/features/scripture-recording/VoiceBlessingSharePage.jsx', import.meta.url),
    'utf8'
);
const wizardSource = readFileSync(
    new URL('../../src/features/scripture-recording/VoiceBlessingWizardDialog.jsx', import.meta.url),
    'utf8'
);
const desktopAppSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const mobileAppSource = readFileSync(new URL('../../mobile-app/src/App.jsx', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('voice blessing share page owns a touch scroll viewport inside the mobile app shell', () => {
    assert.match(sharePageSource, /h-\[100dvh\][^"\n]*overflow-y-auto/);
    assert.match(sharePageSource, /WebkitOverflowScrolling:\s*'touch'/);
    assert.doesNotMatch(sharePageSource, /min-h-\[100dvh\][^"\n]*bg-slate-50/);
});

test('voice blessing share page uses the main Ecclesia Hub brand and document title', () => {
    assert.match(sharePageSource, /語音祝福－\$\{cardTitle\}｜來自聖經智匯/);
    assert.match(sharePageSource, /語音祝福｜來自聖經智匯/);
    assert.match(sharePageSource, />聖經智匯<small/);
    assert.match(sharePageSource, />Biblical Intelligence<\/small>/);
    assert.match(sharePageSource, /<ShieldCheck[^>]*\/>語音經文祝福/);
});

test('voice blessing player pauses on background and shows live current and total time', () => {
    assert.match(sharePageSource, /document\.addEventListener\('visibilitychange', pauseWhenHidden\)/);
    assert.match(sharePageSource, /document\.addEventListener\('freeze', pausePlayback\)/);
    assert.match(sharePageSource, /document\.addEventListener\('pause', pausePlayback\)/);
    assert.match(sharePageSource, /window\.addEventListener\('blur', pausePlayback\)/);
    assert.match(sharePageSource, /window\.addEventListener\('pagehide', pausePlayback\)/);
    assert.match(sharePageSource, /window\.removeEventListener\('pagehide', pausePlayback\);\s*pausePlayback\(\)/);
    assert.match(sharePageSource, /requestAnimationFrame\(updateProgress\)/);
    assert.match(sharePageSource, /durationMs=\{recording\.durationMs\}/);
    assert.match(sharePageSource, /formatPlaybackTime\(currentTime\)/);
    assert.match(sharePageSource, /formatPlaybackTime\(duration\)/);
});

test('short blessing routes work while legacy links remain accepted', () => {
    assert.match(desktopAppSource, /\(\?:b\|blessing\)/);
    assert.match(mobileAppSource, /path="\/b\/:token"/);
    assert.match(mobileAppSource, /path="\/blessing\/:token"/);
    assert.match(serverSource, /\(\?:b\|blessing\)/);
    assert.match(serverSource, /'\/b\/:token'/);
    assert.match(serverSource, /'\/m\/b\/:token'/);
    assert.match(serverSource, /serveVoiceBlessingShareShell/);
});

test('voice blessing wizard keeps header and actions visible while its content scrolls', () => {
    assert.match(wizardSource, /max-h-\[76dvh\][^"\n]*min-h-0/);
    assert.match(wizardSource, /min-h-0 flex-1 grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
    assert.match(wizardSource, /touch-pan-y overflow-y-auto overscroll-y-contain/);
    assert.match(wizardSource, /<footer className="[^"]*shrink-0/);
    assert.match(wizardSource, /safe-area-inset-bottom/);
});

test('voice blessing wizard preserves an unfinished recording when the page is backgrounded', () => {
    assert.match(wizardSource, /loadVoiceBlessingDraft/);
    assert.match(wizardSource, /updateVoiceBlessingDraft/);
    assert.match(wizardSource, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
    assert.match(wizardSource, /window\.addEventListener\('pagehide', preserveBeforeBackground\)/);
    assert.match(wizardSource, /切換分頁前已自動結束並保留目前錄音/);
});
