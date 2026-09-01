import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const SCRIPTURE_SEGMENTATION_NORMALIZATION_VERSION = 'display-normalization-v5-translation-profiles';

function configuredTargetLength(value = process.env.SCRIPTURE_SEGMENTATION_TARGET_LENGTH) {
    const parsed = Number.parseInt(String(value || '8'), 10);
    return Number.isFinite(parsed) ? Math.min(16, Math.max(4, parsed)) : 8;
}

export const SCRIPTURE_SEGMENTATION_TARGET_LENGTH = configuredTargetLength();
export const SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH = 10;
export const SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION = 'memory-segments-v1-t6-8-m10';
export const SCRIPTURE_SEGMENTATION_RULE_VERSION =
    'healthy-rule-v14-boundary-graph-t' + SCRIPTURE_SEGMENTATION_TARGET_LENGTH
    + '-m' + SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH;
export const SCRIPTURE_SEGMENTATION_LEXICON_VERSION = String(
    process.env.SCRIPTURE_SEGMENTATION_LEXICON_VERSION || 'protected-terms-v4'
).trim();

const coreLexicon = JSON.parse(readFileSync(
    new URL('../../data/scripture-segmentation/protected-terms.v1.json', import.meta.url),
    'utf8'
));
const approvedMemoryManifest = JSON.parse(readFileSync(
    new URL('../../data/scripture-segmentation/approved-memory-segments.v1.json', import.meta.url),
    'utf8'
));

const EDITORIAL_MARKER = /(?:或譯|或作|有古卷|古卷(?:作|有)?|原文(?:作|是|直譯)?|小字|另作|註(?:：|:)?|意即|作：|馬索拉|七十士譯本|古譯本|抄本|修譯)/u;
const TRANSLATION_LABEL = /(?:中文)?(?:新標點)?和合本|現代中文譯本(?:\s*(?:1995|2010))?|呂振中譯本|中文新譯本|新譯本|CUV|LCC|TCV(?:2010)?|CNV/iu;
const RESIDUAL_EDITORIAL_MARKER = /(?:【[^】]*(?:原文|或譯|或作|古卷|譯本|抄本)[^】]*】|《(?:馬索拉|七十士譯本)[^》]*》|本(?:節|章).{0,12}(?:抄本|細字|標題))/u;
const TCV_EDITORIAL_TAIL = /(?:\r?\n\s*)s\s*:\s*另有些古卷有下列結語\s*:/iu;
const TRANSLATION_NORMALIZATION_PROFILES = Object.freeze({
    CUV_TRAD: Object.freeze({ id: 'CUV_TRAD', squareNumericNotes: false, crossReferenceNotes: false }),
    LCC_TRAD: Object.freeze({ id: 'LCC_TRAD', squareNumericNotes: true, crossReferenceNotes: true }),
    TCV2010_TRAD: Object.freeze({
        id: 'TCV2010_TRAD', squareNumericNotes: true, crossReferenceNotes: true,
        leadingHeadingWithReference: true
    }),
    CNV_TRAD: Object.freeze({
        id: 'CNV_TRAD', squareNumericNotes: true, crossReferenceNotes: true,
        leadingHeadingWithReference: true
    }),
    DEFAULT: Object.freeze({ id: 'DEFAULT', squareNumericNotes: false, crossReferenceNotes: false })
});
// 和合本部分詩篇把題註放進第一節的前置括號。這些內容是閱讀時可見的
// 題註，但不是排序遊戲的答案；只移除「位於整節最前方」且明確帶有
// 詩篇題註特徵的括號，避免誤刪正文中的括號內容。
const PSALM_SUPERSCRIPTION_MARKER = /(?:大衛|亞薩|可拉後裔|所羅門|摩西|希幔|以探|耶杜頓|伶長|詩|歌|金詩|訓誨詩|上行之詩|調用|記念詩|安息日)/u;
const SENTENCE_END = new Set(Array.from('。！？!?'));
const CLAUSE_END = new Set(Array.from('；：;:'));
const PHRASE_END = new Set(Array.from('，、,'));
const TRAILING_CLOSERS = new Set(Array.from('」』》〉】〕］）)]}'));
// These marks belong to the preceding phrase. A word/semantic candidate placed
// immediately before one of them would produce a visually and semantically
// broken next fragment (for example "愛是恆久忍耐" + "，又有恩慈；").
// Opening quotation/parenthesis marks are intentionally excluded because a
// new fragment may legitimately begin with direct speech or a parenthesis.
const LEADING_BOUNDARY_PUNCTUATION = /^[，、。；：！？，,;:!?」』》〉】〕］）)\]}]/u;
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{Script=Han}]/u;
const NON_SCRIPTURE_ONLY = /^(?:[a-z]|[*†‡]+)$/iu;
// These multi-character discourse markers can begin a new natural clause. They
// are deliberately not cut after the marker: "因為|神愛世人" is a lexical
// boundary but not a complete semantic fragment.
const SEMANTIC_CLAUSE_STARTS = Object.freeze([
    '所以', '因為', '但是', '然而', '因此', '於是', '並且', '如今', '若是', '倘若',
    '只是', '不但', '而且', '或者'
]);
// These words safely begin a new memory unit when a punctuation-free phrase is
// otherwise too long. They are starts, never trailing cut points, so the word
// and the meaning that follows it remain together.
const SAFE_MEMORY_UNIT_STARTS = Object.freeze([
    '有兩個', '去見', '召了', '攻取', '按著', '賣銀', '殺敗', '只結',
    '最尊大', '轄制', '就是', '所生', '其餘', '分定',
    '照以', '用刀', '用精金', '比眾', '引導'
]);
// A fragment must not stop after a word that grammatically governs what comes
// next. This includes single-character coverbs/conjunctions such as "使":
// otherwise an eight-character target can incorrectly produce
// "...靈明使 | 少年人..." and still pass deterministic validation.
const DANGLING_MULTI_CHARACTER_END = /(?:所以|因為|但是|然而|因此|於是|並且|若是|倘若|只是|不但|而且|或者)$/u;
const DANGLING_SINGLE_CHARACTER_WORDS = new Set(Array.from(
    // Keep this narrow: Intl can tokenize complete predicates such as "同在"
    // as "同" + "在". Causative verbs are unambiguous here and must carry
    // their following object/predicate into the same memory unit.
    '使叫讓'
));
const CAUSATIVE_GOVERNOR = /^(?:不|未|要|能|可|會|勿|別|莫|必)?(?:使|叫|讓)$/u;
const DEPENDENT_FRAGMENT_START = /^的/u;
const LITURGICAL_CONTINUATION = /^[（(]細拉[）)]/u;
// Only these one-character segments are unambiguous standalone Chinese
// function words. Unknown one-character Han segments may be parts of a name
// (末、底、改) and must not become automatic cut points.
const SAFE_SINGLE_CHARACTER_WORDS = new Set(Array.from(
    '在的和並又也就都而與及或從向到將把被為所要必可使叫讓給因若但其他你我誰此那各每'
));
const WORD_SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh-Hant', { granularity: 'word' })
    : null;
