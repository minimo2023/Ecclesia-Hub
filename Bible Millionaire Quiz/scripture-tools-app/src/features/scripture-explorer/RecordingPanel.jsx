import { useEffect, useMemo, useState } from 'react';
import { CircleStop, CloudUpload, Download, Mic, Play, Trash2, X } from 'lucide-react';
import { isSignedIn, saveMemberRecording } from '../../api.js';

function formatSeconds(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function RecordingPanel({ open, onClose, controller, passage, selection, onStart, previewAudioRef, onPreviewPlay, onSaved }) {
    const firstVerse = Number(passage?.[0]?.verse || 1);
    const lastVerse = Number(passage?.at(-1)?.verse || firstVerse);
    const [verseStart, setVerseStart] = useState(firstVerse);
    const [verseEnd, setVerseEnd] = useState(Math.min(lastVerse, firstVerse + 29));
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [savedRecording, setSavedRecording] = useState(null);
    const signedIn = isSignedIn();
    const range = useMemo(() => ({ verseStart, verseEnd }), [verseStart, verseEnd]);
    const rangeValid = verseEnd >= verseStart && verseEnd - verseStart < 30;

    useEffect(() => {
        setVerseStart(firstVerse);
        setVerseEnd(Math.min(lastVerse, firstVerse + 29));
        setSavedRecording(null);
        setSaveError('');
    }, [selection?.version, selection?.book, selection?.chapter, firstVerse, lastVerse]);

    useEffect(() => {
        setSavedRecording(null);
        setSaveError('');
    }, [controller.result?.clientRequestId]);

    if (!open) return null;
    const { supported, isRecording, seconds, result, error, stop, clearResult, markDownloaded, markServerSaved } = controller;
    const downloadName = result ? `${result.filenameBase}.${result.extension}` : '';

    const save = async () => {
        if (!result || !rangeValid) return;
        setSaving(true);
        setSaveError('');
        try {
            const response = await saveMemberRecording({ result, range: { verseStart: result.verseStart, verseEnd: result.verseEnd } });
            setSavedRecording(response.recording);
            markServerSaved();
            onSaved?.(response.recording);
        } catch (nextError) {
            setSaveError(nextError.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <aside className="explorer-drawer recording-drawer" aria-labelledby="recording-panel-title">
            <div className="explorer-drawer-heading">
                <div>
                    <span className="status-pill status-private">預設只留在本機</span>
                    <h2 id="recording-panel-title">我的朗讀</h2>
                </div>
                <button type="button" className="text-button icon-button" onClick={onClose} disabled={isRecording} aria-label="關閉錄音面板"><X size={20} /></button>
            </div>
            <p className="drawer-intro">錄音不會自動上傳、轉文字或評分。只有登入會員主動按下保存後，才會送到私人錄音空間。</p>
            <div className="recording-range-grid">
                <label>起始節
                    <select value={verseStart} disabled={isRecording || Boolean(result)} onChange={event => {
                        const next = Number(event.target.value);
                        setVerseStart(next);
                        setVerseEnd(current => Math.max(next, Math.min(current, next + 29)));
                    }}>{passage.map(item => <option key={item.verse} value={item.verse}>第 {item.verse} 節</option>)}</select>
                </label>
                <label>結束節
                    <select value={verseEnd} disabled={isRecording || Boolean(result)} onChange={event => setVerseEnd(Number(event.target.value))}>
                        {passage.filter(item => Number(item.verse) >= verseStart && Number(item.verse) < verseStart + 30).map(item => <option key={item.verse} value={item.verse}>第 {item.verse} 節</option>)}
                    </select>
                </label>
            </div>
            <div className={`recorder-orb ${isRecording ? 'is-recording' : ''}`}>
                <Mic size={28} />
                <strong>{formatSeconds(seconds)}</strong>
                <small>{isRecording ? '錄音中' : '最長 05:00'}</small>
            </div>

            {!supported && <div className="notice notice-error">這個瀏覽器不支援錄音，請改用新版 Chrome、Edge 或 Safari。</div>}
            {error && <div className="notice notice-error" role="alert">{error}</div>}

            <div className="button-stack">
                {!isRecording ? (
                    <button type="button" className="primary-button" onClick={() => onStart(range)} disabled={!supported || !passage?.length || !rangeValid}>
                        <Mic size={17} /> {result ? '重新錄音' : '開始錄音'}
                    </button>
                ) : (
                    <button type="button" className="danger-button" onClick={() => stop()}>
                        <CircleStop size={17} /> 停止並保留
                    </button>
                )}
            </div>

            {result && (
                <div className="recording-preview">
                    <h3><Play size={16} /> 本機預聽</h3>
                    <p className="recording-reference">{result.reference}</p>
                    <audio ref={previewAudioRef} controls src={result.url} onPlay={onPreviewPlay} />
                     <div className="inline-actions">
                        <a className="secondary-button" href={result.url} download={downloadName} onClick={markDownloaded}>
                            <Download size={16} /> 下載錄音
                        </a>
                        <button type="button" className="text-button" onClick={clearResult}><Trash2 size={16} /> 清除</button>
                     </div>
                    {signedIn ? <button type="button" className="primary-button save-recording-button" onClick={save} disabled={saving || Boolean(savedRecording)}><CloudUpload size={16} /> {saving ? '保存中…' : savedRecording ? '已保存到我的朗讀' : '保存到我的朗讀'}</button> : <div className="login-save-note">登入後才能保存到伺服器及分享。<a href="/">返回主站登入</a></div>}
                    {saveError && <small className="inline-error" role="alert">{saveError}</small>}
                    {!result.downloaded && !result.serverSaved && <small className="helper-text">尚未保存。離開或重新整理頁面前請下載到裝置，或登入後保存。</small>}
                    {result.downloaded && <small className="helper-text saved-local">已下載到裝置。</small>}
                    {result.serverSaved && <small className="helper-text saved-local">伺服器已保存私人副本；是否分享由你決定。</small>}
                </div>
            )}
        </aside>
    );
}
