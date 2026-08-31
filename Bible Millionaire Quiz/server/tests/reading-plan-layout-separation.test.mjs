import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../../src/features/reading-plans/ReadingPlansIndex.jsx', import.meta.url), 'utf8');
const desktopSource = readFileSync(new URL('../../src/features/reading-plans/ReadingPlansDesktopCatalog.jsx', import.meta.url), 'utf8');
const mobileAdapterSource = readFileSync(new URL('../../mobile-app/src/pages/reading-plans/ReadingPlansRouterAdapter.jsx', import.meta.url), 'utf8');

test('desktop reading-plan creation keeps a full-page two-column layout', () => {
  assert.match(indexSource, /layout = 'desktop'/);
  assert.match(indexSource, /<ReadingPlansDesktopCatalog/);
  assert.match(desktopSource, /lg:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(400px,0\.85fr\)\]/);
  assert.match(desktopSource, /variant="desktop"/);
});

test('mobile reading-plan route explicitly retains the step-by-step wizard', () => {
  assert.match(mobileAdapterSource, /layout="mobile"/);
  assert.match(indexSource, /layout === 'mobile'/);
  assert.match(indexSource, /<ReadingPlansCatalog/);
});
