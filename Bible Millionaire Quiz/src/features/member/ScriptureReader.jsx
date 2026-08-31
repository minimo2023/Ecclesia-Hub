/**
 * ScriptureReader - 經文閱讀器組件
 * 提供書卷/章節選擇、經文顯示、AI 摘要功能
 * (已移除劃線與筆記功能，回歸純淨閱讀)
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, Loader2, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { useScriptureReadAloud } from '../scripture-reading/useScriptureReadAloud.js';
import { applyVerseRange, summarizeVerseSelection, toggleVerseGroupSelection } from '../scripture-reading/verseSelection.js';
import ScriptureAudioDock from '../scripture-recording/ScriptureAudioDock.jsx';
import useReadingPlanSession from '../reading-plans/useReadingPlanSession.js';
import ScriptureBookChapterSelector from '../scripture-reading/ScriptureBookChapterSelector.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 書卷列表（含信望愛 API 書卷代碼 code）
export const BIBLE_BOOKS = {
    old: [
        { code: '創', name: '創世記', chapters: 50 },
        { code: '出', name: '出埃及記', chapters: 40 },
        { code: '利', name: '利未記', chapters: 27 },
        { code: '民', name: '民數記', chapters: 36 },
        { code: '申', name: '申命記', chapters: 34 },
        { code: '書', name: '約書亞記', chapters: 24 },
        { code: '士', name: '士師記', chapters: 21 },
        { code: '得', name: '路得記', chapters: 4 },
        { code: '撒上', name: '撒母耳記上', chapters: 31 },
        { code: '撒下', name: '撒母耳記下', chapters: 24 },
        { code: '王上', name: '列王紀上', chapters: 22 },
        { code: '王下', name: '列王紀下', chapters: 25 },
        { code: '代上', name: '歷代志上', chapters: 29 },
        { code: '代下', name: '歷代志下', chapters: 36 },
        { code: '拉', name: '以斯拉記', chapters: 10 },
        { code: '尼', name: '尼希米記', chapters: 13 },
        { code: '斯', name: '以斯帖記', chapters: 10 },
        { code: '伯', name: '約伯記', chapters: 42 },
        { code: '詩', name: '詩篇', chapters: 150 },
        { code: '箴', name: '箴言', chapters: 31 },
        { code: '傳', name: '傳道書', chapters: 12 },
        { code: '歌', name: '雅歌', chapters: 8 },
        { code: '賽', name: '以賽亞書', chapters: 66 },
        { code: '耶', name: '耶利米書', chapters: 52 },
        { code: '哀', name: '耶利米哀歌', chapters: 5 },
        { code: '結', name: '以西結書', chapters: 48 },
        { code: '但', name: '但以理書', chapters: 12 },
        { code: '何', name: '何西阿書', chapters: 14 },
        { code: '珥', name: '約珥書', chapters: 3 },
        { code: '摩', name: '阿摩司書', chapters: 9 },
        { code: '俄', name: '俄巴底亞書', chapters: 1 },
        { code: '拿', name: '約拿書', chapters: 4 },
        { code: '彌', name: '彌迦書', chapters: 7 },
        { code: '鴻', name: '那鴻書', chapters: 3 },
        { code: '哈', name: '哈巴谷書', chapters: 3 },
        { code: '番', name: '西番雅書', chapters: 3 },
        { code: '該', name: '哈該書', chapters: 2 },
        { code: '亞', name: '撒迦利亞書', chapters: 14 },
        { code: '瑪', name: '瑪拉基書', chapters: 4 }
    ],
    new: [
        { code: '太', name: '馬太福音', chapters: 28 },
        { code: '可', name: '馬可福音', chapters: 16 },
        { code: '路', name: '路加福音', chapters: 24 },
        { code: '約', name: '約翰福音', chapters: 21 },
        { code: '徒', name: '使徒行傳', chapters: 28 },
        { code: '羅', name: '羅馬書', chapters: 16 },
        { code: '林前', name: '哥林多前書', chapters: 16 },
        { code: '林後', name: '哥林多後書', chapters: 13 },
        { code: '加', name: '加拉太書', chapters: 6 },
        { code: '弗', name: '以弗所書', chapters: 6 },
        { code: '腓', name: '腓立比書', chapters: 4 },
        { code: '西', name: '歌羅西書', chapters: 4 },
        { code: '帖前', name: '帖撒羅尼迦前書', chapters: 5 },
        { code: '帖後', name: '帖撒羅尼迦後書', chapters: 3 },
        { code: '提前', name: '提摩太前書', chapters: 6 },
        { code: '提後', name: '提摩太後書', chapters: 4 },
        { code: '多', name: '提多書', chapters: 3 },
        { code: '門', name: '腓利門書', chapters: 1 },
        { code: '來', name: '希伯來書', chapters: 13 },
        { code: '雅', name: '雅各書', chapters: 5 },
        { code: '彼前', name: '彼得前書', chapters: 5 },
        { code: '彼後', name: '彼得後書', chapters: 3 },
        { code: '約一', name: '約翰一書', chapters: 5 },
        { code: '約二', name: '約翰二書', chapters: 1 },
        { code: '約三', name: '約翰三書', chapters: 1 },
        { code: '猶', name: '猶大書', chapters: 1 },
        { code: '啟', name: '啟示錄', chapters: 22 }
    ]
};

// 🚀 [Sovereign Versions] 譯本列表 (與本地資料庫對齊)
export const BIBLE_VERSIONS = [
    // 中文譯本
    { code: 'unv', name: '和合本', source: 'fhl' },
    { code: 'ncv', name: '新譯本', source: 'fhl' },
    { code: 'tcv2019', name: '現代中文2019', source: 'fhl' },
    { code: 'lcc', name: '呂振中譯本', source: 'fhl' },
];

function passageFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const bookName = params.get('book');
    const allBooks = [...BIBLE_BOOKS.old, ...BIBLE_BOOKS.new];
    const book = allBooks.find(item => item.name === bookName) || null;
    const requestedChapter = Number(params.get('chapter'));
    const chapter = book && Number.isInteger(requestedChapter)
        ? Math.min(book.chapters, Math.max(1, requestedChapter))
        : 1;
    const requestedVersion = params.get('version');
    const version = BIBLE_VERSIONS.some(item => item.code === requestedVersion) ? requestedVersion : 'unv';
    return { book, chapter, version };
}



export default function ScriptureReader({
    onBack,
    readingPlanScheduleId = null,
    onReadingPlanCompleted
}) {
    const initialPassage = useRef(passageFromQuery()).current;
    const initialPassageLoaded = useRef(false);
    const [selectedBook, setSelectedBook] = useState(initialPassage.book);
    const [selectedChapter, setSelectedChapter] = useState(initialPassage.chapter);
    const [selectedVersion, setSelectedVersion] = useState(initialPassage.version);
    const [verses, setVerses] = useState([]);
    const [isLoadingVerses, setIsLoadingVerses] = useState(false);
    const [showBookSelector, setShowBookSelector] = useState(!initialPassage.book);
    const [selectorBook, setSelectorBook] = useState(initialPassage.book);
    const [activeTestament, setActiveTestament] = useState(
        BIBLE_BOOKS.new.some(book => book.code === initialPassage.book?.code) ? 'new' : 'old'
    );
    const [selectedVerses, setSelectedVerses] = useState([]);
    const [lastSelectedVerse, setLastSelectedVerse] = useState(null);
    const readingPlan = useReadingPlanSession({
        scheduleId: readingPlanScheduleId,
        onCompleted: onReadingPlanCompleted
    });

    // 對照模式
    const [compareMode, setCompareMode] = useState(false);



    const [compareVersion, setCompareVersion] = useState('ncv');
    const [compareVerses, setCompareVerses] = useState([]);
    const [isLoadingCompare, setIsLoadingCompare] = useState(false);



    // Note Modal State
    const [activeNote, setActiveNote] = useState(null);

    const contentRef = useRef(null);
    const selectionGestureRef = useRef({
        active: false,
        anchor: null,
        anchorEnd: null,
        baseSelection: [],
        current: null,
        currentEnd: null,
        mode: 'add',
        pointerId: null,
        pointerType: null,
        startX: 0,
        startY: 0,
        target: null,
        timer: null,
        suppressClickUntil: 0,
        touchMoveBlocker: null
    });
    const displayVerses = readingPlan.enabled ? readingPlan.verses : verses;
    const displayLoading = readingPlan.enabled ? readingPlan.loading : isLoadingVerses;
    const displayVersion = readingPlan.enabled ? readingPlan.selectedVersion : selectedVersion;
    const selectedVerseSet = useMemo(() => new Set(selectedVerses), [selectedVerses]);
    const selectedVerseRange = useMemo(() => summarizeVerseSelection(selectedVerses), [selectedVerses]);
    const readAloud = useScriptureReadAloud(displayVerses);

    useEffect(() => {
        if (!readingPlan.enabled) return;
        const reference = readingPlan.activeReference;
        if (reference?.book) {
            const allBooks = [...BIBLE_BOOKS.old, ...BIBLE_BOOKS.new];
            const matchingBook = allBooks.find(book => book.name === reference.book);
            if (matchingBook) setSelectedBook(matchingBook);
        }
        if (Number.isInteger(Number(reference?.chapter))) setSelectedChapter(Number(reference.chapter));
        setShowBookSelector(false);
        setCompareMode(false);
    }, [readingPlan.activeReference, readingPlan.enabled]);

    useEffect(() => {
        setSelectedVerses([]);
        setLastSelectedVerse(null);
    }, [readingPlan.chapterIndex, selectedBook, selectedChapter, displayVersion]);

    useEffect(() => () => {
        const gesture = selectionGestureRef.current;
        if (gesture.timer) window.clearTimeout(gesture.timer);
        if (gesture.touchMoveBlocker) document.removeEventListener('touchmove', gesture.touchMoveBlocker);
    }, []);

    useEffect(() => {
        if (readAloud.activeVerse === null || !contentRef.current) return;
        const activeElement = contentRef.current.querySelector(`[data-primary-verse="${readAloud.activeVerse}"]`);
        if (!activeElement) return;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        activeElement.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'center'
        });
    }, [readAloud.activeVerse]);

    useEffect(() => {
        if (compareMode) readAloud.stop();
    }, [compareMode, readAloud.stop]);

    // 載入經文 - 改為呼叫後端 API (ContentManager)
    const loadChapter = async (book, chapter, version = null) => {
        setIsLoadingVerses(true);
        setVerses([]);
        setActiveNote(null);

        try {
            const ver = version || selectedVersion || 'unv';
            const url = `${API_BASE_URL}/api/content/scripture?book=${encodeURIComponent(book.name)}&chapter=${chapter}&version=${ver}`;
            console.log('Loading from Backend:', url);

            const token = localStorage.getItem('token');
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, { headers });
            const data = await response.json();

            if (data.success && data.data && data.data.length > 0) {
                setVerses(data.data.map(r => ({
                    verse: Number(r.verseStart ?? r.verse),
                    verseStart: Number(r.verseStart ?? r.verse),
                    verseEnd: Number(r.verseEnd ?? r.verse),
                    verseLabel: String(r.verseLabel ?? r.verse),
                    coveredVerses: Array.isArray(r.coveredVerses) ? r.coveredVerses.map(Number) : [Number(r.verse)],
                    isMergedVerse: Boolean(r.isMergedVerse),
                    text: r.text, // 後端已移除 HTML
                    lineBreakAfter: Boolean(r.lineBreakAfter),
                    paragraphBreakAfter: Boolean(r.paragraphBreakAfter)
                })));
                console.log(`Loaded ${data.data.length} verses from ${data.source}`);
            } else {
                console.warn('No verses returned for', book.name, chapter);
                // Fallback? 或者顯示錯誤
            }
        } catch (error) {
            console.error('載入經文失敗:', error);
        } finally {
            setIsLoadingVerses(false);
        }
    };

    useEffect(() => {
        if (readingPlan.enabled || initialPassageLoaded.current || !initialPassage.book) return;
        initialPassageLoaded.current = true;
        loadChapter(initialPassage.book, initialPassage.chapter, initialPassage.version);
    }, [readingPlan.enabled]);

    const clearVerseSelection = () => {
        setSelectedVerses([]);
        setLastSelectedVerse(null);
    };

    const handleVerseSelect = (verseRow, event) => {
        if (compareMode) return;
        const verseStart = Number(verseRow.verseStart ?? verseRow.verse);
        const verseEnd = Number(verseRow.verseEnd ?? verseRow.verse);
        const coveredVerses = Array.isArray(verseRow.coveredVerses) ? verseRow.coveredVerses : [verseStart];
        if (Date.now() < selectionGestureRef.current.suppressClickUntil) return;
        if (event?.shiftKey && Number.isInteger(lastSelectedVerse)) {
            const target = verseEnd >= lastSelectedVerse ? verseEnd : verseStart;
            setSelectedVerses(current => applyVerseRange(current, lastSelectedVerse, target, 'add'));
        } else {
            setSelectedVerses(current => toggleVerseGroupSelection(current, coveredVerses));
        }
        setLastSelectedVerse(verseEnd);
    };

    const releaseSelectionGesture = suppressClick => {
        const gesture = selectionGestureRef.current;
        if (gesture.timer) window.clearTimeout(gesture.timer);
        if (gesture.touchMoveBlocker) document.removeEventListener('touchmove', gesture.touchMoveBlocker);
        if (gesture.target?.hasPointerCapture?.(gesture.pointerId)) {
            try { gesture.target.releasePointerCapture(gesture.pointerId); } catch { /* pointer may already be released */ }
        }
        if (suppressClick) gesture.suppressClickUntil = Date.now() + 400;
        if (gesture.active && Number.isInteger(gesture.currentEnd)) setLastSelectedVerse(gesture.currentEnd);
        Object.assign(gesture, {
            active: false,
            anchor: null,
            anchorEnd: null,
            baseSelection: [],
            current: null,
            currentEnd: null,
            mode: 'add',
            pointerId: null,
            pointerType: null,
            target: null,
            timer: null,
            touchMoveBlocker: null
        });
    };

    const activateSelectionGesture = () => {
        const gesture = selectionGestureRef.current;
        if (!Number.isInteger(gesture.anchor) || gesture.active) return;
        gesture.active = true;
        gesture.mode = Array.from({ length: gesture.anchorEnd - gesture.anchor + 1 }, (_, index) => gesture.anchor + index)
            .every(verse => gesture.baseSelection.includes(verse)) ? 'remove' : 'add';
        gesture.current = gesture.anchor;
        gesture.currentEnd = gesture.anchorEnd;
        gesture.touchMoveBlocker = event => event.preventDefault();
        document.addEventListener('touchmove', gesture.touchMoveBlocker, { passive: false });
        try { gesture.target?.setPointerCapture?.(gesture.pointerId); } catch { /* pointer capture is optional */ }
        setSelectedVerses(applyVerseRange(gesture.baseSelection, gesture.anchor, gesture.anchorEnd, gesture.mode));
        window.navigator.vibrate?.(10);
    };

    const startSelectionGesture = (verseRow, event) => {
        if (compareMode || (event.button !== undefined && event.button !== 0)) return;
        const gesture = selectionGestureRef.current;
        releaseSelectionGesture(false);
        Object.assign(gesture, {
            anchor: Number(verseRow.verseStart ?? verseRow.verse),
            anchorEnd: Number(verseRow.verseEnd ?? verseRow.verse),
            baseSelection: [...selectedVerses],
            current: Number(verseRow.verseStart ?? verseRow.verse),
            currentEnd: Number(verseRow.verseEnd ?? verseRow.verse),
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            startX: event.clientX,
            startY: event.clientY,
            target: event.currentTarget
        });
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            gesture.timer = window.setTimeout(activateSelectionGesture, 300);
        }
    };

    const moveSelectionGesture = event => {
        const gesture = selectionGestureRef.current;
        if (gesture.pointerId !== event.pointerId || !Number.isInteger(gesture.anchor)) return;
        const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (!gesture.active) {
            if (gesture.pointerType === 'mouse' && distance >= 6) activateSelectionGesture();
            else if (gesture.pointerType !== 'mouse' && distance >= 10) {
                releaseSelectionGesture(false);
                return;
            }
        }
        if (!gesture.active) return;
        event.preventDefault();
        const verseElement = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-primary-verse]');
        const current = Number(verseElement?.dataset.primaryVerse);
        const currentEnd = Number(verseElement?.dataset.verseEnd || current);
        if (!Number.isInteger(current) || !Number.isInteger(currentEnd)
            || (current === gesture.current && currentEnd === gesture.currentEnd)) return;
        gesture.current = current;
        gesture.currentEnd = currentEnd;
        const rangeStart = Math.min(gesture.anchor, current);
        const rangeEnd = Math.max(gesture.anchorEnd, currentEnd);
        setSelectedVerses(applyVerseRange(gesture.baseSelection, rangeStart, rangeEnd, gesture.mode));
    };

    const finishSelectionGesture = event => {
        const gesture = selectionGestureRef.current;
        if (gesture.pointerId !== event.pointerId) return;
        releaseSelectionGesture(gesture.active);
    };

    const openBookSelector = () => {
        setSelectorBook(selectedBook);
        setActiveTestament(BIBLE_BOOKS.new.some(book => book.code === selectedBook?.code) ? 'new' : 'old');
        setShowBookSelector(true);
    };

    const handleSelectBook = (book) => {
        setSelectorBook(current => current?.code === book.code ? null : book);
    };

    const handleSelectBookChapter = (book, chapter) => {
        readAloud.stop();
        setSelectedBook(book);
        setSelectedChapter(chapter);
        setShowBookSelector(false);
        loadChapter(book, chapter);
    };

    // 切換章節
    const handleChapterChange = (chapter) => {
        setSelectedChapter(chapter);
        loadChapter(selectedBook, chapter);
    };

    // 切換譯本
    const handleVersionChange = (version) => {
        setSelectedVersion(version);
        if (selectedBook) {
            loadChapter(selectedBook, selectedChapter, version);
        }
    };

    // 載入對照版本
    const loadCompareVersion = async (book, chapter, version) => {
        setIsLoadingCompare(true);
        try {
            const url = `${API_BASE_URL}/api/content/scripture?book=${encodeURIComponent(book.name)}&chapter=${chapter}&version=${version}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.success && Array.isArray(data.data)) {
                setCompareVerses(data.data.map(r => ({
                    verse: Number(r.verseStart ?? r.verse),
                    verseStart: Number(r.verseStart ?? r.verse),
                    verseEnd: Number(r.verseEnd ?? r.verse),
                    verseLabel: String(r.verseLabel ?? r.verse),
                    text: r.text
                })));
            }
        } catch (error) {
            console.error('載入對照版本失敗:', error);
        } finally {
            setIsLoadingCompare(false);
        }
    };

    // 切換對照模式
    const toggleCompareMode = () => {
        const newMode = !compareMode;
        setCompareMode(newMode);
        if (newMode && selectedBook) {
            loadCompareVersion(selectedBook, selectedChapter, compareVersion);
        }
    };

    // 切換對照版本
    const handleCompareVersionChange = (version) => {
        setCompareVersion(version);
        if (compareMode && selectedBook) {
            loadCompareVersion(selectedBook, selectedChapter, version);
        }
    };



    // 書卷選擇器 UI
    const BookSelector = () => (
        <div className="h-full overflow-y-auto bg-[#F8FAFC] px-5 py-6 sm:px-8">
            <div className="mx-auto mb-6 flex max-w-6xl items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Scripture Explorer</p>
                    <h2 className="mt-1 flex items-center gap-2.5 text-[28px] font-black text-slate-900"><BookOpen className="h-7 w-7 text-indigo-600" strokeWidth={2.25} />選擇書卷與章節</h2>
                    <p className="mt-2 text-[15px] font-medium text-slate-600">先選新約或舊約，再展開經卷選擇章節。</p>
                </div>
                {selectedBook ? (
                    <button type="button" onClick={() => setShowBookSelector(false)} className="min-h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">返回閱讀</button>
                ) : null}
            </div>
            <ScriptureBookChapterSelector
                books={BIBLE_BOOKS}
                activeTestament={activeTestament}
                expandedBook={selectorBook}
                currentBook={selectedBook}
                currentChapter={selectedChapter}
                onTestamentChange={testament => {
                    setActiveTestament(testament);
                    setSelectorBook(null);
                }}
                onBookToggle={handleSelectBook}
                onChapterSelect={handleSelectBookChapter}
                variant="desktop"
            />
        </div>
    );

    // Helper to extract notes from text
    const extractScriptureNotes = (text) => {
        if (!text) return { text: '', notes: [] };
        let cleaned = text;
        const notes = [];

        // Helper to extract by regex
        const extract = (regex) => {
            let match;
            while ((match = regex.exec(cleaned)) !== null) {
                // If the regex matches global, we need to loop manually if not using replace callback or similar.
                // Simpler: use replace with callback to capture and remove
                cleaned = cleaned.replace(regex, (m) => {
                    notes.push(m);
                    return '';
                });
            }
        };

        // 1. FHL standard notes: ([1.1] ...)
        // Note: exec with global regex is tricky if modifying string. 
        // Safer strategy: match, store, then replace all.

        const patterns = [
            /\(\[[0-9.]+\][^)]+\)/g,
            new RegExp(`\\((?:[^)(]*(${'或譯|或作|古卷|原文|註|意即'})[^)(]*)\\)`, 'g'),
            new RegExp(`（(?:[^）（]*(${'或譯|或作|古卷|原文|註|意即'})[^）（]*)）`, 'g')
        ];

        patterns.forEach(p => {
            cleaned = cleaned.replace(p, (match) => {
                notes.push(match);
                return '';
            });
        });

        // Remove standalone numbers
        cleaned = cleaned.replace(/\[[0-9.]+\]/g, '');

        return { text: cleaned.trim(), notes };
    };

    // 註解 Modal 組件
    const NoteModal = ({ note, onClose }) => {
        if (!note) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
                <div
                    className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50">
                        <div className="flex items-center gap-2 text-stone-700">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">註</span>
                            <h3 className="font-bold">參考註解</h3>
                        </div>
                        <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded-full transition-colors">
                            <X className="w-5 h-5 text-stone-500" />
                        </button>
                    </div>
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        <p className="text-stone-700 leading-relaxed whitespace-pre-wrap text-lg">
                            {note}
                        </p>
                    </div>
                    <div className="p-4 bg-stone-50 border-t border-stone-100 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-lg transition-colors font-medium"
                        >
                            關閉
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // 經文閱讀 UI (Modified for Side-by-Side Summary)
    const ChapterView = () => (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 頂部工作區：桌機左右分欄，窄螢幕自動上下排列 */}
            <div className={`flex-none grid bg-white border-b border-stone-200 z-20 shadow-sm ${compareMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]'}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-2 p-3">
                {readingPlan.enabled ? (
                    <>
                        <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">今日閱讀</div>
                            <div className="truncate font-bold text-stone-800">{readingPlan.chapterTitle}</div>
                        </div>
                        <select
                            value={readingPlan.selectedVersion}
                            onChange={(event) => readingPlan.setSelectedVersion(event.target.value)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-medium text-emerald-700 outline-none"
                        >
                            {readingPlan.availableVersions.length > 0 ? readingPlan.availableVersions.map(version => (
                                <option key={version.id} value={version.id}>{version.name}</option>
                            )) : <option value="CUV_TRAD">和合本</option>}
                        </select>
                    </>
                ) : (
                <>
                <button
                    onClick={openBookSelector}
                    className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                >
                    <BookOpen className="w-4 h-4" />
                    <span className="font-medium">{selectedBook?.name}</span>
                    <ChevronDown className="w-4 h-4" />
                </button>

                <select
                    value={selectedChapter}
                    onChange={(e) => handleChapterChange(parseInt(e.target.value))}
                    className="px-3 py-2 bg-stone-100 rounded-lg border-none outline-none font-medium"
                >
                    {Array.from({ length: selectedBook?.chapters || 1 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>第 {i + 1} 章</option>
                    ))}
                </select>

                <select
                    value={selectedVersion}
                    onChange={(e) => handleVersionChange(e.target.value)}
                    className="px-3 py-2 bg-emerald-5 text-emerald-700 rounded-lg border border-emerald-200 outline-none font-medium"
                >
                    {BIBLE_VERSIONS.map(v => (
                        <option key={v.code} value={v.code}>{v.name}</option>
                    ))}
                </select>

                <button
                    onClick={toggleCompareMode}
                    className={`hidden sm:block px-3 py-2 rounded-lg font-medium transition-colors ${compareMode ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'}`}
                >
                    {compareMode ? '關閉對照' : '開啟對照'}
                </button>

                {compareMode && (
                    <select
                        value={compareVersion}
                        onChange={(e) => handleCompareVersionChange(e.target.value)}
                        className="hidden sm:block px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 outline-none font-medium"
                    >
                        {BIBLE_VERSIONS.filter(v => v.code !== selectedVersion).map(v => (
                            <option key={v.code} value={v.code}>{v.name}</option>
                        ))}
                    </select>
                )}


                {/* Chapter Navigation Buttons (Top) */}
                <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50">
                    <button
                        onClick={() => {
                            if (selectedChapter > 1) {
                                handleChapterChange(selectedChapter - 1);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                        }}
                        disabled={selectedChapter <= 1}
                        className="flex h-10 w-10 items-center justify-center hover:bg-stone-100 text-stone-600 disabled:opacity-30 disabled:hover:bg-transparent rounded-l-lg transition-colors border-r border-stone-200"
                        title="上一章"
                        aria-label="上一章"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => {
                            if (selectedBook && selectedChapter < selectedBook.chapters) {
                                handleChapterChange(selectedChapter + 1);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                        }}
                        disabled={!selectedBook || selectedChapter >= selectedBook.chapters}
                        className="flex h-10 w-10 items-center justify-center hover:bg-stone-100 text-stone-600 disabled:opacity-30 disabled:hover:bg-transparent rounded-r-lg transition-colors"
                        title="下一章"
                        aria-label="下一章"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                </>
                )}

                </div>

                {!compareMode ? (
                    <div className="min-w-0 border-t border-stone-200 md:border-l md:border-t-0">
                        <ScriptureAudioDock
                            controller={readAloud}
                            hasVerses={!displayLoading && displayVerses.length > 0}
                            verses={displayVerses}
                            selection={{ version: displayVersion, book: selectedBook?.name || '', chapter: selectedChapter }}
                            selectedVerseRange={selectedVerseRange}
                            onClearVerseSelection={clearVerseSelection}
                            integrated
                        />
                    </div>
                ) : null}
            </div>

            {/* 主內容區：經文 + 側邊欄 */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* 經文內容 (With Blur Effect when Summary is Open) */}
                <div
                    ref={contentRef}
                    className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-50"
                    onPointerMove={moveSelectionGesture}
                    onPointerUp={finishSelectionGesture}
                    onPointerCancel={finishSelectionGesture}
                    onPointerLeave={event => {
                        if (event.pointerType === 'mouse' && selectionGestureRef.current.active) finishSelectionGesture(event);
                    }}
                >
                    {displayLoading ? (
                        <div className="flex items-center justify-center h-32 text-stone-400">
                            <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            載入中...
                        </div>
                    ) : readingPlan.error ? (
                        <div className="mx-auto mt-16 max-w-md rounded-xl border border-rose-100 bg-rose-50 p-5 text-center font-medium text-rose-700">
                            {readingPlan.error}
                        </div>
                    ) : displayVerses.length > 0 ? (
                        <div className={`mx-auto pb-24 ${compareMode ? 'max-w-6xl grid grid-cols-2 gap-8' : 'max-w-3xl'}`}>
                            {/* 主譯本 */}
                            <div className={compareMode ? 'space-y-4' : 'space-y-6'}>
                                {compareMode && <h4 className="font-bold text-emerald-700 text-sm mb-2 sticky top-0 bg-stone-50 py-2 border-b border-stone-200 z-10">{BIBLE_VERSIONS.find(v => v.code === selectedVersion)?.name}</h4>}
                                {displayVerses.map(v => {
                                    const { text, notes } = extractScriptureNotes(v.text);
                                    const verseNumber = Number(v.verseStart ?? v.verse);
                                    const coveredVerses = Array.isArray(v.coveredVerses) ? v.coveredVerses : [verseNumber];
                                    const isSelected = coveredVerses.every(verse => selectedVerseSet.has(Number(verse)));
                                    return (
                                        <p
                                            key={v.verse}
                                            role="button"
                                            tabIndex={0}
                                            onClick={(event) => handleVerseSelect(v, event)}
                                            onPointerDown={event => startSelectionGesture(v, event)}
                                            onContextMenu={event => {
                                                if (selectionGestureRef.current.active) event.preventDefault();
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    handleVerseSelect(v, event);
                                                }
                                            }}
                                            className={`verse-text touch-pan-y select-none leading-loose text-stone-800 text-lg sm:text-xl tracking-wide group relative rounded-xl px-2 py-1 -mx-2 border transition-colors ${isSelected ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : readAloud.activeVerse === Number(v.verse) ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-stone-100'}`}
                                            data-book={selectedBook?.code}
                                            data-chapter={selectedChapter}
                                            data-verse={v.verse}
                                            data-primary-verse={v.verse}
                                            data-verse-end={v.verseEnd ?? verseNumber}
                                            aria-pressed={isSelected}
                                            aria-label={`第 ${v.verseLabel ?? v.verse} 節，${isSelected ? '已選取，點一下取消' : '未選取，點一下選取'}；拖曳可連續選取`}
                                            aria-current={readAloud.activeVerse === Number(v.verse) ? 'true' : undefined}
                                        >
                                            <span className="text-amber-600 font-bold mr-3 text-sm select-none align-text-top inline-block min-w-[1.2em]">{v.verseLabel ?? v.verse}</span>
                                            <span className="verse-content">{text}</span>
                                            {notes.length > 0 && (
                                                <button
                                                    className="inline-flex items-center ml-1 align-baseline text-stone-400 hover:text-amber-600 transition-colors cursor-pointer group-hover:scale-110"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveNote(notes.join('\n\n'));
                                                    }}
                                                    title="點擊查看註解"
                                                >
                                                    <span className="text-[10px] border border-current rounded-full px-1 min-w-[14px] text-center leading-tight">註</span>
                                                </button>
                                            )}
                                        </p>
                                    );
                                })}
                            </div>
                            {/* 對照譯本 */}
                            {compareMode && (
                                <div className="space-y-4 border-l-2 border-stone-200 pl-8">
                                    <h4 className="font-bold text-blue-700 text-sm mb-2 sticky top-0 bg-stone-50 py-2 border-b border-stone-200 z-10">{BIBLE_VERSIONS.find(v => v.code === compareVersion)?.name}</h4>
                                    {isLoadingCompare ? (
                                        <div className="text-stone-400 animate-pulse">載入對照版本...</div>
                                    ) : compareVerses.map(v => {
                                        const { text, notes } = extractScriptureNotes(v.text);
                                        return (
                                            <p
                                                key={v.verse}
                                                className="verse-text leading-loose text-stone-600 text-lg sm:text-xl tracking-wide group"
                                                data-book={selectedBook?.code}
                                                data-chapter={selectedChapter}
                                                data-verse={v.verse}
                                            >
                                                <span className="text-blue-600 font-bold mr-3 text-sm select-none align-text-top inline-block min-w-[1.2em]">{v.verseLabel ?? v.verse}</span>
                                                <span className="verse-content">{text}</span>
                                                {notes.length > 0 && (
                                                    <button
                                                        className="inline-flex items-center ml-1 align-baseline text-stone-300 hover:text-blue-600 transition-colors cursor-pointer group-hover:scale-110"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveNote(notes.join('\n\n'));
                                                        }}
                                                        title="點擊查看註解"
                                                    >
                                                        <span className="text-[10px] border border-current rounded-full px-1 min-w-[14px] text-center leading-tight">註</span>
                                                    </button>
                                                )}
                                            </p>
                                        );
                                    })}
                                </div>
                            )}



                        </div>
                    ) : (
                        <div className="text-center text-stone-400 mt-20 flex flex-col items-center gap-4">
                            <BookOpen className="w-12 h-12 opacity-20" />
                            <p>請從上方選擇書卷和章節開始閱讀</p>
                        </div>
                    )}
                </div>



                {/* Note Modal */}
                {activeNote && <NoteModal note={activeNote} onClose={() => setActiveNote(null)} />}

            </div>

            {readingPlan.enabled ? (
                <footer className="flex-none border-t border-stone-200 bg-white px-4 py-3">
                    <div className="mx-auto flex max-w-3xl items-center gap-3">
                        <button
                            type="button"
                            onClick={readingPlan.goPrevious}
                            disabled={readingPlan.isFirstChapter}
                            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-stone-200 px-4 font-bold text-stone-600 disabled:opacity-30"
                        >
                            <ChevronLeft className="h-4 w-4" /> 上一段
                        </button>
                        <div className="min-w-0 flex-1 text-center">
                            <div className="text-sm font-black text-stone-700">
                                {readingPlan.chapterIndex + 1} / {readingPlan.chapterCount}
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                                <div
                                    className="h-full bg-emerald-500 transition-[width]"
                                    style={{ width: `${readingPlan.progress}%` }}
                                />
                            </div>
                            {readingPlan.timer > 0 ? (
                                <div className="mt-1 text-[11px] font-medium text-stone-400">
                                    閱讀 {readingPlan.timer} 秒後可繼續
                                </div>
                            ) : null}
                        </div>
                        {readingPlan.isLastChapter ? (
                            <button
                                type="button"
                                onClick={readingPlan.complete}
                                disabled={!readingPlan.canAdvance || readingPlan.completing}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-black text-white disabled:bg-stone-200 disabled:text-stone-500"
                            >
                                {readingPlan.completing ? '儲存中…' : <>完成閱讀 <Check className="h-4 w-4" /></>}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={readingPlan.goNext}
                                disabled={!readingPlan.canAdvance}
                                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 font-black text-white disabled:bg-stone-200 disabled:text-stone-500"
                            >
                                下一段 <ChevronRight className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </footer>
            ) : null}

        </div>
    );

    return (
        <div className="h-screen bg-white flex flex-col relative">
            {/* Header */}
            <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-stone-500" />
                </button>
                <h1 className="text-lg font-bold text-stone-800">
                    📖 {readingPlan.enabled ? '讀經計畫・經文探索' : '經文探索'}
                </h1>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                {showBookSelector ? <BookSelector /> : <ChapterView />}
            </div>
        </div>
    );
}

