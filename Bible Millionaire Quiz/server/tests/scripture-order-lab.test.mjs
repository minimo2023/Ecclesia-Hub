import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    SEED_PASSAGES,
    auditOrderPassage,
    buildStepOptions,
    rotateWrongOption,
    scoreCorrect,
    splitExactText,
    stripEditorialAnnotations,
    stripOrderGameSymbols,
    timerSeconds,
    validateCustomRange,
    verifyFragments
} from '../domains/scripture-tools/order-engine.js';

test('order lab defines 20 distinct CUV seed passages including the Lord Prayer', () => {
    assert.equal(SEED_PASSAGES.length, 20);
    assert.equal(new Set(SEED_PASSAGES.map(passage => passage.id)).size, 20);
    assert.ok(SEED_PASSAGES.some(passage => passage.title === '主禱文'
        && passage.book === 'Matthew' && passage.chapter === 6
        && passage.verseStart === 9 && passage.verseEnd === 13));
});

test('punctuation-aware fragments reassemble the source text exactly', () => {
    const source = '所以，你們禱告要這樣說：我們在天上的父：願人都尊你的名為聖。願你的國降臨；願你的旨意行在地上，如同行在天上。';
    for (const difficulty of ['INTRO', 'STANDARD', 'CHALLENGE', 'LONG']) {
        const fragments = splitExactText(source, { difficulty });
        assert.equal(verifyFragments(source, fragments), true);
        assert.equal(fragments.map(fragment => fragment.text).join(''), source);
    }
});

test('a short single verse may pass exact reassembly before playability is checked separately', () => {
    const source = '起初，神創造天地。';
    assert.equal(verifyFragments(source, [{ id: 'f1', text: source }]), true);
    assert.equal(verifyFragments(source, []), false);
});

test('editorial parenthetical notes are removed without changing the stored Bible source', () => {
    const source = '救我們脫離兇惡（或譯：脫離惡者）。因為國度、權柄、榮耀，全是你的。';
    const playable = stripEditorialAnnotations(source);
    assert.equal(playable, '救我們脫離兇惡。因為國度、權柄、榮耀，全是你的。');
    assert.equal(source.includes('或譯'), true);
    assert.equal(/[（）()]/u.test(playable), false);
});

test('game display removes punctuation while the audited fragments retain the formal text', () => {
    const source = '「你不要害怕！」因為我與你同在；';
    const fragments = splitExactText(source, { difficulty: 'INTRO' });
    assert.equal(verifyFragments(source, fragments), true);
    assert.equal(stripOrderGameSymbols(source), '你不要害怕因為我與你同在');
    assert.equal(fragments.map(fragment => fragment.text).join(''), source);
});

test('step options contain exactly one correct fragment and shrink naturally', () => {
    const fragments = Array.from({ length: 6 }, (_, index) => ({ id: `f${index}`, text: `片段${index}` }));
    const ids = function* () { let value = 0; while (true) yield `token-${value++}`; }();
    const tokenFactory = () => ids.next().value;
    const fixedRandom = () => 0.42;
    for (const [index, expectedLength] of [[0, 4], [3, 3], [4, 2], [5, 1]]) {
        const options = buildStepOptions(fragments, index, tokenFactory, fixedRandom);
        assert.equal(options.length, expectedLength);
        assert.equal(options.filter(option => option.isCorrect).length, 1);
        assert.equal(options.find(option => option.isCorrect).fragmentId, fragments[index].id);
        assert.ok(options.every(option => fragments.slice(index).some(fragment => fragment.id === option.fragmentId)));
        assert.ok(options.every(option => Number.isInteger(option.slot) && option.slot >= 0 && option.slot < 4));
        assert.equal(new Set(options.map(option => option.slot)).size, options.length);
    }
});

test('the correct fragment never repeats the previous correct slot', () => {
    const fragments = Array.from({ length: 6 }, (_, index) => ({ id: `f${index}`, text: `片段${index}` }));
    for (const previousSlot of [0, 1, 2, 3]) {
        const options = buildStepOptions(fragments, 1, () => crypto.randomUUID(), () => 0.42, previousSlot);
        assert.notEqual(options.find(option => option.isCorrect).slot, previousSlot);

        const finalOption = buildStepOptions(fragments, 5, () => crypto.randomUUID(), () => 0.42, previousSlot);
        assert.equal(finalOption.length, 1);
        assert.notEqual(finalOption[0].slot, previousSlot);
    }
});

test('a full passage keeps one answer, unique slots, opaque public fields, and no adjacent answer slot', async () => {
    const { publicOptions } = await import('../domains/scripture-tools/order-engine.js');
    const fragments = Array.from({ length: 12 }, (_, index) => ({ id: `f${index}`, text: `片段${index}` }));
    let previousSlot = null;
    for (let index = 0; index < fragments.length; index += 1) {
        let token = 0;
        const options = buildStepOptions(fragments, index, () => `step-${index}-${token++}`, () => 0.37, previousSlot);
        const correct = options.find(option => option.isCorrect);
        assert.ok(correct);
        assert.notEqual(correct.slot, previousSlot);
        assert.equal(new Set(options.map(option => option.slot)).size, options.length);
        const exposed = publicOptions(options);
        assert.equal(exposed.some(option => Object.hasOwn(option, 'isCorrect')), false);
        assert.equal(exposed.some(option => Object.hasOwn(option, 'fragmentId')), false);
        previousSlot = correct.slot;
    }
});

