import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../mobile-app/src/App.jsx', import.meta.url), 'utf8');

test('mobile route loading keeps the shared layout and bottom navigation mounted', () => {
    assert.match(app, /<main className="relative flex flex-1 flex-col overflow-hidden">\s*<Suspense fallback=\{<PageFallback \/>\}>\s*<Outlet \/>/);
    assert.match(app, /<\/main>\s*<BottomNav \/>/);
    assert.match(app, /function FocusLayout\(\)[\s\S]*?<Suspense fallback=\{<PageFallback \/>\}>\s*<Outlet \/>/);
});

test('mobile route loading uses a light reduced-motion-friendly skeleton', () => {
    assert.match(app, /bg-slate-50/);
    assert.match(app, /motion-safe:animate-pulse/);
    assert.match(app, /頁面載入中/);
    assert.doesNotMatch(app, /animate-spin rounded-full border-4/);
});
