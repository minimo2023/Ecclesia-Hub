import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_SPEECH_RATE,
    getVersePauseMs,
    listChineseSpeechVoices,
    normalizeSpeechRate,
    stripScriptureSpeechAnnotations
} from '../../src/features/scripture-reading/scriptureSpeech.js';

test('朗讀文字只移除已知譯註，不刪除一般括號內容', () => {
    const text = '耶穌（轉過身來）說：「回來。」（或譯：轉回）〔測試〕（有古卷作：歸回）';
    assert.equal(stripScriptureSpeechAnnotations(text), '耶穌（轉過身來）說：「回來。」 〔測試〕');
});

test('朗讀文字移除腳註編號與 HTML，但保留經文數字', () => {
    const text = '<span>一百二十人</span> [1.1]，又有 12 個籃子。';
    assert.equal(stripScriptureSpeechAnnotations(text), '一百二十人，又有 12 個籃子。');
});

test('語速只接受產品允許值', () => {
    assert.equal(normalizeSpeechRate(1.15), 1.15);
    assert.equal(normalizeSpeechRate('0.88'), 0.88);
    assert.equal(normalizeSpeechRate(9), DEFAULT_SPEECH_RATE);
});

test('段落停頓優先於詩行停頓', () => {
    assert.equal(getVersePauseMs({ paragraphBreakAfter: true, lineBreakAfter: true }), 620);
    assert.equal(getVersePauseMs({ lineBreakAfter: true }), 260);
    assert.equal(getVersePauseMs({}), 80);
});

test('中文語音以台灣語音優先，排除非中文語音', () => {
    const voices = listChineseSpeechVoices([
        { name: 'English', lang: 'en-US', voiceURI: 'en' },
        { name: '中國語音', lang: 'zh-CN', voiceURI: 'cn' },
        { name: '台灣語音', lang: 'zh-TW', voiceURI: 'tw' }
    ]);
    assert.deepEqual(voices.map(voice => voice.voiceURI), ['tw', 'cn']);
});