test('deterministic passage audit quarantines broken reconstruction', () => {
    const result = auditOrderPassage({
        sourceText: '耶和華是我的牧者。',
        fragments: [{ id: 'f1', text: '耶和華是' }, { id: 'f2', text: '牧者。' }]
    });
    assert.equal(result.readiness, 'QUARANTINED');
    assert.ok(result.errors.includes('EXACT_REASSEMBLY_FAILED'));
});

test('deterministic passage audit separates soft boundary warnings', () => {
    const chunks = ['一二三', '四五六', '七八九', '十甲乙', '丙丁戊', '己庚辛', '壬癸子', '丑寅卯。'];
    const sourceText = chunks.join('');
    const fragments = chunks.map((text, index) => ({ id: `f${index + 1}`, text }));
    const result = auditOrderPassage({ sourceText, fragments, difficulty: 'INTRO' });
    assert.equal(result.exactReassembly, true);
    assert.notEqual(result.readiness, 'QUARANTINED');
    assert.ok(result.warnings.includes('LOW_NATURAL_BOUNDARY_RATIO'));
});

test('practice wrong option is replaced in place and rejected fragments do not return', () => {
    const fragments = Array.from({ length: 7 }, (_, index) => ({
        id: `f${index}`,
        publicKey: `key-${index}`,
        text: `片段${index}`
    }));
    const options = [0, 1, 2, 3].map(index => ({
        token: `token-${index}`,
        fragmentId: `f${index}`,
        key: `key-${index}`,
        slot: index,
        text: `片段${index}`,
        isCorrect: index === 0
    }));
    const rotated = rotateWrongOption({
        fragments,
        currentIndex: 0,
        options,
        wrongToken: 'token-1',
        rejectedFragmentIds: ['f1'],
        tokenFactory: () => 'replacement-token',
        random: () => 0
    });
    assert.equal(rotated.length, 4);
    assert.equal(rotated[0].fragmentId, 'f0');
    assert.equal(rotated[1].token, 'replacement-token');
    assert.equal(rotated[1].slot, 1);
    assert.notEqual(rotated[1].fragmentId, 'f1');
    assert.deepEqual(rotated.slice(2).map(option => option.fragmentId), ['f2', 'f3']);

    const noReplacement = rotateWrongOption({
        fragments: fragments.slice(0, 4),
        currentIndex: 0,
        options,
        wrongToken: 'token-1',
        rejectedFragmentIds: ['f1']
    });
    assert.deepEqual(noReplacement.map(option => option.fragmentId), ['f0', 'f2', 'f3']);
});

test('custom passage accepts only a same-chapter 5 to 20 verse range', () => {
    assert.equal(validateCustomRange({ chapter: 6, verseStart: 9, verseEnd: 13 }).valid, true);
    assert.equal(validateCustomRange({ chapter: 6, verseStart: 9, verseEnd: 12 }).code, 'PASSAGE_RANGE_5_TO_20_REQUIRED');
    assert.equal(validateCustomRange({ chapter: 6, verseStart: 1, verseEnd: 21 }).code, 'PASSAGE_RANGE_5_TO_20_REQUIRED');
    assert.equal(validateCustomRange({ chapter: 0, verseStart: 1, verseEnd: 5 }).code, 'INVALID_PASSAGE_RANGE');
    assert.equal(validateCustomRange(
        { chapter: 23, verseStart: 1, verseEnd: 1 },
        { min: 1, max: 20 }
    ).valid, true);
});

test('scoring raises the next multiplier every third consecutive correct answer', () => {
    let state = { score: 0, streak: 0, multiplier: 1 };
    state = scoreCorrect(state);
    assert.deepEqual(state, { score: 100, points: 100, streak: 1, multiplier: 1 });
    state = scoreCorrect(state);
    state = scoreCorrect(state);
    assert.equal(state.score, 300);
    assert.equal(state.multiplier, 2);
    state = scoreCorrect(state);
    assert.equal(state.points, 200);
    assert.equal(state.score, 500);
});

test('timers follow intro, standard and challenge formulas', () => {
    assert.equal(timerSeconds('INTRO', 10), 90);
    assert.equal(timerSeconds('STANDARD', 10), 70);
    assert.equal(timerSeconds('CHALLENGE', 10), 50);
});

test('lab storage stays isolated while the optional hint uses the formal coin ledger', async () => {
    const schema = await readFile(new URL('../database/schemas/scripture_order_lab.js', import.meta.url), 'utf8');
    const service = await readFile(new URL('../domains/scripture-tools/order-service.js', import.meta.url), 'utf8');
    assert.match(schema, /scripture_order_lab_sessions/);
    assert.match(schema, /UNIQUE\(session_id, idempotency_key\)/);
    assert.match(service, /FOR UPDATE/);
    assert.doesNotMatch(schema, /asset_ledger|coin_ledger/i);
    assert.match(service, /applyCoinDeltaTx/);
    assert.match(service, /spend_scripture_order_hint/);
});

test('official common passages always replace legacy fragments with the healthy library', async () => {
    const service = await readFile(new URL('../domains/scripture-tools/order-service.js', import.meta.url), 'utf8');
    assert.match(service, /officialSegmentationChanged/);
    assert.match(service, /WHEN EXCLUDED\.is_official = FALSE\s+AND scripture_order_lab_passages\.source_hash/u);
    assert.match(service, /useHealthyLibrary \? 'healthy_per_verse_library'/u);
});
