export const MAX_SCRIPTURE_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_SCRIPTURE_AUDIO_DURATION_MS = 5 * 60 * 1000;

const TYPE_DETAILS = Object.freeze({
    'audio/webm': { mimeType: 'audio/webm', extension: 'webm' },
    'video/webm': { mimeType: 'audio/webm', extension: 'webm' },
    'audio/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
    'application/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
    'audio/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
    'video/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
    'audio/x-m4a': { mimeType: 'audio/mp4', extension: 'm4a' },
    'audio/mpeg': { mimeType: 'audio/mpeg', extension: 'mp3' },
    'audio/mp3': { mimeType: 'audio/mpeg', extension: 'mp3' },
    'audio/wav': { mimeType: 'audio/wav', extension: 'wav' },
    'audio/x-wav': { mimeType: 'audio/wav', extension: 'wav' },
    'audio/vnd.wave': { mimeType: 'audio/wav', extension: 'wav' }
});

const EXTENSION_DETAILS = Object.freeze({
    webm: TYPE_DETAILS['audio/webm'],
    ogg: TYPE_DETAILS['audio/ogg'],
    oga: TYPE_DETAILS['audio/ogg'],
    m4a: TYPE_DETAILS['audio/mp4'],
    mp4: TYPE_DETAILS['audio/mp4'],
    mp3: TYPE_DETAILS['audio/mpeg'],
    wav: TYPE_DETAILS['audio/wav'],
    wave: TYPE_DETAILS['audio/wav']
});

export const SCRIPTURE_AUDIO_ACCEPT = '.m4a,.mp3,.wav,.webm,.ogg,audio/mp4,audio/mpeg,audio/wav,audio/webm,audio/ogg';

function uploadError(message) {
    const error = new Error(message);
    error.name = 'ScriptureAudioUploadError';
    return error;
}

export function scriptureAudioFileDetails(file) {
    if (!file || typeof file.size !== 'number' || file.size <= 0) {
        throw uploadError('請選擇有效的音檔。');
    }
    if (file.size > MAX_SCRIPTURE_AUDIO_BYTES) {
        throw uploadError('音檔不可超過 5MB。');
    }

    const type = String(file.type || '').toLowerCase().split(';')[0].trim();
    const extension = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
    const details = TYPE_DETAILS[type] || EXTENSION_DETAILS[extension];
    if (!details) {
        throw uploadError('只接受 M4A、MP3、WAV、WebM 或 Ogg 音檔。');
    }
    return details;
}

export async function measureScriptureAudioDuration(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
        const durationSeconds = await new Promise((resolve, reject) => {
            const audio = new Audio();
            const timeout = window.setTimeout(() => reject(uploadError('讀取音檔時間過久，請重新選擇。')), 12000);
            const finish = callback => {
                window.clearTimeout(timeout);
                audio.removeAttribute('src');
                audio.load();
                callback();
            };
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => {
                const duration = Number(audio.duration);
                finish(() => resolve(duration));
            };
            audio.onerror = () => finish(() => reject(uploadError('無法讀取這個音檔，請確認檔案未損壞。')));
            audio.src = objectUrl;
        });

        if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
            throw uploadError('音檔至少需要 1 秒。');
        }
        const durationMs = Math.round(durationSeconds * 1000);
        if (durationMs > MAX_SCRIPTURE_AUDIO_DURATION_MS) {
            throw uploadError('音檔不可超過 5 分鐘。');
        }
        return durationMs;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
