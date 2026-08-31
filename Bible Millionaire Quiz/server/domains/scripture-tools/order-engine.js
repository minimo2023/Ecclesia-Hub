import { createHash, randomUUID } from 'node:crypto';
import {
    normalizeScriptureForGame,
    segmentScriptureVerse
} from './healthy-segmentation-engine.js';

export const ORDER_LAB_VERSION = 'order-lab-v1';
export const ORDER_LAB_TAGS = Object.freeze(['勇敢', '喜樂', '快手', '愛心', '雨滴']);
export const ORDER_LAB_MODES = Object.freeze(['practice', 'endless', 'daily']);
export const ORDER_LAYOUT_DIFFICULTIES = Object.freeze(['RANDOM']);
export const ORDER_LAB_DIFFICULTIES = Object.freeze(['INTRO', 'STANDARD', 'CHALLENGE', 'LONG']);

export const SEED_PASSAGES = Object.freeze([
    { id: 'cuv-mat-6-9-13', title: '主禱文', book: 'Matthew', chapter: 6, verseStart: 9, verseEnd: 13, difficulty: 'STANDARD' },
    { id: 'cuv-psa-23-1-6', title: '耶和華是我的牧者', book: 'Psalms', chapter: 23, verseStart: 1, verseEnd: 6, difficulty: 'INTRO' },
    { id: 'cuv-psa-1-1-6', title: '有福之人的道路', book: 'Psalms', chapter: 1, verseStart: 1, verseEnd: 6, difficulty: 'STANDARD' },
    { id: 'cuv-psa-100-1-5', title: '普天下向耶和華歡呼', book: 'Psalms', chapter: 100, verseStart: 1, verseEnd: 5, difficulty: 'INTRO' },
    { id: 'cuv-psa-121-1-8', title: '幫助從造天地的耶和華而來', book: 'Psalms', chapter: 121, verseStart: 1, verseEnd: 8, difficulty: 'STANDARD' },
    { id: 'cuv-deu-6-4-9', title: '你要盡心愛主', book: 'Deuteronomy', chapter: 6, verseStart: 4, verseEnd: 9, difficulty: 'STANDARD' },
    { id: 'cuv-jos-1-5-9', title: '你當剛強壯膽', book: 'Joshua', chapter: 1, verseStart: 5, verseEnd: 9, difficulty: 'INTRO' },
    { id: 'cuv-pro-3-5-10', title: '專心仰賴耶和華', book: 'Proverbs', chapter: 3, verseStart: 5, verseEnd: 10, difficulty: 'INTRO' },
    { id: 'cuv-isa-40-28-31', title: '等候耶和華的必重新得力', book: 'Isaiah', chapter: 40, verseStart: 28, verseEnd: 31, difficulty: 'STANDARD' },
    { id: 'cuv-isa-53-4-8', title: '因他受的刑罰我們得平安', book: 'Isaiah', chapter: 53, verseStart: 4, verseEnd: 8, difficulty: 'CHALLENGE' },
    { id: 'cuv-mat-5-3-12', title: '八福', book: 'Matthew', chapter: 5, verseStart: 3, verseEnd: 12, difficulty: 'CHALLENGE' },
    { id: 'cuv-jhn-3-14-18', title: '神愛世人', book: 'John', chapter: 3, verseStart: 14, verseEnd: 18, difficulty: 'INTRO' },
    { id: 'cuv-jhn-15-1-8', title: '真葡萄樹', book: 'John', chapter: 15, verseStart: 1, verseEnd: 8, difficulty: 'CHALLENGE' },
    { id: 'cuv-rom-8-31-39', title: '誰能使我們與基督的愛隔絕', book: 'Romans', chapter: 8, verseStart: 31, verseEnd: 39, difficulty: 'CHALLENGE' },
    { id: 'cuv-1co-13-4-8', title: '愛的篇章', book: '1 Corinthians', chapter: 13, verseStart: 4, verseEnd: 8, difficulty: 'STANDARD' },
    { id: 'cuv-gal-5-22-26', title: '聖靈所結的果子', book: 'Galatians', chapter: 5, verseStart: 22, verseEnd: 26, difficulty: 'INTRO' },
    { id: 'cuv-eph-6-10-18', title: '神所賜的全副軍裝', book: 'Ephesians', chapter: 6, verseStart: 10, verseEnd: 18, difficulty: 'CHALLENGE' },
    { id: 'cuv-php-4-4-9', title: '應當一無掛慮', book: 'Philippians', chapter: 4, verseStart: 4, verseEnd: 9, difficulty: 'STANDARD' },
    { id: 'cuv-col-3-12-17', title: '存憐憫恩慈謙虛的心', book: 'Colossians', chapter: 3, verseStart: 12, verseEnd: 17, difficulty: 'CHALLENGE' },
    { id: 'cuv-heb-11-1-6', title: '信就是所望之事的實底', book: 'Hebrews', chapter: 11, verseStart: 1, verseEnd: 6, difficulty: 'STANDARD' }
]);

