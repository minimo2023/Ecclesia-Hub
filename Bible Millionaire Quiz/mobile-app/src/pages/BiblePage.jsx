import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BookOpen, Loader2, ChevronLeft, ChevronRight, List, Check } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import {
  BIBLE_BOOKS,
  BIBLE_VERSIONS,
} from '../../../src/features/member/ScriptureReader';
import { useScriptureReadAloud } from '../../../src/features/scripture-reading/useScriptureReadAloud.js';
import { stripScriptureSpeechAnnotations } from '../../../src/features/scripture-reading/scriptureSpeech.js';
import ScriptureAudioDock from '../../../src/features/scripture-recording/ScriptureAudioDock.jsx';
import useReadingPlanSession from '../../../src/features/reading-plans/useReadingPlanSession.js';
import ScriptureBookChapterSelector from '../../../src/features/scripture-reading/ScriptureBookChapterSelector.jsx';
import {
  applyVerseRange,
  summarizeVerseSelection,
  toggleVerseGroupSelection
} from '../utils/verseSelection.js';

export default function BiblePage({
  readingPlanScheduleId = null,
  onReadingPlanBack,
  onReadingPlanCompleted
}) {
  const initialSelection = useRef(null);
  if (!initialSelection.current) {
    const params = new URLSearchParams(window.location.search);
    const allBooks = [...BIBLE_BOOKS.old, ...BIBLE_BOOKS.new];
    const book = allBooks.find(item => item.name === params.get('book')) || null;
    const requestedChapter = Number(params.get('chapter'));
    const requestedVersion = params.get('version');
    initialSelection.current = {
      book,
      chapter: book && Number.isInteger(requestedChapter) ? Math.min(book.chapters, Math.max(1, requestedChapter)) : 1,
      version: BIBLE_VERSIONS.some(item => item.code === requestedVersion) ? requestedVersion : 'unv'
    };
  }
  const [selectedBook, setSelectedBook] = useState(initialSelection.current.book);
  const [selectedChapter, setSelectedChapter] = useState(initialSelection.current.chapter);
  const [selectedVersion, setSelectedVersion] = useState(initialSelection.current.version);
  const [verses, setVerses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSelector, setShowSelector] = useState(!readingPlanScheduleId && !initialSelection.current.book);
  const [selectorBook, setSelectorBook] = useState(initialSelection.current.book);
  const [activeTestament, setActiveTestament] = useState(BIBLE_BOOKS.new.some(book => book.code === initialSelection.current.book?.code) ? 'new' : 'old');
  const [selectedVerses, setSelectedVerses] = useState([]);
  const [lastSelectedVerse, setLastSelectedVerse] = useState(null);
  const readingPlan = useReadingPlanSession({
    scheduleId: readingPlanScheduleId,
    onCompleted: onReadingPlanCompleted
  });
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
  const readAloud = useScriptureReadAloud(verses);
  const selectedVerseSet = useMemo(() => new Set(selectedVerses), [selectedVerses]);
  const selectedVerseRange = useMemo(() => summarizeVerseSelection(selectedVerses), [selectedVerses]);
  const effectiveLoading = readingPlan.enabled ? readingPlan.loading : isLoading;
  const effectiveError = readingPlan.enabled ? readingPlan.error : null;
  const effectiveVersion = readingPlan.enabled ? readingPlan.selectedVersion : selectedVersion;

  useEffect(() => {
    // Scroll to top when chapter changes
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [readingPlan.chapterIndex, selectedChapter, selectedBook]);

  useEffect(() => {
    if (!readingPlan.enabled) return;
    const reference = readingPlan.activeReference;
    if (reference?.book) {
      const allBooks = [...BIBLE_BOOKS.old, ...BIBLE_BOOKS.new];
      const matchingBook = allBooks.find(book => book.name === reference.book);
      if (matchingBook) setSelectedBook(matchingBook);
    }
    if (Number.isInteger(Number(reference?.chapter))) setSelectedChapter(Number(reference.chapter));
    setVerses(readingPlan.verses);
    setShowSelector(false);
  }, [readingPlan.activeReference, readingPlan.enabled, readingPlan.verses]);

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
    if (readingPlan.enabled || !selectedBook) return undefined;
    const fetchVerses = async () => {
      setIsLoading(true);
      setVerses([]);
      try {
        const token = sessionStorage.getItem('authToken');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const url = `/api/content/scripture?book=${encodeURIComponent(selectedBook.name)}&chapter=${selectedChapter}&version=${selectedVersion}`;
        
        const res = await fetch(url, { headers });
        const data = await res.json();
        if (data.success && data.data) {
          setVerses(data.data.map(v => ({
            verse: Number(v.verseStart ?? v.verse),
            verseStart: Number(v.verseStart ?? v.verse),
            verseEnd: Number(v.verseEnd ?? v.verse),
            verseLabel: String(v.verseLabel ?? v.verse),
            coveredVerses: Array.isArray(v.coveredVerses) ? v.coveredVerses.map(Number) : [Number(v.verse)],
            isMergedVerse: Boolean(v.isMergedVerse),
            text: v.text,
            lineBreakAfter: Boolean(v.lineBreakAfter),
            paragraphBreakAfter: Boolean(v.paragraphBreakAfter)
          })));
        } else {
          setVerses([]);
        }
      } catch (err) {
        console.error('Fetch verses error:', err);
        setVerses([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVerses();
  }, [readingPlan.enabled, selectedBook, selectedChapter, selectedVersion]);

  useEffect(() => {
    setSelectedVerses([]);
    setLastSelectedVerse(null);
  }, [readingPlan.chapterIndex, selectedBook, selectedChapter, selectedVersion]);

  useEffect(() => () => {
    const gesture = selectionGestureRef.current;
    if (gesture.timer) window.clearTimeout(gesture.timer);
    if (gesture.touchMoveBlocker) document.removeEventListener('touchmove', gesture.touchMoveBlocker);
  }, []);

  const openSelector = () => {
    if (readingPlan.enabled) return;
    setSelectorBook(selectedBook);
    setActiveTestament(BIBLE_BOOKS.new.some(book => book.code === selectedBook?.code) ? 'new' : 'old');
    setShowSelector(true);
  };

  const handleBookSelect = (book) => {
    setSelectorBook(current => current?.code === book.code ? null : book);
  };

  const handleChapterSelect = (book, chapter) => {
    readAloud.stop();
    setSelectedBook(book);
    setSelectedChapter(chapter);
    setShowSelector(false);
  };

  const clearVerseSelection = () => {
    setSelectedVerses([]);
    setLastSelectedVerse(null);
  };

  const handleVerseSelect = (verseRow, event) => {
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
    try { gesture.target?.setPointerCapture?.(gesture.pointerId); } catch { /* capture is optional */ }
    setSelectedVerses(applyVerseRange(gesture.baseSelection, gesture.anchor, gesture.anchorEnd, gesture.mode));
    window.navigator.vibrate?.(10);
  };

  const startSelectionGesture = (verseRow, event) => {
    if (event.button !== undefined && event.button !== 0) return;
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
    if (!Number.isInteger(current) || !Number.isInteger(currentEnd) || (current === gesture.current && currentEnd === gesture.currentEnd)) return;
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

  return (
    <div className="app-page flex flex-col">
      <PageHeader 
        title={
          <button
            onClick={openSelector}
            disabled={readingPlan.enabled}
            className="flex items-center justify-center gap-1.5 w-full active:opacity-70 transition-opacity disabled:active:opacity-100"
          >
            <span className="truncate">
              {showSelector && !readingPlan.enabled
                ? '經文探索'
                : readingPlan.enabled
                ? readingPlan.chapterTitle || '今日閱讀'
                : `${selectedBook?.name || ''} 第 ${selectedChapter} 章`}
            </span>
            {!readingPlan.enabled && !showSelector && <List className="w-4 h-4 text-slate-400" />}
          </button>
        }
        showBack={readingPlan.enabled}
        onBack={onReadingPlanBack}
        rightElement={
          <select 
            value={effectiveVersion} 
            onChange={(e) => readingPlan.enabled
              ? readingPlan.setSelectedVersion(e.target.value)
              : setSelectedVersion(e.target.value)}
            className="bg-transparent text-sm font-bold text-indigo-600 outline-none p-1 appearance-none text-right"
          >
            {readingPlan.enabled && readingPlan.availableVersions.length > 0
              ? readingPlan.availableVersions.map(version => (
                  <option key={version.id} value={version.id}>{version.name}</option>
                ))
              : BIBLE_VERSIONS.map(version => (
                  <option key={version.code} value={version.code}>{version.name}</option>
                ))}
          </select>
        }
      />

      {showSelector && !readingPlan.enabled ? (
        <div className="flex-1 overflow-y-auto p-4 bg-white animate-in fade-in zoom-in-95 duration-200" style={{ scrollbarGutter: 'stable' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[22px] font-black text-slate-900 flex items-center gap-2.5">
              <BookOpen className="h-7 w-7 text-indigo-600" strokeWidth={2.25} />
              選擇書卷與章節
            </h2>
            {selectedBook ? <button onClick={() => setShowSelector(false)} className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-sm font-bold active:bg-slate-200">返回閱讀</button> : null}
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
            onBookToggle={handleBookSelect}
            onChapterSelect={handleChapterSelect}
            variant="mobile"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <div className="relative z-20 border-b border-slate-200 bg-slate-50 px-2.5 py-1">
            <ScriptureAudioDock
              controller={readAloud}
              hasVerses={!effectiveLoading && verses.length > 0}
              verses={verses}
              selection={{ version: effectiveVersion, book: selectedBook.name, chapter: selectedChapter }}
              selectedVerseRange={selectedVerseRange}
              onClearVerseSelection={clearVerseSelection}
              compact
              mobileCompact
            />
          </div>

          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto px-5 pt-3 pb-32"
            onPointerMove={moveSelectionGesture}
            onPointerUp={finishSelectionGesture}
            onPointerCancel={finishSelectionGesture}
            onPointerLeave={event => {
              if (event.pointerType === 'mouse' && selectionGestureRef.current.active) finishSelectionGesture(event);
            }}
          >
            {effectiveLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-sm font-bold tracking-widest">正在載入經文</span>
              </div>
            ) : effectiveError ? (
              <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-rose-100 bg-rose-50 p-4 text-center text-sm font-bold text-rose-700">
                {effectiveError}
              </div>
            ) : verses.length > 0 ? (
              <div className="space-y-1.5 pb-10">
                {verses.map(v => {
                  const verseNumber = Number(v.verseStart ?? v.verse);
                  const coveredVerses = Array.isArray(v.coveredVerses) ? v.coveredVerses : [verseNumber];
                  const isSelected = coveredVerses.every(verse => selectedVerseSet.has(Number(verse)));
                  const isActive = readAloud.activeVerse === verseNumber;
                  return (
                  <button
                    type="button"
                    key={v.verse}
                    onClick={event => handleVerseSelect(v, event)}
                    onPointerDown={event => startSelectionGesture(v, event)}
                    onContextMenu={event => {
                      if (selectionGestureRef.current.active) event.preventDefault();
                    }}
                    className={`flex w-full touch-pan-y select-none items-baseline rounded-xl border px-2 py-1 -mx-2 text-left transition-colors ${isSelected ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200' : isActive ? 'border-indigo-200 bg-indigo-50 shadow-sm' : 'border-transparent active:bg-slate-100'}`}
                    data-primary-verse={verseNumber}
                    data-verse-end={v.verseEnd ?? verseNumber}
                    aria-current={isActive ? 'true' : undefined}
                    aria-pressed={Boolean(isSelected)}
                    aria-label={`第 ${v.verseLabel ?? v.verse} 節，${isSelected ? '已選取，點一下取消' : '未選取，點一下選取'}；長按後拖曳可連續選取`}
                  >
                    {/* 合併節標籤也必須能完整顯示 */}
                    <div className="w-[32px] shrink-0">
                      <span className="text-[12px] font-bold text-slate-400/80 select-none">
                        {v.verseLabel ?? v.verse}
                      </span>
                    </div>
                    {/* 經文內容 */}
                    <div className="flex-1 text-[18px] leading-[1.2] text-slate-800 tracking-[0.03em] font-medium font-serif">
                      {stripScriptureSpeechAnnotations(v.text)}
                    </div>
                  </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-slate-400 mt-20">
                找不到經文資料
              </div>
            )}
          </div>

          {/* Bottom Navigation / reading-plan completion */}
          <div className="absolute bottom-0 inset-x-0 px-4 pb-6 pt-12 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/90 to-transparent pointer-events-none">
            <div className="max-w-sm mx-auto flex items-center justify-between bg-white/95 backdrop-blur-md border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-full p-1.5 pointer-events-auto">
              <button
                onClick={() => readingPlan.enabled
                  ? readingPlan.goPrevious()
                  : setSelectedChapter(prev => prev - 1)}
                disabled={readingPlan.enabled ? readingPlan.isFirstChapter : selectedChapter <= 1}
                className="flex items-center justify-center w-24 py-2.5 text-slate-500 font-bold text-sm rounded-full active:bg-slate-50 disabled:opacity-30 disabled:active:bg-transparent transition-all"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {readingPlan.enabled ? '上一段' : '上一章'}
              </button>
              
              <div
                className={`flex-1 text-center text-sm font-black text-slate-700 tracking-widest ${readingPlan.enabled ? '' : 'cursor-pointer active:opacity-70'}`}
                onClick={openSelector}
              >
                {readingPlan.enabled
                  ? `${readingPlan.chapterIndex + 1} / ${readingPlan.chapterCount}`
                  : `${selectedBook.name} ${selectedChapter} 章`}
                {readingPlan.enabled && readingPlan.timer > 0
                  ? <span className="block text-[10px] tracking-normal text-slate-400">閱讀 {readingPlan.timer} 秒後可繼續</span>
                  : null}
              </div>

              {readingPlan.enabled && readingPlan.isLastChapter ? (
                <button
                  type="button"
                  onClick={readingPlan.complete}
                  disabled={!readingPlan.canAdvance || readingPlan.completing}
                  className="flex min-h-10 w-24 items-center justify-center gap-1 rounded-full bg-emerald-600 px-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {readingPlan.completing
                    ? '儲存中…'
                    : readingPlan.timer > 0
                      ? `${readingPlan.timer} 秒`
                      : <>完成 <Check className="h-4 w-4" /></>}
                </button>
              ) : (
                <button
                  onClick={() => readingPlan.enabled
                    ? readingPlan.goNext()
                    : setSelectedChapter(prev => prev + 1)}
                  disabled={readingPlan.enabled
                    ? !readingPlan.canAdvance
                    : selectedChapter >= selectedBook.chapters}
                  className="flex items-center justify-center w-24 py-2.5 text-slate-500 font-bold text-sm rounded-full active:bg-slate-50 disabled:opacity-30 disabled:active:bg-transparent transition-all"
                >
                  {readingPlan.enabled ? '下一段' : '下一章'}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
