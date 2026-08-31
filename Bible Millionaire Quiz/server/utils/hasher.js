import crypto from 'crypto';

/**
 * Normalizes text for semantic comparison
 * Removes punctuation, whitespace, and converts to lowercase
 */
export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        // 1. Remove punctuation and common conversational noise
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()？。，、！「」『』[\]【】]/g, "")
        .replace(/\s+/g, "")
        .replace(/請問|根據經文|根據聖經|根據記載|記載說|記載著/g, "")
        // 2. Numerical Normalization (Dual-track)
        .replace(/一/g, '1').replace(/二|兩/g, '2').replace(/三/g, '3')
        .replace(/四/g, '4').replace(/五/g, '5').replace(/六/g, '6')
        .replace(/七/g, '7').replace(/八/g, '8').replace(/九/g, '9')
        .replace(/十/g, '10').replace(/百/g, '100').replace(/千/g, '1000')
        // 3. Measure Unit De-noising (防止: 三個 vs 三次 vs 三位)
        .replace(/個|位|隻|條|座|次|年|月|日|天|歲/g, "");
}

/**
 * Generates semantic signature (sig_semantic)
 */
export function generateSigSemantic(book, chapter, stem, options, answer) {
    // Core semantic identity: Book + Chapter + Normalized Stem
    // Different options don't make it a different semantic question usually, 
    // but the answer definitely does.
    const normalizedStem = normalizeText(stem);
    const normalizedAnswer = normalizeText(answer);

    const signature = `${book}|${chapter}|${normalizedStem}|${normalizedAnswer}`;
    return crypto.createHash('md5').update(signature).digest('hex');
}

/**
 * Generates exact hash (hash_exact) for strict deduplication
 */
export function generateHashExact(book, chapter, stem, options, answer) {
    // Strict identity: All fields matter
    const sortedOptions = [...options].sort(); // Sort options to ignore order
    const payload = JSON.stringify({
        book,
        chapter,
        stem,
        options: sortedOptions,
        answer
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
}

export default {
    normalizeText,
    generateSigSemantic,
    generateHashExact
};
