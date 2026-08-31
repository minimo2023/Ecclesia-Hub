export const DEVOTIONAL_BACKGROUND_TRACKS = Object.freeze([
    { id: 'rainy-night-echo', title: '雨夜回聲', fileName: '雨夜回聲.mp3' },
    { id: 'rainy-night-slow-beat', title: '雨夜慢拍', fileName: '雨夜慢拍.mp3' },
    { id: 'rain-window-bass-alt', title: '雨窗低音・版本二', fileName: '雨窗低音 (1).mp3' },
    { id: 'rain-window-bass', title: '雨窗低音', fileName: '雨窗低音.mp3' },
    { id: 'rainy-night-piano-alt', title: 'Rainy Night Piano・版本二', fileName: 'Rainy Night Piano_1.mp3' },
    { id: 'rainy-night-piano', title: 'Rainy Night Piano', fileName: 'Rainy Night Piano.mp3' }
]);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getLocalDevotionalMusicDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getDailyDevotionalTrackIndex(dayKey, trackCount) {
    if (!Number.isInteger(trackCount) || trackCount <= 0) return -1;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey));
    if (!match) return 0;

    const [, year, month, day] = match;
    const dayNumber = Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / ONE_DAY_MS);
    return ((dayNumber % trackCount) + trackCount) % trackCount;
}

export function buildDevotionalTrackUrl(fileName) {
    return `/audio/devotion/${encodeURIComponent(String(fileName))}`;
}

export function normalizeDevotionalMusicVolume(value, fallback = 0.16) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(0.5, Math.max(0, parsed));
}
