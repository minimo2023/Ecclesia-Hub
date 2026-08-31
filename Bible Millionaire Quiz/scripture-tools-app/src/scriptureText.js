export function stripSpeechAnnotations(value) {
    let text = String(value || '');
    let previous;
    do {
        previous = text;
        text = text
            .replace(/（[^（）]*）/gu, '')
            .replace(/\([^()]*\)/gu, '');
    } while (text !== previous);

    return text
        .replace(/[ \t]{2,}/gu, ' ')
        .trim();
}

export const SPEECH_RATE_OPTIONS = Object.freeze([0.75, 0.88, 1, 1.15, 1.3]);
export const DEFAULT_SPEECH_RATE = 0.88;
const SPEECH_RATE_STORAGE_KEY = 'scripture_tools_speech_rate';
const SPEECH_VOICE_STORAGE_KEY = 'scripture_tools_speech_voice';

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
        try { window.localStorage.setItem(SPEECH_RATE_STORAGE_KEY, String(normalized)); } catch { /* Device storage may be unavailable. */ }
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
        try { window.localStorage.setItem(SPEECH_VOICE_STORAGE_KEY, voiceUri); } catch { /* Voice preference is optional. */ }
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
