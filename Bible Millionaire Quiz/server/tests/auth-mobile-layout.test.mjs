import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sharedAuthSource = readFileSync(
    new URL('../../src/features/auth/AuthModal.jsx', import.meta.url),
    'utf8'
);
const mobileAuthSource = readFileSync(
    new URL('../../mobile-app/src/components/auth/AuthModal.jsx', import.meta.url),
    'utf8'
);

for (const [name, source] of [['shared authentication modal', sharedAuthSource]]) {
    test(`${name} is portalled above page layout and remains scrollable on iPhone`, () => {
        assert.match(source, /createPortal/);
        assert.match(source, /fixed inset-0[^"\n]*overflow-y-auto/);
        assert.match(source, /safe-area-inset-top/);
        assert.match(source, /safe-area-inset-bottom/);
        assert.match(source, /min-h-0[^"\n]*overflow-hidden/);
        assert.match(source, /touch-pan-y overflow-y-auto/);
        assert.match(source, /WebkitOverflowScrolling:\s*'touch'/);
        assert.match(source, /document\.body/);
    });
}

test('mobile app reuses the shared authentication modal', () => {
    assert.match(mobileAuthSource, /export \{ default \} from ['"]\.\.\/\.\.\/\.\.\/\.\.\/src\/features\/auth\/AuthModal\.jsx['"]/);
});

test('shared mobile authentication uses a vertical card instead of the clipped two-column layout', () => {
    assert.match(sharedAuthSource, /行動版：直向卡片/);
    assert.doesNotMatch(sharedAuthSource, /w-\[38%\]/);
    assert.doesNotMatch(sharedAuthSource, /min\(90dvh, 370px\)/);
});
