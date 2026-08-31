import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import {
    fetchModerationPlaybackTicket,
    fetchRecordingModerationQueue,
    moderateCommunityRecording
} from '../../api.js';
import { SecureAudioPlayer } from './SecureAudioPlayer.jsx';

export function ModerationQueue() {
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');

    const load = useCallback(async () => {
        try {
            const result = await fetchRecordingModerationQueue();
            setItems(result.items || []);
        } catch (nextError) {
            setError(nextError.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const moderate = async (recording, action) => {
        const prompt = action === 'RESTORE' ? '恢復這筆公開朗讀？' : '移除這筆公開朗讀？既有分享會立即失效。';
        if (!window.confirm(prompt)) return;
        setBusyId(recording.id);
        try {
            await moderateCommunityRecording(recording.id, action, '管理員經人工檢視處理');
            await load();
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setBusyId('');
        }
    };

    if (!items.length && !error) return null;
    return (
        <section className="moderation-queue" aria-labelledby="moderation-title">
            <header className="section-heading-row">
                <div><span className="status-pill status-review">管理功能</span><h3 id="moderation-title"><ShieldAlert size={18} /> 待審朗讀</h3></div>
                <button type="button" className="text-button" onClick={load}>重新整理</button>
            </header>
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            {items.map(recording => <article className="recording-card" key={recording.id}>
                <div className="recording-card-heading">
                    <div><strong>{recording.reference}</strong><small>{recording.displayName}・{recording.reportCount} 位會員檢舉</small></div>
                    <span className="status-pill status-review">已暫停公開</span>
                </div>
                <SecureAudioPlayer recordingId={recording.id} ticketLoader={fetchModerationPlaybackTicket} label="管理員聆聽" />
                <ul className="moderation-reasons">
                    {recording.reports?.map((report, index) => <li key={`${recording.id}-${index}`}>{report.reason}{report.detail ? `：${report.detail}` : ''}</li>)}
                </ul>
                <div className="inline-actions">
                    <button type="button" className="secondary-button" disabled={busyId === recording.id} onClick={() => moderate(recording, 'RESTORE')}><RotateCcw size={16} /> 恢復</button>
                    <button type="button" className="danger-button" disabled={busyId === recording.id} onClick={() => moderate(recording, 'REMOVE')}><Trash2 size={16} /> 移除</button>
                </div>
            </article>)}
        </section>
    );
}

export default ModerationQueue;
