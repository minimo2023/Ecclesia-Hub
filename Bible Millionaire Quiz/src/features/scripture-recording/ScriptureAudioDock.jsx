import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleStop, CloudUpload, Gift, Headphones, Loader2, Mic, Play, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import AuthModal from '../auth/AuthModal.jsx';
import ScriptureReadAloudControls from '../scripture-reading/ScriptureReadAloudControls.jsx';
import VoiceBlessingWizardDialog from './VoiceBlessingWizardDialog.jsx';
import {
    canonicalScriptureVersion,
    fetchMyScriptureRecordings,
    fetchScripturePlaybackTicket,
    fetchScriptureRecordingStatus,
    isScriptureMemberSignedIn,
    saveScriptureRecording,
    scripturePlaybackUrl
} from './scriptureRecordingApi.js';
import { useLocalScriptureRecording } from './useLocalScriptureRecording.js';
import { loadVoiceBlessingDraft, voiceBlessingDraftMatches } from './voiceBlessingDraftStore.js';

function formatSeconds(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function SavedRecordingPlayer({ recordingId, onPlay }) {
    const [src, setSrc] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setSrc('');
        setError('');
    }, [recordingId]);

    const prepare = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await fetchScripturePlaybackTicket(recordingId);
            setSrc(scripturePlaybackUrl(result.ticket));
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    };

    if (!src) {
        return (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <button type="button" onClick={prepare} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {loading ? '準備中…' : '播放我的朗讀'}
                </button>
                {error ? <small className="text-xs font-medium text-rose-600" role="alert">{error}</small> : null}
            </div>
        );
    }

    return (
        <audio
            className="min-h-10 min-w-0 flex-1"
            controls
            controlsList="nodownload noremoteplayback"
            disableRemotePlayback
            preload="metadata"
            src={src}
            onPlay={onPlay}
            onContextMenu={event => event.preventDefault()}
        >你的瀏覽器不支援音訊播放。</audio>
    );
}

function MemberFeaturePrompt({ feature, onClose, onRegister, onLogin }) {
    if (!feature) return null;

    const isBlessing = feature === 'blessing';
    return (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="scripture-member-prompt-title">
            <section className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
                <header className="flex items-start justify-between gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                        {isBlessing ? <Gift className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    </div>
                    <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600" aria-label="關閉會員提示"><X className="h-5 w-5" /></button>
                </header>
                <h2 id="scripture-member-prompt-title" className="mt-4 text-xl font-black text-slate-900">{isBlessing ? '登入後製作語音祝福' : '登入後保存私人錄音'}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    {isBlessing
                        ? '註冊會員後即可錄製祝福、建立分享連結與 QR Code，讓收件人免登入聆聽。'
                        : '註冊會員後即可錄下經文朗讀，安全保存在自己的錄音空間。'}
                </p>
                <div className="mt-6 grid gap-2.5">
                    <button type="button" onClick={onRegister} className="min-h-12 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm hover:bg-indigo-700">註冊會員</button>
                    <button type="button" onClick={onLogin} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">已有帳號，前往登入</button>
                </div>
                <p className="mt-4 text-center text-xs leading-5 text-slate-400">系統朗讀與收到的有效祝福連結不需要登入。</p>
            </section>
        </div>
    );
}

