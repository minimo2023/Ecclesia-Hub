import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const entryPoints = [
    'Bible Millionaire Quiz/dist/index.html',
    'Bible Millionaire Quiz/mobile-app/dist/index.html',
    'Bible Millionaire Quiz/server/public/index.html'
];

for (const relative of entryPoints) {
    const target = path.join(root, relative);
    const html = fs.readFileSync(target, 'utf8');
    if (!/<html|<!doctype/i.test(html) || html.length < 500) throw new Error(`Recovered artifact is invalid: ${relative}`);
    const base = path.dirname(target);
    for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
        const reference = match[1];
        if (/^(?:https?:|data:|\/api\/)/i.test(reference)) continue;
        const resolved = reference.startsWith('/')
            ? path.join(base, reference.replace(/^\/+/, ''))
            : path.resolve(base, reference);
        if (!fs.existsSync(resolved) && !reference.startsWith('/')) throw new Error(`Missing recovered asset: ${relative} -> ${reference}`);
    }
}

const adminHtml = fs.readFileSync(path.join(root, 'Bible Millionaire Quiz/server/public/index.html'), 'utf8');
if (!adminHtml.includes('question-bank-admin.js') || !adminHtml.includes('question-bank-admin.css')) {
    throw new Error('Question bank management assets are not linked from the production shell');
}
console.log('Recovered production artifacts verified.');
