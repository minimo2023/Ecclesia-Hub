import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = [
    'Bible Millionaire Quiz/server',
    'Bible Millionaire Quiz/scripts',
    'steward-ops/XIT-Worker/backend',
    'platform'
];
const failures = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['node_modules','dist','.git','coverage','tests','public','tools','uploads','legacy','scratch'].includes(entry.name)) continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(target);
        else if (['.js','.mjs','.cjs'].includes(path.extname(entry.name).toLowerCase())) {
            try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }); }
            catch (error) { failures.push(`${path.relative(root, target)}\n${String(error.stderr || error.message)}`); }
        }
    }
}

for (const relative of roots) {
    const directory = path.join(root, relative);
    if (fs.existsSync(directory)) walk(directory);
}
try {
    execFileSync(process.execPath, ['--check', path.join(root, 'Bible Millionaire Quiz/server/public/question-bank-admin.js')], { stdio: 'pipe' });
} catch (error) {
    failures.push(`Bible Millionaire Quiz/server/public/question-bank-admin.js\n${String(error.stderr || error.message)}`);
}
if (failures.length) throw new Error(`Node syntax validation failed:\n${failures.join('\n')}`);
console.log('Node syntax validation passed.');
