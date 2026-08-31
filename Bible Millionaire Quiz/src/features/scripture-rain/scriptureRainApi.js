const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function guestKey() {
    const storageKey = 'scripture_memory_guest_v1';
    let value = localStorage.getItem(storageKey);
    if (!value) {
        value = globalThis.crypto?.randomUUID?.() || `memory_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(storageKey, value);
    }
    return value;
}

function authToken() {
    return sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || localStorage.getItem('token') || '';
}

async function request(path, options = {}) {
    const token = authToken();
    const response = await fetch(`${API_BASE_URL}/api/scripture-rain${path}`, {
        ...options,
        headers: {
            'X-Scripture-Guest-Key': guestKey(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data?.success) {
        const error = new Error(data?.message || '經文雨服務暫時無法使用');
        error.code = data?.error || `HTTP_${response.status}`;
        error.status = response.status;
        throw error;
    }
    return data;
}

export function loadScriptureRainBootstrap() {
    return request('/bootstrap');
}

export function loadScriptureRainChapter(book, chapter) {
    const query = new URLSearchParams({ book, chapter: String(chapter) });
    return request(`/chapter?${query.toString()}`);
}

export function previewScriptureRainPassage(input) {
    return request('/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
    });
}

export function createScriptureRainSession(input) {
    const source = typeof input === 'string' ? { passageId: input } : input;
    const body = {
        ...source,
        challengeDifficulty: source?.challengeDifficulty || 'SIMPLE',
        challengeSpeed: source?.challengeSpeed || 'SLOW',
        clientSessionKey: requestKey('rain-session')
    };
    return request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

export function startScriptureRainSession(sessionId) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: requestKey('rain-start') })
    });
}

export function forfeitScriptureRainSession(sessionId) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/forfeit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: requestKey('rain-forfeit') })
    });
}

export function recordScriptureRainEvent(sessionId, event) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event, idempotencyKey: requestKey(`rain-${event.type}`) })
    });
}

export function requestKey(prefix) {
    return `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function spendScriptureRainHint({ sessionId, requestId, token }) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/hints`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
    });
}
