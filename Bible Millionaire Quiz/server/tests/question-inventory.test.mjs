import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getDifficultyTargets,
    getStoredDifficultyBand,
    getStoredDifficultyScore,
    getStoredDifficultySource
} from '../domains/game/difficulty/DifficultyScorer.js';
import {
    buildInventorySnapshot,
    questionInventoryService
} from '../domains/game/replenishment/QuestionInventoryService.js';
import { generateBatch } from '../domains/game/engine/QuestionCore.js';
import LogosEngine from '../infrastructure/ai/LogosEngine.js';
import { isProductionTestQuestion } from '../database/games.js';

test('production test artifacts are never accepted as playable inventory', () => {
    assert.equal(isProductionTestQuestion({ id: 'test_lite_123', question: '普通題目' }), true);
    assert.equal(isProductionTestQuestion({ id: 'live_123', question: '【JIT 測試】起初發生了什麼？' }), true);
    assert.equal(isProductionTestQuestion({ id: 'live_456', question: '起初，神創造了什麼？' }), false);
});

test('difficulty contract reads PostgreSQL camelCase fields before legacy fallback', () => {
    const question = {
        difficulty: 'MEDIUM',
        finalDifficultyScore: 82,
        ruleDifficultyScore: 40,
        difficultyBand: 'MEDIUM'
    };

    assert.equal(getStoredDifficultyScore(question), 82);
    assert.equal(getStoredDifficultySource(question), 'final');
    assert.equal(getStoredDifficultyBand(question), 'HARD');
});

test('difficulty contract remains compatible with generation-pipeline snake_case fields', () => {
    const question = {
        difficulty: 'EASY',
        final_difficulty_score: 91,
        rule_difficulty_score: 20
    };

    assert.equal(getStoredDifficultyScore(question), 91);
    assert.equal(getStoredDifficultySource(question), 'final');
    assert.equal(getStoredDifficultyBand(question), 'VERY_HARD');
});

test('difficulty targets always add up to the requested hand size', () => {
    for (let count = 1; count <= 200; count++) {
        const targets = getDifficultyTargets(count);
        assert.equal(Object.values(targets).reduce((sum, value) => sum + value, 0), count);
    }

    assert.deepEqual(getDifficultyTargets(15), {
        EASY: 5,
        MEDIUM: 5,
        HARD: 3,
        VERY_HARD: 2
    });
});

test('inventory is ready only when playable stock can fill the difficulty profile', () => {
    const ready = buildInventorySnapshot([
        { category: 'verse_fill', difficultyBand: 'EASY', questionCount: 5, chapter: 1 },
        { category: 'verse_fact', difficultyBand: 'MEDIUM', questionCount: 5, chapter: 1 },
        { category: 'theology', difficultyBand: 'HARD', questionCount: 3, chapter: 2 },
        { category: 'lexicon', difficultyBand: 'VERY_HARD', questionCount: 2, chapter: 2 }
    ], { book: '創世記', version: 'CUV_TRAD', targetCount: 15 });

    assert.equal(ready.total, 15);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.shortageTotal, 0);
    assert.equal(ready.priorityGap, null);
});

test('raw quantity does not hide an unusable difficulty mix', () => {
    const mediumOnly = buildInventorySnapshot([
        { category: 'verse_fact', difficulty_band: 'MEDIUM', question_count: 15, chapter: 1 }
    ], { book: '創世記', version: 'CUV_TRAD', targetCount: 15 });

    assert.equal(mediumOnly.total, 15);
    assert.equal(mediumOnly.status, 'degraded');
    assert.deepEqual(mediumOnly.shortages, {
        EASY: 5,
        MEDIUM: 0,
        HARD: 3,
        VERY_HARD: 2
    });
    assert.equal(mediumOnly.priorityGap.band, 'EASY');
    assert.equal(mediumOnly.priorityGap.category, 'verse_fill');
});

test('replenishment gap is forwarded to the generation prompt', async () => {
    const originalAskBrain = LogosEngine.askBrain;
    let capturedPayload = null;

    LogosEngine.askBrain = async (_task, payload) => {
        capturedPayload = payload;
        return {
            questions: [{
                segment_id: 1,
                status: 'success',
                verseRef: '約翰福音 3:16-18',
                question: '測試用題目內容足夠長嗎？',
                answer: '是',
                category: 'lexicon',
                difficulty: 'VERY_HARD',
                chapter: 1,
                verse_start: 1,
                verse_end: 1,
                verse_ref: '創世記 1:1'
            }]
        };
    };

    try {
        const generated = await generateBatch({
            book: '創世記',
            segments: [{
                id: 1,
                chapter: 3,
                verseRange: { start: 16, end: 18 },
                ref: '約翰福音 3:16-18',
                context: '神愛世人，甚至將他的獨生子賜給他們；信他的人不被定罪，不信的人罪已經定了。'
            }],
            book: '約翰福音',
            count: 1,
            mode: 'patrol',
            options: {
                categoryQuota: '1x lexicon',
                target_category: 'lexicon',
                target_difficulty_band: 'VERY_HARD',
                target_score_range: '86-100',
                preferred_verse_window: '1-5',
                avoid_verse_windows: '6-10'
            }
        }, { corpusGuard: async () => ({ newQuestionEligible: true }) });

        assert.equal(generated.length, 1);
        assert.equal(capturedPayload.target_category, 'lexicon');
        assert.equal(capturedPayload.target_difficulty_band, 'VERY_HARD');
        assert.equal(capturedPayload.target_score_range, '86-100');
        assert.equal(capturedPayload.preferred_verse_window, '1-5');
        assert.equal(capturedPayload.avoid_verse_windows, '6-10');
    } finally {
        LogosEngine.askBrain = originalAskBrain;
    }
});

test('game shortages are queued for patrol and cleared when inventory recovers', () => {
    const book = '測試書卷';
    questionInventoryService.recordDemand({
        book,
        startChapter: 1,
        endChapter: 3,
        version: 'CUV_TRAD',
        required: 15,
        available: 4,
        mode: 'classic'
    });

    const queued = questionInventoryService.getPendingDemandSignals()
        .find(signal => signal.book === book);
    assert.equal(queued.missing, 11);
    assert.equal(queued.mode, 'classic');

    questionInventoryService.resolveDemand({ book, version: 'CUV_TRAD' });
    assert.equal(
        questionInventoryService.getPendingDemandSignals().some(signal => signal.book === book),
        false
    );
});
