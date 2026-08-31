import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getVersePauseMs,
    listChineseSpeechVoices,
    loadSpeechRate,
    loadSpeechVoiceUri,
    saveSpeechRate,
    saveSpeechVoiceUri,
    stripScriptureSpeechAnnotations
} from './scriptureSpeech.js';

export function useScriptureReadAloud(passage) {
    const [status, setStatus] = useState('idle');
    const [activeVerse, setActiveVerse] = useState(null);
    const [rate, setRateState] = useState(loadSpeechRate);
    const [voices, setVoices] = useState([]);
    const [voiceUri, setVoiceUriState] = useState(loadSpeechVoiceUri);
    const [error, setError] = useState('');

    const queueIndexRef = useRef(-1);
    const generationRef = useRef(0);
    const advanceTimerRef = useRef(null);
    const passageRef = useRef(passage || []);
    const rateRef = useRef(rate);
    const voiceUriRef = useRef(voiceUri);
    const voicesRef = useRef(voices);
    const statusRef = useRef(status);
    const speakAtRef = useRef(() => {});
    const supported = typeof window !== 'undefined'
        && 'speechSynthesis' in window
        && typeof window.SpeechSynthesisUtterance !== 'undefined';

    const updateStatus = useCallback(nextStatus => {
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
        clearAdvanceTimer();
        if (supported) window.speechSynthesis.cancel();
        setActiveVerse(null);
        setError('');
        updateStatus('idle');
    }, [clearAdvanceTimer, supported, updateStatus]);

    const setRate = useCallback(value => {
        const normalized = saveSpeechRate(value);
        rateRef.current = normalized;
        setRateState(normalized);
    }, []);

    const setVoiceUri = useCallback(value => {
        const normalized = saveSpeechVoiceUri(value);
        voiceUriRef.current = normalized;
        setVoiceUriState(normalized);
    }, []);

    useEffect(() => {
        rateRef.current = rate;
    }, [rate]);

    useEffect(() => {
        voiceUriRef.current = voiceUri;
    }, [voiceUri]);

    useEffect(() => {
        passageRef.current = passage || [];
        stop();
    }, [passage, stop]);

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
        speakAtRef.current = (index, generation) => {
            if (generation !== generationRef.current) return;
            const item = passageRef.current[index];
            if (!item) {
                queueIndexRef.current = -1;
                setActiveVerse(null);
                updateStatus('idle');
                return;
            }

            const text = stripScriptureSpeechAnnotations(item.text);
            if (!text) {
                speakAtRef.current(index + 1, generation);
                return;
            }

            queueIndexRef.current = index;
            setActiveVerse(Number(item.verse));
            const utterance = new window.SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-TW';
            utterance.rate = rateRef.current;
            const selectedVoice = voicesRef.current.find(voice => voice.voiceURI === voiceUriRef.current);
            if (selectedVoice) utterance.voice = selectedVoice;

            utterance.onend = () => {
                if (generation !== generationRef.current || queueIndexRef.current !== index) return;
                clearAdvanceTimer();
                advanceTimerRef.current = window.setTimeout(
                    () => speakAtRef.current(index + 1, generation),
                    getVersePauseMs(item)
                );
            };
            utterance.onerror = event => {
                if (generation !== generationRef.current || ['canceled', 'interrupted'].includes(event.error)) return;
                queueIndexRef.current = -1;
                setActiveVerse(null);
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
        };
    }, [clearAdvanceTimer, supported, updateStatus]);

    const play = useCallback(() => {
        if (!supported || passageRef.current.length === 0) return;
        setError('');
        if (statusRef.current === 'paused') {
            window.speechSynthesis.resume();
            updateStatus('playing');
            return;
        }

        generationRef.current += 1;
        const generation = generationRef.current;
        queueIndexRef.current = -1;
        clearAdvanceTimer();
        window.speechSynthesis.cancel();
        updateStatus('playing');
        speakAtRef.current(0, generation);
    }, [clearAdvanceTimer, supported, updateStatus]);

    const pause = useCallback(() => {
        if (!supported || statusRef.current !== 'playing') return;
        window.speechSynthesis.pause();
        updateStatus('paused');
    }, [supported, updateStatus]);

    return {
        supported,
        status,
        activeVerse,
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
