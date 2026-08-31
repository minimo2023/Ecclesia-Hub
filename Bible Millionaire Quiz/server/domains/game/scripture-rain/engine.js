import { normalizeScriptureForGame } from '../../scripture-tools/healthy-segmentation-engine.js';
import { SEED_PASSAGES } from '../../scripture-tools/order-engine.js';

export const SCRIPTURE_RAIN_VERSION = 'scripture-rain-scaffold-v2';

const RAIN_LEVEL_BY_DIFFICULTY = Object.freeze({
    INTRO: '入門',
    STANDARD: '標準',
    CHALLENGE: '挑戰',
    LONG: '長篇'
});

// Scripture order and Scripture rain deliberately share one curated catalogue.
// Keeping the original ids also makes the same passage remain selected when a
// player moves between the two memory games.
export const SCRIPTURE_RAIN_PASSAGES = Object.freeze(SEED_PASSAGES.map(passage => Object.freeze({
    ...passage,
    level: RAIN_LEVEL_BY_DIFFICULTY[passage.difficulty] || '標準'
})));

export function stripRainEditorialAnnotations(value) {
    return normalizeScriptureForGame(value).displayText;
}

function visibleRainText(value) {
    return String(value || '').replace(/[\p{P}\p{S}\s]/gu, '');
}

export function isCorrectRainSelection(fragments, currentIndex, fragmentId) {
    const current = fragments[Number(currentIndex || 0)];
    const selected = fragments.find(fragment => String(fragment.id) === String(fragmentId || ''));
    if (!current || !selected) return false;
    return selected.id === current.id
        || visibleRainText(selected.text) === visibleRainText(current.text);
}

function naturalBoundaries(text) {
    const points = new Set([text.length]);
    for (let index = 0; index < text.length; index += 1) {
        if ('，。！？；：、'.includes(text[index])) points.add(index + 1);
    }
    return [...points].filter(point => point > 0).sort((left, right) => left - right);
}

function desiredFragmentCount(length) {
    return Math.min(16, Math.max(8, Math.round(length / 14)));
}

export function splitScriptureRainText(sourceText) {
    const text = String(sourceText || '');
    if (!text) return [];

    const requestedCount = Math.min(text.length, desiredFragmentCount(text.length));
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
        const candidates = remainingBoundaries.slice(0, Math.max(1, latestCandidateIndex + 1));
        let end = candidates[0];
        for (const point of candidates) {
            if (Math.abs(point - ideal) < Math.abs(end - ideal)) end = point;
        }
        if (!end || end <= start) end = Math.min(text.length - (remainingParts - 1), start + 1);
        fragments.push(text.slice(start, end));
        start = end;
    }
    fragments.push(text.slice(start));

    return fragments.filter(Boolean).map((textPart, index) => ({
        id: `rain-f${index + 1}`,
        text: textPart
    }));
}

export function verifyScriptureRainFragments(sourceText, fragments) {
    return Array.isArray(fragments)
        && fragments.length >= 2
        && fragments.every(fragment => typeof fragment?.text === 'string' && fragment.text.length > 0)
        && fragments.map(fragment => fragment.text).join('') === String(sourceText || '');
}

export function scriptureRainDurationMs(fragmentCount) {
    const count = Math.max(1, Number(fragmentCount) || 1);
    return Math.max(55_000, Math.min(120_000, 20_000 + count * 6_000));
}

export function scoreScriptureRainCorrect({ score = 0, streak = 0, multiplier = 1 } = {}) {
    const points = 100 * multiplier;
    const nextStreak = streak + 1;
    const nextMultiplier = nextStreak % 3 === 0 ? Math.min(5, multiplier + 1) : multiplier;
    return { score: score + points, points, streak: nextStreak, multiplier: nextMultiplier };
}
