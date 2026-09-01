import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH,
    SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION,
    approvedMemorySegmentations,
    gridAvailability,
    mergePassageSegmentations,
    normalizeScriptureForGame,
    protectedCoreTerms,
    segmentScriptureVerse,
    validateHealthySegmentation
} from '../domains/scripture-tools/healthy-segmentation-engine.js';
import { buildStepOptions, publicOptions } from '../domains/scripture-tools/order-engine.js';

test('marked translation notes are removed while parenthetical Scripture remains', () => {
    assert.equal(
        normalizeScriptureForGame('你們禱告要這樣說（或作：所以你們禱告要這樣說）：天父。').displayText,
        '你們禱告要這樣說：天父。'
    );
    assert.equal(
        normalizeScriptureForGame('我對其餘的人說（不是主說）：倘若某弟兄有妻子。').displayText,
        '我對其餘的人說（不是主說）：倘若某弟兄有妻子。'
    );
    assert.equal(
        normalizeScriptureForGame('生命已經顯現出來（我們也看見過，現在又作見證）。').displayText,
        '生命已經顯現出來（我們也看見過，現在又作見證）。'
    );
    assert.equal(
        normalizeScriptureForGame('三十軍官（「軍官」或譯：「三十（勇士）」）的首領。', { version: 'CNV_TRAD' }).displayText,
        '三十軍官的首領。'
    );
    assert.equal(
        normalizeScriptureForGame('作居住的城市（按照《馬索拉文本》，現參照《七十士譯本》翻譯。)', { version: 'CNV_TRAD' }).displayText,
        '作居住的城市'
    );
});

test('leading Psalm superscriptions are excluded only from game text', () => {
    const source = '（大衛與拔示巴同室以後，先知拿單來見他；他作這詩，交與伶長。）神啊，求你按你的慈愛憐恤我！';
    const normalized = normalizeScriptureForGame(source);
    assert.equal(normalized.displayText, '神啊，求你按你的慈愛憐恤我！');
    assert.equal(normalized.superscriptionRemoved, true);
    assert.equal(normalizeScriptureForGame('眾人說（這是大衛的詩）也未可知。').displayText, '眾人說（這是大衛的詩）也未可知。');
    assert.equal(normalizeScriptureForGame('（大衛的詩）。我要歌唱慈愛和公平。').displayText, '我要歌唱慈愛和公平。');
});

test('an editorial-note-only verse is a valid omitted game entry instead of an empty option', () => {
    const result = segmentScriptureVerse('（有古卷加：這就應了經上的話說。）');
    assert.equal(result.displayText, '');
    assert.equal(result.healthState, 'VALID');
    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.memoryReady, false);
    assert.equal(result.voiceReady, false);
    assert.deepEqual(result.fragments, []);
    assert.equal(result.ruleVersion, 'healthy-rule-v14-boundary-graph-t8-m10');
    assert.equal(result.lexiconVersion, 'protected-terms-v4');
    assert.ok(result.issues.includes('EDITORIAL_NOTE_ONLY_VERSE'));
    assert.equal(validateHealthySegmentation({ text: '', fragments: [], boundaryOffsets: [] }).valid, true);
});

test('healthy segmentation preserves exact text and protected Biblical terms', () => {
    const source = '亞伯拉罕生以撒，以撒生雅各；尼布甲尼撒王到了耶路撒冷，稱頌耶和華。';
    const result = segmentScriptureVerse(source);
    assert.equal(result.fragments.join(''), source);
    assert.ok(['VALID', 'VALID_LONG'].includes(result.healthState));
    const offsets = new Set(result.boundaryOffsets.slice(0, -1));
    for (const term of ['亞伯拉罕', '以撒', '尼布甲尼撒', '耶路撒冷', '耶和華']) {
        const start = source.indexOf(term);
        for (let offset = start + 1; offset < start + term.length; offset += 1) {
            assert.equal(offsets.has(offset), false, `${term} must not be split at ${offset}`);
        }
    }
});

test('short Amen is merged and no punctuation-only option is emitted', () => {
    const result = segmentScriptureVerse('因為國度、權柄、榮耀，全是你的，直到永遠。阿們！');
    assert.equal(result.fragments.join(''), result.displayText);
    assert.ok(result.fragments.at(-1).includes('阿們'));
    assert.ok(result.fragments.every(fragment => fragment.replace(/[\p{P}\p{S}\s]/gu, '').length > 0));
});

