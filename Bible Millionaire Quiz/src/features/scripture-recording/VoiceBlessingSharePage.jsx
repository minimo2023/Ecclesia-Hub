import { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Gift, Loader2, Pause, Play, ShieldCheck, Volume2 } from 'lucide-react';
import { stripScriptureSpeechAnnotations } from '../scripture-reading/scriptureSpeech.js';
import {
    fetchScriptureRecordingShare,
    fetchScriptureSharePlaybackTicket,
    scripturePlaybackUrl
} from './scriptureRecordingApi.js';

const THEMES = {
    dawn: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-100 text-amber-950',
    peace: 'border-teal-200 bg-gradient-to-br from-cyan-50 via-white to-teal-100 text-teal-950',
    hope: 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-100 text-indigo-950'
};

const VERSION_TO_CLIENT = {
    CUV_TRAD: 'unv',
    CNV_TRAD: 'ncv',
    TCV2019_TRAD: 'tcv2019',
    TCV2010_TRAD: 'tcv2019',
    LCC_TRAD: 'lcc'
};

const DEFAULT_SHARE_PAGE_TITLE = '語音祝福｜來自聖經智匯';

function sharePageMetadata(share) {
    const cardTitle = String(share?.card?.title || '').replace(/\s+/gu, ' ').trim();
    const reference = String(share?.recording?.reference || '').replace(/\s+/gu, ' ').trim();
    return {
        title: cardTitle ? `語音祝福－${cardTitle}｜來自聖經智匯` : DEFAULT_SHARE_PAGE_TITLE,
        description: reference
            ? `聆聽一段以${reference}錄製的語音經文祝福。`
            : '聆聽一段來自聖經智匯的語音經文祝福。'
    };
}

function setDocumentMeta(selector, attributes) {
    const existing = document.head.querySelector(selector);
    const element = existing || document.createElement('meta');
    const previousAttributes = existing
        ? Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value]))
        : null;
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    if (!existing) document.head.appendChild(element);
    return () => {
        if (!previousAttributes) {
            element.remove();
            return;
        }
        [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
        Object.entries(previousAttributes).forEach(([name, value]) => element.setAttribute(name, value));
    };
}

function formatPlaybackTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function VoiceBlessingAudioPlayer({ src, durationMs }) {
    const audioRef = useRef(null);
    const animationFrameRef = useRef(0);
    const fallbackDuration = Number(durationMs) > 0 ? Number(durationMs) / 1000 : 0;
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(fallbackDuration);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return undefined;

        const syncCurrentTime = () => setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
        const syncDuration = () => {
            const mediaDuration = Number(audio.duration);
            setDuration(Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : fallbackDuration);
        };
        const stopProgressUpdates = () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = 0;
        };
        const updateProgress = () => {
            syncCurrentTime();
            if (!audio.paused && !audio.ended) animationFrameRef.current = requestAnimationFrame(updateProgress);
        };
        const handlePlay = () => {
            setIsPlaying(true);
            stopProgressUpdates();
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        };
        const handlePause = () => {
            setIsPlaying(false);
            stopProgressUpdates();
            syncCurrentTime();
        };
        const pausePlayback = () => audio.pause();
        const pauseWhenHidden = () => {
            if (document.hidden) pausePlayback();
        };

        audio.addEventListener('loadedmetadata', syncDuration);
        audio.addEventListener('durationchange', syncDuration);
        audio.addEventListener('timeupdate', syncCurrentTime);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handlePause);
        document.addEventListener('visibilitychange', pauseWhenHidden);
        document.addEventListener('freeze', pausePlayback);
        document.addEventListener('pause', pausePlayback);
        window.addEventListener('blur', pausePlayback);
        window.addEventListener('pagehide', pausePlayback);

        audio.play().catch(() => {});

        return () => {
            stopProgressUpdates();
            audio.removeEventListener('loadedmetadata', syncDuration);
            audio.removeEventListener('durationchange', syncDuration);
            audio.removeEventListener('timeupdate', syncCurrentTime);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handlePause);
            document.removeEventListener('visibilitychange', pauseWhenHidden);
            document.removeEventListener('freeze', pausePlayback);
            document.removeEventListener('pause', pausePlayback);
            window.removeEventListener('blur', pausePlayback);
            window.removeEventListener('pagehide', pausePlayback);
            pausePlayback();
        };
    }, [src, fallbackDuration]);

    const togglePlayback = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) await audio.play().catch(() => {});
        else audio.pause();
    };

    const seek = event => {
        const nextTime = Number(event.target.value);
        if (!audioRef.current || !Number.isFinite(nextTime)) return;
        audioRef.current.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    const progressMaximum = duration > 0 ? duration : 1;

    return (
        <div className="flex items-center gap-3 rounded-xl bg-white/80 p-2">
            <audio ref={audioRef} preload="metadata" src={src} controlsList="nodownload noremoteplayback" disableRemotePlayback onContextMenu={event => event.preventDefault()}>你的瀏覽器不支援音訊播放。</audio>
            <button type="button" onClick={togglePlayback} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-600 text-white" aria-label={isPlaying ? '暫停語音祝福' : '播放語音祝福'}>
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1">
                <input type="range" min="0" max={progressMaximum} step="0.1" value={Math.min(currentTime, progressMaximum)} onChange={seek} className="h-2 w-full cursor-pointer accent-indigo-600" aria-label="語音播放進度" aria-valuetext={`${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`} />
                <div className="mt-1 flex justify-between text-xs font-bold tabular-nums text-slate-600" aria-live="off">
                    <span>{formatPlaybackTime(currentTime)}</span>
                    <span>{formatPlaybackTime(duration)}</span>
                </div>
            </div>
        </div>
    );
}

