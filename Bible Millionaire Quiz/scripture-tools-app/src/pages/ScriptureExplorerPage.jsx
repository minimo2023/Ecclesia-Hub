import { useEffect, useRef, useState } from 'react';
import { BookOpen, Columns3, Gift, Headphones, Mic, Search, ShieldCheck, Users } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { PassageDisplay } from '../components/PassageDisplay.jsx';
import { ScripturePicker } from '../components/ScripturePicker.jsx';
import { VERSIONS } from '../data.js';
import { ComparePassagePanel } from '../features/scripture-explorer/ComparePassagePanel.jsx';
import { PassageChangeDialog } from '../features/scripture-explorer/PassageChangeDialog.jsx';
import { ReadAloudPlayer } from '../features/scripture-explorer/ReadAloudPlayer.jsx';
import { VoiceBlessingCardDialog } from '../features/scripture-explorer/VoiceBlessingCardDialog.jsx';
import { ScriptureSearchDrawer } from '../features/scripture-explorer/ScriptureSearchDrawer.jsx';
import { MyRecordingsPanel } from '../features/scripture-explorer/MyRecordingsPanel.jsx';
import { CommunityPanel } from '../features/scripture-explorer/CommunityPanel.jsx';
import { fetchScriptureToolsStatus } from '../api.js';
import { useLocalRecording } from '../features/scripture-explorer/useLocalRecording.js';
import { useReadAloud } from '../features/scripture-explorer/useReadAloud.js';
import { useScripturePassage } from '../features/scripture-explorer/useScripturePassage.js';

const initialSelection = { version: 'CUV_TRAD', book: '詩篇', chapter: 23 };

