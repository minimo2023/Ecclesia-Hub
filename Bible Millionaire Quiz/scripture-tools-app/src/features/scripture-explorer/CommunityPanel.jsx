import { useEffect, useState } from 'react';
import { Flag, LoaderCircle, MessageCircle, ShieldOff, Users } from 'lucide-react';
import {
    addRecordingComment,
    blockRecordingMember,
    deleteRecordingComment,
    fetchCommunityRecordings,
    fetchCurrentMember,
    fetchRecordingComments,
    isSignedIn,
    moderateRecordingComment,
    reportCommunityRecording,
    setRecordingReaction
} from '../../api.js';
import { SecureAudioPlayer } from './SecureAudioPlayer.jsx';
import { ModerationQueue } from './ModerationQueue.jsx';

const REACTIONS = [
    ['THANKS', '❤️', '感謝'],
    ['AMEN', '🙏', '阿們'],
    ['HELPED', '✨', '得幫助'],
    ['GROWING', '🌱', '一起成長']
];

function Comments({ recording, signedIn, isAdmin, onCountChanged }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [content, setContent] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        setBusy(true);
        try {
            const result = await fetchRecordingComments(recording.id);
            setItems(result.items || []);
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusy(false);
        }
    };

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) load();
    };

    const submit = async event => {
        event.preventDefault();
        if (!content.trim()) return;
        setBusy(true);
        setError('');
        try {
            await addRecordingComment(recording.id, content);
            setContent('');
            await load();
            onCountChanged?.();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async commentId => {
        await deleteRecordingComment(commentId);
        await load();
        onCountChanged?.();
    };

    const moderateRemove = async commentId => {
        if (!window.confirm('確定由管理員隱藏這則留言嗎？')) return;
        setBusy(true);
        try {
            await moderateRecordingComment(commentId, 'HIDE', '管理員經人工檢視處理');
            await load();
            onCountChanged?.();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="community-comments">
            <button type="button" className="text-button" onClick={toggle}><MessageCircle size={16} /> 留言 {recording.commentCount || ''}</button>
            {open && <div className="comment-thread">
                {busy && !items.length && <small>載入留言中…</small>}
                {items.map(comment => <div className="comment-row" key={comment.id}>
                    <div><strong>{comment.displayName || comment.username || '會員'}</strong><p>{comment.content}</p></div>
                    {comment.isOwner
                        ? <button type="button" className="text-button" onClick={() => remove(comment.id)}>刪除</button>
                        : isAdmin && <button type="button" className="text-button danger-text" onClick={() => moderateRemove(comment.id)}>管理隱藏</button>}
                </div>)}
                {!items.length && !busy && <small>目前還沒有留言。</small>}
                {signedIn && recording.commentsEnabled ? <form className="comment-form" onSubmit={submit}>
                    <textarea value={content} onChange={event => setContent(event.target.value)} maxLength={300} placeholder="留下簡短鼓勵（不能包含網址）" />
                    <div><small>{Array.from(content).length}/300</small><button className="primary-button" disabled={busy || !content.trim()}>送出</button></div>
                </form> : <small>{recording.commentsEnabled ? '登入後可以留言。' : '朗讀者已關閉留言。'}</small>}
                {error && <small className="inline-error" role="alert">{error}</small>}
            </div>}
        </div>
    );
}

export function CommunityPanel({ selection, passage }) {
    const signedIn = isSignedIn();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (!signedIn) return;
        fetchCurrentMember().then(result => {
            const roles = result?.user?.adminRoles || result?.entitlements?.membership?.adminRoles || [];
            setIsAdmin(result?.user?.role === 'super_admin' || roles.includes('admin_ops'));
        }).catch(() => setIsAdmin(false));
    }, [signedIn]);

    const load = async () => {
        if (!selection?.book || !selection?.chapter) return;
        setLoading(true);
        setError('');
        try {
            const result = await fetchCommunityRecordings({
                version: selection.version,
                book: selection.book,
                chapter: selection.chapter,
                verseStart: passage[0]?.verse || 1,
                verseEnd: passage.at(-1)?.verse || 30
            });
            setItems(result.items || []);
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [selection?.version, selection?.book, selection?.chapter]);

    const react = async (recording, reactionType) => {
        if (!signedIn) return;
        try {
            await setRecordingReaction(recording.id, reactionType);
            await load();
        } catch (nextError) {
            setError(nextError.message);
        }
    };

    const report = async recording => {
        if (!signedIn || !window.confirm('確定要將這筆朗讀交給管理員檢查嗎？')) return;
        try {
            await reportCommunityRecording(recording.id, 'OTHER');
            setError('已送出檢舉，管理員會進一步查看。');
        } catch (nextError) {
            setError(nextError.message);
        }
    };

    const block = async recording => {
        if (!signedIn || !window.confirm(`確定不再顯示「${recording.displayName}」的朗讀與留言嗎？`)) return;
        try {
            await blockRecordingMember(recording.ownerId);
            await load();
        } catch (nextError) {
            setError(nextError.message);
        }
    };

    return (
        <section className="community-library" aria-labelledby="community-title">
            {isAdmin && <ModerationQueue />}
            <header className="section-heading-row">
                <div><span className="status-pill status-public">經文範圍內</span><h2 id="community-title">經文共讀</h2></div>
                <button type="button" className="text-button" onClick={load} disabled={loading}>重新整理</button>
            </header>
            <p className="section-intro">只顯示目前書卷與章節的公開朗讀，不會延伸成全站動態牆。</p>
            {error && <div className="notice" role="status">{error}</div>}
            {loading && <div className="compact-loading"><LoaderCircle className="spin" /> 載入中…</div>}
            {!loading && !items.length && <div className="recording-empty-card"><Users size={32} /><h3>這一章還沒有公開朗讀</h3><p>你可以錄下自己的朗讀，再到「我的朗讀」決定是否公開。</p></div>}
            <div className="recording-card-list">
                {items.map(recording => <article className="recording-card community-card" key={recording.id}>
                    <div className="recording-card-heading">
                        <div><strong>{recording.reference}</strong><small>{recording.displayName}・{new Date(recording.publishedAt).toLocaleDateString('zh-TW')}</small></div>
                        <span className="status-pill status-public">公開共讀</span>
                    </div>
                    <SecureAudioPlayer recordingId={recording.id} label="聆聽分享者朗讀" />
                    <div className="reaction-row" aria-label="朗讀回應">
                        {REACTIONS.map(([value, icon, label]) => <button
                            type="button"
                            key={value}
                            className={recording.myReaction === value ? 'is-selected' : ''}
                            onClick={() => react(recording, value)}
                            disabled={!signedIn}
                            title={signedIn ? label : '登入後可以回應'}
                        ><span>{icon}</span>{label}<small>{recording.reactionCounts?.[value] || ''}</small></button>)}
                    </div>
                    <Comments recording={recording} signedIn={signedIn} isAdmin={isAdmin} onCountChanged={load} />
                    {signedIn && !recording.isOwner && <div className="community-safety-actions">
                        <button type="button" className="text-button" onClick={() => report(recording)}><Flag size={14} /> 檢舉</button>
                        <button type="button" className="text-button" onClick={() => block(recording)}><ShieldOff size={14} /> 不再顯示此讀者</button>
                    </div>}
                </article>)}
            </div>
        </section>
    );
}

export default CommunityPanel;