export const SCRIPTURE_BOUNDARY_STATES = Object.freeze({
    MUST: 'MUST',
    PREFER: 'PREFER',
    ALLOW: 'ALLOW',
    REVIEW: 'REVIEW',
    FORBID: 'FORBID',
    HUMAN_APPROVED: 'HUMAN_APPROVED',
    AI_APPROVED: 'AI_APPROVED'
});

function sha256(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

function visibleOptionText(value) {
    return String(value || '').replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/gu, ' ').trim();
}

function hasIncompleteSemanticEnd(value) {
    const text = visibleOptionText(value);
    if (DANGLING_MULTI_CHARACTER_END.test(text)) return true;
    if (!text || !WORD_SEGMENTER) return false;
    const words = [...WORD_SEGMENTER.segment(text)]
        .filter(item => item.isWordLike);
    const finalWord = String(words.at(-1)?.segment || '');
    return (visibleLength(finalWord) === 1 && DANGLING_SINGLE_CHARACTER_WORDS.has(finalWord))
        || CAUSATIVE_GOVERNOR.test(finalWord);
}

export function protectedCoreTerms() {
    return coreLexicon.terms.map(item => ({ ...item }));
}

function visibleLength(value) {
    return Array.from(String(value || '')).filter(character => VISIBLE_CHARACTER.test(character)).length;
}

function buildApprovedMemoryMap() {
    if (approvedMemoryManifest.profileVersion !== SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION) {
        throw new Error('APPROVED_MEMORY_PROFILE_VERSION_MISMATCH');
    }
    if (Number(approvedMemoryManifest.maximumVisibleLength) !== SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH) {
        throw new Error('APPROVED_MEMORY_MAX_LENGTH_MISMATCH');
    }
    const result = new Map();
    for (const item of approvedMemoryManifest.entries || []) {
        const version = String(
            item?.version || approvedMemoryManifest.defaultVersion || 'CUV_TRAD'
        ).trim().toUpperCase();
        const displayText = String(item?.displayText || '');
        const fragments = Array.isArray(item?.fragments) ? item.fragments.map(String) : [];
        if (!displayText || !fragments.length || fragments.join('') !== displayText) {
            throw new Error('APPROVED_MEMORY_EXACT_REASSEMBLY_FAILED:' + (item?.reference || 'UNKNOWN'));
        }
        if (fragments.some(fragment => !visibleOptionText(fragment)
            || visibleLength(fragment) > SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH)) {
            throw new Error('APPROVED_MEMORY_FRAGMENT_INVALID:' + (item?.reference || 'UNKNOWN'));
        }
        const key = `${version}\u0000${displayText}`;
        if (result.has(key)) {
            throw new Error('APPROVED_MEMORY_DUPLICATE_TEXT:' + (item?.reference || 'UNKNOWN'));
        }
        result.set(key, {
            version,
            displayText,
            reference: String(item.reference || ''),
            fragments
        });
    }
    return result;
}

const approvedMemoryByDisplayText = buildApprovedMemoryMap();

export function approvedMemorySegmentations() {
    return [...approvedMemoryByDisplayText.values()].map(item => ({
        version: item.version,
        displayText: item.displayText,
        reference: item.reference,
        fragments: [...item.fragments]
    }));
}

function segmentationRuleVersion(targetLength) {
    return 'healthy-rule-v14-boundary-graph-t' + targetLength
        + '-m' + SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH;
}

function normalizationProfile(version) {
    const id = String(version || 'CUV_TRAD').trim().toUpperCase();
    return TRANSLATION_NORMALIZATION_PROFILES[id]
        || { ...TRANSLATION_NORMALIZATION_PROFILES.DEFAULT, id };
}

