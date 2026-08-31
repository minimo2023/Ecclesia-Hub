import assert from 'node:assert/strict';
import test from 'node:test';
import {
    absolutizeVoiceBlessingShareAssetUrls,
    buildVoiceBlessingShareMetadata,
    injectVoiceBlessingShareMetadata
} from '../domains/scripture-tools/voice-blessing-share-metadata.js';

test('voice blessing metadata uses the blessing title and scripture reference', () => {
    const metadata = buildVoiceBlessingShareMetadata({
        card: { title: '給此刻需要平安的你', recipient: '小明' },
        recording: { reference: '詩篇 23:1-3' }
    }, 'https://xtc-biblestudy.idv.tw/b/example');

    assert.equal(metadata.title, '語音祝福－給此刻需要平安的你｜來自聖經智匯');
    assert.equal(metadata.description, '聆聽一段以詩篇 23:1-3錄製的語音經文祝福。');
    assert.doesNotMatch(metadata.description, /小明/u);
});

test('voice blessing metadata replaces generic shell metadata for link previews', () => {
    const shell = '<!doctype html><html><head><meta name="description" content="generic"><title>聖經智匯</title></head><body></body></html>';
    const metadata = buildVoiceBlessingShareMetadata({
        card: { title: '給親愛的你' },
        recording: { reference: '約翰福音 3:16' }
    }, 'https://xtc-biblestudy.idv.tw/b/example');
    const result = injectVoiceBlessingShareMetadata(shell, metadata);

    assert.match(result, /<title>語音祝福－給親愛的你｜來自聖經智匯<\/title>/u);
    assert.match(result, /property="og:title" content="語音祝福－給親愛的你｜來自聖經智匯"/u);
    assert.match(result, /property="og:site_name" content="聖經智匯"/u);
    assert.match(result, /name="twitter:title" content="語音祝福－給親愛的你｜來自聖經智匯"/u);
    assert.match(result, /rel="canonical" href="https:\/\/xtc-biblestudy\.idv\.tw\/b\/example"/u);
    assert.doesNotMatch(result, /content="generic"/u);
});

test('voice blessing metadata escapes untrusted titles and supports a safe fallback', () => {
    const unsafe = buildVoiceBlessingShareMetadata({
        card: { title: '\"><script>alert(1)</script>' },
        recording: {}
    }, 'https://xtc-biblestudy.idv.tw/b/example');
    const result = injectVoiceBlessingShareMetadata('<html><head></head><body></body></html>', unsafe);

    assert.doesNotMatch(result, /<script>alert\(1\)<\/script>/u);
    assert.match(result, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);

    const fallback = buildVoiceBlessingShareMetadata(null, 'https://xtc-biblestudy.idv.tw/b/missing');
    assert.equal(fallback.title, '語音祝福｜來自聖經智匯');
});

test('nested blessing routes load desktop and mobile assets from their app roots', () => {
    const shell = '<link href="./assets/app.css"><script src="./assets/app.js"></script>';

    assert.equal(
        absolutizeVoiceBlessingShareAssetUrls(shell),
        '<link href="/assets/app.css"><script src="/assets/app.js"></script>'
    );
    assert.equal(
        absolutizeVoiceBlessingShareAssetUrls(shell, '/m/'),
        '<link href="/m/assets/app.css"><script src="/m/assets/app.js"></script>'
    );
});
