import { useCallback, useEffect, useRef, useState } from 'react';
import {
    listChineseSpeechVoices,
    loadSpeechVoiceUri,
    saveSpeechVoiceUri,
    stripSpeechAnnotations
} from '../../scriptureText.js';
import { useSpeechRate } from './useSpeechRate.js';

export function useReadAloud(passage) {
    const [status, setStatus] = useState('idle');
    const [activeVerse, setActiveVerse] = useState(null);
    const [voices, setVoices] = useState([]);
    const [voiceUri, setVoiceUriState] = useState(loadSpeechVoiceUri);
    const [error, setError] = useState('');
    const queueIndexRef = useRef(-1);
    const advanceTimerRef = useRef(null);
    const { rate, setRate } = useSpeechRate();
    const rateRef = useRef(rate);
    const voiceUriRef = useRef(voiceUri);
    const voicesRef = useRef(voices);
    const passageRef = useRef(passage);
    const speakAtRef = useRef(() => {});
    const statusRef = useRef(status);
    const supported = typeof window !== 'undefined'
        && 'speechSynthesis' in window
        && typeof window.SpeechSynthesisUtterance !== 'undefined';

    useEffect(() => {
        rateRef.current = rate;
    }, [rate]);

    useEffect(() => {
        voiceUriRef.current = voiceUri;
    }, [voiceUri]);

    const updateStatus = useCallback(nextStatus => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
    }, []);

    const stop = useCallback(() => {
        queueIndexRef.current = -1;
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
        window.speechSynthesis?.cancel();
        setActiveVerse(null);
        setError('');
        updateStatus('idle');
    }, [updateStatus]);

    const setVoiceUri = useCallback(value => {
        const normalized = saveSpeechVoiceUri(value);
        voiceUriRef.current = normalized;
        setVoiceUriState(normalized);
    }, []);

    useEffect(() => {
        passageRef.current = passage;
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
        speakAtRef.current = index => {
            const item = passageRef.current[index];
            if (!item) {
                queueIndexRef.current = -1;
                setActiveVerse(null);
                updateStatus('idle');
                return;
            }

            const text = stripSpeechAnnotations(item.text);
            if (!text) {
                speakAtRef.current(index + 1);
                return;
            }

            queueIndexRef.current = index;
            setActiveVerse(item.verse);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-TW';
            utterance.rate = rateRef.current;
            const selectedVoice = voicesRef.current.find(voice => voice.voiceURI === voiceUriRef.current);
            if (selectedVoice) utterance.voice = selectedVoice;
            utterance.onend = () => {
                if (queueIndexRef.current !== index) return;
                const pauseMs = item.paragraphBreakAfter ? 620 : item.lineBreakAfter ? 260 : 80;
                window.clearTimeout(advanceTimerRef.current);
                advanceTimerRef.current = window.setTimeout(() => speakAtRef.current(index + 1), pauseMs);
            };
            utterance.onerror = event => {
                if (queueIndexRef.current !== index || ['canceled', 'interrupted'].includes(event.error)) return;
                queueIndexRef.current = -1;
                setActiveVerse(null);
                setError('裝置朗讀暫時無法繼續，請停止後再試一次。');
                updateStatus('idle');
            };
            window.speechSynthesis.speak(utterance);
        };
    }, [updateStatus]);

    useEffect(() => {
        const pauseWhenHidden = () => {
            if (document.hidden && statusRef.current === 'playing') {
                window.speechSynthesis?.pause();
                updateStatus('paused');
            }
        };
        document.addEventListener('visibilitychange', pauseWhenHidden);
        return () => {
            document.removeEventListener('visibilitychange', pauseWhenHidden);
            queueIndexRef.current = -1;
            window.clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = null;
            window.speechSynthesis?.cancel();
        };
    }, [updateStatus]);

    const play = useCallback(() => {
        if (!supported || !passageRef.current.length) return;
        setError('');
        if (statusRef.current === 'paused') {
            window.speechSynthesis.resume();
            updateStatus('playing');
            return;
        }
        queueIndexRef.current = -1;
        window.speechSynthesis.cancel();
        updateStatus('playing');
        speakAtRef.current(0);
    }, [supported, updateStatus]);

    const pause = useCallback(() => {
        if (statusRef.current !== 'playing') return;
        window.speechSynthesis.pause();
        updateStatus('paused');
    }, [updateStatus]);

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
