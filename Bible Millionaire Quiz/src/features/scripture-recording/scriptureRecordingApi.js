const parseResponse = async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
        throw new Error(body.message || body.error || '朗讀服務暫時無法使用');
    }
    return body.data ?? body;
};

export const getScriptureAuthToken = () => sessionStorage.getItem('authToken')
    || localStorage.getItem('authToken')
    || localStorage.getItem('token')
    || '';

export const isScriptureMemberSignedIn = () => Boolean(getScriptureAuthToken());

const headers = ({ json = false, idempotencyKey } = {}) => {
    const result = {};
    const token = getScriptureAuthToken();
    if (token) result.Authorization = `Bearer ${token}`;
    if (json) result['Content-Type'] = 'application/json';
    if (idempotencyKey) result['Idempotency-Key'] = idempotencyKey;
    return result;
};

const request = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
    const isForm = body instanceof FormData;
    const response = await fetch(`/api/scripture-tools${path}`, {
        method,
        headers: headers({ json: body !== undefined && !isForm, idempotencyKey }),
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
    });
    return parseResponse(response);
};

export const fetchScriptureRecordingStatus = async () => {
    const response = await fetch('/api/scripture-tools/status');
    const result = await parseResponse(response);
    return result.features || {};
};

export const fetchMyScriptureRecordings = recordingKind => request(`/recordings/mine${recordingKind ? `?kind=${encodeURIComponent(recordingKind)}` : ''}`);

export const deleteScriptureRecording = recordingId => request(`/recordings/${encodeURIComponent(recordingId)}`, { method: 'DELETE' });

export const saveScriptureRecording = result => {
    const body = new FormData();
    body.append('audio', result.blob, `${result.filenameBase}.${result.extension}`);
    body.append('version', result.version);
    body.append('book', result.book);
    body.append('chapter', String(result.chapter));
    body.append('verseStart', String(result.verseStart));
    body.append('verseEnd', String(result.verseEnd));
    body.append('durationMs', String(result.durationMs || 0));
    if (result.recordingKind) body.append('recordingKind', result.recordingKind);
    return request('/recordings', {
        method: 'POST',
        body,
        idempotencyKey: result.clientRequestId
    });
};

export const fetchScripturePlaybackTicket = recordingId => request(`/recordings/${recordingId}/playback-ticket`, { method: 'POST' });

export const scripturePlaybackUrl = ticket => `/api/scripture-tools/audio/${encodeURIComponent(ticket)}`;

export const createScriptureRecordingShare = (recordingId, payload, idempotencyKey) => request(`/recordings/${recordingId}/shares`, {
    method: 'POST',
    body: payload,
    idempotencyKey
});

export const revokeScriptureRecordingShare = shareId => request(`/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' });

export const fetchScriptureRecordingShare = token => request(`/shares/${encodeURIComponent(token)}`);

export const fetchScriptureSharePlaybackTicket = token => request(`/shares/${encodeURIComponent(token)}/playback-ticket`, { method: 'POST' });

export const canonicalScriptureShareOrigin = location => {
    const source = location || window.location;
    const url = new URL(source.origin);
    if (url.port === '5174') url.port = '5173';
    return url.origin;
};

export const scriptureBlessingShareUrl = (token, location) => {
    const origin = canonicalScriptureShareOrigin(location);
    return `${origin}/b/${encodeURIComponent(token)}`;
};

const VERSION_ALIASES = Object.freeze({
    unv: 'CUV_TRAD',
    cuv: 'CUV_TRAD',
    CUV_TRAD: 'CUV_TRAD',
    ncv: 'CNV_TRAD',
    CNV_TRAD: 'CNV_TRAD',
    tcv2019: 'TCV2019_TRAD',
    tcv2010: 'TCV2019_TRAD',
    TCV2010_TRAD: 'TCV2019_TRAD',
    TCV2019_TRAD: 'TCV2019_TRAD',
    lcc: 'LCC_TRAD',
    LCC_TRAD: 'LCC_TRAD'
});

export const canonicalScriptureVersion = version => VERSION_ALIASES[version] || String(version || '');