function appLinks(recording) {
    const path = window.location.pathname;
    const isMobileApp = path.startsWith('/m/') || window.location.port === '5174';
    const mobileBase = path.startsWith('/m/') ? '/m' : '';
    const query = new URLSearchParams({
        book: recording.bookName,
        chapter: String(recording.chapter),
        version: VERSION_TO_CLIENT[recording.version] || recording.version
    });
    return {
        home: isMobileApp ? `${mobileBase}/` : '/',
        explore: isMobileApp
            ? `${mobileBase}/bible?${query}`
            : `/?view=verse-explorer&${query}`
    };
}

export default function VoiceBlessingSharePage({ token }) {
    const [share, setShare] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [audioSrc, setAudioSrc] = useState('');
    const [audioLoading, setAudioLoading] = useState(false);
    const [audioError, setAudioError] = useState('');
    const fallbackHome = window.location.pathname.startsWith('/m/') ? '/m/' : '/';

    useEffect(() => {
        const robots = document.querySelector('meta[name="robots"]') || document.createElement('meta');
        const previousContent = robots.getAttribute('content');
        const wasAttached = Boolean(robots.parentNode);
        robots.setAttribute('name', 'robots');
        robots.setAttribute('content', 'noindex, nofollow, noarchive');
        if (!wasAttached) document.head.appendChild(robots);
        return () => {
            if (wasAttached) robots.setAttribute('content', previousContent || 'index, follow');
            else robots.remove();
        };
    }, []);

    useEffect(() => {
        const previousTitle = document.title;
        const metadata = sharePageMetadata(share);
        document.title = metadata.title;
        const restoreMetadata = [
            setDocumentMeta('meta[name="description"]', { name: 'description', content: metadata.description }),
            setDocumentMeta('meta[property="og:title"]', { property: 'og:title', content: metadata.title }),
            setDocumentMeta('meta[property="og:description"]', { property: 'og:description', content: metadata.description }),
            setDocumentMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: metadata.title }),
            setDocumentMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: metadata.description })
        ];
        return () => {
            document.title = previousTitle;
            restoreMetadata.forEach(restore => restore());
        };
    }, [share]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        fetchScriptureRecordingShare(token)
            .then(result => {
                if (!active) return;
                if (!result.card || result.card.kind !== 'VOICE_BLESSING') throw new Error('這不是有效的語音經文祝福');
                setShare(result);
            })
            .catch(nextError => { if (active) setError(nextError.message || '這份祝福不存在或已失效'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [token]);

    const prepareAudio = async () => {
        if (audioSrc) {
            return;
        }
        setAudioLoading(true);
        setAudioError('');
        try {
            const result = await fetchScriptureSharePlaybackTicket(token);
            setAudioSrc(scripturePlaybackUrl(result.ticket));
        } catch (nextError) {
            setAudioError(nextError.message || '語音暫時無法播放');
        } finally {
            setAudioLoading(false);
        }
    };

    if (loading) {
        return <main className="grid h-[100dvh] overflow-y-auto overscroll-y-contain bg-slate-50" role="status" style={{ WebkitOverflowScrolling: 'touch' }}><span className="m-auto inline-flex items-center gap-2 p-5 font-bold text-indigo-700"><Loader2 className="h-5 w-5 animate-spin" />正在開啟祝福卡…</span></main>;
    }

    if (error || !share) {
        return (
            <main className="grid h-[100dvh] overflow-y-auto overscroll-y-contain bg-slate-50 px-5" style={{ WebkitOverflowScrolling: 'touch' }}>
                <section className="m-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl">
                    <Gift className="mx-auto h-10 w-10 text-slate-400" />
                    <h1 className="mt-4 text-2xl font-black text-slate-900">這份祝福目前無法開啟</h1>
                    <p className="mt-2 leading-7 text-slate-600">{error || '連結可能已過期、遭撤銷或錄音已刪除。'}</p>
                    <a href={fallbackHome} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 font-bold text-white">進入聖經智匯</a>
                </section>
            </main>
        );
    }

    const { card, recording, verses } = share;
    const links = appLinks(recording);
    const themeClass = THEMES[card.theme] || THEMES.peace;

    return (
        <div className="h-[100dvh] overflow-y-auto overscroll-y-contain bg-slate-50 text-slate-900" style={{ WebkitOverflowScrolling: 'touch' }}>
            <header className="border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                    <a href={links.home} className="inline-flex items-center gap-3 font-black text-slate-900"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm"><BookOpen className="h-5 w-5" /></span><span>聖經智匯<small className="block text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-700">Biblical Intelligence</small></span></a>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />語音經文祝福</span>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:py-10">
                <article className={`mx-auto max-w-2xl overflow-hidden rounded-[28px] border p-5 shadow-xl sm:p-9 ${themeClass}`}>
                    <small className="font-black tracking-[0.18em] opacity-75">語音經文祝福</small>
                    <p className="mb-1 mt-5 text-sm font-black opacity-75">{card.recipient}</p>
                    <h1 className="font-serif text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{card.title}</h1>
                    <p className="mt-3 text-sm font-black opacity-80">{recording.reference}・{recording.versionName}</p>

                    <section className="mt-5 rounded-2xl bg-white/75 p-4" aria-label="語音祝福播放器">
                        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-700"><Volume2 className="h-5 w-5 text-indigo-600" />一段為你錄下的祝福</div>
                        {!audioSrc ? (
                            <button type="button" onClick={prepareAudio} disabled={audioLoading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-black text-white disabled:opacity-50">{audioLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}{audioLoading ? '準備播放中…' : '播放語音祝福'}</button>
                        ) : (
                            <VoiceBlessingAudioPlayer src={audioSrc} durationMs={recording.durationMs} />
                        )}
                        {audioError ? <p className="mt-2 text-sm font-bold text-rose-700" role="alert">{audioError}</p> : null}
                    </section>

                    <blockquote className="mt-5 border-l-[3px] border-current bg-white/65 px-4 py-4 font-serif text-lg leading-9 text-slate-800">
                        {verses.map(verse => <span key={verse.verse}><sup className="mr-1 text-[11px] font-black">{verse.verseLabel ?? verse.verse}</sup>{stripScriptureSpeechAnnotations(verse.text)} </span>)}
                    </blockquote>
                    {card.message ? <p className="mt-5 whitespace-pre-wrap text-base leading-8 text-slate-800">{card.message}</p> : null}
                    <footer className="mt-5 border-t border-current/15 pt-4 text-sm font-black opacity-80">—— {card.signature}</footer>
                </article>

                <div className="mx-auto mt-5 grid max-w-2xl gap-3 sm:grid-cols-2">
                    <a href={links.explore} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 font-black text-indigo-700"><BookOpen className="h-5 w-5" />在經文探索中閱讀</a>
                    <a href={links.home} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-black text-white">進入聖經智匯<ExternalLink className="h-4 w-4" /></a>
                </div>
                <p className="mt-5 text-center text-xs leading-6 text-slate-500">語音由分享者自行錄製。本站不會自動播放，也不提供正式下載途徑。</p>
            </main>
        </div>
    );
}
