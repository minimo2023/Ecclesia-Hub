import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('game hub remains silent and does not expose a music control', async () => {
  const hub = await read('src/features/game/components/GameModeSelector.jsx');
  const home = await read('src/features/navigation/ModernFeatureMenu.jsx');
  const intro = await read('src/features/game/components/GameIntroScreen.jsx');

  assert.match(hub, /useEffect\(\(\) => \{\s*soundManager\.stopBGM\(\);/);
  assert.doesNotMatch(hub, /VolumeControl/);
  assert.doesNotMatch(hub, /playBGM\('theme'\)/);
  assert.doesNotMatch(home, /playBGM\('theme'\)/);
  assert.doesNotMatch(intro, /playBGM\('theme'\)/);
});

test('question music is limited to classic and speed after mode selection', async () => {
  const app = await read('src/App.jsx');
  const desktopSetup = await read('src/features/game/components/StartScreen.jsx');
  const mobileSetup = await read('src/features/game/components/mobile/MobileStartScreen.jsx');
  const manager = await read('src/features/game/components/GameManager.jsx');
  const audio = await read('src/features/game/hooks/useGameAudio.js');

  for (const source of [app, desktopSetup, mobileSetup]) {
    assert.match(source, /gameMode === 'classic' \|\| .*gameMode === 'speed'/);
  }

  assert.match(desktopSetup, /hasQuestionMusic \? <VolumeControl \/> : null/);
  assert.match(mobileSetup, /hasQuestionMusic \? <button/);
  assert.match(manager, /backgroundMusicEnabled: isClassicMode \|\| isSpeedMode/);
  assert.match(audio, /if \(backgroundMusicEnabled\) soundManager\.playBGM\('tension'\)/);
});

test('expedition keeps its independent stage music', async () => {
  const expeditionMusic = await read('src/features/expedition/hooks/useExpeditionMusic.js');

  assert.match(expeditionMusic, /soundManager\.playBGMFromUrl\(newTrack, true\)/);
});