test('translation labels are excluded before Scripture segmentation', () => {
    const normalized = normalizeScriptureForGame('【和合本 CUV】\n太初有道，道與神同在。');
    assert.equal(normalized.displayText, '太初有道，道與神同在。');
    assert.equal(normalized.nonScriptureMetadataRemoved, true);
    assert.equal(
        normalizeScriptureForGame('【呂振中譯本 LCC】\n起初上帝創造天地。', { version: 'LCC_TRAD' }).displayText,
        '起初上帝創造天地。'
    );
    assert.equal(
        normalizeScriptureForGame('【中文新譯本 CNV】\n起初　神創造天地。', { version: 'CNV_TRAD' }).displayText,
        '起初　神創造天地。'
    );
});

test('non-Scripture footnote placeholders are omitted from game text', () => {
    const result = segmentScriptureVerse('a');
    assert.equal(result.displayText, '');
    assert.deepEqual(result.fragments, []);
    assert.ok(result.issues.includes('NON_SCRIPTURE_TEXT_OMITTED'));
});

test('punctuation and complete meaning outrank the adjustable eight-character target', () => {
    const source = '神愛世人，所以賜下他的獨生子。阿們！';
    const result = segmentScriptureVerse(source);
    assert.equal(result.fragments.join(''), source);
    assert.equal(result.targetLength, 8);
    assert.ok(result.fragments.includes('阿們！'), 'a short but complete sentence must remain intact');
    assert.ok(result.fragments.every(fragment => !/因為[，,。；;：:]?$/u.test(fragment)));
    assert.ok(result.candidateBoundaries.every(boundary => boundary.kind !== 'GRAMMAR_AFTER'));
});

test('a safe comma outranks the exact target in the Lords Prayer', () => {
    const result = segmentScriptureVerse('願你的國降臨；願你的旨意行在地上，如同行在天上。');
    assert.deepEqual(result.fragments, [
        '願你的國降臨；',
        '願你的旨意行在地上，',
        '如同行在天上。'
    ]);
    assert.equal(result.fragments.join(''), result.displayText);
    assert.ok(result.fragments.every(fragment => (
        Array.from(fragment).filter(character => /[\p{L}\p{N}\p{Script=Han}]/u.test(character)).length <= 10
    )));
});

test('enumerations stay grouped without crossing semantic commas or splitting a causative phrase', () => {
    const source = '使人處事，領受智慧、仁義、公平、正直的訓誨，使愚人靈明，使少年人有知識和謀略。';
    const result = segmentScriptureVerse(source);
    assert.deepEqual(result.fragments, [
        '使人處事，',
        '領受智慧、仁義、',
        '公平、正直的訓誨，',
        '使愚人靈明，',
        '使少年人有知識和謀略。'
    ]);
    assert.equal(result.fragments.join(''), source);
    assert.equal(result.healthState, 'VALID');
    assert.equal(result.confidence, 'HIGH');
    assert.ok(result.fragments.every(fragment => !/使[\p{P}\p{S}]*$/u.test(fragment)));
    assert.ok(result.fragments.every(fragment => !/^人有知識/u.test(fragment)));
});

test('an internal memory fragment never strands the possessive particle in Psalm 23', () => {
    const guidance = segmentScriptureVerse('他使我的靈魂甦醒，為自己的名引導我走義路。');
    assert.deepEqual(guidance.fragments, [
        '他使我的靈魂甦醒，',
        '為自己的名',
        '引導我走義路。'
    ]);

    const valley = segmentScriptureVerse('我雖然行過死蔭的幽谷，也不怕遭害，因為你與我同在；你的杖，你的竿，都安慰我。');
    assert.deepEqual(valley.fragments, [
        '我雖然行過死蔭的幽谷，',
        '也不怕遭害，',
        '因為你與我同在；',
        '你的杖，',
        '你的竿，',
        '都安慰我。'
    ]);
    assert.ok([...guidance.fragments, ...valley.fragments]
        .slice(0, -1)
        .every(fragment => !/的[\p{P}\p{S}]*$/u.test(fragment)));
});

