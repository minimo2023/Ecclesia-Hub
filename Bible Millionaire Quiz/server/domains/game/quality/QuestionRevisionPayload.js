function parseJsonValue(value, fallback) {
    if (value === undefined) return undefined;
    if (value === null) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        throw new Error('INVALID_REVISION_JSON');
    }
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function readInput(body, camel, snake = camel) {
    if (hasOwn(body, camel)) return body[camel];
    if (snake !== camel && hasOwn(body, snake)) return body[snake];
    return undefined;
}

/**
 * Only content fields may be changed from the admin repair workbench.
 * Scripture identity and evidence fields intentionally remain bound to the
 * original question so a content edit cannot silently change its source.
 */
export function buildQuestionRevisionCandidate(body = {}) {
    const candidate = {};
    const scalarFields = [
        ['question', 'question'],
        ['answer', 'answer'],
        ['difficulty', 'difficulty'],
        ['category', 'category'],
        ['explanation', 'explanation']
    ];

    for (const [target, input] of scalarFields) {
        const value = readInput(body, input);
        if (value !== undefined) candidate[target] = value;
    }

    const options = readInput(body, 'options');
    if (options !== undefined) {
        const parsed = parseJsonValue(options, []);
        if (!Array.isArray(parsed)) throw new Error('INVALID_REVISION_OPTIONS');
        candidate.options = parsed;
    }

    const distractorsPool = readInput(body, 'distractorsPool', 'distractors_pool');
    if (distractorsPool !== undefined) {
        const parsed = parseJsonValue(distractorsPool, []);
        if (!Array.isArray(parsed)) throw new Error('INVALID_REVISION_DISTRACTORS');
        candidate.distractors_pool = parsed;
    }

    return candidate;
}

export default buildQuestionRevisionCandidate;