function RecordingDialog({ open, onClose, verses, selection, controller, recordingsAvailable, onSaved }) {
    const recorder = useLocalScriptureRecording();
    const firstVerse = Number(verses?.[0]?.verseStart ?? verses?.[0]?.verse ?? 1);
    const lastVerse = Number(verses?.at(-1)?.verseEnd ?? verses?.at(-1)?.verse ?? firstVerse);
    const [verseStart, setVerseStart] = useState(firstVerse);
    const [verseEnd, setVerseEnd] = useState(Math.min(lastVerse, firstVerse + 29));
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const previewRef = useRef(null);
    const signedIn = isScriptureMemberSignedIn();

    useEffect(() => {
        setVerseStart(firstVerse);
        setVerseEnd(Math.min(lastVerse, firstVerse + 29));
        setSaveError('');
        recorder.clear();
    }, [firstVerse, lastVerse, selection.book, selection.chapter, selection.version]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const start = async () => {
        if (recorder.result && !window.confirm('重新錄音會取代目前尚未保存的錄音，確定繼續嗎？')) return;
        recorder.clear();
        controller.stop();
        await recorder.start({
            reference: `${selection.book} ${selection.chapter}:${verseStart}-${verseEnd}`,
            version: selection.version,
            book: selection.book,
            chapter: selection.chapter,
            verseStart,
            verseEnd,
            filenameBase: `${selection.book}-${selection.chapter}章-我的朗讀`
        });
    };

    const save = async () => {
        if (!recorder.result) return;
        setSaving(true);
        setSaveError('');
        try {
            const response = await saveScriptureRecording(recorder.result);
            recorder.markSaved();
            onSaved(response.recording);
        } catch (error) {
            setSaveError(error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="scripture-recording-title">
            <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
                <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <span className="text-xs font-black tracking-wider text-indigo-600">私人朗讀</span>
                        <h2 id="scripture-recording-title" className="mt-1 text-xl font-black text-slate-900">錄下自己的讀經</h2>
                    </div>
                    <button type="button" onClick={onClose} disabled={recorder.isRecording} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40" aria-label="關閉錄音"><X className="h-5 w-5" /></button>
                </header>

                <p className="mt-4 text-sm leading-6 text-slate-600">錄音完成後可先預聽或重錄；只有你主動保存時，才會上傳到會員的私人朗讀空間。</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-xs font-bold text-slate-600">起始節
                        <select value={verseStart} disabled={recorder.isRecording || Boolean(recorder.result)} onChange={event => {
                            const next = Number(event.target.value);
                            setVerseStart(next);
                            setVerseEnd(current => Math.max(next, Math.min(current, next + 29)));
                        }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
                            {verses.map(verse => <option key={verse.verse} value={verse.verseStart ?? verse.verse}>第 {verse.verseLabel ?? verse.verse} 節</option>)}
                        </select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-bold text-slate-600">結束節
                        <select value={verseEnd} disabled={recorder.isRecording || Boolean(recorder.result)} onChange={event => setVerseEnd(Number(event.target.value))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
                            {verses.filter(verse => Number(verse.verseEnd ?? verse.verse) >= verseStart && Number(verse.verseStart ?? verse.verse) < verseStart + 30).map(verse => <option key={verse.verse} value={verse.verseEnd ?? verse.verse}>第 {verse.verseLabel ?? verse.verse} 節</option>)}
                        </select>
                    </label>
                </div>

                <div className={`mx-auto my-6 grid h-32 w-32 place-content-center justify-items-center gap-2 rounded-full border ${recorder.isRecording ? 'border-rose-300 bg-rose-50 text-rose-600 shadow-[0_0_0_10px_rgba(244,63,94,.08)]' : 'border-indigo-200 bg-indigo-50 text-indigo-600'}`}>
                    <Mic className="h-7 w-7" />
                    <strong className="font-mono text-lg">{formatSeconds(recorder.seconds)}</strong>
                    <small className="text-[11px] font-bold">{recorder.isRecording ? '錄音中' : '最長 05:00'}</small>
                </div>

                {!recorder.supported ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">這個瀏覽器不支援錄音。</p> : null}
                {recorder.error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{recorder.error}</p> : null}

                {!recorder.isRecording ? (
                    <button type="button" onClick={start} disabled={!recorder.supported || !verses.length} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-40"><Mic className="h-5 w-5" />{recorder.result ? '重新錄音' : '開始錄音'}</button>
                ) : (
                    <button type="button" onClick={recorder.stop} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 font-bold text-white"><CircleStop className="h-5 w-5" />停止並保留</button>
                )}

                {recorder.result ? (
                    <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5">
                        <strong className="text-sm text-slate-800">本機預聽・{recorder.result.reference}</strong>
                        <audio ref={previewRef} controls src={recorder.result.url} onPlay={controller.stop} className="w-full" />
                        <div className="flex flex-wrap gap-2">
                            <a href={recorder.result.url} download={`${recorder.result.filenameBase}.${recorder.result.extension}`} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700">下載到裝置</a>
                            <button type="button" onClick={recorder.clear} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl px-3 text-sm font-bold text-slate-500"><Trash2 className="h-4 w-4" />清除</button>
                        </div>
                        {signedIn && recordingsAvailable ? (
                            <button type="button" onClick={save} disabled={saving || recorder.result.serverSaved} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700 disabled:opacity-50"><CloudUpload className="h-4 w-4" />{saving ? '保存中…' : recorder.result.serverSaved ? '已保存到我的錄音' : '保存到我的錄音'}</button>
                        ) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">登入後才能保存到伺服器及分享。</p>}
                        {saveError ? <small className="text-xs font-medium text-rose-600" role="alert">{saveError}</small> : null}
                    </div>
                ) : null}
            </section>
        </div>
    );
}

export default function ScriptureAudioDock({
    controller,
    hasVerses,
    verses,
    selection,
    compact = false,
    integrated = false,
    mobileCompact = false,
    personalRecordingsEnabled = false,
    selectedVerseRange = null,
    onClearVerseSelection
}) {
    const { isLoggedIn } = useAuth();
    const [source, setSource] = useState('system');
    const [recordingOpen, setRecordingOpen] = useState(false);
    const [blessingOpen, setBlessingOpen] = useState(false);
    const [features, setFeatures] = useState({ personalRecords: 'disabled' });
    const [recordings, setRecordings] = useState([]);
    const [recordingsLoading, setRecordingsLoading] = useState(false);
    const [recordingsError, setRecordingsError] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [memberPrompt, setMemberPrompt] = useState(null);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authInitialView, setAuthInitialView] = useState('register');
    const signedIn = isLoggedIn && isScriptureMemberSignedIn();
    const selectedStart = Number(selectedVerseRange?.start);
    const selectedEnd = Number(selectedVerseRange?.end);
    const selectedCount = Number(selectedVerseRange?.count || (Number.isInteger(selectedStart) && Number.isInteger(selectedEnd) ? selectedEnd - selectedStart + 1 : 0));
    const hasAnySelection = selectedCount > 0 && Number.isInteger(selectedStart) && Number.isInteger(selectedEnd) && selectedEnd >= selectedStart;
    const hasSelectedRange = hasAnySelection && selectedVerseRange?.isContiguous !== false;

    useEffect(() => {
        fetchScriptureRecordingStatus().then(setFeatures).catch(() => {});
    }, []);

    useEffect(() => {
        if (!signedIn || !hasVerses || blessingOpen) return undefined;
        let active = true;
        loadVoiceBlessingDraft()
            .then(draft => {
                if (active && voiceBlessingDraftMatches(draft, selection)) setBlessingOpen(true);
            })
            .catch(() => {});
        return () => { active = false; };
    }, [blessingOpen, hasVerses, selection.book, selection.chapter, selection.version, signedIn]);

    useEffect(() => {
        if (!personalRecordingsEnabled) {
            setRecordings([]);
            return undefined;
        }
        let active = true;
        if (!signedIn || features.personalRecords !== 'available') {
            setRecordings([]);
            return undefined;
        }
        setRecordingsLoading(true);
        setRecordingsError('');
        fetchMyScriptureRecordings()
            .then(result => { if (active) setRecordings(result.items || []); })
            .catch(error => { if (active) setRecordingsError(error.message); })
            .finally(() => { if (active) setRecordingsLoading(false); });
        return () => { active = false; };
    }, [features.personalRecords, personalRecordingsEnabled, refreshKey, signedIn]);

    useEffect(() => {
        if (!personalRecordingsEnabled && source !== 'system') setSource('system');
    }, [personalRecordingsEnabled, source]);

    const matching = useMemo(() => recordings.filter(recording => (
        recording.status === 'READY'
        && recording.chapter === Number(selection.chapter)
        && [recording.book, recording.bookName].includes(selection.book)
        && canonicalScriptureVersion(recording.version) === canonicalScriptureVersion(selection.version)
    )), [recordings, selection.book, selection.chapter, selection.version]);

    useEffect(() => {
        if (matching.some(recording => recording.id === selectedId)) return;
        setSelectedId(matching[0]?.id || '');
    }, [matching, selectedId]);

    const selected = matching.find(recording => recording.id === selectedId);
    const requestMemberFeature = (feature, openFeature) => {
        if (!signedIn) {
            setMemberPrompt(feature);
            return;
        }
        controller.stop();
        openFeature();
    };

    const openAuth = initialView => {
        setMemberPrompt(null);
        setAuthInitialView(initialView);
        setAuthModalOpen(true);
    };

    const selectSource = next => {
        if (next === 'mine' && !signedIn) {
            setMemberPrompt('recording');
            return;
        }
        controller.stop();
        setSource(next);
    };

    return (
        <>
            <section className={`${mobileCompact ? 'overflow-visible bg-transparent' : 'overflow-hidden bg-white/95 backdrop-blur-md'} ${integrated ? 'h-full' : mobileCompact ? '' : compact ? 'rounded-2xl border border-slate-200 shadow-lg' : 'border border-x-0 border-b-0 border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,.06)]'}`} aria-label="經文朗讀">
                <div className={`${mobileCompact ? `flex items-center ${personalRecordingsEnabled ? '' : 'justify-center'} gap-1.5 p-0.5` : 'flex flex-wrap items-center gap-1 p-1.5'} ${integrated || mobileCompact ? '' : 'border-b border-slate-100'}`}>
                    {personalRecordingsEnabled ? (
                        <button type="button" onClick={() => selectSource('system')} aria-label="使用經文朗讀" className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg text-xs font-black ${mobileCompact ? 'px-2' : 'rounded-xl px-3'} ${source === 'system' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}><Headphones className="h-4 w-4" />經文</button>
                    ) : (
                        <span className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-1 text-xs font-black text-indigo-700" aria-label="經文朗讀"><Headphones className="h-4 w-4" />經文</span>
                    )}
                    {personalRecordingsEnabled ? <button type="button" onClick={() => selectSource('mine')} aria-label={`使用我的錄音${matching.length ? `，共 ${matching.length} 筆` : ''}`} className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg text-xs font-black ${mobileCompact ? 'px-2' : 'rounded-xl px-3'} ${source === 'mine' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}><Mic className="h-4 w-4" />{mobileCompact ? '我的' : `我的錄音${matching.length ? `・${matching.length}` : ''}`}</button> : null}

                    {(integrated || mobileCompact) && source === 'system' ? (
                        <div className={mobileCompact ? 'min-w-0' : 'order-last min-w-0 basis-full border-t border-slate-100 pt-1 xl:order-none xl:flex-1 xl:basis-auto xl:border-t-0 xl:pt-0'}>
                            <ScriptureReadAloudControls controller={controller} hasVerses={hasVerses} compact embedded toolbar={mobileCompact} />
                        </div>
                    ) : <span className="min-w-0 flex-1" />}

                    {personalRecordingsEnabled ? <button type="button" onClick={() => requestMemberFeature('recording', () => setRecordingOpen(true))} disabled={!hasVerses} aria-label="錄下私人朗讀" title={mobileCompact ? '錄下私人朗讀' : undefined} className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap bg-indigo-600 text-xs font-black text-white disabled:opacity-40 ${mobileCompact ? 'w-9 rounded-lg' : 'gap-1.5 rounded-xl px-2.5'}`}><Mic className="h-4 w-4" />{mobileCompact ? null : <><span className="hidden sm:inline">私人</span>錄音</>}</button> : null}
                </div>

                {hasAnySelection ? (
                    <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50/70 px-2 py-1.5 text-xs">
                        <strong className="mr-auto text-indigo-800">
                            {hasSelectedRange
                                ? `已選第 ${selectedStart}${selectedEnd === selectedStart ? '' : `–${selectedEnd}`} 節`
                                : `已選 ${selectedCount} 節・祝福卡需連續經節`}
                        </strong>
                        {onClearVerseSelection ? <button type="button" onClick={onClearVerseSelection} className="min-h-8 rounded-lg px-2 font-bold text-slate-500 hover:bg-white">清除</button> : null}
                        {hasSelectedRange ? <button type="button" onClick={() => requestMemberFeature('blessing', () => setBlessingOpen(true))} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 font-black text-white"><Gift className="h-3.5 w-3.5" />用這段製作祝福卡</button> : null}
                    </div>
                ) : null}

                {source === 'system' ? (
                    integrated || mobileCompact ? null : <ScriptureReadAloudControls controller={controller} hasVerses={hasVerses} compact={compact} />
                ) : (
                    <div className="flex min-h-[76px] flex-col gap-3 p-3 sm:flex-row sm:items-center">
                        {!signedIn ? <p className="flex-1 text-sm text-slate-600">「我的錄音」是會員功能，登入後可選擇自己保存的經文朗讀。</p> : null}
                        {signedIn && features.personalRecords !== 'available' ? <p className="flex-1 text-sm text-slate-600">會員朗讀保存目前尚未啟用。</p> : null}
                        {signedIn && features.personalRecords === 'available' && recordingsLoading ? <p className="flex flex-1 items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />載入我的錄音…</p> : null}
                        {signedIn && features.personalRecords === 'available' && recordingsError ? <p className="flex-1 text-sm text-rose-600" role="alert">{recordingsError}</p> : null}
                        {signedIn && features.personalRecords === 'available' && !recordingsLoading && !recordingsError && !matching.length ? <p className="flex-1 text-sm text-slate-600">目前章節尚無保存的錄音，請按右上方「錄音」。</p> : null}
                        {selected ? (
                            <>
                                <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-slate-500">選擇自己的錄音
                                    <select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
                                        {matching.map(recording => <option key={recording.id} value={recording.id}>{recording.reference}・{new Date(recording.createdAt).toLocaleDateString('zh-TW')}</option>)}
                                    </select>
                                </label>
                                <SavedRecordingPlayer recordingId={selected.id} onPlay={controller.stop} />
                            </>
                        ) : null}
                    </div>
                )}
            </section>

            {personalRecordingsEnabled ? (
                <RecordingDialog
                    open={recordingOpen}
                    onClose={() => setRecordingOpen(false)}
                    verses={verses}
                    selection={selection}
                    controller={controller}
                    recordingsAvailable={features.personalRecords === 'available'}
                    onSaved={() => { setRefreshKey(value => value + 1); setSource('mine'); setRecordingOpen(false); }}
                />
            ) : null}

            <VoiceBlessingWizardDialog
                open={blessingOpen}
                onClose={() => setBlessingOpen(false)}
                verses={verses}
                selection={selection}
                systemController={controller}
                initialVerseStart={hasSelectedRange ? selectedStart : undefined}
                initialVerseEnd={hasSelectedRange ? selectedEnd : undefined}
            />

            <MemberFeaturePrompt
                feature={memberPrompt}
                onClose={() => setMemberPrompt(null)}
                onRegister={() => openAuth('register')}
                onLogin={() => openAuth('login')}
            />

            <AuthModal
                isOpen={authModalOpen}
                onClose={() => setAuthModalOpen(false)}
                initialView={authInitialView}
                onLoginSuccess={() => setAuthModalOpen(false)}
            />
        </>
    );
}
