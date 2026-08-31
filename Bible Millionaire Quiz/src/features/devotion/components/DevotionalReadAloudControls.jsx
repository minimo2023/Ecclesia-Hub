import { useState } from 'react';
import { Headphones, Music2, Pause, Play, Settings2, Square, Volume2 } from 'lucide-react';
import { SPEECH_RATE_OPTIONS } from '../../scripture-reading/scriptureSpeech.js';
import { useDevotionalBackgroundMusic } from '../useDevotionalBackgroundMusic.js';

export default function DevotionalReadAloudControls({ controller }) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const backgroundMusic = useDevotionalBackgroundMusic();
    const {
        supported,
        hasContent,
        status,
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
    } = controller;

    const isPlaying = status === 'playing';
    const isPaused = status === 'paused';
    const isMusicPlaying = backgroundMusic.status === 'playing';
    const statusText = activeLabel
        ? `${isPaused ? '已暫停' : '正在朗讀'}：${activeLabel}`
        : '靈修短文朗讀';

    return (
        <section
            className="min-w-0 text-left"
            aria-label="靈修短文朗讀"
            data-devotional-read-aloud={status}
        >
            <span className="sr-only" aria-live="polite">{statusText}</span>
            <div className="flex flex-wrap items-center justify-center gap-1.5 p-0.5 sm:justify-start">
                <span
                    className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-black ring-1 ${isPlaying ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-indigo-50 text-indigo-700 ring-indigo-200'}`}
                    title={statusText}
                >
                    <Headphones className="h-4 w-4" aria-hidden="true" />
                    靈修
                </span>

                {supported && !isPlaying ? (
                    <button
                        type="button"
                        onClick={play}
                        disabled={!hasContent}
                        className="inline-flex h-9 min-w-[4.75rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={isPaused ? '繼續朗讀靈修短文' : '開始朗讀靈修短文'}
                        title={isPaused ? '繼續朗讀' : '開始朗讀'}
                    >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        {isPaused ? '繼續' : '朗讀'}
                    </button>
                ) : supported ? (
                    <button
                        type="button"
                        onClick={pause}
                        className="inline-flex h-9 min-w-[4.75rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-indigo-700"
                        aria-label="暫停朗讀靈修短文"
                        title="暫停朗讀"
                    >
                        <Pause className="h-4 w-4" aria-hidden="true" />
                        暫停
                    </button>
                ) : null}
                {supported ? (
                    <button
                        type="button"
                        onClick={stop}
                        disabled={status === 'idle'}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="停止朗讀靈修短文"
                        title="停止朗讀"
                    >
                        <Square className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : null}
                {backgroundMusic.supported ? (
                    <button
                        type="button"
                        onClick={backgroundMusic.toggle}
                        className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors ${isMusicPlaying ? 'bg-amber-500 text-white shadow-sm' : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                        aria-label={isMusicPlaying ? '暫停今日背景音樂' : '播放今日背景音樂'}
                        aria-pressed={isMusicPlaying}
                        title={backgroundMusic.currentTrack?.title || '今日背景音樂'}
                    >
                        {isMusicPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Music2 className="h-4 w-4" aria-hidden="true" />}
                        <span>{isMusicPlaying ? '暫停音樂' : '播放音樂'}</span>
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={() => setSettingsOpen(value => !value)}
                    className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors ${settingsOpen ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
                    aria-label={settingsOpen ? '收合靈修朗讀設定' : '展開靈修朗讀設定'}
                    aria-expanded={settingsOpen}
                    title="朗讀設定"
                >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    <span>朗讀設定</span>
                </button>
            </div>

            {settingsOpen ? (
                <div className="mt-2 grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-lg sm:grid-cols-2">
                    {supported ? <label className="grid gap-1.5 text-xs font-bold text-stone-600">
                        朗讀速度
                        <select
                            value={rate}
                            onChange={event => setRate(event.target.value)}
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        >
                            {SPEECH_RATE_OPTIONS.map(option => (
                                <option key={option} value={option}>{option}×</option>
                            ))}
                        </select>
                    </label> : null}

                    {supported && voices.length > 1 ? (
                        <label className="grid min-w-0 gap-1.5 text-xs font-bold text-stone-600">
                            中文語音
                            <select
                                value={voiceUri}
                                onChange={event => setVoiceUri(event.target.value)}
                                className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            >
                                {voices.map(voice => (
                                    <option key={voice.voiceURI} value={voice.voiceURI}>
                                        {voice.name}（{voice.lang}）
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    {backgroundMusic.supported ? (
                        <label className="grid gap-1.5 text-xs font-bold text-stone-600 sm:col-span-2">
                            <span className="flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" aria-hidden="true" />背景音樂音量</span>
                                <span className="font-medium text-stone-400">{Math.round(backgroundMusic.volume * 100)}%</span>
                            </span>
                            <input
                                type="range"
                                min="0"
                                max="0.5"
                                step="0.01"
                                value={backgroundMusic.volume}
                                onChange={event => backgroundMusic.setVolume(event.target.value)}
                                className="h-2 w-full cursor-pointer accent-amber-500"
                                aria-label="背景音樂音量"
                            />
                        </label>
                    ) : null}
                    <p className="text-[11px] leading-5 text-stone-500 sm:col-span-2">
                        {supported ? '朗讀會依文章區塊與段落自然停頓。' : '這個瀏覽器不支援裝置朗讀。'}
                        {backgroundMusic.currentTrack ? ` 今日選曲：${backgroundMusic.currentTrack.title}，當天會循環播放同一首。` : ''}
                    </p>
                    {error ? <p className="text-xs font-medium text-rose-600 sm:col-span-2" role="alert">{error}</p> : null}
                    {backgroundMusic.error ? <p className="text-xs font-medium text-rose-600 sm:col-span-2" role="alert">{backgroundMusic.error}</p> : null}
                </div>
            ) : error || backgroundMusic.error ? (
                <p className="mt-2 text-xs font-medium text-rose-600" role="alert">{error || backgroundMusic.error}</p>
            ) : null}
        </section>
    );
}
