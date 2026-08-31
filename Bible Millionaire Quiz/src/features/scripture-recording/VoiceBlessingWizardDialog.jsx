import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    Check,
    CheckCircle2,
    CircleStop,
    Copy,
    ExternalLink,
    Gift,
    Globe2,
    Loader2,
    LockKeyhole,
    Mic,
    QrCode,
    RotateCcw,
    Send,
    Share2,
    Upload,
    UserRound,
    X
} from 'lucide-react';
import QRCode from 'qrcode';
import { stripScriptureSpeechAnnotations } from '../scripture-reading/scriptureSpeech.js';
import {
    createScriptureRecordingShare,
    revokeScriptureRecordingShare,
    saveScriptureRecording,
    scriptureBlessingShareUrl
} from './scriptureRecordingApi.js';
import { useLocalScriptureRecording } from './useLocalScriptureRecording.js';
import { SCRIPTURE_AUDIO_ACCEPT } from './scriptureRecordingFile.js';
import {
    clearVoiceBlessingDraft,
    loadVoiceBlessingDraft,
    recordingForDraft,
    updateVoiceBlessingDraft,
    voiceBlessingDraftMatches
} from './voiceBlessingDraftStore.js';

const VERSION_NAMES = {
    unv: '和合本',
    CUV_TRAD: '和合本',
    ncv: '新譯本',
    CNV_TRAD: '新譯本',
    tcv2019: '現代中文譯本 2019',
    TCV2010_TRAD: '現代中文譯本 2019',
    lcc: '呂振中譯本',
    LCC_TRAD: '呂振中譯本'
};

const THEMES = [
    {
        id: 'dawn',
        name: '晨光',
        description: '米白與暖金',
        card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-100 text-amber-900',
        swatch: 'from-amber-200 to-amber-500'
    },
    {
        id: 'peace',
        name: '平安',
        description: '霧藍與青綠',
        card: 'border-teal-200 bg-gradient-to-br from-cyan-50 via-white to-teal-100 text-teal-900',
        swatch: 'from-cyan-200 to-teal-500'
    },
    {
        id: 'hope',
        name: '盼望',
        description: '靛藍與淡紫',
        card: 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-100 text-indigo-950',
        swatch: 'from-indigo-200 to-violet-500'
    }
];

