export const MULTIPLAYER_JOIN_PATH = '/game/multiplayer/join';

export function normalizeMultiplayerRoomCode(value) {
    const roomCode = String(value ?? '').trim();
    return /^\d{6}$/.test(roomCode) ? roomCode : '';
}

export function buildMultiplayerJoinUrl(origin, roomCode) {
    const normalizedRoomCode = normalizeMultiplayerRoomCode(roomCode);
    if (!normalizedRoomCode) return '';

    const url = new URL(MULTIPLAYER_JOIN_PATH, origin);
    url.searchParams.set('room', normalizedRoomCode);
    return url.toString();
}

export function getMultiplayerRoomCodeFromLocation(locationLike) {
    if (!locationLike) return '';
    return normalizeMultiplayerRoomCode(
        new URLSearchParams(locationLike.search || '').get('room')
    );
}

export function isMultiplayerJoinPath(pathname = '') {
    return /^\/(?:m\/)?game\/multiplayer\/join\/?$/.test(pathname);
}
