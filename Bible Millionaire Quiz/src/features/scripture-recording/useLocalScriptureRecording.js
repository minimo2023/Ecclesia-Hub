import { useCallback, useEffect, useRef, useState } from 'react';
import {
    buildVoiceAudioConstraints,
    createEnhancedVoiceStream,
    VOICE_AUDIO_BIT_RATE,
    voiceCaptureDetails
} from './voiceCaptureEnhancer.js';
import {
    measureScriptureAudioDuration,
    scriptureAudioFileDetails
} from './scriptureRecordingFile.js';

const MAX_SECONDS = 300;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
function supportedMimeType() {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    return MIME_CANDIDATES.find(type => window.MediaRecorder.isTypeSupported(type)) || '';
}

function extensionFor(type) {
    if (type.includes('mp4')) return 'm4a';
    if (type.includes('ogg')) return 'ogg';
    return 'webm';
}

export function useLocalScriptureRecording({ onFinalized } = {}) {
    const [status, setStatus] = useState('idle');
    const [seconds, setSeconds] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [qualityInfo, setQualityInfo] = useState(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const enhancementRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const metadataRef = useRef(null);
    const resultRef = useRef(null);
    const startedAtRef = useRef(null);
    const onFinalizedRef = useRef(onFinalized);
    const supported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

    useEffect(() => {
        onFinalizedRef.current = onFinalized;
    }, [onFinalized]);

    const release = useCallback(() => {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
        enhancementRef.current?.dispose();
        enhancementRef.current = null;
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const start = useCallback(async metadata => {
        if (!supported || recorderRef.current?.state === 'recording') return false;
        setError('');
        try {
            const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() || {};
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: buildVoiceAudioConstraints(supportedConstraints)
            });
            streamRef.current = stream;
            const inputTrack = stream.getAudioTracks()[0];
            if (inputTrack && 'contentHint' in inputTrack) inputTrack.contentHint = 'speech';
            let enhancement = await createEnhancedVoiceStream(stream);
            const mimeType = supportedMimeType();
            const recorderOptions = {
                audioBitsPerSecond: VOICE_AUDIO_BIT_RATE,
                ...(mimeType ? { mimeType } : {})
            };
            let recorder;
            try {
                recorder = new MediaRecorder(enhancement?.stream || stream, recorderOptions);
            } catch {
                enhancement?.dispose();
                enhancement = null;
                recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            }
            enhancementRef.current = enhancement;
            recorderRef.current = recorder;
            setQualityInfo(voiceCaptureDetails(inputTrack, Boolean(enhancement)));
            metadataRef.current = metadata;
            startedAtRef.current = Date.now();
            chunksRef.current = [];

            recorder.ondataavailable = event => {
                if (event.data.size) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const actualType = recorder.mimeType || mimeType || 'audio/webm';
                if (chunksRef.current.length) {
                    const blob = new Blob(chunksRef.current, { type: actualType });
                    if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
                    const nextResult = {
                        ...metadataRef.current,
                        blob,
                        mimeType: actualType,
                        extension: extensionFor(actualType),
                        url: URL.createObjectURL(blob),
                        durationMs: Math.min(MAX_SECONDS * 1000, Math.max(1000, Date.now() - startedAtRef.current)),
                        clientRequestId: `recording:${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
                        serverSaved: false
                    };
                    resultRef.current = nextResult;
                    setResult(nextResult);
                    Promise.resolve(onFinalizedRef.current?.(nextResult)).catch(() => {});
                }
                release();
                recorderRef.current = null;
                chunksRef.current = [];
                startedAtRef.current = null;
                setStatus('idle');
            };

            // Let the browser finalize one complete WebM/MP4 container on stop.
            // Time-sliced MediaRecorder blobs can be playable in the browser but
            // omit duration metadata required by server-side inspection.
            recorder.start();
            setSeconds(0);
            setStatus('recording');
            timerRef.current = window.setInterval(() => {
                const elapsed = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
                const next = Math.min(MAX_SECONDS, elapsed);
                setSeconds(next);
                if (next >= MAX_SECONDS) queueMicrotask(() => recorderRef.current?.stop());
            }, 250);
            return true;
        } catch {
            release();
            setStatus('idle');
            setQualityInfo(null);
            setError('無法使用麥克風。請確認瀏覽器的麥克風權限。');
            return false;
        }
    }, [release, supported]);

    const stop = useCallback(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, []);

    const loadFile = useCallback(async (file, metadata) => {
        if (recorderRef.current?.state === 'recording') return false;
        setError('');
        try {
            const details = scriptureAudioFileDetails(file);
            const durationMs = await measureScriptureAudioDuration(file);
            const previous = resultRef.current;
            const nextResult = {
                ...metadata,
                blob: file,
                mimeType: details.mimeType,
                extension: details.extension,
                url: URL.createObjectURL(file),
                durationMs,
                source: 'upload',
                originalFilename: String(file.name || ''),
                clientRequestId: `recording:${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
                serverSaved: false
            };
            resultRef.current = nextResult;
            setResult(nextResult);
            Promise.resolve(onFinalizedRef.current?.(nextResult)).catch(() => {});
            setSeconds(Math.round(durationMs / 1000));
            setQualityInfo({ profile: 'uploaded', originalFilename: nextResult.originalFilename });
            if (previous?.url) URL.revokeObjectURL(previous.url);
            return true;
        } catch (uploadError) {
            setError(uploadError.message || '無法載入這個音檔。');
            return false;
        }
    }, []);

    const restore = useCallback(savedResult => {
        if (!savedResult?.blob || recorderRef.current?.state === 'recording') return false;
        const previous = resultRef.current;
        const nextResult = {
            ...savedResult,
            url: URL.createObjectURL(savedResult.blob),
            serverSaved: Boolean(savedResult.serverSaved)
        };
        resultRef.current = nextResult;
        setResult(nextResult);
        setSeconds(Math.max(0, Math.round(Number(nextResult.durationMs || 0) / 1000)));
        setQualityInfo(nextResult.qualityInfo || null);
        setStatus('idle');
        setError('');
        if (previous?.url) URL.revokeObjectURL(previous.url);
        return true;
    }, []);

    const clear = useCallback(() => {
        if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
        resultRef.current = null;
        setResult(null);
        setSeconds(0);
        setError('');
        setQualityInfo(null);
    }, []);

    const markSaved = useCallback(() => {
        setResult(previous => {
            if (!previous) return previous;
            const next = { ...previous, serverSaved: true };
            resultRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => () => {
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
        }
        release();
        if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    }, [release]);

    return {
        supported,
        status,
        seconds,
        result,
        error,
        qualityInfo,
        isRecording: status === 'recording',
        start,
        stop,
        loadFile,
        restore,
        clear,
        markSaved
    };
}
