import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    CalendarClock,
    Gift,
    Link2Off,
    Loader2,
    Play,
    RefreshCw,
    Trash2
} from 'lucide-react';
import {
    deleteScriptureRecording,
    fetchMyScriptureRecordings,
    fetchScripturePlaybackTicket,
    revokeScriptureRecordingShare,
    scripturePlaybackUrl
} from './scriptureRecordingApi';

const formatDate = value => {
    if (!value) return '日期未記錄';
    return new Intl.DateTimeFormat('zh-TW', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(new Date(value));
};

const formatDuration = milliseconds => {
    const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const shareLabel = share => {
    if (!share) return { text: '尚未分享', tone: 'bg-slate-100 text-slate-600' };
    if (share.status === 'ACTIVE') {
        return share.expiresAt
            ? { text: `分享至 ${formatDate(share.expiresAt)}`, tone: 'bg-emerald-50 text-emerald-700' }
            : { text: '永久分享中', tone: 'bg-emerald-50 text-emerald-700' };
    }
    if (share.status === 'EXPIRED') return { text: '分享已過期', tone: 'bg-amber-50 text-amber-700' };
    return { text: '分享已撤銷', tone: 'bg-slate-100 text-slate-600' };
};

export default function MyVoiceBlessings({ onBack, compact = false }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');
    const [playback, setPlayback] = useState(null);
    const audioRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await fetchMyScriptureRecordings('VOICE_BLESSING');
            const recordings = Array.isArray(result?.items) ? result.items : [];
            setItems(recordings.filter(recording => recording.recordingKind === 'VOICE_BLESSING'
                || recording.blessingShares?.length));
        } catch {
            setError('暫時無法取得祝福語音，請稍後再試。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        return () => audioRef.current?.pause();
    }, [load]);

    const orderedItems = useMemo(() => [...items].sort((a, b) => (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )), [items]);

    const startPlayback = async recording => {
        setBusyId(recording.id);
        setError('');
        try {
            const result = await fetchScripturePlaybackTicket(recording.id);
            setPlayback({
                recordingId: recording.id,
                title: recording.blessingShares?.[0]?.title || '語音經文祝福',
                src: scripturePlaybackUrl(result.ticket)
            });
        } catch {
            setError('暫時無法播放這筆錄音，請稍後再試。');
        } finally {
            setBusyId('');
        }
    };

    const revokeActiveShare = async (recording, share) => {
        if (!window.confirm('撤銷後，已傳出的連結會立即失效；原錄音仍保留在會員中心。確定撤銷？')) return;
        setBusyId(recording.id);
        setError('');
        try {
            await revokeScriptureRecordingShare(share.id);
            await load();
        } catch {
            setError('暫時無法撤銷分享，請稍後再試。');
        } finally {
            setBusyId('');
        }
    };

    const removeRecording = async recording => {
        if (!window.confirm('這會永久刪除錄音，並讓所有分享連結失效。此動作無法復原，確定刪除？')) return;
        setBusyId(recording.id);
        setError('');
        try {
            if (playback?.recordingId === recording.id) {
                audioRef.current?.pause();
                setPlayback(null);
            }
            await deleteScriptureRecording(recording.id);
            setItems(current => current.filter(item => item.id !== recording.id));
        } catch {
            setError('暫時無法刪除錄音，請稍後再試。');
        } finally {
            setBusyId('');
        }
    };

    return (
        <div className={`mx-auto w-full ${compact ? 'max-w-none px-4 pb-24 pt-5' : 'max-w-4xl py-4'}`}>
            <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    {onBack ? (
                        <button type="button" onClick={onBack} aria-label="返回會員中心" className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    ) : null}
                    <div>
                        <div className="mb-1 flex items-center gap-2">
                            <Gift className="h-5 w-5 text-indigo-600" />
                            <h1 className="text-xl font-black text-slate-900">我的祝福語音</h1>
                        </div>
                        <p className="text-sm font-medium leading-6 text-slate-600">錄音會保留在會員帳號中；分享期限只影響收件人的連結。</p>
                    </div>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading} aria-label="重新整理" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-slate-500 hover:bg-white disabled:opacity-50">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {playback ? (
                <section className="sticky top-2 z-10 mb-4 rounded-2xl border border-indigo-100 bg-white/95 p-3 shadow-lg shadow-indigo-100/40 backdrop-blur">
                    <p className="mb-2 truncate text-sm font-black text-slate-800">正在播放：{playback.title}</p>
                    <audio ref={audioRef} key={playback.src} controls autoPlay controlsList="nodownload" className="h-10 w-full" src={playback.src} />
                </section>
            ) : null}

            {error ? <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}

            {loading ? (
                <div className="grid min-h-52 place-items-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : orderedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
                    <Gift className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <h2 className="font-black text-slate-800">還沒有祝福語音</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">在經文探索選取經節後，就能錄製並建立第一張語音祝福卡。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orderedItems.map(recording => {
                        const shares = recording.blessingShares || [];
                        const latestShare = shares[0];
                        const activeShare = shares.find(share => share.status === 'ACTIVE');
                        const status = shareLabel(activeShare || latestShare);
                        const disabled = busyId === recording.id;
                        return (
                            <article key={recording.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="truncate font-black text-slate-900">{latestShare?.title || '語音經文祝福'}</h2>
                                        <p className="mt-1 text-sm font-bold text-indigo-700">{recording.reference}・{recording.versionName}</p>
                                        {latestShare?.recipient ? <p className="mt-1 truncate text-xs text-slate-500">給 {latestShare.recipient}</p> : null}
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${status.tone}`}>{status.text}</span>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
                                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{formatDate(recording.createdAt)}</span>
                                    <span>{formatDuration(recording.durationMs)}</span>
                                    {shares.length > 1 ? <span>曾建立 {shares.length} 次分享</span> : null}
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                    <button type="button" onClick={() => void startPlayback(recording)} disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-50">
                                        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}播放
                                    </button>
                                    {activeShare ? (
                                        <button type="button" onClick={() => void revokeActiveShare(recording, activeShare)} disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-50 px-4 text-sm font-black text-amber-700 disabled:opacity-50">
                                            <Link2Off className="h-4 w-4" />撤銷分享
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => void removeRecording(recording)} disabled={disabled} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                        <Trash2 className="h-4 w-4" />刪除錄音
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
