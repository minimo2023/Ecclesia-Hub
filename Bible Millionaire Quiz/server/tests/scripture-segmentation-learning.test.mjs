import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    buildSegmentationLearningPrompt,
    convertFlatCandidateToPerVerse,
    LOCAL_SEGMENTATION_OUTPUT_SCHEMA,
    validateSegmentationCandidate
} from '../domains/scripture-tools/segmentation-learning.js';

const examples = JSON.parse(await readFile(new URL('../data/scripture-segmentation/learning-examples.v1.json', import.meta.url), 'utf8'));
const passages = [{
    passageId: 'ps23',
    verses: [
        { verse: 1, text: '耶和華是我的牧者，我必不致缺乏。' },
        { verse: 2, text: '他使我躺臥在青草地上，領我在可安歇的水邊。' }
    ]
}];

test('learning prompt keeps rules, reviewed examples and exact source verses separate', () => {
    const prompt = buildSegmentationLearningPrompt(passages, examples);
    assert.match(prompt, /LEARNING_EXAMPLES_JSON/u);
    assert.match(prompt, /INPUT_JSON/u);
    assert.match(prompt, /如同我們免了人的債/u);
    assert.match(prompt, /耶和華是我的牧者/u);
    assert.equal(LOCAL_SEGMENTATION_OUTPUT_SCHEMA.additionalProperties, false);
});

test('candidate validator accepts exact per-verse fragments', () => {
    const candidate = {
        results: [{
            passageId: 'ps23',
            verses: [
                { verse: 1, fragments: ['耶和華是我的牧者，', '我必不致缺乏。'], uncertainBoundaries: [] },
                { verse: 2, fragments: ['他使我躺臥在', '青草地上，', '領我在可安歇的', '水邊。'], uncertainBoundaries: [] }
            ]
        }]
    };
    const result = validateSegmentationCandidate(passages, candidate, examples);
    assert.equal(result.valid, true);
    assert.equal(result.exact, true);
    assert.deepEqual(result.errors, []);
});

test('candidate validator rejects changed text, missing verses and learned bad boundaries', () => {
    const changed = validateSegmentationCandidate(passages, {
        results: [{
            passageId: 'ps23',
            verses: [{ verse: 1, fragments: ['耶和華是我的牧者', '我必不致缺乏。'], uncertainBoundaries: [] }]
        }]
    }, examples);
    assert.equal(changed.valid, false);
    assert.ok(changed.errors.some(error => error.code === 'EXACT_REASSEMBLY_FAILED'));
    assert.ok(changed.errors.some(error => error.code === 'MISSING_VERSE'));

    const prayer = [{
        passageId: 'prayer',
        verses: [{ verse: 12, text: '免我們的債，如同我們免了人的債。' }]
    }];
    const repeatedBadBoundary = validateSegmentationCandidate(prayer, {
        results: [{
            passageId: 'prayer',
            verses: [{
                verse: 12,
                fragments: ['免我們的債，', '如同我們免了', '人的債。'],
                uncertainBoundaries: []
            }]
        }]
    }, examples);
    assert.equal(repeatedBadBoundary.valid, false);
    assert.ok(repeatedBadBoundary.errors.some(error => error.code === 'REJECTED_BOUNDARY_REPEATED'));
});

test('free-key flat fragments must align exactly with verse boundaries', () => {
    const converted = convertFlatCandidateToPerVerse(passages[0], [
        '耶和華是我的牧者，', '我必不致缺乏。',
        '他使我躺臥在', '青草地上，', '領我在可安歇的', '水邊。'
    ]);
    assert.equal(converted?.verses.length, 2);
    assert.deepEqual(converted?.verses.map(verse => verse.verse), [1, 2]);

    const crossesVerseBoundary = convertFlatCandidateToPerVerse(passages[0], [
        '耶和華是我的牧者，',
        '我必不致缺乏。他使我躺臥在',
        '青草地上，領我在可安歇的水邊。'
    ]);
    assert.equal(crossesVerseBoundary, null);
});
