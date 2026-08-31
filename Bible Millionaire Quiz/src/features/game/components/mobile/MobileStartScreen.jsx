import React, { useState, useEffect } from 'react';
import LeaderboardModal from '../LeaderboardModal';
import HelpModal from '../HelpModal';
import WarningModal from '../../../../shared/components/WarningModal';
import IntroAnimation from '../IntroAnimation';
import MobileBookSelector from './MobileBookSelector';
import { useBookSelection } from '../../hooks/useBookSelection';
import { soundManager } from '../../utils/SoundManager';
import { BIBLE_BOOKS } from '../../data/constants';
import { useAuth } from '../../../../contexts/AuthContext';
import { useCoinSystem } from '../../../../hooks/useCoinSystem';

export default function MobileStartScreen({ 
    onStartGame, 
    onAdminLogin, 
    skipIntro = false, 
    helpInitialTab = null, 
    onHelpOpened, 
    onBack, 
    gameMode = 'classic',
    bibleVersion = 'CUV_TRAD',
    onVersionChange,
    includeGeography = true,
    onToggleGeography,
    includeEncyclopedia = true,
    onToggleEncyclopedia,
    semanticTag = 'main'
}) {
    const [showIntro, setShowIntro] = useState(!skipIntro);
    const { isLoggedIn } = useAuth();
    const coinSystem = useCoinSystem();

    const coinBalance = isLoggedIn ? (coinSystem.coins || 0) : 0;

    useEffect(() => {
        if (skipIntro) setShowIntro(false);
    }, [skipIntro]);

    const [isTransitioning, setIsTransitioning] = useState(false);
    const [currentStep, setCurrentStep] = useState('books'); // 'books', 'confirm'

    const isCasualMode = gameMode === 'casual';
    const [questionCount, setQuestionCount] = useState(20);
    const [isInfiniteMode, setIsInfiniteMode] = useState(false);

    const {
        selectedScope,
        selectedBooks,
        toggleBook,
        selectAllInScope,
        clearAllInScope,
        isBookSelected,
        getSelectedBooksForGame,
        availableBooks
    } = useBookSelection();

    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');
    const hasQuestionMusic = gameMode === 'classic' || gameMode === 'speed';
    const [muted, setMuted] = useState(() => soundManager.isMuted());
    const toggleMute = () => {
        if (muted) { soundManager.unmute(); } else { soundManager.mute(); }
        setMuted(m => !m);
    };

    // [BugFix] 手機版選書頁面不使用 scope 機制，就用預設的 'full'，讓 availableBooks 含全部 66 卷。
    // 不重設 scope，避免出現「自訂」標簽。

    useEffect(() => {
        if (helpInitialTab) {
            setShowHelp(true);
            if (onHelpOpened) onHelpOpened();
        }
    }, [helpInitialTab, onHelpOpened]);

    const handleStartIntro = () => {
        setIsTransitioning(true);
        if (hasQuestionMusic) soundManager.playBGM('theme');
        setTimeout(() => setShowIntro(false), 4500);
    };

    useEffect(() => {
        if (!showIntro && hasQuestionMusic) {
            soundManager.playBGM('theme');
        } else if (!hasQuestionMusic) {
            soundManager.stopBGM();
        }
    }, [hasQuestionMusic, showIntro]);

    const handleProceedToConfirm = () => {
        if (selectedBooks.length === 0) {
            setWarningMessage('請至少選擇一卷書。');
            return;
        }
        setCurrentStep('confirm');
    };


    // 判斷無限挑戰是否可用
    const isInfiniteAllowed = (() => {
        if (gameMode !== 'classic') return false;
        const count = selectedBooks.length;
        if (count === 0) return true;
        
        const allOldTestament = []; const allNewTestament = [];
        Object.values(BIBLE_BOOKS['舊約']).forEach(books => allOldTestament.push(...books));
        Object.values(BIBLE_BOOKS['新約']).forEach(books => allNewTestament.push(...books));
        
        const selectedBookNames = selectedBooks.map(s => s.book);
        
        if (count === 66 && [...allOldTestament, ...allNewTestament].every(book => selectedBookNames.includes(book))) return true;
        if (count === 39 && allOldTestament.every(book => selectedBookNames.includes(book))) return true;
        if (count === 27 && allNewTestament.every(book => selectedBookNames.includes(book))) return true;
        
        return false;
    })();

    // 當無限模式不可用時強制關閉
    useEffect(() => {
        if (!isInfiniteAllowed && isInfiniteMode) {
            setIsInfiniteMode(false);
        }
    }, [isInfiniteAllowed, isInfiniteMode]);

    const handleConfirmStart = () => {
        const bookSelections = getSelectedBooksForGame();
        if (bookSelections.length === 0) {
            setWarningMessage('請至少選擇一個範圍。');
            return;
        }
        const extraOptions = {
            isInfiniteMode: gameMode === 'classic' ? isInfiniteMode : false,
            questionCount: isInfiniteMode ? 9999 : (isCasualMode ? questionCount : undefined)
        };
        onStartGame(bookSelections, extraOptions);
    };

    if (showIntro) {
        return <IntroAnimation showIntro={showIntro} isTransitioning={isTransitioning} onStartIntro={handleStartIntro} onBack={onBack} />;
    }

    const isSpeedMode = gameMode === 'speed';
    const ContentRoot = semanticTag;

    const getBgClass = () => {
        if (isSpeedMode) return 'h-[100dvh] w-full bg-gradient-to-br from-purple-950 via-slate-900 to-pink-950 text-white flex animate-fade-in overflow-hidden';
        if (isCasualMode) return 'h-[100dvh] w-full bg-gradient-to-br from-slate-900 to-emerald-950 text-white flex animate-fade-in overflow-hidden';
        return 'h-[100dvh] w-full bg-slate-900 text-white flex animate-fade-in overflow-hidden';
    };

    const getModeDisplayName = () => {
        if (isSpeedMode) return '快問快答';
        if (isCasualMode) return '練習模式';
        return '經典挑戰';
    };

    const getTitleColor = () => {
        if (isSpeedMode) return 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400';
        return 'text-yellow-500';
    };

    return (
        <div className={getBgClass()}>
            <ContentRoot className="relative flex flex-1 flex-col overflow-hidden safe-area-pl safe-area-pr safe-area-pb sm:flex-row">
                <header className="shrink-0 border-b border-slate-700/60 bg-slate-900/95 px-3 pb-2 pt-3 sm:hidden">
                    <div className="flex items-center gap-2">
                        <button onClick={onBack} className="min-h-10 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200">🏠 首頁</button>
                        <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">遊戲模式</span>
                            <strong className={`block truncate text-sm ${getTitleColor()}`}>{getModeDisplayName()}</strong>
                        </div>
                        {!isCasualMode ? <span className="shrink-0 text-xs font-black text-amber-400">💰 {coinBalance}</span> : null}
                        {hasQuestionMusic ? <button onClick={toggleMute} className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${muted ? 'border-slate-700 bg-slate-800 text-slate-500' : 'border-amber-500/60 bg-amber-500/10 text-amber-200'}`}>{muted ? '🔇' : '🔊'}</button> : null}
                    </div>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                        <select value={bibleVersion} onChange={event => onVersionChange(event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 outline-none">
                            <option value="CUV_TRAD">和合本</option>
                            <option value="CNV_TRAD">新譯本</option>
                            <option value="TCV2010_TRAD">現代中文</option>
                        </select>
                        <button onClick={onToggleGeography} className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${includeGeography ? 'border-blue-500 bg-blue-600/20 text-blue-200' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>📍地理</button>
                        <button onClick={onToggleEncyclopedia} className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${includeEncyclopedia ? 'border-purple-500 bg-purple-600/20 text-purple-200' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>📖百科</button>
                    </div>
                </header>

                {/* Left Section: Book Selection (70%) */}
                <section className="flex flex-1 flex-col overflow-hidden p-3 pb-16 sm:flex-[0.7] sm:p-4 lg:p-8">
                    <MobileBookSelector
                        selectedScope={selectedScope}
                        availableBooks={availableBooks}
                        isBookSelected={isBookSelected}
                        selectedBooks={selectedBooks}
                        onToggleBook={toggleBook}
                        onSelectAll={selectAllInScope}
                        onClearAll={clearAllInScope}
                        onProceed={handleProceedToConfirm}
                        isCasualMode={isCasualMode}
                        questionCount={questionCount}
                        onQuestionCountChange={setQuestionCount}
                        bibleVersion={bibleVersion}
                        onVersionChange={onVersionChange}
                        includeGeography={includeGeography}
                        onToggleGeography={onToggleGeography}
                        includeEncyclopedia={includeEncyclopedia}
                        onToggleEncyclopedia={onToggleEncyclopedia}
                        gameMode={gameMode}
                        variant="landscape-left"
                    />
                </section>

                <aside className="hidden flex-[0.3] bg-slate-800/60 border-l border-slate-700/50 flex-col overflow-hidden backdrop-blur-md sm:flex">
                    <div className="flex flex-col p-2 gap-2 h-full">
                        {/* 頂列：🏠 + 🔊（同地理百科樣式） */}
                        <div className="flex gap-1 shrink-0">
                            <button onClick={onBack} className="flex-1 min-h-11 py-0.5 rounded text-[10px] font-bold border transition-all bg-slate-700/30 border-slate-600 text-slate-300">
                                🏠首頁
                            </button>
                            {hasQuestionMusic ? (
                                <button onClick={toggleMute} className={`flex-1 min-h-11 py-0.5 rounded text-[10px] font-bold border transition-all ${muted ? 'bg-slate-700/30 border-slate-600 text-slate-500' : 'bg-amber-500/20 border-amber-500 text-amber-200'}`}>
                                    {muted ? '🔇靜音' : '🔊音效'}
                                </button>
                            ) : null}
                        </div>

                        {/* 模式（左）＆ 餘額（右） */}
                        <div className="flex gap-1 shrink-0">
                            <div className="flex-1 py-0.5 px-1 rounded border bg-blue-600/20 border-blue-500 flex flex-col justify-center">
                                <span className="text-[8px] font-black uppercase text-blue-400/70">模式</span>
                                <div className={`text-[10px] font-black leading-tight ${getTitleColor()}`}>{getModeDisplayName()}</div>
                            </div>
                            {!isCasualMode && (
                                <div className="flex-1 py-0.5 px-1 rounded border bg-blue-600/20 border-blue-500 flex flex-col justify-center">
                                    <span className="text-[8px] font-black text-blue-400/70">餘額</span>
                                    <span className="text-[10px] font-black text-amber-400">💰{coinBalance}</span>
                                </div>
                            )}
                        </div>

                        {/* 譯本 + 出題來源（合併一區） */}
                        <div className="shrink-0 flex flex-col gap-1">
                            <div className="grid grid-cols-2 gap-1">
                                {[['CUV_TRAD', '和'], ['CNV_TRAD', '新'], ['TCV2010_TRAD', '現']].map(([v, label]) => (
                                    <button
                                        key={v}
                                        onClick={() => onVersionChange(v)}
                                        className={`flex-1 min-h-11 py-0.5 rounded text-[10px] font-bold transition-all ${bibleVersion === v ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={onToggleGeography}
                                    className={`flex-1 min-h-11 py-0.5 rounded text-[10px] font-bold border transition-all ${includeGeography ? 'bg-blue-600/30 border-blue-500 text-blue-200' : 'bg-slate-700/30 border-slate-600 text-slate-500'}`}
                                >
                                    📍地理
                                </button>
                                <button
                                    onClick={onToggleEncyclopedia}
                                    className={`flex-1 min-h-11 py-0.5 rounded text-[10px] font-bold border transition-all ${includeEncyclopedia ? 'bg-purple-600/30 border-purple-500 text-purple-200' : 'bg-slate-700/30 border-slate-600 text-slate-500'}`}
                                >
                                    📖百科
                                </button>
                            </div>
                        </div>

                        {/* 已選卷數（撐滿中間空間，顯示書卷名稱） */}
                        <div className="flex-1 flex flex-col rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden min-h-0">
                            <span className="text-[8px] uppercase text-slate-500 font-black text-center py-1 shrink-0 border-b border-slate-700/30">
                                已選 {selectedBooks.length} 卷
                            </span>
                            <div className="flex-1 overflow-y-auto p-1 flex flex-wrap gap-1 content-start custom-scrollbar">
                                {selectedBooks.length === 0
                                    ? <span className="text-[9px] text-slate-600 w-full text-center mt-2">尚未選擇</span>
                                    : selectedBooks.map((s, i) => (
                                        <span key={i} className="text-[9px] bg-yellow-600/20 border border-yellow-500/50 text-yellow-400 px-1 py-0.5 rounded leading-none whitespace-nowrap">
                                            {s.book}
                                        </span>
                                    ))
                                }
                            </div>
                        </div>

                        {/* 選完後由下方確認框開始遊戲 */}
                        {currentStep === 'books' ? <div className="shrink-0">
                            <button
                                onClick={handleProceedToConfirm}
                                disabled={selectedBooks.length === 0}
                                className={`w-full min-h-11 py-2 rounded-lg text-xs font-black shadow-xl ${selectedBooks.length === 0 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white animate-pulse'}`}
                            >
                                檢查選擇 ➜
                            </button>
                        </div> : null}
                    </div>
                </aside>

                {currentStep === 'books' ? (
                    <div className="absolute inset-x-0 bottom-0 z-20 flex min-h-14 items-center gap-3 border-t border-slate-700 bg-slate-900/95 px-3 py-2 shadow-[0_-8px_24px_rgba(2,6,23,.3)] backdrop-blur sm:hidden">
                        <div className="min-w-0 flex-1">
                            <strong className="block text-xs text-slate-200">已選 {selectedBooks.length} 卷</strong>
                            <span className="block truncate text-[10px] text-slate-500">{selectedBooks.length ? selectedBooks.map(item => item.book).join('、') : '請點選要出題的經卷'}</span>
                        </div>
                        <button type="button" onClick={handleProceedToConfirm} disabled={!selectedBooks.length} className="min-h-10 shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:bg-slate-700 disabled:text-slate-500">檢查選擇 ➜</button>
                    </div>
                ) : null}

                {currentStep === 'confirm' ? (
                    <section className="absolute inset-x-0 bottom-0 z-30 animate-slide-up rounded-t-3xl border border-slate-600 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md sm:inset-x-2 sm:bottom-2 sm:rounded-2xl sm:p-3" aria-label="確認遊戲經卷選擇">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <strong className="text-sm text-yellow-400">確認出題經卷</strong>
                                    <span className="text-xs font-bold text-slate-400">已選 {selectedBooks.length} 卷</span>
                                </div>
                                <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto custom-scrollbar sm:max-h-14">
                                    {selectedBooks.map(selection => <span key={selection.book} className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-1 text-[10px] font-bold text-yellow-200">{selection.book}</span>)}
                                </div>
                            </div>

                            {gameMode === 'classic' ? (
                                <button
                                    type="button"
                                    onClick={() => isInfiniteAllowed && setIsInfiniteMode(!isInfiniteMode)}
                                    disabled={!isInfiniteAllowed}
                                    className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-black ${!isInfiniteAllowed ? 'border-slate-700 bg-slate-800 text-slate-600' : isInfiniteMode ? 'border-green-500 bg-green-600 text-white' : 'border-slate-600 bg-slate-800 text-slate-300'}`}
                                >
                                    ∞ {isInfiniteMode ? '無限開啟' : '無限模式'}
                                </button>
                            ) : null}

                            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                                <button type="button" onClick={() => setCurrentStep('books')} className="min-h-11 rounded-xl border border-slate-600 px-3 text-xs font-bold text-slate-300">繼續選擇</button>
                                <button type="button" onClick={handleConfirmStart} className="min-h-11 rounded-xl bg-green-600 px-5 text-sm font-black text-white shadow-lg">🎮 確認開始</button>
                            </div>
                        </div>
                    </section>
                ) : null}
            </ContentRoot>

            {showLeaderboard && <LeaderboardModal mode={isInfiniteMode ? 'infinite' : 'classic'} onClose={() => setShowLeaderboard(false)} />}
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} onAdminLogin={onAdminLogin} initialTab={helpInitialTab || 'instructions'} />}
            {warningMessage && <WarningModal message={warningMessage} onClose={() => setWarningMessage('')} />}
        </div>
    );
}
