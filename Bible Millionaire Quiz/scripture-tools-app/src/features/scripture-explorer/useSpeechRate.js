import { useCallback, useState } from 'react';
import { loadSpeechRate, saveSpeechRate } from '../../scriptureText.js';

export function useSpeechRate() {
    const [rate, setStoredRate] = useState(loadSpeechRate);
    const setRate = useCallback(value => setStoredRate(saveSpeechRate(value)), []);
    return { rate, setRate };
}
