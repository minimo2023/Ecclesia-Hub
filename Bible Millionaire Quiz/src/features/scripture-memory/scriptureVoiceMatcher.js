import { pinyin, polyphonic } from 'pinyin-pro';
import * as OpenCC from 'opencc-js';

const STRIP_RE = /[\p{P}\p{S}\p{Z}\p{C}\p{M}]/gu;
const HAN_RE = /\p{Script=Han}/u;
const SPOKEN_PREFIX_RE = /^(?:答案(?:是|為)?|我(?:選|說)|選擇|應該是|就是)+/u;
const converter = OpenCC.Converter({ from: 't', to: 'cn' });

export function normalizeScriptureVoiceText(value) {
    const compact = String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(SPOKEN_PREFIX_RE, '')
        .replace(STRIP_RE, '')
        .toLowerCase();
    return converter(compact);
}

function fuzzyPinyinKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^zh/u, 'z')
        .replace(/^ch/u, 'c')
        .replace(/^sh/u, 's')
        .replace(/v/gu, 'u')
        .replace(/ang$/u, 'an')
        .replace(/eng$/u, 'en')
        .replace(/ing$/u, 'in');
}

function targetPronunciations(text) {
    return Array.from(text).map(character => {
        if (!HAN_RE.test(character)) return new Set([character]);
        const readings = polyphonic(character, { toneType: 'none', type: 'array', v: true });
        return new Set(((readings && readings[0]) || [character]).map(fuzzyPinyinKey));
    });
}

function heardPronunciations(text) {
    const characters = Array.from(text);
    const readings = pinyin(text, { toneType: 'none', type: 'array', v: true });
    return characters.map((character, index) => (
        HAN_RE.test(character) ? fuzzyPinyinKey(readings[index] || character) : character
    ));
}

function lcsF1(left, right, matches = (a, b) => a === b) {
    if (!left.length || !right.length) return 0;
    let previous = new Array(right.length + 1).fill(0);
    let current = new Array(right.length + 1).fill(0);
    for (let i = 1; i <= left.length; i += 1) {
        for (let j = 1; j <= right.length; j += 1) {
            current[j] = matches(left[i - 1], right[j - 1])
                ? previous[j - 1] + 1
                : Math.max(previous[j], current[j - 1]);
        }
        [previous, current] = [current, previous];
        current.fill(0);
    }
    const matched = previous[right.length];
    const precision = matched / right.length;
    const recall = matched / left.length;
    return precision + recall ? Math.round((2 * precision * recall / (precision + recall)) * 100) : 0;
}

function scoreCandidate(target, heard) {
    if (!target.normalized || !heard) return { score: 0, exact: false };
    if (target.normalized === heard) return { score: 100, exact: true };
    const targetCharacters = Array.from(target.normalized);
    const heardCharacters = Array.from(heard);
    const literalScore = lcsF1(targetCharacters, heardCharacters);
    const heardKeys = heardPronunciations(heard);
    const pronunciationScore = lcsF1(
        target.pronunciations,
        heardKeys,
        (accepted, key) => accepted.has(key)
    );
    return { score: Math.max(literalScore, pronunciationScore), exact: false };
}

function thresholdForLength(length) {
    if (length <= 3) return { score: 100, margin: 20 };
    if (length <= 6) return { score: 90, margin: 15 };
    return { score: 82, margin: 12 };
}

function optionIdentity(option, index) {
    return String(option?.token || option?.rainInstanceId || option?.key || option?.id || index);
}

export function rankScriptureVoiceOptions(candidates, options) {
    const heardCandidates = (Array.isArray(candidates) ? candidates : [candidates])
        .map(normalizeScriptureVoiceText)
        .filter(Boolean)
        .slice(0, 5);
    if (!heardCandidates.length) return { matched: false, reason: 'empty', score: 0, margin: 0 };

    const groups = new Map();
    (Array.isArray(options) ? options : []).forEach((option, index) => {
        if (!option || option.disabled) return;
        const normalized = normalizeScriptureVoiceText(option.text);
        if (!normalized) return;
        const current = groups.get(normalized);
        if (current) {
            current.duplicates.push(option);
            return;
        }
        groups.set(normalized, {
            option,
            identity: optionIdentity(option, index),
            normalized,
            pronunciations: targetPronunciations(normalized),
            duplicates: []
        });
    });

    const ranked = [...groups.values()].map(target => {
        const candidateScores = heardCandidates.map(heard => scoreCandidate(target, heard));
        const exact = candidateScores.some(result => result.exact);
        return {
            ...target,
            exact,
            score: Math.max(...candidateScores.map(result => result.score))
        };
    }).sort((left, right) => right.score - left.score
        || Number(right.exact) - Number(left.exact)
        || left.identity.localeCompare(right.identity));

    const best = ranked[0];
    if (!best) return { matched: false, reason: 'no-options', score: 0, margin: 0 };
    const runnerUp = ranked[1];
    const secondScore = best.exact && runnerUp && !runnerUp.exact
        ? Math.min(80, runnerUp.score)
        : runnerUp?.score || 0;
    const margin = best.score - secondScore;
    const required = thresholdForLength(Array.from(best.normalized).length);
    const matched = best.score >= required.score && margin >= required.margin;
    return {
        matched,
        ambiguous: best.score >= required.score && margin < required.margin,
        reason: matched ? 'matched' : best.score < required.score ? 'low-score' : 'ambiguous',
        option: matched ? best.option : null,
        score: best.score,
        secondScore,
        margin,
        required
    };
}
