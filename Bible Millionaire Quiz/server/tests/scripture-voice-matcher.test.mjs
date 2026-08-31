import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeScriptureVoiceText,
    rankScriptureVoiceOptions
} from '../../src/features/scripture-memory/scriptureVoiceMatcher.js';
import { collectScriptureVoiceCandidates } from '../../src/features/scripture-memory/useScriptureVoiceInput.js';

const option = (text, token) => ({ text, token });

test('voice normalization removes display punctuation, spaces and spoken answer prefixes', () => {
    assert.equal(normalizeScriptureVoiceText('答案是：耶和華是 我的牧者。'), '耶和华是我的牧者');
});

test('voice matcher selects an exact visible scripture option', () => {
    const result = rankScriptureVoiceOptions(
        ['耶和華是我的牧者'],
        [option('我必不致缺乏，', 'a'), option('耶和華是我的牧者。', 'b')]
    );
    assert.equal(result.matched, true);
    assert.equal(result.option.token, 'b');
});

test('voice matcher accepts traditional and simplified transcripts', () => {
    const result = rankScriptureVoiceOptions(
        ['耶和华是我的牧者'],
        [option('耶和華是我的牧者，', 'a'), option('我必不致缺乏。', 'b')]
    );
    assert.equal(result.matched, true);
    assert.equal(result.option.token, 'a');
});

test('voice matcher tolerates a clear homophone when no visible option competes', () => {
    const result = rankScriptureVoiceOptions(
        ['自會'],
        [option('智慧', 'a'), option('公義', 'b'), option('恩典', 'c')]
    );
    assert.equal(result.matched, true);
    assert.equal(result.option.token, 'a');
});

test('literal exact text wins over another option with the same pronunciation', () => {
    const result = rankScriptureVoiceOptions(
        ['智慧'],
        [option('智慧', 'a'), option('自會', 'b')]
    );
    assert.equal(result.matched, true);
    assert.equal(result.option.token, 'a');
});

test('voice matcher refuses different visible options with an unresolved phonetic tie', () => {
    const result = rankScriptureVoiceOptions(
        ['至會'],
        [option('智慧', 'a'), option('自會', 'b')]
    );
    assert.equal(result.matched, false);
    assert.equal(result.ambiguous, true);
});

test('voice matcher groups identical visible text and keeps the first live card', () => {
    const result = rankScriptureVoiceOptions(
        ['阿們'],
        [
            { text: '阿們。', rainInstanceId: 'first' },
            { text: '阿們！', rainInstanceId: 'second' }
        ]
    );
    assert.equal(result.matched, true);
    assert.equal(result.option.rainInstanceId, 'first');
});

test('voice matcher does not select a low confidence partial phrase', () => {
    const result = rankScriptureVoiceOptions(
        ['耶和華'],
        [option('耶和華是我的牧者', 'a'), option('我必不致缺乏', 'b')]
    );
    assert.equal(result.matched, false);
    assert.equal(result.reason, 'low-score');
});

function speechResult(transcripts, isFinal) {
    const result = transcripts.map(transcript => ({ transcript }));
    result.isFinal = isFinal;
    return result;
}

test('voice recognition ignores finalized phrases from earlier events', () => {
    const result = collectScriptureVoiceCandidates({
        resultIndex: 1,
        results: [
            speechResult(['愛是恆久忍耐'], true),
            speechResult(['又有恩慈', '有恩慈'], true)
        ]
    });
    assert.equal(result.display, '又有恩慈');
    assert.deepEqual(result.candidates, ['又有恩慈', '有恩慈']);
});

test('voice recognition never appends an unfinished phrase to a final answer', () => {
    const result = collectScriptureVoiceCandidates({
        resultIndex: 0,
        results: [
            speechResult(['不自誇'], true),
            speechResult(['不張'], false)
        ]
    });
    assert.equal(result.display, '不自誇 不張');
    assert.deepEqual(result.candidates, ['不自誇']);
});
