import { useEffect, useRef, useState } from 'react';
import { CircleStop, Download, Mic, Play, Trash2 } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { ScripturePicker } from '../components/ScripturePicker.jsx';
import { PassageDisplay } from '../components/PassageDisplay.jsx';
import { fetchChapter } from '../api.js';

const initialSelection = { version: 'CUV_TRAD', book: '詩篇', chapter: 23 };

export function RecordPage() {
    const [selection, setSelection] = useState(initialSelection);
    const [passage, setPassage] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [audioUrl, setAudioUrl] = useState('');
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const supported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

    useEffect(() => () => {
        clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach(track => track.stop());
        if (audioUrl) URL.revokeObjectURL(audioUrl);
    }, [audioUrl]);

    const load = async next => {
        setLoading(true); setError('');
        try { setPassage(await fetchChapter(next)); setSelection(next); }
        catch (loadError) { setPassage([]); setError(loadError.message); }
        finally { setLoading(false); }
    };

    const startRecording = async () => {
        if (!supported || recording) return;
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            streamRef.current = stream;
            recorderRef.current = recorder;
            chunksRef.current = [];
            recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                setAudioUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob); });
                stream.getTracks().forEach(track => track.stop());
            };
            recorder.start(1000);
            setSeconds(0);
            setRecording(true);
            timerRef.current = setInterval(() => setSeconds(value => {
                if (value >= 299) { recorder.stop(); clearInterval(timerRef.current); setRecording(false); return 300; }
                return value + 1;
            }), 1000);
        } catch {
            setError('無法使用麥克風。請確認已允許權限，或檢查瀏覽器的麥克風設定。');
        }
    };

    const stopRecording = () => {
        if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
        clearInterval(timerRef.current);
        setRecording(false);
    };

    const clearRecording = () => setAudioUrl(previous => { if (previous) URL.revokeObjectURL(previous); return ''; });
    const timestamp = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    return (
        <AppShell title="我的朗讀" eyebrow="經文工具・本機錄音">
            <p className="page-intro">錄音只先留在這個頁面供預聽或下載，不會自動上傳、分享、轉文字或進行聲音評分。</p>
            <ScripturePicker value={selection} onChange={setSelection} onLoad={load} loading={loading} />
            {error && <div className="notice notice-error">{error}</div>}
            <div className="workspace-grid">
                <PassageDisplay passage={passage} reference={`${selection.book} ${selection.chapter} 章`} />
                <aside className="control-card sticky-card">
                    <span className="status-pill status-private">未上傳</span>
                    <h2>錄音控制</h2>
                    <div className={`recorder-orb ${recording ? 'is-recording' : ''}`}><Mic size={28} /><strong>{timestamp}</strong></div>
                    {!supported && <p>這個瀏覽器不支援錄音，請改用新版 Chrome、Edge 或 Safari。</p>}
                    <div className="button-stack">
                        {!recording ? (
                            <button className="primary-button" onClick={startRecording} disabled={!supported || !passage.length}><Mic size={17} /> 開始錄音</button>
                        ) : (
                            <button className="danger-button" onClick={stopRecording}><CircleStop size={17} /> 停止錄音</button>
                        )}
                    </div>
                    {audioUrl && <div className="recording-preview">
                        <h3><Play size={16} /> 本機預聽</h3>
                        <audio controls src={audioUrl} />
                        <div className="inline-actions">
                            <a className="secondary-button" href={audioUrl} download={`${selection.book}-${selection.chapter}章-我的朗讀.webm`}><Download size={16} /> 下載</a>
                            <button className="text-button" onClick={clearRecording}><Trash2 size={16} /> 清除</button>
                        </div>
                    </div>}
                    <small className="helper-text">錄音上限 5 分鐘。關閉頁面後，本次未下載的錄音將消失。</small>
                </aside>
            </div>
        </AppShell>
    );
}
