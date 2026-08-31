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
    return sessionStorage.getItem('authToken')
        || localStorage.getItem('authToken')
        || localStorage.getItem('token')
        || '';
}

async function request(path, { method = 'GET', body } = {}) {
    const token = authToken();
    const response = await fetch(`${API_BASE_URL}/api/scripture-tools/order${path}`, {
        method,
        headers: {
            'X-Scripture-Guest-Key': guestKey(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
        const error = new Error(payload.message || '經文四宮格暫時無法使用');
        error.code = payload.error || `HTTP_${response.status}`;
        throw error;
    }
    return payload.data;
}

export function scriptureOrderRequestKey(prefix) {
    return `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function loadScriptureOrderBootstrap() {
    return request('/bootstrap');
}

export function loadScriptureOrderHistory(limit = 8) {
    const query = new URLSearchParams({ limit: String(limit) });
    return request(`/history?${query.toString()}`);
}

export function loadScriptureOrderChapter(book, chapter) {
    const query = new URLSearchParams({ book, chapter: String(chapter) });
    return request(`/chapter?${query.toString()}`);
}

export function previewScriptureOrderRange(customRange) {
    return request('/custom-preview', { method: 'POST', body: customRange });
}

export function createScriptureOrderSession({ passageId, customRange, gridSize = 4, challengeDifficulty = 'SIMPLE' }) {
    return request('/sessions', {
        method: 'POST',
        body: {
            mode: 'practice',
            layoutDifficulty: 'RANDOM',
            gridSize,
            challengeDifficulty,
            passageId,
            customRange,
            clientSessionKey: scriptureOrderRequestKey('memory-session')
        }
    });
}

export function selectScriptureOrderOption(sessionId, optionToken) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/selections`, {
        method: 'POST',
        body: {
            action: 'select',
            optionToken,
            idempotencyKey: scriptureOrderRequestKey('memory-pick')
        }
    });
}

export function resumeScriptureOrderSession(sessionId) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/resume`, {
        method: 'POST',
        body: { idempotencyKey: scriptureOrderRequestKey('memory-resume') }
    });
}

export function requestScriptureOrderHint(sessionId) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/hints`, {
        method: 'POST',
        body: { idempotencyKey: scriptureOrderRequestKey('memory-hint') }
    });
}

export function abandonScriptureOrderSession(sessionId) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/abandon`, {
        method: 'POST',
        body: { idempotencyKey: scriptureOrderRequestKey('memory-abandon') }
    });
}

export function forfeitScriptureOrderSession(sessionId) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/forfeit`, {
        method: 'POST',
        body: { idempotencyKey: scriptureOrderRequestKey('memory-forfeit') }
    });
}