function markedAnnotation(content, { squareNumericNotes = false, crossReferenceNotes = false } = {}) {
    const normalized = String(content || '').trim();
    return EDITORIAL_MARKER.test(normalized)
        || (squareNumericNotes && /^[\d\s，,、~～:：.．\-–—]+$/u.test(normalized))
        || (crossReferenceNotes
            && /^#?\s*[\p{Script=Han}A-Za-z]{1,8}\s*\d{1,3}\s*[:：]\s*\d{1,3}(?:\s*[-~～–—]\s*\d{1,3})?\s*[|｜]?$/u.test(normalized));
}

function removeMarkedParentheses(value, open, close, profile = {}) {
    let text = String(value || '');
    const openers = new Set(Array.isArray(open) ? open : [open]);
    const closers = new Set(Array.isArray(close) ? close : [close]);
    let removed = 0;
    let changed = true;
    while (changed) {
        changed = false;
        const stack = [];
        for (let index = 0; index < text.length; index += 1) {
            if (openers.has(text[index])) {
                stack.push(index);
                continue;
            }
            if (!closers.has(text[index]) || stack.length === 0) continue;
            const start = stack.pop();
            const content = text.slice(start + 1, index);
            if (markedAnnotation(content, profile)) {
                text = text.slice(0, start) + text.slice(index + 1);
                removed += 1;
                changed = true;
            }
            if (changed) break;
        }
    }
    return { text, removed };
}

function removeTrailingSourceArtifacts(value) {
    let text = String(value || '');
    const original = text;
    text = text.replace(/\s*[（(【[]\s*$/u, '');
    text = text.replace(/[—─－-]{2,}\s*$/u, '');
    return { text, removed: text !== original };
}

function removeEditorialTail(value, profile) {
    const text = String(value || '');
    if (profile.id !== 'TCV2010_TRAD') return { text, removed: false };
    const marker = text.search(TCV_EDITORIAL_TAIL);
    return marker < 0
        ? { text, removed: false }
        : { text: text.slice(0, marker).trimEnd(), removed: true };
}

function removeLeadingHeadingWithReference(value, profile) {
    const text = String(value || '');
    if (profile.leadingHeadingWithReference !== true) return { text, removed: false };
    const heading = text.match(
        /^([^\r\n（）()，。；：！？!?]{2,24})(?:\r?\n\s*)?(?=[（(]\s*#?\s*[\p{Script=Han}A-Za-z]{1,8}\s*\d{1,3}\s*[:：])/u
    );
    return heading
        ? { text: text.slice(heading[0].length), removed: true }
        : { text, removed: false };
}

function removeLeadingTranslationLabels(value) {
    let text = String(value || '').trimStart();
    let removed = false;
    let changed = true;
    while (changed && text) {
        changed = false;
        const bracketed = text.match(/^[【[]\s*([^】\]]+)\s*[】\]]\s*/u);
        if (bracketed && TRANSLATION_LABEL.test(bracketed[1])) {
            text = text.slice(bracketed[0].length).trimStart();
            removed = true;
            changed = true;
            continue;
        }
        const line = text.match(/^([^\r\n：:|｜]{1,40})(?:\r?\n|[：:|｜]\s*)/u);
        if (line && TRANSLATION_LABEL.test(line[1])) {
            text = text.slice(line[0].length).trimStart();
            removed = true;
            changed = true;
        }
    }
    return { text, removed };
}

export function removeLeadingGameSuperscription(value) {
    let text = String(value || '').trimStart();
    const pairs = [['（', '）'], ['(', ')']];
    let removed = false;
    let inspecting = true;
    while (inspecting) {
        inspecting = false;
        for (const [open, close] of pairs) {
            if (!text.startsWith(open)) continue;
            const end = text.indexOf(close, open.length);
            if (end < 0) continue;
            const heading = text.slice(open.length, end);
            if (!PSALM_SUPERSCRIPTION_MARKER.test(heading)) continue;
            text = text.slice(end + close.length).trimStart().replace(/^[。．.:：]\s*/u, '');
            removed = true;
            inspecting = true;
            break;
        }
    }
    return { text, removed };
}

export function normalizeScriptureForGame(value, { version = 'CUV_TRAD' } = {}) {
    const profile = normalizationProfile(version);
    const rawText = String(value || '').trim();
    const metadata = removeLeadingTranslationLabels(rawText);
    const heading = removeLeadingHeadingWithReference(metadata.text, profile);
    const editorialTail = removeEditorialTail(heading.text, profile);
    let workingText = editorialTail.text;
    let removedAnnotationCount = 0;
    for (const [open, close] of [[['（', '('], ['）', ')']], [['【', '['], ['】', ']']]]) {
        const result = removeMarkedParentheses(workingText, open, close, profile);
        workingText = result.text;
        removedAnnotationCount += result.removed;
    }
    const artifacts = removeTrailingSourceArtifacts(workingText);
    const superscription = removeLeadingGameSuperscription(artifacts.text);
    const normalizedText = superscription.text
        .replace(/[ \t]{2,}/gu, ' ')
        .trim();
    const nonScriptureOnly = NON_SCRIPTURE_ONLY.test(normalizedText)
        || (Boolean(normalizedText) && !VISIBLE_CHARACTER.test(normalizedText));
    const displayText = nonScriptureOnly ? '' : normalizedText;
    // Parentheses and quotations legitimately span verse boundaries in several
    // translations, so per-verse delimiter balance is not a source-integrity
    // signal. Only explicit residual editorial markers are reviewed here.
    const normalizationIssues = [];
    if (displayText && RESIDUAL_EDITORIAL_MARKER.test(displayText)) {
        normalizationIssues.push('RESIDUAL_EDITORIAL_TEXT');
    }
    return {
        rawText,
        displayText,
        rawHash: sha256(rawText),
        displayHash: sha256(displayText),
        normalizationVersion: SCRIPTURE_SEGMENTATION_NORMALIZATION_VERSION,
        translationVersion: profile.id,
        superscriptionRemoved: superscription.removed,
        removedAnnotationCount,
        nonScriptureMetadataRemoved: metadata.removed || removedAnnotationCount > 0
            || heading.removed || editorialTail.removed || artifacts.removed
            || superscription.removed || nonScriptureOnly,
        nonScriptureOnly,
        normalizationIssues: [...new Set(normalizationIssues)],
        sourceState: nonScriptureOnly
            ? 'OMITTED'
            : normalizationIssues.length ? 'REVIEW_REQUIRED' : 'CLEAN'
    };
}

function addBoundary(map, offset, kind, priority, extra = {}) {
    if (!Number.isInteger(offset) || offset <= 0) return;
    const current = map.get(offset);
    if (!current || priority > current.priority) {
        map.set(offset, { id: `b${offset}`, offset, kind, priority, ...extra });
    }
}

function codePointOffsets(text) {
    const offsets = [];
    let offset = 0;
    for (const character of text) {
        offsets.push({ character, start: offset, end: offset + character.length });
        offset += character.length;
    }
    return offsets;
}

function findProtectedSpans(text, terms) {
    const normalized = [...new Map((terms || [])
        .map(item => typeof item === 'string' ? { term: item } : item)
        .map(item => ({ ...item, term: String(item?.term || '').trim() }))
        .filter(item => item.term)
        .map(item => [item.term, item])).values()]
        .sort((left, right) => right.term.length - left.term.length
            || left.term.localeCompare(right.term, 'zh-Hant'));
    const spans = [];
    for (const item of normalized) {
        const term = item.term;
        let start = text.indexOf(term);
        while (start >= 0) {
            spans.push({
                term,
                start,
                end: start + term.length,
                source: 'LEXICON',
                category: String(item.category || ''),
                isolate: item.isolate === true
            });
            start = text.indexOf(term, start + 1);
        }
    }
    return spans.sort((left, right) => left.start - right.start || right.end - left.end);
}

function intlProtectedSpans(text) {
    if (!WORD_SEGMENTER) return [];
    return [...WORD_SEGMENTER.segment(text)]
        .filter(item => item.isWordLike && visibleLength(item.segment) >= 2)
        .map(item => ({
            term: String(item.segment),
            start: Number(item.index),
            end: Number(item.index) + String(item.segment).length,
            source: 'INTL'
        }));
}

function protectedAtOffset(spans, offset) {
    return spans.find(span => offset > span.start && offset < span.end) || null;
}

function segmenterCandidates(text, boundaries) {
    if (!WORD_SEGMENTER) return;
    for (const item of WORD_SEGMENTER.segment(text)) {
        const segment = String(item.segment || '');
        const end = Number(item.index) + segment.length;
        const count = visibleLength(segment);
        // Intl.Segmenter legitimately identifies many one-character Chinese
        // words (在、的、和、並). They must remain usable boundaries when a
        // punctuation-free clause would otherwise exceed the memory limit.
        // Curated Biblical names and places are still protected separately by
        // protectedAtOffset, so accepting the word boundary does not split a
        // known protected term.
        if (item.isWordLike && (count >= 2 || SAFE_SINGLE_CHARACTER_WORDS.has(segment))) {
            addBoundary(boundaries, end, 'WORD', 40, { segment });
        }
    }
}

function semanticClauseCandidates(text, boundaries) {
    for (const connector of SEMANTIC_CLAUSE_STARTS) {
        let start = text.indexOf(connector);
        while (start >= 0) {
            if (start > 0) addBoundary(boundaries, start, 'SEMANTIC_CLAUSE', 50, { connector });
            start = text.indexOf(connector, start + 1);
        }
    }
}

function safeMemoryUnitCandidates(text, boundaries) {
    for (const marker of SAFE_MEMORY_UNIT_STARTS) {
        let start = text.indexOf(marker);
        while (start >= 0) {
            if (start > 0) addBoundary(boundaries, start, 'MEMORY_UNIT_START', 72, { marker });
            start = text.indexOf(marker, start + 1);
        }
    }
}

function parentheticalCandidates(text, boundaries) {
    const pairs = new Map([['（', '）'], ['(', ')'], ['〈', '〉']]);
    const closers = new Set(pairs.values());
    for (const { character, start, end } of codePointOffsets(text)) {
        if (pairs.has(character)) addBoundary(boundaries, start, 'PARENTHETICAL_START', 94);
        if (closers.has(character)) addBoundary(boundaries, end, 'PARENTHETICAL_END', 94);
    }
}

function candidateBoundaries(text, spans) {
    const boundaries = new Map();
    for (const { character, end } of codePointOffsets(text)) {
        let boundaryEnd = end;
        while (boundaryEnd < text.length) {
            const next = String.fromCodePoint(text.codePointAt(boundaryEnd));
            if (!TRAILING_CLOSERS.has(next)) break;
            boundaryEnd += next.length;
        }
        // Punctuation is the first-choice boundary whenever it produces a
        // memory-sized card. Keep its score materially above an ordinary word
        // boundary so the adjustable eight-character target cannot turn
        // "行在地上，" into "行在｜地上，" merely to save one character.
        if (SENTENCE_END.has(character)) {
            addBoundary(boundaries, boundaryEnd, 'SENTENCE', 112, { punctuation: character });
        } else if (CLAUSE_END.has(character)) {
            addBoundary(boundaries, boundaryEnd, 'CLAUSE', 104, { punctuation: character });
        } else if (PHRASE_END.has(character)) {
            // The enumeration comma is a possible grouping boundary, not a
            // mandatory one. Keeping it distinct lets short list items merge
            // into readable cards while ordinary commas retain clause shape.
            const kind = character === '、' ? 'ENUMERATION' : 'PHRASE';
            addBoundary(boundaries, boundaryEnd, kind, kind === 'ENUMERATION' ? 80 : 96, {
                punctuation: character
            });
        }
    }
    segmenterCandidates(text, boundaries);
    semanticClauseCandidates(text, boundaries);
    safeMemoryUnitCandidates(text, boundaries);
    parentheticalCandidates(text, boundaries);
    const genealogyLike = /(?:生|所生|兒子|女兒|長子|次子|子孫|後裔|宗族)/u.test(text)
        && spans.some(item => item.category === 'PERSON');
    if (genealogyLike) {
        // Genealogies are lists rather than prose sentences. A complete name
        // is the lexical unit, so expose a boundary after each known person;
        // keep an immediately following possessive particle with the name.
        for (const span of spans.filter(item => item.category === 'PERSON')) {
            const suffixLength = text.slice(span.end).startsWith('的') ? 1 : 0;
            addBoundary(boundaries, span.end + suffixLength, 'ROSTER_TERM', 90, { term: span.term });
        }
    }
    // Long transliterated names are memory units in their own right. Offer
    // exact boundaries on both sides so a name such as 提革拉．毘列色 is not
    // fused to a title, verb, or the following place list.
    for (const span of spans.filter(item => item.isolate)) {
        addBoundary(boundaries, span.start, 'ENTITY_START', 115, { term: span.term });
        addBoundary(boundaries, span.end, 'ENTITY_END', 115, { term: span.term });
    }
    // A curated person/place/title is an indivisible word, but its outside
    // edges are useful optional cuts for long descriptions and rosters.
    for (const span of spans.filter(item => item.source === 'LEXICON')) {
        addBoundary(boundaries, span.start, 'ENTITY_TERM_START', 76, { term: span.term });
        const suffixLength = text.slice(span.end).startsWith('的') ? 1 : 0;
        addBoundary(boundaries, span.end + suffixLength, 'ENTITY_TERM_END', 76, { term: span.term });
    }
    addBoundary(boundaries, text.length, 'END', 120);
    return [...boundaries.values()]
        .filter(boundary => {
            if (boundary.offset > text.length) return false;
            const protectedSpan = protectedAtOffset(spans, boundary.offset);
            if (!protectedSpan) return true;
            if (protectedSpan.source === 'LEXICON') return false;
            return [
                'MEMORY_UNIT_START',
                'PARENTHETICAL_START',
                'PARENTHETICAL_END',
                'ENTITY_TERM_START',
                'ENTITY_TERM_END'
            ].includes(boundary.kind);
        })
        .filter(boundary => boundary.kind === 'END'
            || !LEADING_BOUNDARY_PUNCTUATION.test(text.slice(boundary.offset).trimStart()))
        .filter(boundary => boundary.kind !== 'PARENTHETICAL_END'
            || !/^的/u.test(text.slice(boundary.offset).trimStart()))
        .filter(boundary => boundary.kind === 'END'
            || !hasIncompleteSemanticEnd(text.slice(0, boundary.offset)))
        .filter(boundary => boundary.kind === 'END'
            || boundary.kind === 'ENTITY_END'
            || boundary.kind === 'ENTITY_TERM_END'
            || boundary.kind === 'PARENTHETICAL_END'
            || boundary.kind === 'ROSTER_TERM'
            || !DEPENDENT_FRAGMENT_START.test(visibleOptionText(text.slice(boundary.offset))))
        .filter(boundary => boundary.kind === 'END'
            || !LITURGICAL_CONTINUATION.test(text.slice(boundary.offset).trimStart()))
        .sort((left, right) => left.offset - right.offset);
}

function isSemanticPunctuationBoundary(boundary) {
    return boundary.kind === 'SENTENCE'
        || boundary.kind === 'PHRASE'
        || (boundary.kind === 'CLAUSE' && /[；;]/u.test(boundary.punctuation || ''));
}

function baseBoundaryClassification(text, boundary) {
    if (boundary.kind === 'END') {
        return { status: SCRIPTURE_BOUNDARY_STATES.MUST, reasonCodes: ['VERSE_END'] };
    }
    if (isSemanticPunctuationBoundary(boundary)) {
        return { status: SCRIPTURE_BOUNDARY_STATES.MUST, reasonCodes: ['SEMANTIC_PUNCTUATION'] };
    }

    const leftText = text.slice(0, boundary.offset);
    const rightText = text.slice(boundary.offset);
    const leftVisible = visibleOptionText(leftText);
    const rightVisible = visibleOptionText(rightText);
    const finalWord = WORD_SEGMENTER
        ? [...WORD_SEGMENTER.segment(leftVisible)].filter(item => item.isWordLike).at(-1)?.segment || ''
        : '';

    // These rules inspect both sides of a proposed cut. They are deliberately
    // evaluated before length scoring, so the target can never separate a
    // verb from its aspect marker or a possessive modifier from its noun.
    if (/^(?:了|著|過)/u.test(rightVisible)) {
        return { status: SCRIPTURE_BOUNDARY_STATES.FORBID, reasonCodes: ['ASPECT_PARTICLE_RIGHT'] };
    }
    if (/的$/u.test(leftVisible) && rightVisible) {
        return { status: SCRIPTURE_BOUNDARY_STATES.FORBID, reasonCodes: ['GENITIVE_RELATION'] };
    }
    if (CAUSATIVE_GOVERNOR.test(finalWord)) {
        return { status: SCRIPTURE_BOUNDARY_STATES.FORBID, reasonCodes: ['CAUSATIVE_RELATION'] };
    }

    if (boundary.kind === 'CLAUSE'
        || boundary.kind === 'SEMANTIC_CLAUSE'
        || boundary.kind === 'MEMORY_UNIT_START'
        || boundary.kind === 'PARENTHETICAL_START'
        || boundary.kind === 'PARENTHETICAL_END') {
        return { status: SCRIPTURE_BOUNDARY_STATES.PREFER, reasonCodes: [boundary.kind] };
    }
    if (boundary.kind === 'ENUMERATION'
        || boundary.kind === 'ENTITY_START'
        || boundary.kind === 'ENTITY_END'
        || boundary.kind === 'ENTITY_TERM_START'
        || boundary.kind === 'ENTITY_TERM_END'
        || boundary.kind === 'ROSTER_TERM') {
        return { status: SCRIPTURE_BOUNDARY_STATES.ALLOW, reasonCodes: [boundary.kind] };
    }
    if (boundary.kind === 'WORD') {
        const nextWord = WORD_SEGMENTER
            ? [...WORD_SEGMENTER.segment(rightVisible)].find(item => item.isWordLike)?.segment || ''
            : '';
        // Intl occasionally leaves the final character of an unlisted
        // transliterated name as a one-character "word" (米實利|密). Keep
        // those rare cuts reviewable; ordinary two-sided word boundaries are
        // deterministic lexical units and do not need an AI call.
        if (visibleLength(nextWord) === 1 && !SAFE_SINGLE_CHARACTER_WORDS.has(nextWord)) {
            return {
                status: SCRIPTURE_BOUNDARY_STATES.REVIEW,
                reasonCodes: ['SUSPICIOUS_SINGLE_CHARACTER_RIGHT']
            };
        }
        return { status: SCRIPTURE_BOUNDARY_STATES.ALLOW, reasonCodes: ['WORD_BOUNDARY'] };
    }
    return { status: SCRIPTURE_BOUNDARY_STATES.REVIEW, reasonCodes: ['UNCLASSIFIED_BOUNDARY'] };
}

function annotateBoundaryGraph(text, candidates, decisions = {}, humanApprovedOffsets = new Set()) {
    return candidates.map(boundary => {
        const base = baseBoundaryClassification(text, boundary);
        const decision = String(decisions[boundary.id] || '').toUpperCase();
        if (humanApprovedOffsets.has(boundary.offset) && base.status !== SCRIPTURE_BOUNDARY_STATES.FORBID) {
            return {
                ...boundary,
                status: SCRIPTURE_BOUNDARY_STATES.HUMAN_APPROVED,
                reasonCodes: [...base.reasonCodes, 'APPROVED_MEMORY_BOUNDARY']
            };
        }
        if (decision === 'FORBID'
            && ![SCRIPTURE_BOUNDARY_STATES.MUST, SCRIPTURE_BOUNDARY_STATES.HUMAN_APPROVED]
                .includes(base.status)) {
            return {
                ...boundary,
                status: SCRIPTURE_BOUNDARY_STATES.FORBID,
                reasonCodes: [...base.reasonCodes, 'REVIEW_FORBID'],
                reviewDecision: decision
            };
        }
        if (['KEEP', 'PREFER'].includes(decision)
            && base.status !== SCRIPTURE_BOUNDARY_STATES.FORBID) {
            return {
                ...boundary,
                status: SCRIPTURE_BOUNDARY_STATES.AI_APPROVED,
                reasonCodes: [...base.reasonCodes, 'REVIEW_APPROVED'],
                reviewDecision: decision
            };
        }
        return { ...boundary, ...base };
    });
}

function fragmentCost(fragment, boundary, targetLength, absoluteStart = 0, isolatedSpans = []) {
    const length = visibleLength(fragment);
    if (length === 0) return Number.POSITIVE_INFINITY;
    const distance = Math.abs(targetLength - length);
    let cost = distance * 2;
    if (length < Math.ceil(targetLength / 2)) cost += (targetLength - length) * 7;
    // When a parenthetical explanation follows a noun, starting the note in
    // the middle of a card often strands the following possessive phrase as
    // "的...". Prefer a card boundary immediately before the opening mark so
    // the final part of the note can remain attached to its relation phrase.
    if (/[（(〈]/u.test(fragment.slice(1))) cost += 250;
    // A memory/voice card over ten visible characters is never a harmless
    // alternative to a safe word or punctuation boundary. Keep it technically
    // possible only for an indivisible protected term, but make every safe
    // shorter route win deterministically.
    if (length > SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH) {
        cost += 1_000 + (length - SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH) * 100;
    }
    const absoluteEnd = absoluteStart + fragment.length;
    for (const span of isolatedSpans) {
        const overlaps = absoluteStart < span.end && absoluteEnd > span.start;
        if (!overlaps) continue;
        const isExactEntity = absoluteStart === span.start && absoluteEnd === span.end;
        const suffix = absoluteStart === span.start
            ? fragment.slice(span.end - absoluteStart)
            : '';
        const hasShortPossessiveTail = /^的[\p{Script=Han}]{1,2}[\p{P}\p{S}]*$/u.test(suffix);
        if (!isExactEntity && !hasShortPossessiveTail) cost += 2_000;
    }
    if (boundary?.status === SCRIPTURE_BOUNDARY_STATES.REVIEW) cost += 12;
    if (boundary?.status === SCRIPTURE_BOUNDARY_STATES.PREFER) cost -= 4;
    if ([SCRIPTURE_BOUNDARY_STATES.HUMAN_APPROVED, SCRIPTURE_BOUNDARY_STATES.AI_APPROVED]
        .includes(boundary?.status)) cost -= 10;
    return cost - Math.min(14, (boundary?.priority || 0) / 8);
}

function chooseBoundaries(
    text,
    candidates,
    decisions = {},
    targetLength = SCRIPTURE_SEGMENTATION_TARGET_LENGTH,
    isolatedSpans = []
) {
    const points = [{ id: 'b0', offset: 0, kind: 'START', priority: 120 }, ...candidates];
    const semanticPunctuationOffsets = points
        .filter(point => point.kind === 'SENTENCE'
            || point.kind === 'PHRASE'
            || (point.kind === 'CLAUSE' && /[；;]/u.test(point.punctuation || '')))
        .map(point => point.offset);
    const semanticRangeEdges = [...new Set([0, ...semanticPunctuationOffsets, text.length])]
        .sort((left, right) => left - right);
    const shortSemanticRanges = semanticRangeEdges.slice(1).map((end, index) => ({
        start: semanticRangeEdges[index],
        end
    })).filter(range => visibleLength(text.slice(range.start, range.end))
        <= SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH);
    const best = new Array(points.length).fill(null);
    best[0] = { cost: 0, previous: -1 };
    for (let endIndex = 1; endIndex < points.length; endIndex += 1) {
        const end = points[endIndex];
        if (end.status === SCRIPTURE_BOUNDARY_STATES.FORBID && end.offset !== text.length) continue;
        if (decisions[end.id] === 'FORBID' && end.offset !== text.length) continue;
        // Once punctuation has already bounded a complete memory-sized unit,
        // the adjustable target must not split it merely to move closer to
        // eight characters (for example "使少年人 | 有知識...").
        if (shortSemanticRanges.some(range => (
            end.offset > range.start && end.offset < range.end
        ))) continue;
        // Candidate generation has already removed boundaries that split a
        // protected term, leave dangling conjunctions, or start with dependent
        // particles. The remaining punctuation and word boundaries are safe
        // deterministic fallbacks; an AI decision may still prefer or forbid
        // one, but is no longer required for ordinary memory-sized cards.
        for (let startIndex = 0; startIndex < endIndex; startIndex += 1) {
            if (!best[startIndex]) continue;
            const start = points[startIndex];
            // A valid comma/semicolon/sentence boundary defines the clause
            // before card length is considered. Enumeration commas remain
            // soft so several short list items can share one card. Colons are
            // also soft because they often introduce text that must follow.
            if (semanticPunctuationOffsets.some(
                offset => offset > start.offset && offset < end.offset
            )) continue;
            const fragment = text.slice(start.offset, end.offset);
            let cost = best[startIndex].cost
                + fragmentCost(fragment, end, targetLength, start.offset, isolatedSpans);
            if (!Number.isFinite(cost)) continue;
            if (decisions[end.id] === 'PREFER') cost -= 18;
            if (decisions[end.id] === 'KEEP') cost -= 8;
            const next = { cost, previous: startIndex };
            if (!best[endIndex] || next.cost < best[endIndex].cost) best[endIndex] = next;
        }
    }
    const endIndex = points.length - 1;
    if (!best[endIndex]) return [];
    const chosen = [];
    let cursor = endIndex;
    while (cursor > 0) {
        chosen.push(points[cursor]);
        cursor = best[cursor].previous;
    }
    return chosen.reverse();
}

export function validateHealthySegmentation({
    text,
    fragments,
    boundaryOffsets,
    protectedTerms = [],
    includeIntlProtectedTerms = true
}) {
    const errors = [];
    const source = String(text || '');
    const offsets = Array.isArray(boundaryOffsets) ? boundaryOffsets : [];
    // Some CUV verse numbers contain only an explicitly marked textual note
    // (for example Mark 15:28). After the approved normalization removes that
    // note, an empty display text with no fragments is an exact, intentional
    // result—not a damaged segmentation and never a blank game option.
    if (source.length === 0 && Array.isArray(fragments) && fragments.length === 0 && offsets.length === 0) {
        return { valid: true, errors: [], brokenTerms: [] };
    }
    if (!Array.isArray(fragments) || fragments.length === 0) errors.push('NO_FRAGMENTS');
    if ((fragments || []).join('') !== source) errors.push('EXACT_REASSEMBLY_FAILED');
    if ((fragments || []).some(fragment => !visibleOptionText(fragment))) errors.push('EMPTY_VISIBLE_FRAGMENT');
    if ((fragments || []).slice(1)
        .some(fragment => LEADING_BOUNDARY_PUNCTUATION.test(String(fragment || '').trimStart()))) {
        errors.push('LEADING_BOUNDARY_PUNCTUATION');
    }
    if (offsets.some((offset, index) => !Number.isInteger(offset)
        || offset <= (index === 0 ? 0 : offsets[index - 1]) || offset > source.length)) {
        errors.push('INVALID_BOUNDARY_SEQUENCE');
    }
    if (offsets.at(-1) !== source.length) errors.push('MISSING_FINAL_BOUNDARY');
    const spans = [
        ...findProtectedSpans(source, protectedTerms),
        ...(includeIntlProtectedTerms ? intlProtectedSpans(source) : [])
    ];
    const brokenTerms = offsets
        .slice(0, -1)
        .map(offset => protectedAtOffset(spans, offset))
        .filter(Boolean)
        .map(span => span.term);
    if (brokenTerms.length) errors.push('PROTECTED_TERM_SPLIT');
    const semanticFragments = (fragments || []).map(visibleOptionText);
    const standaloneNames = new Set((protectedTerms || [])
        .filter(item => typeof item === 'object' && item?.isolate === true)
        .map(item => visibleOptionText(item.term)));
    const dependentWithoutStandaloneName = semanticFragments.some((fragment, index) => (
        index > 0
        && DEPENDENT_FRAGMENT_START.test(fragment)
        && !standaloneNames.has(semanticFragments[index - 1])
    ));
    if ((fragments || []).slice(0, -1).some(fragment => hasIncompleteSemanticEnd(fragment))
        || dependentWithoutStandaloneName) {
        errors.push('INCOMPLETE_SEMANTIC_FRAGMENT');
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)], brokenTerms: [...new Set(brokenTerms)] };
}

function boundaryOffsetsForFragments(fragments = []) {
    let offset = 0;
    return fragments.map(fragment => {
        offset += String(fragment || '').length;
        return offset;
    });
}

function includeApprovedBoundaryCandidates(candidates, offsets, textLength) {
    const byOffset = new Map(candidates.map(boundary => [boundary.offset, boundary]));
    for (const offset of offsets) {
        if (offset >= textLength || byOffset.has(offset)) continue;
        byOffset.set(offset, {
            id: `b${offset}`,
            offset,
            kind: 'APPROVED_MEMORY',
            priority: 120
        });
    }
    return [...byOffset.values()].sort((left, right) => left.offset - right.offset);
}

function segmentationReadiness({ normalization, validation, fragments, selectedBoundaries }) {
    const maximumVisibleLength = Math.max(0, ...(fragments || []).map(visibleLength));
    const internalBoundaries = (selectedBoundaries || []).filter(
        boundary => boundary.offset < normalization.displayText.length
    );
    const hasUnresolvedBoundary = internalBoundaries.some(
        boundary => boundary.status === SCRIPTURE_BOUNDARY_STATES.REVIEW
    );
    const hasForbiddenBoundary = internalBoundaries.some(
        boundary => boundary.status === SCRIPTURE_BOUNDARY_STATES.FORBID
    );
    const humanVerified = internalBoundaries.some(
        boundary => boundary.status === SCRIPTURE_BOUNDARY_STATES.HUMAN_APPROVED
    );
    const aiVerified = internalBoundaries.some(
        boundary => boundary.status === SCRIPTURE_BOUNDARY_STATES.AI_APPROVED
    );
    const integrityState = validation.valid ? 'VALID' : 'INVALID';
    const boundaryState = !validation.valid || hasForbiddenBoundary
        ? 'REJECTED'
        : hasUnresolvedBoundary
            ? 'REVIEW_REQUIRED'
            : humanVerified
                ? 'HUMAN_VERIFIED'
                : aiVerified
                    ? 'AI_VERIFIED'
                    : 'RULE_VERIFIED';
    const lengthState = maximumVisibleLength <= 8
        ? 'VOICE_READY'
        : maximumVisibleLength <= SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH
            ? 'VISUAL_READY'
            : 'LONG_EXCEPTION';
    const sourceClean = normalization.sourceState === 'CLEAN';
    const boundaryVerified = !['REJECTED', 'REVIEW_REQUIRED'].includes(boundaryState);
    const memoryReady = validation.valid && sourceClean && boundaryVerified
        && maximumVisibleLength <= SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH;
    const voiceReady = memoryReady && maximumVisibleLength <= 8;
    const confidence = !validation.valid || hasForbiddenBoundary || !sourceClean
        ? 'LOW'
        : hasUnresolvedBoundary
            ? 'MEDIUM'
            : 'HIGH';
    return {
        integrityState,
        boundaryState,
        lengthState,
        maximumVisibleLength,
        memoryReady,
        voiceReady,
        confidence
    };
}

export function segmentScriptureVerse(sourceText, {
    protectedTerms = protectedCoreTerms(),
    boundaryDecisions = {},
    targetLength = SCRIPTURE_SEGMENTATION_TARGET_LENGTH,
    version = 'CUV_TRAD'
} = {}) {
    const preferredLength = configuredTargetLength(targetLength);
    const normalization = normalizeScriptureForGame(sourceText, { version });
    const text = normalization.displayText;
    if (!text) {
        const omittedIssue = normalization.nonScriptureOnly
            ? 'NON_SCRIPTURE_TEXT_OMITTED'
            : 'EDITORIAL_NOTE_ONLY_VERSE';
        return {
            ...normalization,
            fragments: [], boundaryOffsets: [], candidateBoundaries: [],
            selectedBoundaries: [], protectedSpans: [],
            healthState: 'VALID', confidence: 'HIGH', issues: [omittedIssue],
            targetLength: preferredLength,
            memoryProfile: SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION,
            integrityState: 'VALID',
            boundaryState: 'NOT_APPLICABLE',
            lengthState: 'EMPTY',
            maximumVisibleLength: 0,
            memoryReady: false,
            voiceReady: false,
            ruleVersion: segmentationRuleVersion(preferredLength),
            lexiconVersion: SCRIPTURE_SEGMENTATION_LEXICON_VERSION
        };
    }
    const spans = [
        ...findProtectedSpans(text, protectedTerms),
        ...intlProtectedSpans(text)
    ];
    const approvedKey = `${normalization.translationVersion}\u0000${text}`;
    const approved = approvedMemoryByDisplayText.get(approvedKey);
    if (approved) {
        const boundaryOffsets = boundaryOffsetsForFragments(approved.fragments);
        const humanApprovedOffsets = new Set(boundaryOffsets.slice(0, -1));
        const candidates = annotateBoundaryGraph(
            text,
            includeApprovedBoundaryCandidates(candidateBoundaries(text, spans), boundaryOffsets, text.length),
            boundaryDecisions,
            humanApprovedOffsets
        );
        const candidatesByOffset = new Map(candidates.map(boundary => [boundary.offset, boundary]));
        const selectedBoundaries = boundaryOffsets.map(offset => candidatesByOffset.get(offset));
        const validation = validateHealthySegmentation({
            text,
            fragments: approved.fragments,
            boundaryOffsets,
            protectedTerms,
            // Intl.Segmenter can create false cross-boundary words in Chinese
            // (for example 撒但|從 becomes "但從"). Human-approved memory
            // boundaries may override those guesses, but never the curated
            // Biblical-name lexicon or deterministic integrity checks.
            includeIntlProtectedTerms: false
        });
        const withinMemoryLimit = approved.fragments.every(
            fragment => visibleLength(fragment) <= SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH
        );
        const forbiddenApprovedBoundary = selectedBoundaries.slice(0, -1).some(
            boundary => boundary.status === SCRIPTURE_BOUNDARY_STATES.FORBID
        );
        const valid = validation.valid && withinMemoryLimit && !forbiddenApprovedBoundary;
        const readiness = segmentationReadiness({
            normalization,
            validation,
            fragments: approved.fragments,
            selectedBoundaries
        });
        return {
            ...normalization,
            fragments: [...approved.fragments],
            boundaryOffsets,
            candidateBoundaries: candidates,
            boundaryGraph: candidates,
            selectedBoundaries,
            protectedSpans: spans,
            healthState: valid ? 'VALID' : 'NEEDS_REPAIR',
            ...readiness,
            issues: valid
                ? ['APPROVED_MEMORY_SEGMENTATION']
                : [...normalization.normalizationIssues, ...validation.errors,
                    ...(withinMemoryLimit ? [] : ['MEMORY_FRAGMENT_TOO_LONG']),
                    ...(forbiddenApprovedBoundary ? ['APPROVED_BOUNDARY_FORBIDDEN'] : [])],
            targetLength: preferredLength,
            memoryProfile: SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION,
            approvedReference: approved.reference,
            approvedVersion: approved.version,
            approvedBoundaryOffsets: [...humanApprovedOffsets],
            ruleVersion: segmentationRuleVersion(preferredLength),
            lexiconVersion: SCRIPTURE_SEGMENTATION_LEXICON_VERSION
        };
    }
    const candidates = annotateBoundaryGraph(
        text,
        candidateBoundaries(text, spans),
        boundaryDecisions
    );
    const selected = chooseBoundaries(
        text,
        candidates,
        boundaryDecisions,
        preferredLength,
        spans.filter(span => span.isolate)
    );
    const boundaryOffsets = selected.map(boundary => boundary.offset);
    const fragments = [];
    let start = 0;
    for (const boundary of selected) {
        fragments.push(text.slice(start, boundary.offset));
        start = boundary.offset;
    }
    const validation = validateHealthySegmentation({
        text,
        fragments,
        boundaryOffsets,
        protectedTerms,
        // Intl.Segmenter occasionally invents cross-boundary Chinese words
        // such as 上萬、大和、定基. It remains useful while generating
        // candidates, but final integrity is governed by the curated lexicon
        // plus the deterministic high-confidence boundaries above.
        includeIntlProtectedTerms: false
    });
    const longThreshold = SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH;
    const longFragments = fragments.filter(fragment => visibleLength(fragment) > longThreshold);
    const readiness = segmentationReadiness({
        normalization,
        validation,
        fragments,
        selectedBoundaries: selected
    });
    const issues = [...normalization.normalizationIssues, ...validation.errors];
    if (readiness.boundaryState === 'REVIEW_REQUIRED') issues.push('BOUNDARY_REVIEW_REQUIRED');
    if (longFragments.length) issues.push('LONG_FRAGMENT_EXCEPTION');
    const healthState = !validation.valid ? 'NEEDS_REPAIR' : longFragments.length ? 'VALID_LONG' : 'VALID';
    return {
        ...normalization,
        fragments,
        boundaryOffsets,
        candidateBoundaries: candidates,
        boundaryGraph: candidates,
        selectedBoundaries: selected,
        protectedSpans: spans,
        healthState,
        ...readiness,
        issues: [...new Set(issues)],
        targetLength: preferredLength,
        memoryProfile: SCRIPTURE_SEGMENTATION_MEMORY_PROFILE_VERSION,
        ruleVersion: segmentationRuleVersion(preferredLength),
        lexiconVersion: SCRIPTURE_SEGMENTATION_LEXICON_VERSION
    };
}

export function gridAvailability(fragmentCount) {
    const count = Number(fragmentCount) || 0;
    return {
        four: { allowed: count >= 4, ideal: count >= 4 },
        nine: {
            allowed: count >= 12,
            ideal: count >= 15,
            message: count < 12 ? '九宮格至少需要 12 片' : count < 15 ? '可遊玩，15 片以上體驗較佳' : null
        }
    };
}

export function mergePassageSegmentations(perVerse = []) {
    const merged = [];
    for (const verse of perVerse) {
        const verseFragments = Array.isArray(verse?.fragments) ? verse.fragments.filter(Boolean) : [];
        for (let index = 0; index < verseFragments.length; index += 1) {
            const fragment = String(verseFragments[index]);
            const previousIndex = merged.length - 1;
            const previous = merged[previousIndex] || '';
            // A verse ending in a colon introduces the next verse rather than
            // completing a playable thought. Merge only the first following
            // fragment and preserve every original character.
            if (index === 0 && previous && /[：:]\s*$/u.test(previous)
                && visibleLength(previous + fragment) <= SCRIPTURE_SEGMENTATION_MEMORY_MAX_LENGTH) {
                merged[previousIndex] = previous + fragment;
            } else {
                merged.push(fragment);
            }
        }
    }
    return merged;
}

export default segmentScriptureVerse;
