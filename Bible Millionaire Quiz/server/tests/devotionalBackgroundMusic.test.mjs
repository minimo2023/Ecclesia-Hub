import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    buildDevotionalTrackUrl,
    DEVOTIONAL_BACKGROUND_TRACKS,
    getDailyDevotionalTrackIndex,
    normalizeDevotionalMusicVolume
} from '../../src/features/devotion/devotionalBackgroundMusic.js';

test('devotional music playlist has stable unique ids and files', () => {
    assert.ok(DEVOTIONAL_BACKGROUND_TRACKS.length >= 1);
    assert.equal(new Set(DEVOTIONAL_BACKGROUND_TRACKS.map(track => track.id)).size, DEVOTIONAL_BACKGROUND_TRACKS.length);
    assert.equal(new Set(DEVOTIONAL_BACKGROUND_TRACKS.map(track => track.fileName)).size, DEVOTIONAL_BACKGROUND_TRACKS.length);
});

test('every devotional mp3 is registered in the shared playlist', () => {
    const audioDirectory = fileURLToPath(new URL('../../public/audio/devotion/', import.meta.url));
    const filesOnDisk = readdirSync(audioDirectory).filter(file => file.toLowerCase().endsWith('.mp3')).sort();
    const registeredFiles = DEVOTIONAL_BACKGROUND_TRACKS.map(track => track.fileName).sort();
    assert.deepEqual(registeredFiles, filesOnDisk);
});

test('daily devotional track advances predictably and remains in range', () => {
    const count = DEVOTIONAL_BACKGROUND_TRACKS.length;
    const first = getDailyDevotionalTrackIndex('2026-08-29', count);
    const second = getDailyDevotionalTrackIndex('2026-08-30', count);
    assert.ok(first >= 0 && first < count);
    assert.equal(second, (first + 1) % count);
});

test('devotional track URL safely encodes file names', () => {
    assert.equal(
        buildDevotionalTrackUrl('雨窗低音 (1).mp3'),
        '/audio/devotion/%E9%9B%A8%E7%AA%97%E4%BD%8E%E9%9F%B3%20(1).mp3'
    );
});

test('devotional music volume stays within the quiet background range', () => {
    assert.equal(normalizeDevotionalMusicVolume(-1), 0);
    assert.equal(normalizeDevotionalMusicVolume(0.22), 0.22);
    assert.equal(normalizeDevotionalMusicVolume(1), 0.5);
    assert.equal(normalizeDevotionalMusicVolume(null), 0.16);
    assert.equal(normalizeDevotionalMusicVolume('not-a-number'), 0.16);
});
