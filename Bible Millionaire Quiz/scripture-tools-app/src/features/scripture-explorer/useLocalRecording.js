import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 300;
const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
];

function supportedMimeType() {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    return MIME_CANDIDATES.find(type => window.MediaRecorder.isTypeSupported(type)) || '';
}

function extensionFor(type) {
    if (type.includes('mp4')) return 'm4a';
    if (type.includes('ogg')) return 'ogg';
    return 'webm';
}

export function useLocalRecording() {
    const [status, setStatus] = useState('idle');
    const [seconds, setSeconds] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const metadataRef = useRef(null);
    const discardRef = useRef(false);
    const stopResolversRef = useRef([]);
    const stopRef = useRef(() => Promise.resolve(null));
    const resultRef = useRef(result);
    const startedAtRef = useRef(null);
    const supported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

    useEffect(() => { resultRef.current = result; }, [result]);

    const clearTimerAndStream = useCallback(() => {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const start = useCallback(async metadata => {
        if (!supported || recorderRef.current?.state === 'recording') return false;
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = supportedMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            streamRef.current = stream;
            recorderRef.current = recorder;
            metadataRef.current = metadata;
            startedAtRef.current = Date.now();
            chunksRef.current = [];
            discardRef.current = false;

            recorder.ondataavailable = event => {
                if (event.data.size) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const shouldDiscard = discardRef.current;
                const actualType = recorder.mimeType || mimeType || 'audio/webm';
                let nextResult = null;
                if (!shouldDiscard && chunksRef.current.length) {
                    const blob = new Blob(chunksRef.current, { type: actualType });
                    const previous = resultRef.current;
                    if (previous?.url) URL.revokeObjectURL(previous.url);
                    nextResult = {
                        ...metadataRef.current,
                        blob,
                        mimeType: actualType,
                        extension: extensionFor(actualType),
                        url: URL.createObjectURL(blob),
                        durationMs: Math.min(MAX_SECONDS * 1000, Math.max(1000, Date.now() - startedAtRef.current)),
                        clientRequestId: `recording:${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
                        downloaded: false,
                        serverSaved: false
                    };
                    resultRef.current = nextResult;
                    setResult(nextResult);
                }
                clearTimerAndStream();
                recorderRef.current = null;
                chunksRef.current = [];
                startedAtRef.current = null;
                setStatus('idle');
                const resolvers = stopResolversRef.current.splice(0);
                resolvers.forEach(resolve => resolve(nextResult));
            };

            recorder.start(1000);
            setSeconds(0);
            setStatus('recording');
            timerRef.current = window.setInterval(() => {
                setSeconds(value => {
                    const next = Math.min(MAX_SECONDS, value + 1);
                    if (next >= MAX_SECONDS) queueMicrotask(() => stopRef.current());
                    return next;
                });
            }, 1000);
            return true;
        } catch {
            clearTimerAndStream();
            setStatus('idle');
            setError('無法使用麥克風。請確認已允許權限，或檢查瀏覽器的麥克風設定。');
            return false;
        }
    }, [clearTimerAndStream, supported]);

    const stop = useCallback(({ discard = false } = {}) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') return Promise.resolve(resultRef.current);
        discardRef.current = discard;
        return new Promise(resolve => {
            stopResolversRef.current.push(resolve);
            recorder.stop();
        });
    }, []);
    stopRef.current = stop;

    const clearResult = useCallback(() => {
        const previous = resultRef.current;
        if (previous?.url) URL.revokeObjectURL(previous.url);
        resultRef.current = null;
        setResult(null);
    }, []);

    const markDownloaded = useCallback(() => {
        setResult(previous => {
            if (!previous) return previous;
            const next = { ...previous, downloaded: true };
            resultRef.current = next;
            return next;
        });
    }, []);

    const markServerSaved = useCallback(() => {
        setResult(previous => {
            if (!previous) return previous;
            const next = { ...previous, serverSaved: true };
            resultRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => () => {
        window.clearInterval(timerRef.current);
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    }, []);

    return {
        supported,
        status,
        seconds,
        result,
        error,
        isRecording: status === 'recording',
        hasUndownloadedResult: Boolean(result && !result.downloaded && !result.serverSaved),
        start,
        stop,
        clearResult,
        markDownloaded,
        markServerSaved
    };
}
