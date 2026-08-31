const PUNCTUATION_ONLY = /^[\p{P}\p{S}\s]+$/u;
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{Script=Han}]/gu;

export const SEGMENTATION_LEARNING_VERSION = 'scripture-segmentation-learning-v1';

function visibleLength(value) {
    return (String(value || '').match(VISIBLE_CHARACTER) || []).length;
}

function normalizeVerse(verse) {
    return {
        verse: Number(verse?.verse),
        text: String(verse?.text || ''),
        machineFragments: Array.isArray(verse?.machineFragments)
            ? verse.machineFragments.map(fragment => String(fragment || ''))
            : []
    };
}

function boundaryPair(fragments, boundaryNumber) {
    const index = Number(boundaryNumber) - 1;
    return {
        left: String(fragments[index] || ''),
        right: String(fragments[index + 1] || '')
    };
}

export function buildSegmentationLearningPrompt(passages, examples) {
    const safePassages = (Array.isArray(passages) ? passages : []).map(passage => ({
        passageId: String(passage.passageId || ''),
        verses: (Array.isArray(passage.verses) ? passage.verses : []).map(normalizeVerse)
    }));
    const learning = {
        positiveBoundaries: Array.isArray(examples?.positiveBoundaries) ? examples.positiveBoundaries : [],
        rejectedBoundaries: Array.isArray(examples?.rejectedBoundaries) ? examples.rejectedBoundaries : [],
        protectedPhrases: Array.isArray(examples?.protectedPhrases) ? examples.protectedPhrases : []
    };

    return `你是繁體中文經文記憶遊戲的離線切片候選標註器，不解經、不改寫。

你只用已審核的正例、反例與保護詞組學習切點。模型輸出只是候選，不會直接進入正式題庫。

硬規則：
1. 每一節的 fragments 依序直接串接後，必須逐字等於該節 text。
2. 不得增刪、改寫、移動字元，不得跨節。
3. 一般片段以 3 至 8 個可讀字元為佳；只有為了保留完整語意單位時才可 2 或 9 至 12 字。
4. 優先在句號、分號、問號、驚嘆號、冒號、逗號後切；其次在自然詞組、並列或轉折邊界切。
5. 不拆開人名、稱謂、否定詞與動詞、動詞與受詞、介系結構或保護詞組。
6. 避免只有標點、單獨一字或意義殘缺的片段。
7. machineFragments 是機器的基礎切片；只調整不自然的邊界，不得改變經文內容。
8. uncertainBoundaries 列出你無法確定的邊界，使用從 1 開始的邊界編號。
9. 只輸出以下 JSON 形狀，不要加入輸入未要求的欄位：
{"results":[{"passageId":"輸入的 passageId","verses":[{"verse":1,"fragments":["..."],"uncertainBoundaries":[]}]}]}

LEARNING_EXAMPLES_JSON:
${JSON.stringify(learning)}

INPUT_JSON:
${JSON.stringify(safePassages)}`;
}

export const LOCAL_SEGMENTATION_OUTPUT_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        results: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    passageId: { type: 'string' },
                    verses: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                verse: { type: 'integer' },
                                fragments: {
                                    type: 'array',
                                    minItems: 1,
                                    items: { type: 'string' }
                                },
                                uncertainBoundaries: {
                                    type: 'array',
                                    items: { type: 'integer' }
                                }
                            },
                            required: ['verse', 'fragments', 'uncertainBoundaries'],
                            additionalProperties: false
                        }
                    }
                },
                required: ['passageId', 'verses'],
                additionalProperties: false
            }
        }
    },
    required: ['results'],
    additionalProperties: false
});

export function convertFlatCandidateToPerVerse(passage, flatFragments) {
    const verses = (Array.isArray(passage?.verses) ? passage.verses : []).map(normalizeVerse);
    const fragments = Array.isArray(flatFragments) ? flatFragments.map(value => String(value || '')) : [];
    const sourceText = verses.map(verse => verse.text).join('');
    if (!fragments.length || fragments.some(fragment => !fragment) || fragments.join('') !== sourceText) {
        return null;
    }

    const results = [];
    let fragmentIndex = 0;
    for (const verse of verses) {
        const verseFragments = [];
        let reconstructed = '';
        while (fragmentIndex < fragments.length && reconstructed.length < verse.text.length) {
            const fragment = fragments[fragmentIndex];
            if ((reconstructed + fragment).length > verse.text.length) return null;
            reconstructed += fragment;
            verseFragments.push(fragment);
            fragmentIndex += 1;
        }
        if (reconstructed !== verse.text) return null;
        results.push({ verse: verse.verse, fragments: verseFragments, uncertainBoundaries: [] });
    }
    if (fragmentIndex !== fragments.length) return null;
    return { passageId: String(passage.passageId || ''), verses: results };
}

