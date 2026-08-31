import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_GEMINI_MODEL,
    RECOMMENDED_GEMINI_MODELS,
    filterAllowedGeminiModels,
    isAllowedGeminiModel,
    isGeneralPurposeFlashModel,
    resolveGeminiModel
} from '../infrastructure/ai/model-policy.js';

const POLICY_DATE = { asOf: '2026-07-03' };

test('預設使用目前穩定的 Gemini 3.5 Flash', () => {
    assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.5-flash');
    assert.deepEqual(RECOMMENDED_GEMINI_MODELS, [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
    ]);
});

test('不設版本上限，但只接受通用 Flash 與 Flash-Lite', () => {
    for (const modelName of [
        'gemini-3.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite',
        'gemini-4-flash',
        'gemini-4.2-flash-lite-preview'
    ]) {
        assert.equal(isGeneralPurposeFlashModel(modelName), true, modelName);
        assert.equal(isAllowedGeminiModel(modelName, POLICY_DATE), true, modelName);
        assert.equal(resolveGeminiModel(modelName, POLICY_DATE), modelName);
    }
});

test('拒絕 Pro 與用途不相容的 Flash 衍生模型', () => {
    for (const modelName of [
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-live-preview',
        'gemini-3.1-flash-tts-preview',
        'gemini-3.1-flash-image',
        'gemini-2.5-flash-native-audio-preview-12-2025',
        'gemini-9-ultra',
        '',
        undefined
    ]) {
        assert.equal(isAllowedGeminiModel(modelName, POLICY_DATE), false, modelName);
        assert.equal(resolveGeminiModel(modelName, POLICY_DATE), DEFAULT_GEMINI_MODEL);
    }
});

test('依官方停用日期自動拒絕舊 Flash，不提前封鎖仍可用模型', () => {
    assert.equal(
        isAllowedGeminiModel('gemini-2.0-flash', POLICY_DATE),
        false
    );
    assert.equal(
        isAllowedGeminiModel('gemini-2.5-flash', { asOf: '2026-10-15' }),
        true
    );
    assert.equal(
        isAllowedGeminiModel('gemini-2.5-flash', { asOf: '2026-10-16' }),
        false
    );
    assert.equal(
        isAllowedGeminiModel('gemini-3.1-flash-lite-preview', POLICY_DATE),
        false
    );
});

test('模型清單會正規化、去重並排除不合政策者', () => {
    assert.deepEqual(
        filterAllowedGeminiModels([
            'gemini-2.5-pro',
            ' GEMINI-3.5-FLASH ',
            'gemini-3.1-flash-lite',
            'gemini-3.5-flash',
            'gemini-2.0-flash'
        ], POLICY_DATE),
        ['gemini-3.5-flash', 'gemini-3.1-flash-lite']
    );
});
