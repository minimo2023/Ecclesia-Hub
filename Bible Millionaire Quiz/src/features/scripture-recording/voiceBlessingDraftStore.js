const DATABASE_NAME = 'ecclesia-scripture-recording';
const DATABASE_VERSION = 1;
const STORE_NAME = 'voice-blessing-drafts';
const ACTIVE_DRAFT_KEY = 'active';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function indexedDbAvailable() {
    return typeof globalThis.indexedDB !== 'undefined';
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('無法存取本機草稿。'));
    });
}

function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('本機草稿交易已取消。'));
        transaction.onerror = () => reject(transaction.error || new Error('無法更新本機草稿。'));
    });
}

async function openDatabase() {
    if (!indexedDbAvailable()) return null;
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    return requestResult(request);
}

export function recordingForDraft(result) {
    if (!result?.blob) return null;
    const { url: _temporaryUrl, ...persisted } = result;
    return persisted;
}

export function voiceBlessingDraftMatches(draft, selection) {
    if (!draft?.context || !selection) return false;
    return String(draft.context.version) === String(selection.version)
        && String(draft.context.book) === String(selection.book)
        && Number(draft.context.chapter) === Number(selection.chapter);
}

export async function loadVoiceBlessingDraft() {
    const database = await openDatabase();
    if (!database) return null;
    try {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const draft = await requestResult(transaction.objectStore(STORE_NAME).get(ACTIVE_DRAFT_KEY));
        if (!draft) return null;
        if (!draft.updatedAt || Date.now() - Number(draft.updatedAt) > DRAFT_TTL_MS) {
            await clearVoiceBlessingDraft();
            return null;
        }
        return draft;
    } finally {
        database.close();
    }
}

export async function updateVoiceBlessingDraft(patch) {
    const database = await openDatabase();
    if (!database) return null;
    try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const current = await requestResult(store.get(ACTIVE_DRAFT_KEY));
        const next = {
            ...(current || {}),
            ...patch,
            id: ACTIVE_DRAFT_KEY,
            updatedAt: Date.now()
        };
        store.put(next);
        await transactionComplete(transaction);
        return next;
    } finally {
        database.close();
    }
}

export async function clearVoiceBlessingDraft() {
    const database = await openDatabase();
    if (!database) return;
    try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(ACTIVE_DRAFT_KEY);
        await transactionComplete(transaction);
    } finally {
        database.close();
    }
}