export function taipeiDate(now = new Date()) {
    return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

export function sha256(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

export function canonicalizeVerses(verses = []) {
    return verses
        .map(verse => ({
            id: verse.id,
            book: verse.book,
            chapter: Number(verse.chapter),
            verse: Number(verse.verse),
            text: String(verse.text || '').trim()
        }))
        .filter(verse => verse.text);
}

export function stripEditorialAnnotations(value) {
    return normalizeScriptureForGame(value).displayText;
}

export function stripOrderGameSymbols(value) {
    return String(value || '')
        .replace(/[\p{P}\p{S}]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
}

function naturalBoundaries(text) {
    const points = new Set([text.length]);
    for (let index = 0; index < text.length; index += 1) {
        if ('，。！？；：、'.includes(text[index])) points.add(index + 1);
    }
    return [...points].filter(point => point > 0).sort((left, right) => left - right);
}

const ORDER_VISIBLE_CHARACTER = /[\p{L}\p{N}\p{Script=Han}]/u;

function orderVisibleLength(value) {
    return Array.from(String(value || '')).filter(character => ORDER_VISIBLE_CHARACTER.test(character)).length;
}

/**
 * Deterministic, per-verse machine segmentation used before any optional AI
 * semantic review. It never crosses a verse boundary and always preserves the
 * source text byte-for-byte after direct reassembly.
 */
export function splitVerseForOrder(sourceText, { minimumVisibleLength = 3, maximumVisibleLength = 8 } = {}) {
    const result = segmentScriptureVerse(sourceText);
    const issues = [...result.issues];
    if (result.fragments.some(fragment => orderVisibleLength(fragment) < minimumVisibleLength)) {
        issues.push('SHORT_FRAGMENT');
    }
    if (result.fragments.some(fragment => orderVisibleLength(fragment) > maximumVisibleLength)) {
        issues.push('LONG_FRAGMENT_EXCEPTION');
    }
    return {
        ...result,
        issues: [...new Set(issues)]
    };
}

export function splitVersesForOrder(verses = [], options = {}) {
    const perVerse = (Array.isArray(verses) ? verses : []).map(verse => {
        const result = splitVerseForOrder(verse?.text, options);
        return {
            verse: Number(verse?.verse),
            text: String(verse?.text || ''),
            ...result
        };
    });
    const fragments = perVerse.flatMap(verse => verse.fragments).map((text, index) => ({
        id: `f${index + 1}`,
        text
    }));
    return {
        fragments,
        perVerse,
        lowConfidenceVerses: perVerse.filter(verse => verse.confidence === 'LOW')
    };
}

function desiredFragmentCount(textLength, difficulty, custom = false) {
    if (custom) return Math.max(8, Math.round(textLength / 14));
    if (difficulty === 'INTRO') return 9;
    if (difficulty === 'CHALLENGE') return 15;
    if (difficulty === 'LONG') return Math.max(17, Math.round(textLength / 14));
    return 12;
}

export function splitExactText(sourceText, { difficulty = 'STANDARD', custom = false } = {}) {
    const text = String(sourceText || '');
    if (!text) return [];
    const requestedCount = Math.min(text.length, desiredFragmentCount(text.length, difficulty, custom));
    const boundarySet = new Set(naturalBoundaries(text));
    while (boundarySet.size < requestedCount) {
        const points = [0, ...boundarySet].sort((left, right) => left - right);
        let widest = null;
        for (let index = 1; index < points.length; index += 1) {
            const candidate = { start: points[index - 1], end: points[index] };
            if (candidate.end - candidate.start > 1
                && (!widest || candidate.end - candidate.start > widest.end - widest.start)) {
                widest = candidate;
            }
        }
        if (!widest) break;
        boundarySet.add(widest.start + Math.floor((widest.end - widest.start) / 2));
    }
    const boundaries = [...boundarySet].sort((left, right) => left - right);
    const fragments = [];
    let start = 0;

    for (let part = 0; part < requestedCount - 1; part += 1) {
        const remainingParts = requestedCount - part;
        const ideal = start + Math.max(1, Math.round((text.length - start) / remainingParts));
        const remainingBoundaries = boundaries.filter(point => point > start);
        const latestCandidateIndex = remainingBoundaries.length - remainingParts;
        const candidates = remainingBoundaries.slice(0, latestCandidateIndex + 1);
        let end = candidates.reduce((best, point) => (
            Math.abs(point - ideal) < Math.abs(best - ideal) ? point : best
        ), candidates[0]);
        if (!end || end <= start) end = Math.min(text.length - (remainingParts - 1), start + 1);
        fragments.push(text.slice(start, end));
        start = end;
    }
    fragments.push(text.slice(start));

    const maximumCount = difficulty === 'LONG' ? 24 : 16;
    while (fragments.length < maximumCount) {
        const longestIndex = fragments.reduce((bestIndex, fragment, index, all) => (
            fragment.length > all[bestIndex].length ? index : bestIndex
        ), 0);
        const longest = fragments[longestIndex];
        if (!longest || longest.length <= 32) break;
        const innerBoundaries = naturalBoundaries(longest).filter(point => point < longest.length);
        const midpoint = Math.floor(longest.length / 2);
        const splitAt = innerBoundaries.length
            ? innerBoundaries.reduce((best, point) => (
                Math.abs(point - midpoint) < Math.abs(best - midpoint) ? point : best
            ), innerBoundaries[0])
            : midpoint;
        fragments.splice(longestIndex, 1, longest.slice(0, splitAt), longest.slice(splitAt));
    }

    return fragments.filter(fragment => fragment.length > 0).map((fragment, index) => ({
        id: `f${index + 1}`,
        text: fragment
    }));
}

export function verifyFragments(sourceText, fragments) {
    if (!Array.isArray(fragments) || fragments.length < 1) return false;
    return fragments.every(fragment => typeof fragment?.text === 'string' && fragment.text.length > 0)
        && fragments.map(fragment => fragment.text).join('') === String(sourceText || '');
}

const ORDER_NATURAL_BOUNDARY = /[，。！？；：、」』）》】]/u;
const ORDER_EDITORIAL_MARKER = /（[^（）]*(?:或譯|有古卷|小字|原文|另作|作：)[^（）]*）|\([^()]*(?:或譯|有古卷|小字|原文|另作)[^()]*\)/u;

/**
 * Deterministic seed audit. It never calls AI and deliberately separates
 * hard data-integrity failures from soft phrase-boundary review warnings.
 */
export function auditOrderPassage({ sourceText, fragments } = {}) {
    const text = String(sourceText || '');
    const items = Array.isArray(fragments) ? fragments : [];
    const errors = [];
    const warnings = [];

    if (!text) errors.push('SOURCE_TEXT_EMPTY');
    if (!verifyFragments(text, items)) errors.push('EXACT_REASSEMBLY_FAILED');
    if (ORDER_EDITORIAL_MARKER.test(text)) errors.push('EDITORIAL_ANNOTATION_REMAINS');

    const lengths = items.map(fragment => String(fragment?.text || '').length);
    const blankFragments = lengths.filter(length => length === 0).length;
    const veryShortFragments = lengths.filter(length => length > 0 && length <= 2).length;
    const longFragments = lengths.filter(length => length > 32).length;
    if (blankFragments > 0) errors.push('EMPTY_FRAGMENT');
    if (veryShortFragments > 0) warnings.push('VERY_SHORT_FRAGMENT');
    if (longFragments > 0) warnings.push('LONG_FRAGMENT');

    let offset = 0;
    let naturalBoundaryCount = 0;
    const boundaries = [];
    for (let index = 0; index < items.length - 1; index += 1) {
        offset += String(items[index]?.text || '').length;
        const previous = text[offset - 1] || '';
        const next = text[offset] || '';
        const natural = ORDER_NATURAL_BOUNDARY.test(previous) || ORDER_NATURAL_BOUNDARY.test(next);
        if (natural) naturalBoundaryCount += 1;
        boundaries.push({ offset, previous, next, natural });
    }
    const boundaryCount = Math.max(0, items.length - 1);
    const naturalBoundaryRatio = boundaryCount > 0 ? naturalBoundaryCount / boundaryCount : 0;
    if (boundaryCount > 0 && naturalBoundaryRatio < 0.35) warnings.push('LOW_NATURAL_BOUNDARY_RATIO');

    if (items.length < 8) warnings.push('TOO_FEW_FRAGMENTS');

    const readiness = errors.length > 0
        ? 'QUARANTINED'
        : warnings.length > 0
            ? 'NEEDS_REVIEW'
            : 'READY';

    return {
        readiness,
        exactReassembly: !errors.includes('EXACT_REASSEMBLY_FAILED'),
        fragmentCount: items.length,
        minimumFragmentLength: lengths.length ? Math.min(...lengths) : 0,
        maximumFragmentLength: lengths.length ? Math.max(...lengths) : 0,
        naturalBoundaryCount,
        boundaryCount,
        naturalBoundaryRatio: Number(naturalBoundaryRatio.toFixed(3)),
        errors,
        warnings,
        boundaries
    };
}

export function classifyDifficulty(fragmentCount) {
    if (fragmentCount <= 10) return 'INTRO';
    if (fragmentCount <= 13) return 'STANDARD';
    if (fragmentCount <= 16) return 'CHALLENGE';
    return 'LONG';
}

export function timerSeconds(difficulty, fragmentCount) {
    const perFragment = difficulty === 'INTRO' ? 8 : difficulty === 'CHALLENGE' ? 4 : 6;
    return 10 + Math.max(1, Number(fragmentCount) || 1) * perFragment;
}

export function shuffle(items, random = Math.random) {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [next[index], next[target]] = [next[target], next[index]];
    }
    return next;
}

export function buildStepOptions(
    fragments,
    currentIndex,
    tokenFactory = randomUUID,
    random = Math.random,
    excludedCorrectSlot = null,
    optionCount = 4,
    externalFragments = [],
    requestedExternalCount = 0
) {
    const remaining = fragments.slice(currentIndex);
    if (remaining.length === 0) return [];
    const correct = remaining[0];
    const correctVisibleText = stripOrderGameSymbols(correct.text);
    const seenVisibleText = new Set([correctVisibleText]);
    const uniqueCandidate = fragment => {
        const visible = stripOrderGameSymbols(fragment.text);
        if (!visible || seenVisibleText.has(visible)) return false;
        seenVisibleText.add(visible);
        return true;
    };
    const distractorLimit = Math.max(0, optionCount - 1);
    const externalLimit = Math.min(distractorLimit, Math.max(0, Number(requestedExternalCount) || 0));
    const externalDistractors = shuffle(externalFragments, random)
        .filter(uniqueCandidate)
        .slice(0, externalLimit)
        .map(fragment => ({ ...fragment, external: true }));
    const currentDistractors = shuffle(remaining.slice(1), random)
        .filter(uniqueCandidate)
        .slice(0, distractorLimit - externalDistractors.length);
    // If duplicate text in the selected passage reduced the pool, use more safe
    // external fragments to avoid presenting two visually identical answers.
    const fallbackExternal = shuffle(externalFragments, random)
        .filter(fragment => !externalDistractors.some(item => item.id === fragment.id))
        .filter(uniqueCandidate)
        .slice(0, distractorLimit - externalDistractors.length - currentDistractors.length)
        .map(fragment => ({ ...fragment, external: true }));
    const distractors = [...externalDistractors, ...currentDistractors, ...fallbackExternal];
    const slots = Array.from({ length: Math.max(1, optionCount) }, (_value, index) => index);
    const correctSlots = slots.filter(slot => slot !== excludedCorrectSlot);
    const correctSlot = correctSlots[Math.floor(random() * correctSlots.length)];
    const distractorSlots = shuffle(slots.filter(slot => slot !== correctSlot), random);
    const assignedOptions = [correct, ...shuffle(distractors, random)].map((fragment, index) => ({
        token: tokenFactory(),
        fragmentId: fragment.id,
        key: fragment.publicKey || fragment.id,
        slot: index === 0 ? correctSlot : distractorSlots[index - 1],
        text: fragment.text,
        isCorrect: fragment.id === correct.id,
        external: Boolean(fragment.external)
    }));
    // Slot is authoritative; array order must stay opaque so the first item does not reveal the answer.
    return shuffle(assignedOptions, random);
}

export function rotateWrongOption({
    fragments,
    currentIndex,
    options,
    wrongToken,
    rejectedFragmentIds = [],
    tokenFactory = randomUUID,
    random = Math.random,
    distractorPool = []
}) {
    const wrongIndex = options.findIndex(option => option.token === wrongToken);
    if (wrongIndex < 0) return options;

    const wrong = options[wrongIndex];
    const retained = options.filter(option => option.token !== wrongToken);
    const excluded = new Set([
        ...rejectedFragmentIds,
        wrong.fragmentId,
        ...retained.map(option => option.fragmentId)
    ]);
    const retainedVisibleText = new Set(retained.map(option => stripOrderGameSymbols(option.text)));
    const candidates = shuffle(
        [...fragments.slice(currentIndex + 1), ...distractorPool].filter(fragment => !excluded.has(fragment.id)
            && !retainedVisibleText.has(stripOrderGameSymbols(fragment.text))),
        random
    );
    const replacement = candidates[0];
    if (!replacement) return retained;

    const next = [...options];
    next[wrongIndex] = {
        token: tokenFactory(),
        fragmentId: replacement.id,
        key: replacement.publicKey || replacement.id,
        slot: Number.isInteger(wrong.slot) ? wrong.slot : wrongIndex,
        text: replacement.text,
        isCorrect: false,
        external: Boolean(replacement.external)
    };
    return next;
}

export function publicOptions(options = [], disabledTokens = []) {
    const disabled = new Set(disabledTokens);
    return options.map(option => ({
        token: option.token,
        key: option.key || option.token,
        slot: Number.isInteger(option.slot) ? option.slot : undefined,
        text: stripOrderGameSymbols(option.text),
        disabled: disabled.has(option.token)
    }));
}

export function scoreCorrect({ score = 0, streak = 0, multiplier = 1 } = {}) {
    const points = 100 * multiplier;
    const nextStreak = streak + 1;
    const nextMultiplier = nextStreak % 3 === 0 ? Math.min(5, multiplier + 1) : multiplier;
    return { score: score + points, points, streak: nextStreak, multiplier: nextMultiplier };
}

export function completionScore(deadlineAt, now = Date.now()) {
    const remainingSeconds = Math.max(0, Math.floor((new Date(deadlineAt).getTime() - now) / 1000));
    return { completionBonus: 1750, timeBonus: remainingSeconds * 10, remainingSeconds };
}

export function validateCustomRange(input = {}, { min = 5, max = 20 } = {}) {
    const chapter = Number(input.chapter);
    const verseStart = Number(input.verseStart);
    const verseEnd = Number(input.verseEnd);
    if (!Number.isSafeInteger(chapter) || chapter < 1
        || !Number.isSafeInteger(verseStart) || verseStart < 1
        || !Number.isSafeInteger(verseEnd) || verseEnd < verseStart) {
        return { valid: false, code: 'INVALID_PASSAGE_RANGE' };
    }
    const verseCount = verseEnd - verseStart + 1;
    if (verseCount < min || verseCount > max) return { valid: false, code: 'PASSAGE_RANGE_5_TO_20_REQUIRED' };
    return { valid: true, chapter, verseStart, verseEnd, verseCount };
}

export function stableIndex(value, length) {
    if (length <= 0) return 0;
    const digest = createHash('sha256').update(String(value)).digest();
    return digest.readUInt32BE(0) % length;
}
