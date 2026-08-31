import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { ScripturePicker } from '../components/ScripturePicker.jsx';
import { PassageDisplay } from '../components/PassageDisplay.jsx';
import { SpeechRateSelect } from '../components/SpeechRateSelect.jsx';
import { fetchChapter } from '../api.js';
import { stripSpeechAnnotations } from '../scriptureText.js';
import { useSpeechRate } from '../features/scripture-explorer/useSpeechRate.js';

const initialSelection = { version: 'CUV_TRAD', book: '詩篇', chapter: 23 };

export function ReadAloudPage() {
    const [selection, setSelection] = useState(initialSelection);
    const [passage, setPassage] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [state, setState] = useState('idle');
    const [currentVerse, setCurrentVerse] = useState(null);
    const queueIndexRef = useRef(-1);
    const advanceTimerRef = useRef(null);
    const { rate, setRate } = useSpeechRate();
    const rateRef = useRef(rate);
    const supported = 'speechSynthesis' in window;
    const reference = `${selection.book} ${selection.chapter} 章`;

    useEffect(() => {
        rateRef.current = rate;
    }, [rate]);

    useEffect(() => () => {
        queueIndexRef.current = -1;
        window.clearTimeout(advanceTimerRef.current);
        window.speechSynthesis?.cancel();
    }, []);

    useEffect(() => {
        if (currentVerse === null) return;
        const element = document.querySelector(`.passage-text [data-verse="${currentVerse}"]`);
        element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, [currentVerse]);

    const load = async next => {
        queueIndexRef.current = -1;
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
        window.speechSynthesis?.cancel();
        setState('idle');
        setCurrentVerse(null);
        setLoading(true);
        setError('');
        try {
            setPassage(await fetchChapter(next));
            setSelection(next);
        } catch (loadError) {
            setPassage([]);
            setError(loadError.message);
        } finally {
            setLoading(false);
        }
    };

    const speakVerse = index => {
        const item = passage[index];
        if (!item) {
            queueIndexRef.current = -1;
            setCurrentVerse(null);
            setState('idle');
            return;
        }

        const text = stripSpeechAnnotations(item.text);
        if (!text) {
            speakVerse(index + 1);
            return;
        }

        queueIndexRef.current = index;
        setCurrentVerse(item.verse);
        // 畫面保留節號與當前節高亮，實際朗讀只傳入經文正文。
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = rateRef.current;
        utterance.onend = () => {
            if (queueIndexRef.current !== index) return;
            const pauseMs = item.paragraphBreakAfter ? 620 : item.lineBreakAfter ? 260 : 80;
            window.clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = window.setTimeout(() => speakVerse(index + 1), pauseMs);
        };
        utterance.onerror = event => {
            if (queueIndexRef.current !== index || event.error === 'canceled' || event.error === 'interrupted') return;
            queueIndexRef.current = -1;
            setCurrentVerse(null);
            setState('idle');
        };
        window.speechSynthesis.speak(utterance);
    };

    const play = () => {
        if (!supported || !passage.length) return;
        if (state === 'paused') {
            window.speechSynthesis.resume();
            setState('playing');
            return;
        }
        queueIndexRef.current = -1;
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
        window.speechSynthesis.cancel();
        setState('playing');
        speakVerse(0);
    };

    const pause = () => { window.speechSynthesis.pause(); setState('paused'); };
    const stop = () => {
        queueIndexRef.current = -1;
        window.speechSynthesis.cancel();
        setCurrentVerse(null);
        setState('idle');
    };

    return (
        <AppShell title="經文朗讀" eyebrow="經文工具・裝置朗讀">
            <p className="page-intro">使用瀏覽器或作業系統內建語音朗讀。不需要 AI 金鑰、不扣智匯點數，聲音品質會依裝置而異。</p>
            <ScripturePicker value={selection} onChange={setSelection} onLoad={load} loading={loading} />
            {error && <div className="notice notice-error">{error}</div>}
            <div className="workspace-grid">
                <PassageDisplay passage={passage} reference={reference} activeVerse={currentVerse} />
                <aside className="control-card sticky-card">
                    <span className="status-pill status-live">本機處理</span>
                    <h2>朗讀控制</h2>
                    {!supported ? <p>這個瀏覽器不支援系統朗讀，請改用新版 Chrome、Edge 或 Safari。</p> : (
                        <>
                            <p aria-live="polite">{currentVerse !== null ? `正在朗讀第 ${currentVerse} 節。` : passage.length ? `已載入 ${passage.length} 節。` : '載入經文後即可開始。'}</p>
                            <p className="control-note">朗讀時不念節號，並會略過「或譯」、「有古卷」等括號譯註；原譯本有段落時會加長停頓。</p>
                            <SpeechRateSelect value={rate} onChange={setRate} className="control-rate-select" />
                            <div className="button-stack">
                                <button className="primary-button" onClick={play} disabled={!passage.length || state === 'playing'}>
                                    {state === 'paused' ? <RotateCcw size={17} /> : <Play size={17} />} {state === 'paused' ? '繼續' : '開始朗讀'}
                                </button>
                                <button className="secondary-button" onClick={pause} disabled={state !== 'playing'}><Pause size={17} /> 暫停</button>
                                <button className="secondary-button" onClick={stop} disabled={state === 'idle'}><Square size={16} /> 停止</button>
                            </div>
                        </>
                    )}
                </aside>
            </div>
        </AppShell>
    );
}