test('safe punctuation and word boundaries produce memory-sized cards without waiting for AI', () => {
    const source = '你們要彼此相愛，像我愛你們一樣。';
    const machine = segmentScriptureVerse(source);
    assert.deepEqual(machine.fragments, ['你們要彼此相愛，', '像我愛你們一樣。']);
    assert.equal(machine.healthState, 'VALID');
    assert.ok(machine.fragments.every(fragment => (
        Array.from(fragment).filter(character => /[\p{L}\p{N}\p{Script=Han}]/u.test(character)).length <= 10
    )));
    const approved = Object.fromEntries(machine.candidateBoundaries
        .filter(boundary => boundary.kind === 'PHRASE')
        .map(boundary => [boundary.id, 'PREFER']));
    const reviewed = segmentScriptureVerse(source, { boundaryDecisions: approved });
    assert.ok(reviewed.fragments.length > 1);
    assert.equal(reviewed.fragments.join(''), source);
});

test('a semantic review can never strand punctuation at the start of a fragment', () => {
    const source = '愛是恆久忍耐，又有恩慈；愛是不嫉妒；愛是不自誇，不張狂，';
    const result = segmentScriptureVerse(source);
    const beforeComma = source.indexOf('，');
    assert.equal(result.candidateBoundaries.some(boundary => boundary.offset === beforeComma), false);

    const invalid = validateHealthySegmentation({
        text: source,
        fragments: ['愛是恆久忍耐', source.slice(beforeComma)],
        boundaryOffsets: [beforeComma, source.length]
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.includes('LEADING_BOUNDARY_PUNCTUATION'));
});

test('approved memory passages reproduce every reviewed fragment exactly', () => {
    const approved = approvedMemorySegmentations();
    assert.equal(approved.length, 25);
    assert.equal(SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION, 'memory-segments-v1-t6-8-m10');
    assert.equal(SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH, 10);
    for (const example of approved) {
        const result = segmentScriptureVerse(example.displayText, { version: example.version });
        assert.deepEqual(result.fragments, example.fragments, example.reference);
        assert.equal(result.fragments.join(''), example.displayText, example.reference);
        assert.equal(result.healthState, 'VALID', example.reference);
        assert.equal(result.memoryReady, true, example.reference);
        assert.equal(result.voiceReady, result.maximumVisibleLength <= 8, example.reference);
        assert.equal(result.boundaryState, 'HUMAN_VERIFIED', example.reference);
        assert.equal(result.approvedVersion, example.version, example.reference);
        assert.equal(result.approvedReference, example.reference);
        assert.ok(result.issues.includes('APPROVED_MEMORY_SEGMENTATION'));
        assert.ok(result.fragments.every(fragment => (
            Array.from(fragment).filter(character => /[\p{L}\p{N}\p{Script=Han}]/u.test(character)).length
                <= SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH
        )), example.reference);
    }
});

test('approved Mark memory segmentation is selected after editorial notes are removed', () => {
    const source = '他又對他們說：「你們往普天下去，傳福音給萬民（萬民：原文是凡受造的）聽。';
    const result = segmentScriptureVerse(source);
    assert.equal(result.approvedReference, 'Mark 16:15');
    assert.deepEqual(result.fragments, [
        '他又對他們說：',
        '「你們往普天下去，',
        '傳福音給萬民聽。'
    ]);
});

test('target length is adjustable but never creates arbitrary word cuts', () => {
    const source = '耶和華是我的牧者我必不致缺乏';
    const result = segmentScriptureVerse(source, { targetLength: 6 });
    assert.deepEqual(result.fragments, ['耶和華', '是我的牧者', '我必不致缺乏']);
    assert.equal(result.ruleVersion, 'healthy-rule-v14-boundary-graph-t6-m10');
    assert.equal(result.healthState, 'VALID');
    assert.equal(result.boundaryState, 'RULE_VERIFIED');
    assert.equal(result.confidence, 'HIGH');
});

test('single-character function words unlock long clauses without splitting unknown names', () => {
    const result = segmentScriptureVerse('於是人將哈曼掛在他為末底改所預備的木架上。');
    assert.equal(result.fragments.join(''), '於是人將哈曼掛在他為末底改所預備的木架上。');
    assert.ok(result.fragments.every(fragment => (
        Array.from(fragment).filter(character => /[\p{L}\p{N}\p{Script=Han}]/u.test(character)).length <= 10
    )));
    assert.ok(result.fragments.some(fragment => fragment.includes('末底改')));
});

test('long transliterated names become standalone memory fragments', () => {
    const assyrianKing = segmentScriptureVerse('亞述王提革拉．毘列色上來，卻沒有幫助他。');
    assert.ok(assyrianKing.fragments.includes('提革拉．毘列色'));
    assert.equal(assyrianKing.fragments.join(''), assyrianKing.displayText);

    const judge = segmentScriptureVerse('以色列人服事古珊‧利薩田八年。');
    assert.ok(judge.fragments.includes('古珊‧利薩田'));
    assert.equal(judge.fragments.join(''), judge.displayText);

    const possessive = segmentScriptureVerse('王把他們交在古珊‧利薩田的手中。');
    assert.ok(possessive.fragments.includes('古珊‧利薩田的手中。'));
    assert.equal(possessive.healthState, 'VALID');
});

test('genealogy cards keep complete names and retain their source separators', () => {
    const source = '亞伯拉罕生以撒，以撒生雅各；雅各生猶大和他的弟兄。';
    const result = segmentScriptureVerse(source);
    assert.equal(result.fragments.join(''), source);
    assert.ok(result.fragments.some(fragment => fragment.includes('亞伯拉罕') && fragment.includes('以撒')));
    assert.ok(result.fragments.some(fragment => /[，；]/u.test(fragment)));
    for (const name of ['亞伯拉罕', '以撒', '雅各', '猶大']) {
        assert.ok(result.fragments.some(fragment => fragment.includes(name)), name);
    }

    const descendants = segmentScriptureVerse('五子示法提雅是亞比她生的。六子以特念是大衛的妻以格拉生的。');
    assert.ok(descendants.fragments.every(fragment => (
        Array.from(fragment.replace(/[\p{P}\p{S}\s]/gu, '')).length <= 10
    )));
    for (const name of ['示法提雅', '亞比她', '以特念', '大衛', '以格拉']) {
        assert.ok(descendants.fragments.some(fragment => fragment.includes(name)), name);
    }
});

test('safe boundaries handle parentheses, measurements, entities and comparisons', () => {
    const examples = [
        '瑣巴王哈大利謝（在撒母耳下八章三節是哈大底謝）往幼發拉底河去，',
        '於是一細亞細麵賣銀一舍客勒，',
        '以拉谷殺非利士人歌利亞的那刀在這裡，',
        '加利利人比眾加利利人更有罪，',
        '取贖銀五舍客勒（一舍客勒是二十季拉），'
    ];
    for (const source of examples) {
        const result = segmentScriptureVerse(source);
        assert.equal(result.fragments.join(''), result.displayText, source);
        assert.ok(result.fragments.every(fragment => (
            Array.from(fragment.replace(/[\p{P}\p{S}\s]/gu, '')).length <= 10
        )), `${source}: ${JSON.stringify(result.fragments)}`);
    }

    const parentheticalRelation = segmentScriptureVerse(
        '到了基頓（在撒母耳下六章六節是拿艮）的禾場；因為牛失前蹄。'
    );
    assert.ok(parentheticalRelation.fragments.every(fragment => !/^的/u.test(fragment)));
    assert.ok(parentheticalRelation.fragments.every(fragment => (
        Array.from(fragment.replace(/[\p{P}\p{S}\s]/gu, '')).length <= 10
    )));
});

test('semantic validation rejects dangling function words at internal cuts', () => {
    const source = '因為神愛世人。';
    const validation = validateHealthySegmentation({
        text: source,
        fragments: ['因為', '神愛世人。'],
        boundaryOffsets: [2, source.length]
    });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes('INCOMPLETE_SEMANTIC_FRAGMENT'));
});

