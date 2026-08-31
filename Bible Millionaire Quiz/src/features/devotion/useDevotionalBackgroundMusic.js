import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    buildDevotionalTrackUrl,
    DEVOTIONAL_BACKGROUND_TRACKS,
    getDailyDevotionalTrackIndex,
    getLocalDevotionalMusicDayKey,
    normalizeDevotionalMusicVolume
} from './devotionalBackgroundMusic.js';

const VOLUME_STORAGE_KEY = 'bible_millionaire_devotion_music_volume';

function loadSavedVolume() {
    if (typeof window === 'undefined') return 0.16;
    return normalizeDevotionalMusicVolume(window.localStorage.getItem(VOLUME_STORAGE_KEY));
}

export function useDevotionalBackgroundMusic() {
    const tracks = DEVOTIONAL_BACKGROUND_TRACKS;
    const [dayKey, setDayKey] = useState(getLocalDevotionalMusicDayKey);
    const [trackIndex, setTrackIndex] = useState(
        () => getDailyDevotionalTrackIndex(getLocalDevotionalMusicDayKey(), tracks.length)
    );
    const [status, setStatus] = useState('idle');
    const [volume, setVolumeState] = useState(loadSavedVolume);
    const [error, setError] = useState('');

    const audioRef = useRef(null);
    const playRequestRef = useRef(0);
    const statusRef = useRef(status);
    const volumeRef = useRef(volume);
    const trackIndexRef = useRef(trackIndex);

    const currentTrack = useMemo(
        () => tracks[trackIndex] || null,
        [trackIndex, tracks]
    );

    const updateStatus = useCallback((nextStatus) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
    }, []);

    const getAudio = useCallback(() => {
        if (typeof window === 'undefined' || typeof window.Audio !== 'function') return null;
        if (audioRef.current) return audioRef.current;

        const audio = new window.Audio();
        audio.preload = 'metadata';
        audio.loop = true;
        audio.volume = volumeRef.current;
        audio.addEventListener('error', () => {
            setError('今日背景音樂暫時無法播放，請稍後再試。');
            updateStatus('idle');
        });
        audioRef.current = audio;
        return audio;
    }, [tracks.length, updateStatus]);

    const play = useCallback(async () => {
        const audio = getAudio();
        const track = tracks[trackIndexRef.current];
        if (!audio || !track) return;
        const requestId = playRequestRef.current + 1;
        playRequestRef.current = requestId;

        setError('');
        const expectedUrl = buildDevotionalTrackUrl(track.fileName);
        if (audio.dataset.devotionalTrackId !== track.id) {
            audio.src = expectedUrl;
            audio.dataset.devotionalTrackId = track.id;
            audio.load();
        }

        try {
            await audio.play();
            if (requestId !== playRequestRef.current || audio !== audioRef.current) return;
            setError('');
            updateStatus('playing');
        } catch {
            if (requestId !== playRequestRef.current || audio !== audioRef.current) return;
            setError('瀏覽器阻擋了自動播放，請點一下音樂按鈕。');
            updateStatus('paused');
        }
    }, [getAudio, tracks, updateStatus]);

    const pause = useCallback(() => {
        playRequestRef.current += 1;
        audioRef.current?.pause();
        updateStatus('paused');
    }, [updateStatus]);

    const toggle = useCallback(() => {
        if (statusRef.current === 'playing') pause();
        else play();
    }, [pause, play]);

    const setVolume = useCallback((value) => {
        const normalized = normalizeDevotionalMusicVolume(value);
        volumeRef.current = normalized;
        setVolumeState(normalized);
        if (audioRef.current) audioRef.current.volume = normalized;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(VOLUME_STORAGE_KEY, String(normalized));
        }
    }, []);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        play();
    }, [play]);

    useEffect(() => {
        trackIndexRef.current = trackIndex;
        const audio = audioRef.current;
        const track = tracks[trackIndex];
        if (!audio || !track) return;
        if (audio.dataset.devotionalTrackId === track.id) return;

        const shouldContinue = statusRef.current === 'playing';
        audio.src = buildDevotionalTrackUrl(track.fileName);
        audio.dataset.devotionalTrackId = track.id;
        audio.load();
        if (shouldContinue) {
            audio.play().catch(() => {
                setError('今日背景音樂暫時無法繼續播放。');
                updateStatus('paused');
            });
        }
    }, [trackIndex, tracks, updateStatus]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const now = new Date();
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const timer = window.setTimeout(() => {
            const nextDayKey = getLocalDevotionalMusicDayKey();
            setDayKey(nextDayKey);
            setTrackIndex(getDailyDevotionalTrackIndex(nextDayKey, tracks.length));
        }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000));

        return () => window.clearTimeout(timer);
    }, [dayKey, tracks.length]);

    useEffect(() => () => {
        playRequestRef.current += 1;
        if (!audioRef.current) return;
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
        audioRef.current = null;
    }, []);

    return {
        supported: typeof window !== 'undefined' && typeof window.Audio === 'function',
        status,
        currentTrack,
        volume,
        error,
        play,
        pause,
        toggle,
        setVolume
    };
}