export function ScriptureExplorerPage() {
    const scripture = useScripturePassage(initialSelection);
    const readAloud = useReadAloud(scripture.passage);
    const recording = useLocalRecording();
    const [searchOpen, setSearchOpen] = useState(false);
    const [blessingOpen, setBlessingOpen] = useState(false);
    const [compareOpen, setCompareOpen] = useState(false);
    const [focusVerse, setFocusVerse] = useState(null);
    const [pendingNavigation, setPendingNavigation] = useState(null);
    const [transitionBusy, setTransitionBusy] = useState(false);
    const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'reading');
    const [features, setFeatures] = useState({ personalRecords: 'disabled', community: 'disabled' });
    const [recordingsRefreshKey, setRecordingsRefreshKey] = useState(0);
    const initializedRef = useRef(false);
    const previewAudioRef = useRef(null);

    const versionName = VERSIONS.find(version => version.id === scripture.selection.version)?.name || scripture.selection.version;
    const reference = `${scripture.selection.book} ${scripture.selection.chapter} 章・${versionName}`;

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;
        scripture.load(initialSelection);
    }, [scripture]);

    useEffect(() => {
        fetchScriptureToolsStatus().then(setFeatures).catch(() => {});
    }, []);

    const selectTab = tab => {
        setActiveTab(tab);
        const url = new URL(window.location.href);
        if (tab === 'reading') url.searchParams.delete('tab');
        else url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', url);
    };

    useEffect(() => {
        if (readAloud.activeVerse === null) return;
        const element = document.querySelector(`.explorer-primary [data-verse="${readAloud.activeVerse}"]`);
        element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, [readAloud.activeVerse]);

    useEffect(() => {
        if (focusVerse === null) return;
        const timer = window.setTimeout(() => {
            const element = document.querySelector(`.explorer-primary [data-verse="${focusVerse}"]`);
            element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }, 80);
        return () => window.clearTimeout(timer);
    }, [focusVerse, scripture.passage]);

    useEffect(() => {
        const guardUnsavedRecording = event => {
            if (!recording.isRecording && !recording.hasUndownloadedResult) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', guardUnsavedRecording);
        return () => window.removeEventListener('beforeunload', guardUnsavedRecording);
    }, [recording.hasUndownloadedResult, recording.isRecording]);

    const finishNavigation = async navigation => {
        readAloud.stop();
        previewAudioRef.current?.pause();
        const loaded = await scripture.load(navigation.selection);
        if (loaded) {
            setFocusVerse(navigation.verse || null);
            if (navigation.fromSearch) setSearchOpen(false);
        }
    };

    const requestNavigation = (selection, options = {}) => {
        const navigation = { selection, ...options };
        if (recording.isRecording) {
            setPendingNavigation(navigation);
            return;
        }
        finishNavigation(navigation);
    };

    const resolveRecordingNavigation = async discard => {
        if (!pendingNavigation) return;
        setTransitionBusy(true);
        await recording.stop({ discard });
        const navigation = pendingNavigation;
        setPendingNavigation(null);
        await finishNavigation(navigation);
        setTransitionBusy(false);
    };

    const startRecording = async input => {
        if (recording.hasUndownloadedResult) {
            const replace = window.confirm('目前有一段尚未完成的語音祝福。重新錄音會取代它，確定要繼續嗎？');
            if (!replace) return;
            recording.clearResult();
        }
        readAloud.stop();
        previewAudioRef.current?.pause();
        setSearchOpen(false);
        setCompareOpen(false);
        const started = await recording.start({
            reference: `${scripture.selection.book} ${scripture.selection.chapter}:${input.verseStart}-${input.verseEnd}・${versionName}`,
            version: scripture.selection.version,
            book: scripture.selection.book,
            chapter: scripture.selection.chapter,
            verseStart: input.verseStart,
            verseEnd: input.verseEnd,
            blessingDraft: {
                visibility: input.visibility,
                title: input.title,
                message: input.message,
                theme: input.theme,
                signature: input.signature,
                customSignature: input.customSignature,
                recipient: input.recipient
            },
            filenameBase: `${scripture.selection.book}-${scripture.selection.chapter}章-語音祝福`
        });
        if (started) setBlessingOpen(true);
    };

    const playReadAloud = () => {
        previewAudioRef.current?.pause();
        readAloud.play();
    };

    const openBlessing = () => {
        setSearchOpen(false);
        setBlessingOpen(true);
    };

    return (
        <AppShell title="經文探索" eyebrow="閱讀、聆聽與共讀">
            <div className="explorer-intro-row">
                <p className="page-intro">選一次經文，就能在同一頁閱讀、聆聽，或把一段經文錄成送給某人的語音祝福卡。系統朗讀與語音祝福彼此獨立，都不使用 AI 或智匯點數。</p>
                <span className="explorer-privacy"><ShieldCheck size={17} /> 錄音由你決定是否保存</span>
            </div>

            <nav className="explorer-section-tabs" aria-label="經文探索分區">
                <button type="button" className={activeTab === 'reading' ? 'is-active' : ''} onClick={() => selectTab('reading')}><Headphones size={17} /> 閱讀與聆聽</button>
                <button type="button" className={activeTab === 'mine' ? 'is-active' : ''} onClick={() => selectTab('mine')}><Mic size={17} /> 我的朗讀</button>
                <button type="button" className={activeTab === 'community' ? 'is-active' : ''} onClick={() => selectTab('community')}><Users size={17} /> 經文共讀</button>
            </nav>

            {activeTab === 'reading' && <><ScripturePicker
                value={scripture.draftSelection}
                onChange={scripture.setDraftSelection}
                onLoad={selection => requestNavigation(selection)}
                loading={scripture.loading}
                submitLabel="開啟經文"
            />
            {scripture.error && <div className="notice notice-error" role="alert">{scripture.error}</div>}

            <nav className="explorer-tool-row" aria-label="經文探索工具">
                <span className="explorer-current-reference"><BookOpen size={18} /><strong>{reference}</strong><small>{scripture.passage.length ? `${scripture.passage.length} 節` : '載入中'}</small></span>
                <div>
                    <button type="button" className="secondary-button" onClick={() => { setBlessingOpen(false); setSearchOpen(value => !value); }} disabled={recording.isRecording}><Search size={17} /> 搜尋</button>
                    <button type="button" className={`secondary-button ${compareOpen ? 'is-active' : ''}`} onClick={() => setCompareOpen(value => !value)} disabled={!scripture.passage.length || recording.isRecording}><Columns3 size={17} /> 比較譯本</button>
                    <button type="button" className={`secondary-button blessing-entry-button ${recording.result ? 'has-result' : ''}`} onClick={openBlessing} disabled={!scripture.passage.length}><Gift size={17} /> 語音祝福{recording.result ? '・1' : ''}</button>
                </div>
            </nav>

            <ScriptureSearchDrawer
                open={searchOpen}
                onClose={() => setSearchOpen(false)}
                activeSelection={scripture.selection}
                onNavigate={next => requestNavigation(
                    { version: next.version, book: next.book, chapter: next.chapter },
                    { verse: next.verse, fromSearch: true }
                )}
            />

            <div className={`explorer-reading-grid ${compareOpen ? 'is-comparing' : ''}`}>
                <section className="explorer-primary" aria-label="主要經文">
                    <PassageDisplay passage={scripture.passage} reference={reference} activeVerse={readAloud.activeVerse} focusVerse={focusVerse} />
                </section>
                <ComparePassagePanel open={compareOpen} selection={scripture.selection} focusVerse={focusVerse} onClose={() => setCompareOpen(false)} />
            </div>

            <ReadAloudPlayer
                controller={readAloud}
                passageLoaded={Boolean(scripture.passage.length)}
                recordingActive={recording.isRecording}
                onPlay={playReadAloud}
            />

            <VoiceBlessingCardDialog
                open={blessingOpen}
                onClose={() => setBlessingOpen(false)}
                controller={recording}
                passage={scripture.passage}
                selection={scripture.selection}
                versionName={versionName}
                onStart={startRecording}
                previewAudioRef={previewAudioRef}
                onPreviewPlay={readAloud.stop}
            />

            <PassageChangeDialog
                open={Boolean(pendingNavigation)}
                busy={transitionBusy}
                onKeep={() => resolveRecordingNavigation(false)}
                onDiscard={() => resolveRecordingNavigation(true)}
                onCancel={() => setPendingNavigation(null)}
            />
            </>}

            {activeTab === 'mine' && (features.personalRecords === 'available'
                ? <MyRecordingsPanel refreshKey={recordingsRefreshKey} />
                : <div className="notice">會員朗讀保存目前尚未啟用；本機錄音仍可使用。</div>)}

            {activeTab === 'community' && (features.community === 'available'
                ? <CommunityPanel selection={scripture.selection} passage={scripture.passage} />
                : <div className="notice">經文共讀目前尚未啟用。</div>)}
        </AppShell>
    );
}
