import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(
    new URL('../../src/App.jsx', import.meta.url),
    'utf8'
);
const globalStyles = readFileSync(
    new URL('../../src/index.css', import.meta.url),
    'utf8'
);

test('desktop app shell keeps ordinary full-page views on a light canvas', () => {
    assert.match(appSource, /className="app-shell-container bg-slate-50"/);
    assert.doesNotMatch(appSource, /currentView === 'feature-menu' \? 'bg-slate-50' : 'bg-slate-950'/);
    assert.match(globalStyles, /background-color:\s*#f8fafc/);
});
