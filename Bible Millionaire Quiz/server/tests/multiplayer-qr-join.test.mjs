import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildMultiplayerJoinUrl,
    getMultiplayerRoomCodeFromLocation,
    isMultiplayerJoinPath,
    normalizeMultiplayerRoomCode
} from '../../src/features/GameOnline/multiplayerJoinLink.js';

test('multiplayer QR join URL uses the public join path and six-digit room code', () => {
    assert.equal(
        buildMultiplayerJoinUrl('https://xtc-biblestudy.idv.tw/', '123456'),
        'https://xtc-biblestudy.idv.tw/game/multiplayer/join?room=123456'
    );
});

test('multiplayer join page reads a valid room code from the scanned URL', () => {
    assert.equal(
        getMultiplayerRoomCodeFromLocation({ search: '?room=654321' }),
        '654321'
    );
});

test('invalid room codes are never embedded or prefilled', () => {
    assert.equal(normalizeMultiplayerRoomCode('12345'), '');
    assert.equal(normalizeMultiplayerRoomCode('12345a'), '');
    assert.equal(buildMultiplayerJoinUrl('https://example.com/', '12345'), '');
    assert.equal(getMultiplayerRoomCodeFromLocation({ search: '?room=javascript:alert(1)' }), '');
});

test('desktop and mobile SPA join paths are recognized', () => {
    assert.equal(isMultiplayerJoinPath('/game/multiplayer/join'), true);
    assert.equal(isMultiplayerJoinPath('/m/game/multiplayer/join/'), true);
    assert.equal(isMultiplayerJoinPath('/game/multiplayer/host'), false);
});