export function validateSegmentationCandidate(passages, candidate, examples = {}) {
    const errors = [];
    const warnings = [];
    const expectedPassages = new Map((Array.isArray(passages) ? passages : []).map(passage => [
        String(passage.passageId || ''),
        passage
    ]));
    const results = Array.isArray(candidate?.results) ? candidate.results : [];
    const seenPassages = new Set();

    for (const result of results) {
        const passageId = String(result?.passageId || '');
        const passage = expectedPassages.get(passageId);
        if (!passage) {
            errors.push({ code: 'UNEXPECTED_PASSAGE', passageId });
            continue;
        }
        if (seenPassages.has(passageId)) errors.push({ code: 'DUPLICATE_PASSAGE', passageId });
        seenPassages.add(passageId);

        const expectedVerses = new Map((passage.verses || []).map(verse => [Number(verse.verse), normalizeVerse(verse)]));
        const resultVerses = Array.isArray(result?.verses) ? result.verses : [];
        const seenVerses = new Set();
        for (const verseResult of resultVerses) {
            const verseNumber = Number(verseResult?.verse);
            const expectedVerse = expectedVerses.get(verseNumber);
            if (!expectedVerse) {
                errors.push({ code: 'UNEXPECTED_VERSE', passageId, verse: verseNumber });
                continue;
            }
            if (seenVerses.has(verseNumber)) errors.push({ code: 'DUPLICATE_VERSE', passageId, verse: verseNumber });
            seenVerses.add(verseNumber);

            const fragments = Array.isArray(verseResult?.fragments)
                ? verseResult.fragments.map(fragment => String(fragment || ''))
                : [];
            if (!fragments.length || fragments.some(fragment => !fragment)) {
                errors.push({ code: 'EMPTY_FRAGMENT', passageId, verse: verseNumber });
                continue;
            }
            if (fragments.join('') !== expectedVerse.text) {
                errors.push({ code: 'EXACT_REASSEMBLY_FAILED', passageId, verse: verseNumber });
            }
            fragments.forEach((fragment, index) => {
                const length = visibleLength(fragment);
                if (PUNCTUATION_ONLY.test(fragment)) {
                    errors.push({ code: 'PUNCTUATION_ONLY_FRAGMENT', passageId, verse: verseNumber, fragment: index + 1 });
                } else if (length <= 2) {
                    warnings.push({ code: 'VERY_SHORT_FRAGMENT', passageId, verse: verseNumber, fragment: index + 1, length });
                } else if (length > 12) {
                    warnings.push({ code: 'LONG_FRAGMENT', passageId, verse: verseNumber, fragment: index + 1, length });
                }
            });

            for (let boundary = 1; boundary < fragments.length; boundary += 1) {
                const pair = boundaryPair(fragments, boundary);
                const rejected = (examples.rejectedBoundaries || []).find(item => (
                    item.left === pair.left && item.right === pair.right
                ));
                if (rejected) {
                    errors.push({
                        code: 'REJECTED_BOUNDARY_REPEATED',
                        passageId,
                        verse: verseNumber,
                        boundary,
                        reason: rejected.reason
                    });
                }
            }
        }
        for (const verseNumber of expectedVerses.keys()) {
            if (!seenVerses.has(verseNumber)) errors.push({ code: 'MISSING_VERSE', passageId, verse: verseNumber });
        }
    }
    for (const passageId of expectedPassages.keys()) {
        if (!seenPassages.has(passageId)) errors.push({ code: 'MISSING_PASSAGE', passageId });
    }

    return {
        valid: errors.length === 0,
        exact: !errors.some(error => error.code === 'EXACT_REASSEMBLY_FAILED'),
        errors,
        warnings
    };
}
