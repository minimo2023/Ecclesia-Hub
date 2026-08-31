export const SPEECH_RATE_OPTIONS = Object.freeze([0.75, 0.88, 1, 1.15, 1.3]);
export const DEFAULT_SPEECH_RATE = 0.88;

const SPEECH_RATE_STORAGE_KEY = 'scripture_tools_speech_rate';
const SPEECH_VOICE_STORAGE_KEY = 'scripture_tools_speech_voice';
const EDITORIAL_NOTE_MARKERS = '或譯|或作|有古卷|古卷|原文|註|意即|小字|異文';

const EDITORIAL_NOTE_PATTERNS = [
    /\(\[[0-9.]+\][^)]*\)/gu,
    /（\[[0-9.]+\][^）]*）/gu,
    new RegExp(`\\((?:[^()]*(?:${EDITORIAL_NOTE_MARKERS})[^()]*)\\)`, 'gu'),
    new RegExp(`（(?:[^（）]*(?:${EDITORIAL_NOTE_MARKERS})[^（）]*)）`, 'gu'),
    /\[[0-9.]+\]/gu
];

export function stripScriptureSpeechAnnotations(value) {
    let text = String(value || '')
        .replace(/<[^>]*>/gu, ' ');

    for (const pattern of EDITORIAL_NOTE_PATTERNS) {
        text = text.replace(pattern, ' ');
    }

    return text
        .replace(/[ \t]{2,}/gu, ' ')
        .replace(/ *\n+ */gu, ' ')
        .replace(/\s+([，。；：！？、])/gu, '$1')
        .trim();
}

export function normalizeSpeechRate(value) {
    const numeric = Number(value);
    return SPEECH_RATE_OPTIONS.includes(numeric) ? numeric : DEFAULT_SPEECH_RATE;
}

export function loadSpeechRate() {
    if (typeof window === 'undefined') return DEFAULT_SPEECH_RATE;
    try {
        return normalizeSpeechRate(window.localStorage.getItem(SPEECH_RATE_STORAGE_KEY));
    } catch {
        return DEFAULT_SPEECH_RATE;
    }
}

export function saveSpeechRate(value) {
    const normalized = normalizeSpeechRate(value);
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(SPEECH_RATE_STORAGE_KEY, String(normalized));
        } catch {
            // Private browsing or device policy may disable local storage.
        }
    }
    return normalized;
}

export function loadSpeechVoiceUri() {
    if (typeof window === 'undefined') return '';
    try {
        return window.localStorage.getItem(SPEECH_VOICE_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

export function saveSpeechVoiceUri(value) {
    const voiceUri = String(value || '');
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(SPEECH_VOICE_STORAGE_KEY, voiceUri);
        } catch {
            // Voice selection is an optional device preference.
        }
    }
    return voiceUri;
}

export function listChineseSpeechVoices(voices) {
    return [...(voices || [])]
        .filter(voice => String(voice?.lang || '').toLowerCase().startsWith('zh'))
        .sort((left, right) => {
            const leftTaiwan = String(left.lang).toLowerCase().startsWith('zh-tw') ? 0 : 1;
            const rightTaiwan = String(right.lang).toLowerCase().startsWith('zh-tw') ? 0 : 1;
            if (leftTaiwan !== rightTaiwan) return leftTaiwan - rightTaiwan;
            return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant');
        });
}

export function getVersePauseMs(verse) {
    if (verse?.paragraphBreakAfter) return 620;
    if (verse?.lineBreakAfter) return 260;
    return 80;
}