test('semantic validation rejects a dangling causative word at an internal cut', () => {
    const source = '使愚人靈明，使少年人有知識和謀略。';
    const cut = source.indexOf('少年人');
    const validation = validateHealthySegmentation({
        text: source,
        fragments: [source.slice(0, cut), source.slice(cut)],
        boundaryOffsets: [cut, source.length]
    });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes('INCOMPLETE_SEMANTIC_FRAGMENT'));
});

test('sentence punctuation keeps its closing quote and never strands the tail', () => {
    const source = '大衛說：「神與你同在。」';
    const result = segmentScriptureVerse(source);
    assert.equal(result.fragments.join(''), source);
    assert.notEqual(result.healthState, 'NEEDS_REPAIR');
    assert.ok(result.fragments.at(-1).endsWith('」'));
});

test('embedded quotation punctuation does not strand a dependent continuation', () => {
    const source = '看見那門徒（就是說：「主啊，是誰？」的那門徒。）';
    const result = segmentScriptureVerse(source);
    assert.equal(result.fragments.join(''), source);
    assert.notEqual(result.healthState, 'NEEDS_REPAIR');
    assert.ok(result.fragments.every(fragment => !fragment.startsWith('的')));
});

test('Selah stays with the preceding sentence instead of becoming a tiny fragment', () => {
    const result = segmentScriptureVerse('神是我們的避難所。（細拉）');
    assert.deepEqual(result.fragments, ['神是我們的避難所。（細拉）']);
});

