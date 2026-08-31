import { useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Pause,
    Play,
    Settings2,
    Square,
    Volume2
} from 'lucide-react';
import { SPEECH_RATE_OPTIONS } from './scriptureSpeech.js';

function statusLabel(status, activeVerse) {
    if (status === 'paused') return '朗讀已暫停';
    if (activeVerse !== null) return `正在朗讀第 ${activeVerse} 節`;
    return '經文朗讀';
}

export default function ScriptureReadAloudControls({ controller, hasVerses, compact = false, embedded = false, toolbar = false }) {
    const [expanded, setExpanded] = useState(!compact);
    const {
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
    } = controller;

    if (!supported) {
        if (toolbar) {
            return (
                <div
                    className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-2 text-slate-400"
                    role="status"
                    aria-label="這個瀏覽器不支援系統朗讀"
                    data-scripture-read-aloud="unsupported"
                >
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                </div>
            );
        }
        return (
            <div
                className={`${embedded ? '' : 'border-t border-slate-200'} bg-white px-4 py-3 text-sm text-slate-500`}
                role="status"
                data-scripture-read-aloud="unsupported"
            >
                <span className="inline-flex items-center gap-2">
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                    這個瀏覽器不支援系統朗讀。
                </span>
            </div>
        );
    }

    const isPlaying = status === 'playing';
    const isPaused = status === 'paused';
    const inlineSettings = embedded && !compact;

    const settings = (
        <>
            <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-600">
                速度
                <select
                    value={rate}
                    onChange={event => setRate(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    aria-label="朗讀速度"
                >
                    {SPEECH_RATE_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}×</option>
                    ))}
                </select>
            </label>

            {voices.length > 1 ? (
                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-bold text-slate-600">
                    語音
                    <select
                        value={voiceUri}
                        onChange={event => setVoiceUri(event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        aria-label="中文朗讀語音"
                    >
                        {voices.map(voice => (
                            <option key={voice.voiceURI} value={voice.voiceURI}>
                                {voice.name}（{voice.lang}）
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}
        </>
    );

    if (toolbar) {
        return (
            <section
                className="min-w-0"
                aria-label="經文朗讀控制"
                data-scripture-read-aloud={status}
            >
                <span className="sr-only" aria-live="polite">{statusLabel(status, activeVerse)}</span>
                <div className="flex items-center gap-1.5">
                    {!isPlaying ? (
                        <button
                            type="button"
                            onClick={play}
                            disabled={!hasVerses}
                            className="inline-flex h-9 min-w-[4.75rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={isPaused ? '繼續朗讀' : '開始朗讀'}
                            title={isPaused ? '繼續朗讀' : '開始朗讀'}
                        >
                            <Play className="h-4 w-4" aria-hidden="true" />
                            {isPaused ? '繼續' : '朗讀'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={pause}
                            className="inline-flex h-9 min-w-[4.75rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-indigo-700"
                            aria-label="暫停朗讀"
                            title="暫停朗讀"
                        >
                            <Pause className="h-4 w-4" aria-hidden="true" />
                            暫停
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={stop}
                        disabled={status === 'idle'}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="停止朗讀"
                        title="停止朗讀"
                    >
                        <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        onClick={() => setExpanded(value => !value)}
                        className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors ${expanded ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        aria-expanded={expanded}
                        aria-label={expanded ? '收合朗讀設定' : '展開朗讀設定'}
                        title="朗讀設定"
                    >
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                        <span>朗讀設定</span>
                    </button>
                </div>

                {expanded ? (
                    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+6.5rem)] z-50 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                        {settings}
                        <p className="text-[11px] leading-5 text-slate-500">朗讀時不念節號，並略過「或譯／有古卷」等譯註。</p>
                        {error ? <p className="text-xs font-medium text-rose-600" role="alert">{error}</p> : null}
                    </div>
                ) : error ? <span className="sr-only" role="alert">{error}</span> : null}
            </section>
        );
    }

    return (
        <section
            className={`${embedded ? 'bg-transparent' : `border border-slate-200 bg-white/95 shadow-lg backdrop-blur-md ${compact ? 'rounded-2xl' : 'border-x-0 border-b-0 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]'}`}`}
            aria-label="經文朗讀控制"
            data-scripture-read-aloud={status}
        >
            <div className={`flex items-center gap-3 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
                <div className={`flex min-w-0 items-center gap-2.5 ${inlineSettings ? 'flex-[0.75]' : 'flex-1'}`} aria-live="polite">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{statusLabel(status, activeVerse)}</p>
                        {(!compact || expanded) && !inlineSettings ? (
                            <p className="truncate text-xs text-slate-500">不念節號，並略過「或譯／有古卷」等譯註</p>
                        ) : null}
                    </div>
                </div>

                {!isPlaying ? (
                    <button
                        type="button"
                        onClick={play}
                        disabled={!hasVerses}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={isPaused ? '繼續朗讀' : '開始朗讀'}
                    >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        {isPaused ? '繼續' : '朗讀'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={pause}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
                        aria-label="暫停朗讀"
                    >
                        <Pause className="h-4 w-4" aria-hidden="true" />
                        暫停
                    </button>
                )}

                <button
                    type="button"
                    onClick={stop}
                    disabled={status === 'idle'}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="停止朗讀"
                >
                    <Square className="h-4 w-4" aria-hidden="true" />
                </button>

                {inlineSettings ? settings : null}
                {inlineSettings && error ? <span className="sr-only" role="alert">{error}</span> : null}

                {compact ? (
                    <button
                        type="button"
                        onClick={() => setExpanded(value => !value)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"
                        aria-expanded={expanded}
                        aria-label={expanded ? '收合朗讀設定' : '展開朗讀設定'}
                    >
                        {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                    </button>
                ) : null}
            </div>

            {expanded && !inlineSettings ? (
                <div className={`flex flex-wrap items-center gap-3 border-t border-slate-100 ${compact ? 'px-3 py-3' : 'px-4 py-2.5'}`}>
                    {settings}

                    {error ? <p className="basis-full text-xs font-medium text-rose-600" role="alert">{error}</p> : null}
                </div>
            ) : null}
        </section>
    );
}
