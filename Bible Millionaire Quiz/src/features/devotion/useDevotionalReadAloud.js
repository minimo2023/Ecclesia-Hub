import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    listChineseSpeechVoices,
    loadSpeechRate,
    loadSpeechVoiceUri,
    saveSpeechRate,
    saveSpeechVoiceUri,
    stripScriptureSpeechAnnotations
} from '../scripture-reading/scriptureSpeech.js';
import { buildDevotionalSpeechSegments, splitDevotionalSpeechText } from './devotionalSpeech.js';

const CHUNK_PAUSE_MS = 90;

export function useDevotionalReadAloud(devotionalContent) {
    const segments = useMemo(
        () => buildDevotionalSpeechSegments(devotionalContent),
        [devotionalContent]
    );
    const [status, setStatus] = useState('idle');
    const [activeSegmentId, setActiveSegmentId] = useState(null);
    const [activeLabel, setActiveLabel] = useState('');
    const [rate, setRateState] = useState(loadSpeechRate);
    const [voices, setVoices] = useState([]);
    const [voiceUri, setVoiceUriState] = useState(loadSpeechVoiceUri);
    const [error, setError] = useState('');

    const queueIndexRef = useRef(-1);
    const queueChunkIndexRef = useRef(-1);
    const generationRef = useRef(0);
    const advanceTimerRef = useRef(null);
    const utteranceRef = useRef(null);
    const segmentsRef = useRef(segments);
    const rateRef = useRef(rate);
    const voiceUriRef = useRef(voiceUri);
    const voicesRef = useRef(voices);
    const statusRef = useRef(status);
    const speakAtRef = useRef(() => {});
    const supported = typeof window !== 'undefined'
        && 'speechSynthesis' in window
        && typeof window.SpeechSynthesisUtterance !== 'undefined';

    const updateStatus = useCallback((nextStatus) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
    }, []);

    const clearAdvanceTimer = useCallback(() => {
        if (typeof window !== 'undefined' && advanceTimerRef.current !== null) {
            window.clearTimeout(advanceTimerRef.current);
        }
        advanceTimerRef.current = null;
    }, []);

    const stop = useCallback(() => {
        generationRef.current += 1;
        queueIndexRef.current = -1;
        queueChunkIndexRef.current = -1;
        clearAdvanceTimer();
        if (supported) window.speechSynthesis.cancel();
        utteranceRef.current = null;
        setActiveSegmentId(null);
        setActiveLabel('');
        setError('');
        updateStatus('idle');
    }, [clearAdvanceTimer, supported, updateStatus]);

    const setRate = useCallback((value) => {
        const normalized = saveSpeechRate(value);
        rateRef.current = normalized;
        setRateState(normalized);
    }, []);

    const setVoiceUri = useCallback((value) => {
        const normalized = saveSpeechVoiceUri(value);
        voiceUriRef.current = normalized;
        setVoiceUriState(normalized);
    }, []);

    useEffect(() => {
        segmentsRef.current = segments;
        stop();
    }, [segments, stop]);

    useEffect(() => {
        if (!supported) return undefined;

        const refreshVoices = () => {
            const chineseVoices = listChineseSpeechVoices(window.speechSynthesis.getVoices());
            voicesRef.current = chineseVoices;
            setVoices(chineseVoices);

            if (chineseVoices.length > 0 && !chineseVoices.some(voice => voice.voiceURI === voiceUriRef.current)) {
                const preferred = chineseVoices[0].voiceURI;
                voiceUriRef.current = preferred;
                setVoiceUriState(preferred);
                saveSpeechVoiceUri(preferred);
            }
        };

        refreshVoices();
        window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
        return () => window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
    }, [supported]);

    useEffect(() => {
        speakAtRef.current = (index, generation, chunkIndex = 0) => {
            if (generation !== generationRef.current) return;
            const segment = segmentsRef.current[index];
            if (!segment) {
                queueIndexRef.current = -1;
                queueChunkIndexRef.current = -1;
                utteranceRef.current = null;
                setActiveSegmentId(null);
                setActiveLabel('');
                updateStatus('idle');
                return;
            }

            const text = stripScriptureSpeechAnnotations(segment.speechText);
            if (!text) {
                speakAtRef.current(index + 1, generation, 0);
                return;
            }

            const chunks = splitDevotionalSpeechText(text);
            const chunk = chunks[chunkIndex];
            if (!chunk) {
                speakAtRef.current(index + 1, generation, 0);
                return;
            }

            queueIndexRef.current = index;
            queueChunkIndexRef.current = chunkIndex;
            setActiveSegmentId(segment.id);
            setActiveLabel(segment.statusLabel);

            const isLastSegment = index === segmentsRef.current.length - 1;
            const isLastChunk = chunkIndex === chunks.length - 1;
            // A second terminal stop gives device voices a short audio tail so
            // the last spoken characters are not clipped by the output buffer.
            const speechText = isLastSegment && isLastChunk ? `${chunk}。` : chunk;
            const utterance = new window.SpeechSynthesisUtterance(speechText);
            utterance.lang = 'zh-TW';
            utterance.rate = rateRef.current;
            const selectedVoice = voicesRef.current.find(voice => voice.voiceURI === voiceUriRef.current);
            if (selectedVoice) utterance.voice = selectedVoice;
            utteranceRef.current = utterance;

            utterance.onend = () => {
                if (generation !== generationRef.current
                    || queueIndexRef.current !== index
                    || queueChunkIndexRef.current !== chunkIndex) return;
                utteranceRef.current = null;
                clearAdvanceTimer();
                if (!isLastChunk) {
                    advanceTimerRef.current = window.setTimeout(
                        () => speakAtRef.current(index, generation, chunkIndex + 1),
                        CHUNK_PAUSE_MS
                    );
                } else {
                    advanceTimerRef.current = window.setTimeout(
                        () => speakAtRef.current(index + 1, generation, 0),
                        segment.pauseAfterMs
                    );
                }
            };
            utterance.onerror = (event) => {
                if (generation !== generationRef.current || ['canceled', 'interrupted'].includes(event.error)) return;
                queueIndexRef.current = -1;
                queueChunkIndexRef.current = -1;
                utteranceRef.current = null;
                setActiveSegmentId(null);
                setActiveLabel('');
                setError('裝置朗讀暫時無法繼續，請停止後再試一次。');
                updateStatus('idle');
            };
            window.speechSynthesis.speak(utterance);
        };
    }, [clearAdvanceTimer, updateStatus]);

    useEffect(() => {
        if (!supported) return undefined;
        const pauseWhenHidden = () => {
            if (document.hidden && statusRef.current === 'playing') {
                window.speechSynthesis.pause();
                updateStatus('paused');
            }
        };
        document.addEventListener('visibilitychange', pauseWhenHidden);
        return () => {
            document.removeEventListener('visibilitychange', pauseWhenHidden);
            generationRef.current += 1;
            clearAdvanceTimer();
            window.speechSynthesis.cancel();
            utteranceRef.current = null;
        };
    }, [clearAdvanceTimer, supported, updateStatus]);

    const play = useCallback(() => {
        if (!supported || segmentsRef.current.length === 0) return;
        setError('');
        if (statusRef.current === 'paused') {
            window.speechSynthesis.resume();
            updateStatus('playing');
            return;
        }

        generationRef.current += 1;
        const generation = generationRef.current;
        queueIndexRef.current = -1;
        queueChunkIndexRef.current = -1;
        clearAdvanceTimer();
        window.speechSynthesis.cancel();
        updateStatus('playing');
        speakAtRef.current(0, generation, 0);
    }, [clearAdvanceTimer, supported, updateStatus]);

    const pause = useCallback(() => {
        if (!supported || statusRef.current !== 'playing') return;
        window.speechSynthesis.pause();
        updateStatus('paused');
    }, [supported, updateStatus]);

    return {
        supported,
        hasContent: segments.length > 0,
        status,
        activeSegmentId,
        activeLabel,
        rate,
        voices,
        voiceUri,
        error,
        setRate,
        setVoiceUri,
        play,
        pause,
        stop
    };
}