test('a colon at a verse boundary joins the introduced text from the next verse', () => {
    const merged = mergePassageSegmentations([
        { fragments: ['先知說：'] },
        { fragments: ['你們當回轉。', '耶和華如此說。'] }
    ]);
    assert.deepEqual(merged, ['先知說：你們當回轉。', '耶和華如此說。']);
});

test('length is a warning and an unsafe phrase may remain long', () => {
    const source = '尼布甲尼撒尼布甲尼撒尼布甲尼撒尼布甲尼布甲尼撒';
    const result = segmentScriptureVerse(source, {
        protectedTerms: [{ term: source, category: 'PERSON', source: 'CORE' }]
    });
    assert.equal(result.fragments.join(''), source);
    assert.equal(result.healthState, 'VALID_LONG');
    assert.equal(result.lengthState, 'LONG_EXCEPTION');
    assert.equal(result.memoryReady, false);
    assert.deepEqual(result.fragments, [source]);
});

test('translation profiles remove only their own source artifacts', () => {
    const numericNote = '上主是我的牧者。【12】';
    assert.equal(
        normalizeScriptureForGame(numericNote, { version: 'LCC_TRAD' }).displayText,
        '上主是我的牧者。'
    );
    assert.equal(
        normalizeScriptureForGame(numericNote, { version: 'CUV_TRAD' }).displayText,
        numericNote
    );
    const divider = normalizeScriptureForGame('你們要喜樂。』———', { version: 'LCC_TRAD' });
    assert.equal(divider.displayText, '你們要喜樂。』');
    assert.equal(divider.sourceState, 'CLEAN');
    const unmatchedTail = normalizeScriptureForGame('你們要喜樂。\n （', { version: 'TCV2010_TRAD' });
    assert.equal(unmatchedTail.displayText, '你們要喜樂。');
    assert.equal(unmatchedTail.sourceState, 'CLEAN');
    assert.equal(
        normalizeScriptureForGame('你們要喜樂。（', { version: 'TCV2010_TRAD' }).displayText,
        '你們要喜樂。'
    );
    const alternateEnding = '門徒出去傳福音。〕\r\n\r\ns :另有些古卷有下列結語:\r\n〔9 那些婦女去見彼得。〕';
    const normalizedEnding = normalizeScriptureForGame(alternateEnding, { version: 'TCV2010_TRAD' });
    assert.equal(normalizedEnding.displayText, '門徒出去傳福音。〕');
    assert.equal(normalizedEnding.nonScriptureMetadataRemoved, true);
    const segmentedEnding = segmentScriptureVerse(alternateEnding, { version: 'TCV2010_TRAD' });
    assert.equal(segmentedEnding.fragments.join(''), segmentedEnding.displayText);
    assert.notEqual(segmentedEnding.healthState, 'NEEDS_REPAIR');
    assert.equal(
        normalizeScriptureForGame('所羅門的祈禱\n（#王上 8:22-53|） 接著，所羅門舉起雙手禱告。', {
            version: 'TCV2010_TRAD'
        }).displayText,
        '接著，所羅門舉起雙手禱告。'
    );
    assert.equal(
        normalizeScriptureForGame('擊敗亞蘭人（撒下8:5~12）大馬士革的亞蘭人來幫助他。', {
            version: 'CNV_TRAD'
        }).displayText,
        '大馬士革的亞蘭人來幫助他。'
    );
});

