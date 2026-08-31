import { useCallback, useEffect, useRef, useState } from 'react';

function recognitionConstructor() {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function collectScriptureVoiceCandidates(event) {
    const resultIndex = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
    const currentResults = [];

    for (let index = resultIndex; index < (event?.results?.length || 0); index += 1) {
        const result = event.results[index];
        const alternatives = [];
        for (let alternative = 0; alternative < result.length; alternative += 1) {
            alternatives.push(result[alternative]?.transcript || '');
        }
        currentResults.push({
            final: Boolean(result.isFinal),
            alternatives
        });
    }

    const display = currentResults
        .map(result => result.alternatives[0] || '')
        .join(' ')
        .trim();
    const finalResults = currentResults.filter(result => result.final);
    if (finalResults.length === 0) return { display, candidates: [], hasFinal: false };

    const candidateDepth = Math.min(5, Math.max(1, ...finalResults.map(result => result.alternatives.length)));
    const candidates = [];
    for (let rank = 0; rank < candidateDepth; rank += 1) {
        candidates.push(finalResults
            .map(result => result.alternatives[Math.min(rank, result.alternatives.length - 1)] || '')
            .join(' ')
            .trim());
    }
    return { display, candidates: candidates.filter(Boolean), hasFinal: true };
}

export default function useScriptureVoiceInput({
    active,
    contextKey,
    options,
    onSelect,
    paused = false,
    terminal = false
}) {
    const supported = Boolean(recognitionConstructor());
    const [enabled, setEnabledState] = useState(false);
    const [status, setStatus] = useState('off');
    const [heardText, setHeardText] = useState('');
    const [error, setError] = useState('');
    const recognitionRef = useRef(null);
    const enabledRef = useRef(false);
    const activeRef = useRef(active);
    const pausedRef = useRef(paused);
    const terminalRef = useRef(terminal);
    const optionsRef = useRef(options);
    const onSelectRef = useRef(onSelect);
    const contextKeyRef = useRef(contextKey);
    const selectionPendingRef = useRef(false);
    const restartTimerRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const mountedRef = useRef(true);
    const matcherPromiseRef = useRef(null);

    activeRef.current = active;
    pausedRef.current = paused;
    terminalRef.current = terminal;
    optionsRef.current = options;
    onSelectRef.current = onSelect;
    contextKeyRef.current = contextKey;

    const clearTimers = useCallback(() => {
        window.clearTimeout(restartTimerRef.current);
        window.clearTimeout(silenceTimerRef.current);
        restartTimerRef.current = null;
        silenceTimerRef.current = null;
    }, []);

    const stopRecognition = useCallback(() => {
        clearTimers();
        const recognition = recognitionRef.current;
        recognitionRef.current = null;
        if (recognition) {
            recognition.onend = null;
            try { recognition.abort(); } catch {}
        }
        selectionPendingRef.current = false;
        setHeardText('');
    }, [clearTimers]);

    const scheduleRestart = useCallback((delay = 220) => {
        window.clearTimeout(restartTimerRef.current);
        if (!enabledRef.current || pausedRef.current || terminalRef.current || selectionPendingRef.current) return;
        restartTimerRef.current = window.setTimeout(() => {
            const recognition = recognitionRef.current;
            if (!recognition || !enabledRef.current || pausedRef.current || terminalRef.current) return;
            try { recognition.start(); } catch {}
        }, delay);
    }, []);

    const loadMatcher = useCallback(() => {
        if (!matcherPromiseRef.current) {
            matcherPromiseRef.current = import('./scriptureVoiceMatcher')
                .then(module => module.rankScriptureVoiceOptions)
                .catch(error => {
                    matcherPromiseRef.current = null;
                    throw error;
                });
        }
        return matcherPromiseRef.current;
    }, []);

    const createRecognition = useCallback(() => {
        const Recognition = recognitionConstructor();
        if (!Recognition) return null;
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 5;
        recognition.lang = 'zh-TW';

        recognition.onstart = () => {
            if (!mountedRef.current) return;
            setError('');
            setStatus('listening');
        };

        recognition.onresult = async event => {
            if (!enabledRef.current || pausedRef.current || terminalRef.current) return;
            const { display, candidates, hasFinal } = collectScriptureVoiceCandidates(event);
            if (activeRef.current) setHeardText(display);
            if (!hasFinal || !activeRef.current || selectionPendingRef.current) return;
            const capturedContext = contextKeyRef.current;
            selectionPendingRef.current = true;
            setStatus('processing');
            let rankOptions;
            try {
                rankOptions = await loadMatcher();
            } catch (loadError) {
                selectionPendingRef.current = false;
                setStatus('error');
                setError(loadError?.message || '無法載入中文語音比對器');
                return;
            }
            if (capturedContext !== contextKeyRef.current || !activeRef.current) {
                selectionPendingRef.current = false;
                setStatus(pausedRef.current ? 'paused' : 'listening');
                return;
            }
            const match = rankOptions(candidates, optionsRef.current);
            if (!match.matched) {
                selectionPendingRef.current = false;
                setStatus(match.ambiguous ? 'ambiguous' : 'no-match');
                window.clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = window.setTimeout(() => {
                    if (!enabledRef.current || selectionPendingRef.current) return;
                    setHeardText('');
                    try { recognition.abort(); } catch {}
                }, 1400);
                return;
            }

            if (capturedContext !== contextKeyRef.current) return;
            try { recognition.abort(); } catch {}
            Promise.resolve(onSelectRef.current?.(match.option)).catch(selectionError => {
                if (!mountedRef.current) return;
                setError(selectionError?.message || '語音作答暫時無法使用');
                setStatus('error');
            }).finally(() => {
                if (!mountedRef.current) return;
                selectionPendingRef.current = false;
                setHeardText('');
                scheduleRestart(280);
            });
        };

        recognition.onerror = event => {
            const code = event.error || 'unknown';
            if (code === 'aborted' || code === 'no-speech') return;
            if (code === 'not-allowed' || code === 'service-not-allowed') {
                enabledRef.current = false;
                setEnabledState(false);
                setStatus('denied');
                setError(code === 'not-allowed' ? '麥克風權限未開啟' : '瀏覽器不允許使用語音辨識');
                return;
            }
            setStatus('error');
            setError(code === 'network' ? '語音辨識連線中斷，正在重試' : `語音辨識錯誤：${code}`);
        };

        recognition.onend = () => {
            if (!mountedRef.current || recognitionRef.current !== recognition) return;
            scheduleRestart();
        };
        return recognition;
    }, [loadMatcher, scheduleRestart]);

    const setEnabled = useCallback(next => {
        const shouldEnable = Boolean(next);
        if (!shouldEnable) {
            enabledRef.current = false;
            setEnabledState(false);
            setStatus('off');
            setError('');
            stopRecognition();
            return;
        }
        if (!supported) {
            setStatus('unsupported');
            setError('這個瀏覽器不支援語音辨識');
            return;
        }
        enabledRef.current = true;
        setEnabledState(true);
        setStatus('requesting');
        setError('');
        loadMatcher().catch(loadError => {
            if (!mountedRef.current || !enabledRef.current) return;
            setStatus('error');
            setError(loadError?.message || '無法載入中文語音比對器');
        });
        const recognition = createRecognition();
        recognitionRef.current = recognition;
        try { recognition.start(); } catch (startError) {
            enabledRef.current = false;
            setEnabledState(false);
            setStatus('error');
            setError(startError?.message || '無法啟動麥克風');
        }
    }, [createRecognition, loadMatcher, stopRecognition, supported]);

    useEffect(() => {
        if (!enabledRef.current || terminal) return;
        setHeardText('');
        if (paused) {
            clearTimers();
            try { recognitionRef.current?.abort(); } catch {}
            setStatus('paused');
        } else {
            scheduleRestart(80);
        }
    }, [paused, terminal, clearTimers, scheduleRestart]);

    useEffect(() => {
        if (!enabledRef.current) return;
        setHeardText('');
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch {}
        }
    }, [contextKey, active]);

    useEffect(() => {
        if (terminal && enabledRef.current) setEnabled(false);
    }, [terminal, setEnabled]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            enabledRef.current = false;
            clearTimers();
            const recognition = recognitionRef.current;
            recognitionRef.current = null;
            if (recognition) {
                recognition.onend = null;
                try { recognition.abort(); } catch {}
            }
        };
    }, [clearTimers]);

    return { enabled, supported, status, heardText, error, setEnabled };
}
