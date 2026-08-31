import { useCallback, useEffect, useState } from 'react';
import { Bell, Eye, EyeOff, Link2, LoaderCircle, Mic2, Trash2 } from 'lucide-react';
import {
    createRecordingShare,
    deleteMemberRecording,
    fetchMyRecordings,
    fetchRecordingNotifications,
    isSignedIn,
    markRecordingNotificationsRead,
    revokeRecordingShare,
    updateMemberRecording
} from '../../api.js';
import { SecureAudioPlayer } from './SecureAudioPlayer.jsx';
import { ShareLinkCard } from './ShareLinkCard.jsx';

const NOTIFICATION_LABELS = {
    REACTION: '有人回應了你的朗讀',
    COMMENT: '有人在你的朗讀下留言',
    MODERATION: '你的朗讀有新的管理結果'
};

function RecordingNotifications() {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const result = await fetchRecordingNotifications();
            setItems(result.items || []);
        } catch (nextError) {
            setError(nextError.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    const unread = items.filter(item => !item.readAt).length;

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && unread) {
            try {
                await markRecordingNotificationsRead();
                await load();
            } catch (nextError) {
                setError(nextError.message);
            }
        }
    };

    if (!items.length && !error) return null;
    return <aside className="recording-notifications" aria-label="朗讀與共讀通知">
        <button type="button" className="text-button" onClick={toggle} aria-expanded={open}>
            <Bell size={16} /> 朗讀通知{unread ? `（${unread}）` : ''}
        </button>
        {open && <div className="recording-notification-list">
            {items.map(item => <div key={item.id}>
                <strong>{NOTIFICATION_LABELS[item.notificationType] || '朗讀內容有新消息'}</strong>
                <small>{new Date(item.createdAt).toLocaleString('zh-TW')}</small>
            </div>)}
            {error && <small className="inline-error" role="alert">{error}</small>}
        </div>}
    </aside>;
}