test('boundary graph forbids aspect-particle and genitive cuts on both sides', () => {
    const aspect = segmentScriptureVerse('主人已經預備了豐盛的筵席。');
    const beforeAspect = aspect.displayText.indexOf('了');
    assert.equal(
        aspect.candidateBoundaries.find(boundary => boundary.offset === beforeAspect)?.status,
        'FORBID'
    );
    assert.ok(aspect.fragments.every(fragment => !/預備$/u.test(fragment)));

    const genitive = segmentScriptureVerse('這些是以實瑪利的兒子和他們的名字。');
    const afterGenitive = genitive.displayText.indexOf('的兒子') + 1;
    assert.equal(
        genitive.candidateBoundaries.find(boundary => boundary.offset === afterGenitive)?.status,
        'FORBID'
    );
    assert.ok(genitive.fragments.every(fragment => !/的$/u.test(fragment)));
});

test('suspicious one-character name tails are reviewable instead of silently high confidence', () => {
    const source = '米書蘭是米實利密的兒子；';
    const machine = segmentScriptureVerse(source);
    assert.equal(machine.boundaryState, 'REVIEW_REQUIRED');
    assert.equal(machine.confidence, 'MEDIUM');
    assert.equal(machine.memoryReady, false);
    const decisions = Object.fromEntries(machine.candidateBoundaries
        .filter(boundary => boundary.status === 'REVIEW')
        .map(boundary => [boundary.id, 'FORBID']));
    const reviewed = segmentScriptureVerse(source, { boundaryDecisions: decisions });
    assert.equal(reviewed.boundaryState, 'RULE_VERIFIED');
    assert.equal(reviewed.confidence, 'HIGH');
    assert.equal(reviewed.memoryReady, false);
    assert.equal(reviewed.lengthState, 'LONG_EXCEPTION');
    assert.ok(reviewed.fragments.every(fragment => !/米實利$/u.test(fragment)));
});

test('negated causative verbs keep their object on the same memory side', () => {
    const result = segmentScriptureVerse('她晝夜看守屍身，不讓田野的走獸前來糟踐。');
    assert.ok(result.fragments.every(fragment => !/不讓$/u.test(fragment.replace(/[\p{P}\p{S}\s]/gu, ''))));
    assert.equal(result.fragments.join(''), result.displayText);
});

test('human-approved fragment boundaries are isolated by translation version', () => {
    const source = '他使我的靈魂甦醒，為自己的名引導我走義路。';
    const cuv = segmentScriptureVerse(source, { version: 'CUV_TRAD' });
    const cnv = segmentScriptureVerse(source, { version: 'CNV_TRAD' });
    assert.equal(cuv.approvedReference, 'Psalms 23:3');
    assert.equal(cuv.approvedVersion, 'CUV_TRAD');
    assert.equal(cnv.approvedReference, undefined);
    assert.equal(cnv.translationVersion, 'CNV_TRAD');
});

test('health validation rejects protected-term internal offsets', () => {
    const source = '尼布甲尼撒王';
    const validation = validateHealthySegmentation({
        text: source,
        fragments: ['尼布甲', '尼撒王'],
        boundaryOffsets: [3, source.length],
        protectedTerms: protectedCoreTerms()
    });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes('PROTECTED_TERM_SPLIT'));
});

test('four and nine grid readiness follows the 12/15 fragment rule', () => {
    assert.equal(gridAvailability(11).nine.allowed, false);
    assert.equal(gridAvailability(12).nine.allowed, true);
    assert.equal(gridAvailability(12).nine.ideal, false);
    assert.equal(gridAvailability(15).nine.ideal, true);
});

test('step options never contain duplicate visible text and may shrink', () => {
    let token = 0;
    const fragments = [
        { id: 'a', text: '耶和華，' },
        { id: 'b', text: '耶和華。' },
        { id: 'c', text: '是我的牧者；' },
        { id: 'd', text: '我必不致缺乏。' }
    ];
    const options = buildStepOptions(fragments, 0, () => `t${token += 1}`, () => 0.5, null, 4);
    const visible = publicOptions(options).map(option => option.text);
    assert.equal(new Set(visible).size, visible.length);
    assert.equal(visible.filter(text => text === '耶和華').length, 1);
    assert.equal(options.filter(option => option.isCorrect).length, 1);
    assert.equal(options.length, 3);
});
