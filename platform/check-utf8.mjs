import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = ['Bible Millionaire Quiz/server', 'Bible Millionaire Quiz/src', 'Bible Millionaire Quiz/mobile-app/src', 'steward-ops/XIT-Worker/backend', 'platform'];
const extensions = new Set(['.js','.mjs','.cjs','.jsx','.ts','.tsx','.json','.css','.html','.md','.sql','.yml','.yaml']);
const decoder = new TextDecoder('utf-8', { fatal: true });
const failures = [];

// These frozen production bundles intentionally return U+FFFD when JavaScript
// encounters an invalid Unicode scalar. Keep the exception narrow and verify
// the exact count so a newly introduced replacement character still fails.
const expectedReplacementCharacters = new Map([
    ['Bible Millionaire Quiz/src/recovered-production/DevotionCard-BK9gdQFO.js', 2],
    ['Bible Millionaire Quiz/src/recovered-production/DevotionCard-BN97dyj1.js', 2],
    ['Bible Millionaire Quiz/src/recovered-production/DevotionCard-Dcta8t7L.js', 2]
]);

function relativePath(target) {
    return path.relative(root, target).split(path.sep).join('/');
}

function validateTextFile(target) {
    const relative = relativePath(target);

    try {
        const text = decoder.decode(fs.readFileSync(target));
        const replacementCount = [...text].filter(character => character === '\uFFFD').length;
        const expectedCount = expectedReplacementCharacters.get(relative) ?? 0;

        if (replacementCount !== expectedCount) {
            failures.push(`${relative} contains ${replacementCount} replacement character(s); expected ${expectedCount}`);
        }
    } catch (error) {
        failures.push(`${relative}: ${error.message}`);
    }
}

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['node_modules','dist','.git','coverage','assets','games','tools','uploads','public-mobile'].includes(entry.name)) continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(target);
        else if (extensions.has(path.extname(entry.name).toLowerCase())) {
            validateTextFile(target);
        }
    }
}

function checkFile(target) {
    validateTextFile(target);
}

for (const relative of roots) {
    const directory = path.join(root, relative);
    if (fs.existsSync(directory)) walk(directory);
}
for (const relative of ['Bible Millionaire Quiz/server/public/question-bank-admin.js', 'Bible Millionaire Quiz/server/public/question-bank-admin.css']) {
    checkFile(path.join(root, relative));
}
if (failures.length) throw new Error(`UTF-8 validation failed:\n${failures.join('\n')}`);
console.log('UTF-8 validation passed.');