export function MyRecordingsPanel({ refreshKey = 0 }) {
    const signedIn = isSignedIn();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [share, setShare] = useState(null);
    const [busyId, setBusyId] = useState('');
    const [publishingId, setPublishingId] = useState('');

    const load = useCallback(async () => {
        if (!signedIn) return;
        setLoading(true);
        setError('');
        try {
            const result = await fetchMyRecordings();
            setItems(result.items || []);
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    }, [signedIn]);

    useEffect(() => { load(); }, [load, refreshKey]);

    if (!signedIn) return (
        <div className="recording-empty-card">
            <Mic2 size={32} />
            <h2>登入後保存自己的朗讀</h2>
            <p>訪客仍可在閱讀頁錄音、預聽及下載到裝置；伺服器不會保存訪客錄音。</p>
            <a className="primary-button" href="/">返回主站登入</a>
        </div>
    );

    const update = async (recording, patch) => {
        setBusyId(recording.id);
        setError('');
        try {
            await updateMemberRecording(recording.id, patch);
            await load();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusyId('');
        }
    };

    const createShare = async (recording, expiresInDays) => {
        setBusyId(recording.id);
        setError('');
        try {
            const result = await createRecordingShare(recording.id, expiresInDays);
            setShare({ ...result, recordingId: recording.id });
            await load();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusyId('');
        }
    };

    const changeVisibility = (recording, visibility) => {
        if (visibility === 'PUBLIC' && recording.visibility !== 'PUBLIC') {
            setPublishingId(recording.id);
            return;
        }
        setPublishingId('');
        update(recording, { visibility });
    };

    const remove = async recording => {
        if (!window.confirm(`確定刪除「${recording.reference}」的朗讀嗎？分享連結會立即失效。`)) return;
        setBusyId(recording.id);
        try {
            await deleteMemberRecording(recording.id);
            if (share?.recordingId === recording.id) setShare(null);
            await load();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusyId('');
        }
    };

    const revoke = async (recording, shareId) => {
        setBusyId(recording.id);
        setError('');
        try {
            await revokeRecordingShare(shareId);
            if (share?.id === shareId) setShare(null);
            await load();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusyId('');
        }
    };

    return (
        <section className="recording-library" aria-labelledby="my-recordings-title">
            <RecordingNotifications />
            <header className="section-heading-row">
                <div><span className="status-pill status-private">會員私人空間</span><h2 id="my-recordings-title">我的朗讀</h2></div>
                <button type="button" className="text-button" onClick={load} disabled={loading}>重新整理</button>
            </header>
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            {loading && <div className="compact-loading"><LoaderCircle className="spin" /> 載入中…</div>}
            {!loading && !items.length && <div className="empty-state">還沒有保存的朗讀。回到「閱讀與聆聽」即可開始錄音。</div>}
            <div className="recording-card-list">
                {items.map(recording => (
                    <article className="recording-card" key={recording.id}>
                        <div className="recording-card-heading">
                            <div><strong>{recording.reference}</strong><small>{new Date(recording.createdAt).toLocaleString('zh-TW')}</small></div>
                            <span className={`status-pill status-${recording.visibility.toLowerCase()}`}>{recording.visibility === 'PRIVATE' ? '私人' : recording.visibility === 'UNLISTED' ? '連結分享' : '公開共讀'}</span>
                        </div>
                        <SecureAudioPlayer recordingId={recording.id} label="聆聽我的朗讀" />
                        <div className="recording-settings">
                            <label>分享範圍
                                <select value={recording.visibility} disabled={busyId === recording.id} onChange={event => changeVisibility(recording, event.target.value)}>
                                    <option value="PRIVATE">只限自己</option>
                                    <option value="UNLISTED">持連結者</option>
                                    <option value="PUBLIC">經文共讀公開</option>
                                </select>
                            </label>
                            {publishingId === recording.id && <div className="public-identity-choice" role="group" aria-label="公開朗讀顯示名稱">
                                <strong>公開前，請選擇朗讀者名稱</strong>
                                <small>預設建議使用匿名讀者，之後仍可變更。</small>
                                <div className="inline-actions">
                                    <button type="button" className="primary-button" onClick={() => { setPublishingId(''); update(recording, { visibility: 'PUBLIC', displayAnonymous: true }); }}>匿名讀者</button>
                                    <button type="button" className="secondary-button" onClick={() => { setPublishingId(''); update(recording, { visibility: 'PUBLIC', displayAnonymous: false }); }}>顯示會員名稱</button>
                                    <button type="button" className="text-button" onClick={() => setPublishingId('')}>取消</button>
                                </div>
                            </div>}
                            {recording.visibility === 'PUBLIC' && <>
                                <label className="check-row"><input type="checkbox" checked={recording.displayAnonymous} onChange={event => update(recording, { displayAnonymous: event.target.checked })} />匿名顯示</label>
                                <label className="check-row"><input type="checkbox" checked={recording.commentsEnabled} onChange={event => update(recording, { commentsEnabled: event.target.checked })} />允許留言</label>
                            </>}
                        </div>
                        <div className="inline-actions">
                            <button type="button" className="secondary-button" onClick={() => createShare(recording, 7)} disabled={busyId === recording.id}><Link2 size={16} /> 7天連結</button>
                            <button type="button" className="secondary-button" onClick={() => createShare(recording, 30)} disabled={busyId === recording.id}><Link2 size={16} /> 30天連結</button>
                            <button type="button" className="text-button" onClick={() => createShare(recording, 'never')} disabled={busyId === recording.id}>{recording.visibility === 'PUBLIC' ? <Eye size={16} /> : <EyeOff size={16} />} 永久連結</button>
                            <button type="button" className="text-button danger-text" onClick={() => remove(recording)} disabled={busyId === recording.id}><Trash2 size={16} /> 刪除</button>
                        </div>
                        {recording.activeShares?.length > 0 && <div className="active-share-list" aria-label="有效分享連結">
                            <small>有效分享：{recording.activeShares.length} 個</small>
                            {recording.activeShares.map(activeShare => <button
                                type="button"
                                className="text-button danger-text"
                                key={activeShare.id}
                                disabled={busyId === recording.id}
                                onClick={() => revoke(recording, activeShare.id)}
                            >撤銷{activeShare.expiresAt ? `（${new Date(activeShare.expiresAt).toLocaleDateString('zh-TW')} 到期）` : '（永久）'}</button>)}
                        </div>}
                        {share?.recordingId === recording.id && <ShareLinkCard token={share.token} onClose={() => setShare(null)} />}
                    </article>
                ))}
            </div>
        </section>
    );
}

export default MyRecordingsPanel;