function formatSeconds(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function newRequestId(prefix) {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
}

function StepProgress({ currentStep, recording, onStep }) {
    const labels = ['經文與對象', '祝福語音', '卡片內容', '預覽送出'];
    return (
        <nav className="grid grid-cols-4 border-b border-slate-100 bg-white px-2 sm:px-5" aria-label="語音祝福卡製作進度">
            {labels.map((label, index) => {
                const step = index + 1;
                const complete = currentStep > step;
                return (
                    <button
                        type="button"
                        key={label}
                        disabled={step > currentStep || recording}
                        onClick={() => onStep(step)}
                        className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[9px] font-black sm:gap-2 sm:text-xs ${currentStep === step ? 'text-indigo-700' : complete ? 'text-emerald-700' : 'text-slate-400'}`}
                    >
                        <span className={`grid h-5 w-5 place-items-center rounded-full ${currentStep === step ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {complete ? <Check className="h-3.5 w-3.5" /> : step}
                        </span>
                        {label}
                    </button>
                );
            })}
        </nav>
    );
}

function BlessingCard({ theme, recipient, title, reference, verses, message, signature, audioUrl }) {
    return (
        <article className={`mx-auto w-full max-w-[500px] overflow-hidden rounded-[20px] border p-4 text-left shadow-xl sm:p-6 ${theme.card}`}>
            <small className="font-black tracking-[0.18em] opacity-75">語音經文祝福</small>
            <p className="mb-1 mt-4 text-xs font-black opacity-75">{recipient || '給親愛的你'}</p>
            <h3 className="font-serif text-2xl font-black leading-snug text-slate-900 sm:text-[28px]">{title}</h3>
            <p className="mt-3 text-xs font-black opacity-80">{reference}</p>
            {audioUrl ? (
                <div className="mt-4 rounded-2xl bg-white/70 p-3">
                    <span className="mb-2 block text-xs font-black text-slate-600">一段為你錄下的祝福</span>
                    <audio className="w-full" controls controlsList="nodownload noremoteplayback" disableRemotePlayback src={audioUrl}>你的瀏覽器不支援音訊播放。</audio>
                </div>
            ) : null}
            <blockquote className="mt-4 border-l-[3px] border-current bg-white/65 px-4 py-3 font-serif leading-7 text-slate-700">
                {verses.map(verse => <span key={verse.verse}><sup className="mr-1 text-[10px] font-black">{verse.verseLabel ?? verse.verse}</sup>{stripScriptureSpeechAnnotations(verse.text)} </span>)}
            </blockquote>
            {message ? <p className="mt-4 leading-7 text-slate-700">{message}</p> : null}
            <footer className="mt-4 flex items-center gap-2 text-xs font-black opacity-80"><UserRound className="h-4 w-4" />{signature}</footer>
        </article>
    );
}

export default function VoiceBlessingWizardDialog({
    open,
    onClose,
    verses,
    selection,
    systemController,
    initialVerseStart,
    initialVerseEnd
}) {
    const draftEnabledRef = useRef(false);
    const persistFinalizedRecording = useCallback(result => {
        if (!draftEnabledRef.current) return;
        return updateVoiceBlessingDraft({
            audio: recordingForDraft(result),
            interruptedWhileHidden: document.visibilityState === 'hidden'
        });
    }, []);
    const recorder = useLocalScriptureRecording({ onFinalized: persistFinalizedRecording });
    const uploadInputRef = useRef(null);
    const firstVerse = Number(verses?.[0]?.verseStart ?? verses?.[0]?.verse ?? 1);
    const lastVerse = Number(verses?.at(-1)?.verseEnd ?? verses?.at(-1)?.verse ?? firstVerse);
    const requestedStart = Number(initialVerseStart);
    const defaultVerseStart = Number.isInteger(requestedStart)
        ? Math.min(lastVerse, Math.max(firstVerse, requestedStart))
        : firstVerse;
    const requestedEnd = Number(initialVerseEnd);
    const defaultVerseEnd = Number.isInteger(requestedEnd)
        ? Math.min(lastVerse, defaultVerseStart + 29, Math.max(defaultVerseStart, requestedEnd))
        : Math.min(lastVerse, defaultVerseStart + 2);
    const [currentStep, setCurrentStep] = useState(1);
    const [verseStart, setVerseStart] = useState(defaultVerseStart);
    const [verseEnd, setVerseEnd] = useState(defaultVerseEnd);
    const [visibility, setVisibility] = useState('UNLISTED');
    const [recipient, setRecipient] = useState('');
    const [title, setTitle] = useState('給此刻需要平安的你');
    const [message, setMessage] = useState('願這段經文，在今天成為你的安慰與力量。');
    const [themeId, setThemeId] = useState('peace');
    const [signatureMode, setSignatureMode] = useState('custom');
    const [customSignature, setCustomSignature] = useState('');
    const [expiresInDays, setExpiresInDays] = useState('30');
    const [savedRecordingId, setSavedRecordingId] = useState('');
    const [shareRequestId, setShareRequestId] = useState(() => newRequestId('voice-blessing'));
    const [publishing, setPublishing] = useState(false);
    const [publishError, setPublishError] = useState('');
    const [published, setPublished] = useState(null);
    const [copied, setCopied] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const [restoreNotice, setRestoreNotice] = useState('');

    const versionName = VERSION_NAMES[selection.version] || selection.version;
    const selectedVerses = useMemo(() => verses.filter(verse => (
        Number(verse.verseEnd ?? verse.verse) >= verseStart
        && Number(verse.verseStart ?? verse.verse) <= verseEnd
    )), [verseEnd, verseStart, verses]);
    const reference = `${selection.book} ${selection.chapter}:${verseStart}-${verseEnd}・${versionName}`;
    const selectedTheme = THEMES.find(item => item.id === themeId) || THEMES[1];
    const signature = signatureMode === 'anonymous'
        ? '匿名祝福'
        : signatureMode === 'member'
            ? '會員名稱'
            : customSignature.trim() || '你的署名';

    useEffect(() => {
        if (!open) {
            setDraftReady(false);
            return undefined;
        }

        let active = true;
        draftEnabledRef.current = true;
        setDraftReady(false);
        setPublishing(false);
        setPublishError('');
        setPublished(null);
        setCopied(false);
        setRestoreNotice('');

        const initializeDraft = async () => {
            let draft = null;
            try {
                draft = await loadVoiceBlessingDraft();
            } catch {
                // IndexedDB may be unavailable in private browsing; the wizard
                // remains usable in memory for the current page.
            }
            if (!active) return;

            if (draft && voiceBlessingDraftMatches(draft, selection)) {
                const form = draft.form || {};
                setVerseStart(Number(form.verseStart ?? defaultVerseStart));
                setVerseEnd(Number(form.verseEnd ?? defaultVerseEnd));
                setCurrentStep(Math.min(4, Math.max(1, Number(draft.currentStep || 1))));
                setVisibility(form.visibility || 'UNLISTED');
                setRecipient(form.recipient || '');
                setTitle(form.title || '給此刻需要平安的你');
                setMessage(form.message ?? '願這段經文，在今天成為你的安慰與力量。');
                setThemeId(form.themeId || 'peace');
                setSignatureMode(form.signatureMode || 'custom');
                setCustomSignature(form.customSignature || '');
                setExpiresInDays(form.expiresInDays || '30');
                setSavedRecordingId(draft.savedRecordingId || '');
                setShareRequestId(draft.shareRequestId || newRequestId('voice-blessing'));
                recorder.clear();
                const audioRestored = draft.audio ? recorder.restore(draft.audio) : false;
                setRestoreNotice(audioRestored
                    ? '已恢復上次尚未送出的祝福卡與錄音。'
                    : '已恢復上次尚未完成的祝福卡；先前進行中的錄音未能完整保留，請重新錄製。');
            } else {
                const initialShareRequestId = newRequestId('voice-blessing');
                recorder.clear();
                setVerseStart(defaultVerseStart);
                setVerseEnd(defaultVerseEnd);
                setCurrentStep(1);
                setVisibility('UNLISTED');
                setRecipient('');
                setTitle('給此刻需要平安的你');
                setMessage('願這段經文，在今天成為你的安慰與力量。');
                setThemeId('peace');
                setSignatureMode('custom');
                setCustomSignature('');
                setExpiresInDays('30');
                setSavedRecordingId('');
                setShareRequestId(initialShareRequestId);
                try {
                    await updateVoiceBlessingDraft({
                        context: { version: selection.version, book: selection.book, chapter: selection.chapter },
                        currentStep: 1,
                        form: { verseStart: defaultVerseStart, verseEnd: defaultVerseEnd },
                        audio: null,
                        savedRecordingId: '',
                        shareRequestId: initialShareRequestId
                    });
                } catch {
                    // Best-effort device persistence only.
                }
            }
            if (active) setDraftReady(true);
        };

        void initializeDraft();
        return () => { active = false; };
    }, [defaultVerseEnd, defaultVerseStart, open, selection.book, selection.chapter, selection.version]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open || !draftReady || !draftEnabledRef.current) return undefined;
        const timer = window.setTimeout(() => {
            void updateVoiceBlessingDraft({
                context: { version: selection.version, book: selection.book, chapter: selection.chapter },
                currentStep,
                form: {
                    verseStart,
                    verseEnd,
                    visibility,
                    recipient,
                    title,
                    message,
                    themeId,
                    signatureMode,
                    customSignature,
                    expiresInDays
                },
                savedRecordingId,
                shareRequestId
            }).catch(() => {});
        }, 150);
        return () => window.clearTimeout(timer);
    }, [
        currentStep,
        customSignature,
        draftReady,
        expiresInDays,
        message,
        open,
        recipient,
        savedRecordingId,
        selection.book,
        selection.chapter,
        selection.version,
        shareRequestId,
        signatureMode,
        themeId,
        title,
        verseEnd,
        verseStart,
        visibility
    ]);

    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, [open]);

    useEffect(() => {
        if (!open || !recorder.isRecording) return undefined;
        const preserveBeforeBackground = () => {
            setRestoreNotice('切換分頁前已自動結束並保留目前錄音，返回後可以試聽或重新錄製。');
            void updateVoiceBlessingDraft({ interruptedWhileHidden: true }).catch(() => {});
            recorder.stop();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') preserveBeforeBackground();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('freeze', preserveBeforeBackground);
        window.addEventListener('pagehide', preserveBeforeBackground);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('freeze', preserveBeforeBackground);
            window.removeEventListener('pagehide', preserveBeforeBackground);
        };
    }, [open, recorder.isRecording, recorder.stop]);

    if (!open) return null;

    const handleCloseRequest = async () => {
        if (recorder.isRecording) {
            if (!window.confirm('錄音中，取消後將停止錄音並放棄此次錄音，確定要取消？')) return;
            draftEnabledRef.current = false;
            recorder.stop();
        }

        if (recorder.result && !published && !window.confirm('目前錄音尚未送出，確定要離開嗎？')) {
            return;
        }

        draftEnabledRef.current = false;
        try {
            await clearVoiceBlessingDraft();
        } catch {
            // Closing the wizard must not be blocked by unavailable storage.
        }
        onClose();
    };

    const recordingMetadata = () => ({
        recordingKind: 'VOICE_BLESSING',
        reference,
        version: selection.version,
        book: selection.book,
        chapter: selection.chapter,
        verseStart,
        verseEnd,
        blessingDraft: { visibility, recipient, title, message, theme: themeId, signatureMode, customSignature },
        filenameBase: `${selection.book}-${selection.chapter}章-語音祝福`
    });

    const startRecording = async () => {
        if (recorder.result && !window.confirm('重新錄音會取代目前內容，確定繼續嗎？')) return;
        recorder.clear();
        setRestoreNotice('');
        setSavedRecordingId('');
        void updateVoiceBlessingDraft({ audio: null, savedRecordingId: '', interruptedWhileHidden: false }).catch(() => {});
        systemController.stop();
        await recorder.start(recordingMetadata());
    };

    const selectAudioFile = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (recorder.result && !window.confirm('選擇音檔會取代目前內容，確定繼續嗎？')) return;
        systemController.stop();
        const loaded = await recorder.loadFile(file, recordingMetadata());
        if (loaded) {
            setSavedRecordingId('');
            setRestoreNotice('');
        }
    };

    const clearRecording = () => {
        recorder.clear();
        setSavedRecordingId('');
        setRestoreNotice('');
        void updateVoiceBlessingDraft({ audio: null, savedRecordingId: '', interruptedWhileHidden: false }).catch(() => {});
    };

    const nextDisabled = currentStep === 1
        ? !selectedVerses.length || verseEnd < verseStart || verseEnd - verseStart >= 30
        : currentStep === 2
            ? !recorder.result || recorder.isRecording
            : currentStep === 3
                ? !title.trim() || (signatureMode === 'custom' && !customSignature.trim())
                : false;

    const publish = async () => {
        if (!recorder.result || publishing || published) return;
        setPublishing(true);
        setPublishError('');
        try {
            let recordingId = savedRecordingId;
            if (!recordingId) {
                const upload = await saveScriptureRecording(recorder.result);
                recordingId = upload.recording.id;
                setSavedRecordingId(recordingId);
                recorder.markSaved();
            }
            const share = await createScriptureRecordingShare(recordingId, {
                expiresInDays: expiresInDays === 'never' ? 'never' : Number(expiresInDays),
                visibility,
                shareKind: 'VOICE_BLESSING',
                card: {
                    recipient: recipient.trim(),
                    title: title.trim(),
                    message: message.trim(),
                    theme: themeId,
                    signatureMode,
                    signatureText: customSignature.trim()
                }
            }, shareRequestId);
            const url = scriptureBlessingShareUrl(share.token);
            const qrCode = await QRCode.toDataURL(url, {
                width: 320,
                margin: 2,
                color: { dark: '#312e81', light: '#ffffff' }
            });
            setPublished({ ...share, url, qrCode });
            draftEnabledRef.current = false;
            void clearVoiceBlessingDraft().catch(() => {});
        } catch (error) {
            setPublishError(error.message || '暫時無法建立分享連結，請稍後再試。');
        } finally {
            setPublishing(false);
        }
    };

    const copyLink = async () => {
        if (!published?.url) return;
        try {
            await navigator.clipboard.writeText(published.url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setPublishError('瀏覽器無法自動複製，請開啟連結後從網址列複製。');
        }
    };

    const shareLink = async () => {
        if (!published?.url) return;
        if (!navigator.share) {
            await copyLink();
            return;
        }
        try {
            await navigator.share({ title, text: `${recipient || '給親愛的你'}的語音經文祝福`, url: published.url });
        } catch (error) {
            if (error.name !== 'AbortError') setPublishError('系統分享暫時無法使用，請改用複製連結。');
        }
    };

    const revoke = async () => {
        if (!published?.id || !window.confirm('撤銷後，已傳出的連結與 QR Code 將立即失效。確定撤銷嗎？')) return;
        setPublishing(true);
        setPublishError('');
        try {
            await revokeScriptureRecordingShare(published.id);
            setPublished(current => ({ ...current, revoked: true }));
        } catch (error) {
            setPublishError(error.message || '撤銷失敗，請稍後再試。');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/55 p-1.5 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) handleCloseRequest(); }}>
            <section className="flex h-auto max-h-[76dvh] min-h-0 w-[min(96vw,820px)] max-w-[900px] flex-col overflow-hidden rounded-[18px] bg-white shadow-2xl sm:h-[min(820px,calc(100dvh-2rem))] sm:w-[min(95vw,900px)]" role="dialog" aria-modal="true" aria-labelledby="voice-blessing-title">
                <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-white to-indigo-50/60 px-2.5 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg"><Gift className="h-4 w-4" /></span>
                        <div><small className="font-black tracking-[0.08em] text-[10px] text-indigo-600 sm:tracking-wider sm:text-xs">經文探索</small><h2 id="voice-blessing-title" className="text-sm font-black text-slate-900 sm:text-xl">製作語音經文祝福卡</h2></div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={handleCloseRequest} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-700 hover:bg-slate-100 sm:px-3" aria-label="取消製作語音祝福卡"><span>取消</span><X className="h-4 w-4" /></button>
                    </div>
                </header>

                <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-slate-50">
                    <StepProgress currentStep={currentStep} recording={recorder.isRecording} onStep={setCurrentStep} />

                    <div className="min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain p-2 sm:p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {restoreNotice ? <p className="mx-auto mb-2 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-bold leading-5 text-amber-800 sm:text-sm" role="status">{restoreNotice}</p> : null}
                        {currentStep === 1 ? (
                            <section className="mx-auto max-w-3xl">
                                <div className="mb-2 text-center sm:mb-3"><small className="text-[10px] font-black tracking-[0.08em] text-indigo-600 sm:tracking-wider sm:text-xs">步驟 1／4</small><h3 className="mt-1 text-lg font-black text-slate-900 sm:text-2xl">選擇經文與祝福對象</h3><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-sm">先決定要分享的經文，以及這張祝福卡的可見範圍。</p></div>
                                <div className="grid gap-2 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <strong className="text-sm text-slate-900">要分享的經文</strong><small className="block text-[10px] text-slate-500">同一章連續 1 至 30 節</small>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <label className="grid gap-1 text-[10px] font-bold text-slate-600">起始節<select value={verseStart} disabled={Boolean(recorder.result)} onChange={event => { const next = Number(event.target.value); setVerseStart(next); setVerseEnd(current => Math.max(next, Math.min(current, next + 29))); }} className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm sm:min-h-11">{verses.map(verse => <option key={verse.verse} value={verse.verseStart ?? verse.verse}>第 {verse.verseLabel ?? verse.verse} 節</option>)}</select></label>
                                            <label className="grid gap-1 text-[10px] font-bold text-slate-600">結束節<select value={verseEnd} disabled={Boolean(recorder.result)} onChange={event => setVerseEnd(Number(event.target.value))} className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm sm:min-h-11">{verses.filter(verse => Number(verse.verseEnd ?? verse.verse) >= verseStart && Number(verse.verseStart ?? verse.verse) < verseStart + 30).map(verse => <option key={verse.verse} value={verse.verseEnd ?? verse.verse}>第 {verse.verseLabel ?? verse.verse} 節</option>)}</select></label>
                                        </div>
                                        <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-700">{reference}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <strong className="text-sm text-slate-900">這張卡要送給誰？</strong><small className="block text-[10px] text-slate-500">預設只有收到連結的人能開啟</small>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => setVisibility('UNLISTED')} className={`flex min-h-11 items-center gap-2 rounded-xl border p-2 text-left sm:min-h-14 ${visibility === 'UNLISTED' ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300' : 'border-slate-200 text-slate-600'}`}><LockKeyhole className="h-4 w-4" /><span><strong className="block text-[11px]">傳給某人</strong><small className="text-[10px]">不出現在公開區域</small></span></button>
                                            <button type="button" onClick={() => setVisibility('PUBLIC')} className={`flex min-h-11 items-center gap-2 rounded-xl border p-2 text-left sm:min-h-14 ${visibility === 'PUBLIC' ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300' : 'border-slate-200 text-slate-600'}`}><Globe2 className="h-4 w-4" /><span><strong className="block text-[11px]">公開祝福</strong><small className="text-[10px]">可出現在祝福區</small></span></button>
                                        </div>
                                        {visibility === 'UNLISTED' ? <label className="mt-2 grid gap-1 text-[10px] font-bold text-slate-600">收件人稱呼（選填）<input value={recipient} maxLength={30} onChange={event => setRecipient(event.target.value)} placeholder="例如：給媽媽、給正在預備考試的你" className="min-h-9 rounded-xl border border-slate-200 px-3 text-sm" /></label> : null}
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        {currentStep === 2 ? (
                            <section className="mx-auto max-w-xl text-center">
                                <small className="text-[10px] font-black tracking-[0.08em] text-indigo-600">步驟 2／4</small><h3 className="mt-1 text-lg font-black text-slate-900 sm:text-2xl">準備祝福語音</h3><p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-sm">可以直接錄製，或上傳已錄好的祝福與 {reference}；整段保存為一個音檔。</p>
                                <div className={`mt-2 flex min-h-20 items-center gap-2 rounded-2xl border bg-white p-2 text-left sm:min-h-24 sm:gap-3 sm:p-4 ${recorder.isRecording ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200'}`}><span className={`grid h-10 w-10 place-items-center rounded-full sm:h-14 sm:w-14 ${recorder.isRecording ? 'bg-rose-100 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}><Mic className="h-5 w-5 sm:h-7 sm:w-7" /></span><div className="min-w-0 flex-1"><strong className="block text-sm text-slate-900 sm:text-base">{recorder.isRecording ? '錄音中' : recorder.result?.source === 'upload' ? '音檔已載入' : recorder.result ? '錄音已完成' : '準備祝福語音'}</strong><small className="text-[11px] text-slate-500 sm:text-sm">{recorder.result ? '請先試聽，確認後再繼續' : '最長 5 分鐘；不會成為系統朗讀聲音'}</small>{recorder.qualityInfo ? <small className="mt-1 block text-[10px] font-bold text-emerald-700 sm:text-xs">{recorder.qualityInfo.profile === 'enhanced' ? '已啟用降噪、柔和音色與音量平衡' : recorder.qualityInfo.profile === 'uploaded' ? '保留上傳音檔的原始音質' : '此裝置使用瀏覽器原生收音'}</small> : null}</div><time className="font-mono text-base font-black text-indigo-700 sm:text-xl">{formatSeconds(recorder.seconds)}</time></div>
                                {recorder.error ? <p className="mt-2 rounded-xl bg-rose-50 p-2 text-xs text-rose-700 sm:text-sm" role="alert">{recorder.error}</p> : null}
                                <input ref={uploadInputRef} type="file" accept={SCRIPTURE_AUDIO_ACCEPT} className="sr-only" onChange={selectAudioFile} />
                                <div className="mt-2 flex flex-wrap justify-center gap-2">{recorder.isRecording ? <button type="button" onClick={recorder.stop} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-rose-600 px-3 text-sm font-bold text-white sm:min-h-11 sm:px-5"><CircleStop className="h-4 w-4" />停止錄音</button> : <><button type="button" onClick={startRecording} disabled={!recorder.supported} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white disabled:opacity-40 sm:min-h-11 sm:px-5"><Mic className="h-4 w-4" />{recorder.result ? '重新錄音' : '開始錄音'}</button><button type="button" onClick={() => uploadInputRef.current?.click()} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50 sm:min-h-11 sm:px-5"><Upload className="h-4 w-4" />{recorder.result ? '更換音檔' : '上傳音檔'}</button></>}{recorder.result ? <button type="button" onClick={clearRecording} className="inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-slate-100 sm:min-h-11"><RotateCcw className="h-4 w-4" />清除重來</button> : null}</div>
                                {!recorder.result && !recorder.isRecording ? <p className="mt-2 text-[10px] text-slate-400 sm:text-xs">支援 M4A、MP3、WAV、WebM、Ogg；最大 5MB、最長 5 分鐘。</p> : null}
                                {recorder.result ? <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2 text-left sm:p-4"><strong className="mb-2 block text-sm text-slate-800">試聽語音祝福</strong><audio className="w-full" controls controlsList="nodownload noremoteplayback" disableRemotePlayback src={recorder.result.url} onPlay={systemController.stop}>你的瀏覽器不支援音訊播放。</audio></div> : null}
                            </section>
                        ) : null}

                        {currentStep === 3 ? (
                            <section className="mx-auto max-w-2xl">
                                <div className="mb-2 text-center sm:mb-3"><small className="text-[10px] font-black tracking-[0.08em] text-indigo-600">步驟 3／4</small><h3 className="mt-1 text-lg font-black text-slate-900 sm:text-2xl">整理卡片內容</h3><p className="mt-1 text-[11px] text-slate-500 sm:text-sm">補上標題、文字祝福、卡片主題與署名。</p></div>
                                <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                                    <label className="grid gap-1 text-[10px] font-bold text-slate-600">卡片標題<input value={title} maxLength={50} onChange={event => setTitle(event.target.value)} className="min-h-9 rounded-xl border border-slate-200 px-3 text-sm sm:min-h-11" /></label>
                                    <label className="grid gap-1 text-[10px] font-bold text-slate-600">文字祝福（選填）<textarea value={message} maxLength={300} rows={3} onChange={event => setMessage(event.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm" /></label>
                                    <fieldset><legend className="text-[10px] font-bold text-slate-600">卡片主題</legend><div className="mt-2 grid grid-cols-3 gap-2">{THEMES.map(theme => <button type="button" key={theme.id} onClick={() => setThemeId(theme.id)} className={`flex min-h-10 items-center gap-2 rounded-xl border p-2 text-left sm:min-h-14 ${themeId === theme.id ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300' : 'border-slate-200'}`}><i className={`h-9 w-7 rounded-lg bg-gradient-to-b ${theme.swatch}`} /><span><strong className="block text-[11px] text-slate-800">{theme.name}</strong><small className="hidden text-[10px] text-slate-500 sm:block">{theme.description}</small></span></button>)}</div></fieldset>
                                    <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-[10px] font-bold text-slate-600">署名方式<select value={signatureMode} onChange={event => setSignatureMode(event.target.value)} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm sm:min-h-11"><option value="custom">自行填寫署名</option><option value="member">使用會員名稱</option><option value="anonymous">匿名祝福</option></select></label>{signatureMode === 'custom' ? <label className="grid gap-1 text-[10px] font-bold text-slate-600">署名內容<input value={customSignature} maxLength={30} onChange={event => setCustomSignature(event.target.value)} placeholder="例如：偉恩、愛你的媽媽" className="min-h-9 rounded-xl border border-slate-200 px-3 text-sm sm:min-h-11" /></label> : null}</div>
                                </div>
                            </section>
                        ) : null}

                        {currentStep === 4 ? (
                            <section className="mx-auto max-w-xl text-center">
                                <p className="mb-2 text-[11px] leading-5 text-slate-500 sm:text-sm">確認內容後建立分享連結；收件人不需登入即可聆聽。</p>
                                <BlessingCard theme={selectedTheme} recipient={recipient} title={title} reference={reference} verses={selectedVerses} message={message} signature={signature} audioUrl={recorder.result?.url} />
                                {!published ? (
                                <div className="mx-auto mt-2 grid max-w-[500px] gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-2 text-left text-[11px] text-indigo-900 sm:p-3 sm:text-sm">
                                    <div className="flex items-center justify-between gap-3"><span><strong>{visibility === 'PUBLIC' ? '公開祝福' : '不公開分享連結'}</strong><small className="mt-1 block text-indigo-700">建立後可複製連結、使用 QR Code，並可隨時撤銷。</small></span><QrCode className="h-5 w-5 shrink-0" /></div>
                                        <label className="grid gap-1 text-[10px] font-bold text-slate-600">連結有效期限
                                            <select value={expiresInDays} onChange={event => setExpiresInDays(event.target.value)} className="min-h-9 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-800 sm:min-h-11">
                                                <option value="7">7 天</option>
                                                <option value="30">30 天（建議）</option>
                                                <option value="never">永久，直到手動撤銷</option>
                                            </select>
                                        </label>
                                        <button type="button" onClick={publish} disabled={publishing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:opacity-50">
                                            {publishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{publishing ? '正在建立分享…' : '建立分享連結與 QR Code'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mx-auto mt-3 grid max-w-[500px] gap-4 rounded-2xl border border-emerald-200 bg-white p-4 text-left shadow-sm">
                                        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" /><span><strong className="text-emerald-800">{published.revoked ? '分享已撤銷' : '語音祝福已可分享'}</strong><small className="mt-1 block text-slate-500">{published.revoked ? '原連結與 QR Code 已立即失效。' : '連結只會開啟本站祝福播放頁，不會直接下載音檔。'}</small></span></div>
                                        {!published.revoked ? (
                                            <>
                                                <img src={published.qrCode} alt="語音祝福分享 QR Code" className="mx-auto h-44 w-44 rounded-2xl border border-slate-200 bg-white p-2" />
                                                <p className="break-all rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{published.url}</p>
                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                    <button type="button" onClick={copyLink} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"><Copy className="h-4 w-4" />{copied ? '已複製' : '複製連結'}</button>
                                                    <button type="button" onClick={shareLink} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white"><Share2 className="h-4 w-4" />分享</button>
                                                    <a href={published.url} target="_blank" rel="noreferrer" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 px-3 text-sm font-bold text-indigo-700 sm:col-span-1"><ExternalLink className="h-4 w-4" />試開頁面</a>
                                                </div>
                                                <button type="button" onClick={revoke} disabled={publishing} className="justify-self-center px-3 py-2 text-xs font-bold text-slate-400 hover:text-rose-600 disabled:opacity-40">撤銷這個分享</button>
                                            </>
                                        ) : null}
                                    </div>
                                )}
                                {publishError ? <p className="mx-auto mt-3 max-w-[500px] rounded-xl bg-rose-50 p-3 text-left text-sm text-rose-700" role="alert">{publishError}</p> : null}
                            </section>
                        ) : null}
                    </div>

                    <footer className="sticky bottom-0 z-20 flex min-h-11 shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-2 py-2 sm:px-4" style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setCurrentStep(step => Math.max(1, step - 1))} disabled={currentStep === 1 || recorder.isRecording || Boolean(published)} className="inline-flex min-h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-30 sm:text-sm sm:min-h-10 sm:px-3"><ArrowLeft className="h-4 w-4" />上一步</button>
                        <button type="button" onClick={handleCloseRequest} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-rose-300 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 sm:min-h-10 sm:px-3">取消</button>
                        </div>
                        {currentStep < 4 ? <button type="button" disabled={nextDisabled} onClick={() => setCurrentStep(step => Math.min(4, step + 1))} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white disabled:bg-indigo-300 sm:min-h-10 sm:px-5 sm:text-sm">{currentStep === 1 ? '下一步：準備語音' : currentStep === 2 ? '下一步：設計卡片' : <><Send className="h-4 w-4" />預覽並準備分享</>}</button> : <button type="button" onClick={handleCloseRequest} disabled={publishing} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white disabled:opacity-50 sm:min-h-10 sm:px-5 sm:text-sm"><Check className="h-4 w-4" />{published ? '完成' : '稍後再分享'}</button>}
                    </footer>
                </div>
            </section>
        </div>
    );
}
