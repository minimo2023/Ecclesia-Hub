const json = async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
        throw new Error(body.message || body.error || '服務暫時無法使用');
    }
    return body;
};

export const getAuthToken = () => sessionStorage.getItem('authToken')
    || localStorage.getItem('authToken')
    || localStorage.getItem('token')
    || '';

export const isSignedIn = () => Boolean(getAuthToken());

const recordingHeaders = ({ idempotencyKey, jsonBody = false } = {}) => {
    const headers = {};
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (jsonBody) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return headers;
};

const recordingRequest = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
    const isForm = body instanceof FormData;
    const response = await fetch(`/api/scripture-tools${path}`, {
        method,
        headers: recordingHeaders({ idempotencyKey, jsonBody: body !== undefined && !isForm }),
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
    });
    const parsed = await json(response);
    return parsed.data;
};

const guestKey = () => {
    const storageKey = 'scripture_order_lab_guest_v1';
    let value = localStorage.getItem(storageKey);
    if (!value) {
        value = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}_guest`;
        localStorage.setItem(storageKey, value);
    }
    return value;
};

const orderHeaders = ({ jsonBody = false, idempotencyKey } = {}) => {
    const headers = { 'X-Scripture-Guest-Key': guestKey() };
    const token = localStorage.getItem('authToken');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (jsonBody) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return headers;
};

const orderRequest = async (path, { method = 'GET', body } = {}) => {
    const response = await fetch(`/api/scripture-tools/order${path}`, {
        method,
        headers: orderHeaders({ jsonBody: body !== undefined }),
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const parsed = await json(response);
    return parsed.data;
};

export const createRequestKey = prefix => `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export async function fetchChapter({ book, chapter, version }) {
    const params = new URLSearchParams({ book, chapter: String(chapter), version });
    const body = await fetch(`/api/content/scripture?${params}` ).then(json);
    return Array.isArray(body.data) ? body.data : [];
}

export async function searchScripture({ query, version, book, limit = 30 }) {
    const params = new URLSearchParams({ q: query, version, limit: String(limit) });
    if (book) params.set('book', book);
    const body = await fetch(`/api/content/scripture/search?${params}`).then(json);
    return body.results || [];
}

export const fetchOrderBootstrap = () => orderRequest('/bootstrap');

export const previewOrderCustomPassage = customRange => orderRequest('/custom-preview', {
    method: 'POST', body: customRange
});

export const createOrderSession = input => orderRequest('/sessions', { method: 'POST', body: input });

export const selectOrderOption = (sessionId, input) => orderRequest(`/sessions/${sessionId}/selections`, {
    method: 'POST', body: input
});

export const requestOrderDemo = (sessionId, input) => orderRequest(`/sessions/${sessionId}/demo`, {
    method: 'POST', body: input
});

export const abandonOrderSession = (sessionId, input) => orderRequest(`/sessions/${sessionId}/abandon`, {
    method: 'POST', body: input
});

export const publishOrderScore = (sessionId, input) => orderRequest(`/sessions/${sessionId}/publish`, {
    method: 'POST', body: input
});

export const fetchOrderLeaderboard = scope => orderRequest(`/lab-leaderboard?scope=${encodeURIComponent(scope)}`);

export const createOrderShare = sessionId => orderRequest('/lab-shares', {
    method: 'POST', body: { sessionId }
});

export const fetchScriptureToolsStatus = async () => {
    const body = await fetch('/api/scripture-tools/status').then(json);
    return body.features || {};
};

export const fetchCurrentMember = async () => {
    const response = await fetch('/api/auth/me', { headers: recordingHeaders() });
    return json(response);
};

export const saveMemberRecording = ({ result, range }) => {
    const body = new FormData();
    body.append('audio', result.blob, `${result.filenameBase}.${result.extension}`);
    body.append('version', result.version);
    body.append('book', result.book);
    body.append('chapter', String(result.chapter));
    body.append('verseStart', String(range.verseStart));
    body.append('verseEnd', String(range.verseEnd));
    body.append('durationMs', String(result.durationMs || 0));
    return recordingRequest('/recordings', {
        method: 'POST',
        body,
        idempotencyKey: result.clientRequestId
    });
};

export const fetchMyRecordings = () => recordingRequest('/recordings/mine');
export const updateMemberRecording = (recordingId, input) => recordingRequest(`/recordings/${recordingId}`, { method: 'PATCH', body: input });
export const deleteMemberRecording = recordingId => recordingRequest(`/recordings/${recordingId}`, { method: 'DELETE' });
export const createRecordingShare = (recordingId, expiresInDays) => recordingRequest(`/recordings/${recordingId}/shares`, { method: 'POST', body: { expiresInDays } });
export const revokeRecordingShare = shareId => recordingRequest(`/shares/${shareId}`, { method: 'DELETE' });
export const fetchSharedRecording = token => recordingRequest(`/shares/${encodeURIComponent(token)}`);
export const fetchSharePlaybackTicket = token => recordingRequest(`/shares/${encodeURIComponent(token)}/playback-ticket`, { method: 'POST' });
export const fetchRecordingPlaybackTicket = recordingId => recordingRequest(`/recordings/${recordingId}/playback-ticket`, { method: 'POST' });

export const fetchCommunityRecordings = input => {
    const params = new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    return recordingRequest(`/community/recordings?${params}`);
};
export const setRecordingReaction = (recordingId, reactionType) => recordingRequest(`/community/recordings/${recordingId}/reactions`, { method: 'POST', body: { reactionType } });
export const fetchRecordingComments = recordingId => recordingRequest(`/community/recordings/${recordingId}/comments`);
export const addRecordingComment = (recordingId, content) => recordingRequest(`/community/recordings/${recordingId}/comments`, {
    method: 'POST', body: { content }, idempotencyKey: createRequestKey('comment')
});
export const deleteRecordingComment = commentId => recordingRequest(`/community/comments/${commentId}`, { method: 'DELETE' });
export const reportCommunityRecording = (recordingId, reason = 'OTHER') => recordingRequest(`/community/recordings/${recordingId}/reports`, { method: 'POST', body: { reason } });
export const blockRecordingMember = blockedUserId => recordingRequest('/community/blocks', { method: 'POST', body: { blockedUserId } });
export const fetchRecordingNotifications = () => recordingRequest('/notifications');
export const markRecordingNotificationsRead = () => recordingRequest('/notifications/read', { method: 'POST' });
export const fetchRecordingModerationQueue = () => recordingRequest('/moderation/queue');
export const fetchModerationPlaybackTicket = recordingId => recordingRequest(`/moderation/recordings/${recordingId}/playback-ticket`, { method: 'POST' });
export const moderateCommunityRecording = (recordingId, action, reason = '') => recordingRequest(`/moderation/recordings/${recordingId}`, { method: 'POST', body: { action, reason } });
export const moderateRecordingComment = (commentId, action, reason = '') => recordingRequest(`/moderation/comments/${commentId}`, { method: 'POST', body: { action, reason } });

export const playbackUrl = ticket => `/api/scripture-tools/audio/${encodeURIComponent(ticket)}`;
