import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('desktop game hub groups existing modes without changing their identifiers', async () => {
  const source = await read('src/features/game/components/GameModeSelector.jsx');

  for (const id of ['classic', 'speed', 'expedition', 'practice', 'multiplayer', 'scripture-rain']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }

  assert.match(source, /id: 'scripture-order'[\s\S]*?section: 'memory'[\s\S]*?available: scriptureOrderEnabled/);
  assert.match(source, /label: '問答挑戰'/);
  assert.match(source, /label: '經文記憶'/);
  assert.match(source, /label: '連線同樂'/);
  assert.match(source, /modes\.filter\(\(mode\) => mode\.section === activeSection\)/);
});

test('mobile game hub exposes the same categories and routes scripture memory separately', async () => {
  const source = await read('mobile-app/src/pages/GamesPage.jsx');

  for (const id of ['classic', 'speed', 'expedition', 'casual', 'multiplayer', 'scripture-rain']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }

  assert.match(source, /id: 'scripture-order'[\s\S]*?section: 'memory'[\s\S]*?available: scriptureOrderEnabled/);
  assert.match(source, /disabled=\{mode\.available === false\}/);
  assert.match(source, /navigate\('\/game\/expedition'\)/);
  assert.match(source, /navigate\('\/game\/multiplayer\/join'\)/);
  assert.match(source, /navigate\('\/game\/scripture-rain'\)/);
  assert.match(source, /navigate\('\/game\/scripture-order'\)/);
  assert.match(source, /navigate\('\/game\/setup'/);
});

test('desktop home card presents the unified game name', async () => {
  const source = await read('src/features/navigation/ModernFeatureMenu.jsx');

  assert.match(source, /title: '聖經智匯遊戲'/);
  assert.match(source, /subtitle: 'BIBLE GAMES'/);
  assert.match(source, /button: '進入遊戲'/);
});
