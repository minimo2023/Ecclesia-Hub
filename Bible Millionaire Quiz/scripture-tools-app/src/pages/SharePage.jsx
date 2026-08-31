import { useEffect, useState } from 'react';
import { BookOpen, Clock3, ShieldCheck } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { fetchSharedRecording } from '../api.js';
import { SecureAudioPlayer } from '../features/scripture-explorer/SecureAudioPlayer.jsx';

export function SharePage() {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        document.title = '經文朗讀分享｜Ecclesia Hub';
        let meta = document.querySelector('meta[name="robots"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'robots';
            document.head.appendChild(meta);
        }
        meta.content = 'noindex,nofollow,noarchive';
        if (!token) {
            setError('分享連結不完整');
            setLoading(false);
            return;
        }
        fetchSharedRecording(token)
            .then(setData)
            .catch(nextError => setError(nextError.message))
            .finally(() => setLoading(false));
    }, [token]);

    return (
        <AppShell title="經文朗讀分享" eyebrow="持連結者可聆聽">
            <section className="public-share-page">
                {loading && <div className="empty-state">正在開啟分享…</div>}
                {error && <div className="notice notice-error" role="alert">{error}</div>}
                {data?.recording && <>
                    <div className="share-passage-mark"><BookOpen size={28} /></div>
                    <span className="status-pill status-unlisted">不提供下載</span>
                    <h2>{data.recording.reference}</h2>
                    <p>{data.recording.versionName || data.recording.version}・朗讀者：{data.recording.displayName}</p>
                    {data.expiresAt && <small className="share-expiry"><Clock3 size={14} /> 有效至 {new Date(data.expiresAt).toLocaleString('zh-TW')}</small>}
                    <SecureAudioPlayer shareToken={token} label="準備聆聽" />
                    <div className="share-privacy-note"><ShieldCheck size={17} /> 此頁只提供線上播放，不會自動播放，也不提供錄音檔下載。</div>
                    <a className="secondary-button" href="explore.html">返回經文探索</a>
                </>}
            </section>
        </AppShell>
    );
}

export default SharePage;
