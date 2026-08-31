#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || process.cwd());
const targets = [
    {
        label: 'desktop',
        directory: path.join(root, 'dist', 'assets'),
        pattern: /(\{code:"tcv2019",name:"[^"]+",source:"fhl"\})(\])/g,
        addition: ',{code:"lcc",name:"呂振中譯本",source:"fhl"}',
        marker: 'code:"lcc",name:"呂振中譯本",source:"fhl"'
    },
    {
        label: 'mobile',
        directory: path.join(root, 'mobile-app', 'dist', 'assets'),
        pattern: /(\{code:`tcv2019`,name:`[^`]+`,source:`fhl`\})(\])/g,
        addition: ',{code:`lcc`,name:`呂振中譯本`,source:`fhl`}',
        marker: 'code:`lcc`,name:`呂振中譯本`,source:`fhl`'
    }
];

function listJavaScriptFiles(directory) {
    if (!fs.existsSync(directory)) {
        throw new Error(`Bundle directory does not exist: ${directory}`);
    }

    return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => path.join(directory, entry.name));
}

const results = [];

for (const target of targets) {
    const files = listJavaScriptFiles(target.directory);
    const alreadyPatched = files.filter((file) =>
        fs.readFileSync(file, 'utf8').includes(target.marker)
    );

    if (alreadyPatched.length > 0) {
        if (alreadyPatched.length !== 1) {
            throw new Error(`${target.label}: expected one patched bundle, found ${alreadyPatched.length}`);
        }
        results.push({ label: target.label, status: 'already-patched', file: alreadyPatched[0] });
        continue;
    }

    const matches = [];
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const count = [...content.matchAll(target.pattern)].length;
        if (count > 0) {
            matches.push({ file, content, count });
        }
    }

    const totalMatches = matches.reduce((sum, item) => sum + item.count, 0);
    if (matches.length !== 1 || totalMatches !== 1) {
        throw new Error(
            `${target.label}: expected exactly one translation list, found ${totalMatches} in ${matches.length} bundle(s)`
        );
    }

    const match = matches[0];
    const updated = match.content.replace(target.pattern, `$1${target.addition}$2`);
    if (!updated.includes(target.marker)) {
        throw new Error(`${target.label}: bundle patch verification failed`);
    }

    fs.writeFileSync(match.file, updated, 'utf8');
    results.push({ label: target.label, status: 'patched', file: match.file });
}

console.log(JSON.stringify({ root, results }, null, 2));
