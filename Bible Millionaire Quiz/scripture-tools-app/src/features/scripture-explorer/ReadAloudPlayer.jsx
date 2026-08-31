import { Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { SpeechRateSelect } from '../../components/SpeechRateSelect.jsx';

export function ReadAloudPlayer({
    controller,
    passageLoaded,
    recordingActive,
    onPlay
}) {
    const {
        status,
        activeVerse,
        rate,
        voices,
        voiceUri,
        error,
        setRate,
        setVoiceUri,
        pause,
        stop
    } = controller;

    if (!controller.supported) {
        return (
            <section className="explorer-audio-hub" aria-label="系統朗讀控制">
                <div className="explorer-player explorer-player-unavailable">
                    <Volume2 size={18} /> 這個瀏覽器不支援系統朗讀；仍可閱讀經文及製作語音祝福卡。
                </div>
            </section>
        );
    }

    return (
        <section className="explorer-audio-hub" aria-label="系統朗讀控制">
            <div className="explorer-audio-heading">
                <Volume2 size={17} />
                <span><strong>系統朗讀</strong><small>只使用裝置語音，不會播放會員錄音</small></span>
            </div>
            <div className="explorer-player">
                <div className="explorer-player-status" aria-live="polite">
                    <Volume2 size={19} />
                    <span>
                        <strong>{activeVerse !== null ? `正在朗讀第 ${activeVerse} 節` : status === 'paused' ? '朗讀已暫停' : '經文朗讀'}</strong>
                        <small>{recordingActive ? '語音祝福錄音中，系統朗讀已停用' : '不念節號；原譯本有分段時會自然停頓'}</small>
                    </span>
                </div>
                <div className="explorer-player-actions">
                    <button
                        type="button"
                        className="primary-button"
                        onClick={onPlay}
                        disabled={!passageLoaded || status === 'playing' || recordingActive}
                    >
                        {status === 'paused' ? <RotateCcw size={17} /> : <Play size={17} />}
                        {status === 'paused' ? '繼續' : '朗讀'}
                    </button>
                    <button type="button" className="secondary-button icon-button" onClick={pause} disabled={status !== 'playing'} aria-label="暫停朗讀">
                        <Pause size={17} />
                    </button>
                    <button type="button" className="secondary-button icon-button" onClick={stop} disabled={status === 'idle'} aria-label="停止朗讀">
                        <Square size={16} />
                    </button>
                    <SpeechRateSelect value={rate} onChange={setRate} className="explorer-rate" />
                    {voices.length > 0 && (
                        <label className="explorer-voice-select">語音
                            <select value={voiceUri} onChange={event => setVoiceUri(event.target.value)} aria-label="中文朗讀語音">
                                {voices.map(voice => (
                                    <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}（{voice.lang}）</option>
                                ))}
                            </select>
                        </label>
                    )}
                    {error && <small className="inline-error explorer-speech-error" role="alert">{error}</small>}
                </div>
            </div>
        </section>
    );
}
