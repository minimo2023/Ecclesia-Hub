/**
 * Deep debug: Character-level comparison
 */

const normalizeScriptureRef = (ref) => {
    if (!ref) return '';
    return ref
        .replace(/\s+/g, '')
        .replace(/[：:]/g, ':')
        .replace(/[－\-–—]/g, '-')
        .toLowerCase();
};

// Test case: Proverbs 3:5-6
const dbRef = '箴言 3:5-6';
const candidateRef = '箴言 3:5-6';

const normalizedDb = normalizeScriptureRef(dbRef);
const normalizedCandidate = normalizeScriptureRef(candidateRef);

console.log('=== Character-level Analysis ===');
console.log(`DB Reference: [${dbRef}]`);
console.log(`Candidate:    [${candidateRef}]`);
console.log('');
console.log(`Normalized DB:        [${normalizedDb}] (length: ${normalizedDb.length})`);
console.log(`Normalized Candidate: [${normalizedCandidate}] (length: ${normalizedCandidate.length})`);
console.log('');

// Character by character comparison
console.log('=== Char-by-char Comparison ===');
const maxLen = Math.max(normalizedDb.length, normalizedCandidate.length);
let mismatchFound = false;
for (let i = 0; i < maxLen; i++) {
    const dbChar = normalizedDb[i] || '(empty)';
    const candChar = normalizedCandidate[i] || '(empty)';
    const dbCode = normalizedDb.charCodeAt(i) || 0;
    const candCode = normalizedCandidate.charCodeAt(i) || 0;
    const match = dbChar === candChar;

    if (!match) {
        mismatchFound = true;
        console.log(`Position ${i}: DB=[${dbChar}](${dbCode}) vs Cand=[${candChar}](${candCode}) - MISMATCH!`);
    }
}

if (!mismatchFound) {
    console.log('All characters match!');
}

console.log('');
console.log(`Direct comparison: ${normalizedDb === normalizedCandidate}`);
console.log(`includes check: ${[normalizedDb].includes(normalizedCandidate)}`);
