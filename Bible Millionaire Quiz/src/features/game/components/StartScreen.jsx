import React, { useState, useEffect } from 'react';
import LeaderboardModal from './LeaderboardModal';
import WarningModal from '../../../shared/components/WarningModal';
import VolumeControl from './VolumeControl';
import IntroAnimation from './IntroAnimation';
import ScopeSelector from './ScopeSelector';
import BookSelector from './BookSelector';
import SelectedBooksPanel from './SelectedBooksPanel';
import { useBookSelection } from '../hooks/useBookSelection';
import { useCoinSystem } from '../../../hooks/useCoinSystem';
import { useAuth } from '../../../contexts/AuthContext';
import { soundManager } from '../utils/SoundManager';

export default function StartScreen({ 
    onStartGame, 
    skipIntro = false, 
    onBack, 
    gameMode = 'classic',
    bibleVersion = 'CUV_TRAD',
    onVersionChange,
    includeGeography = true,
    onToggleGeography,
    includeEncyclopedia = true,
    onToggleEncyclopedia
}) {
    const [showIntro, setShowIntro] = useState(!skipIntro);

    // Sync showIntro if skipIntro changes
    useEffect(() => {
        if (skipIntro) {
            setShowIntro(false);
        }
    }, [skipIntro]);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Derived Mode States
    const isCasualMode = gameMode === 'casual';
    const isSpeedMode = gameMode === 'speed';
    const isMultiplayerMode = gameMode === 'multiplayer-buzzer';
    const hasQuestionMusic = gameMode === 'classic' || gameMode === 'speed';
    const [questionCount, setQuestionCount] = useState(20);
    const [isInfiniteMode, setIsInfiniteMode] = useState(false); // 💡 無限挑戰模式

    // Coin System & Auth (for balance display)
    const coinSystem = useCoinSystem();
    const { user, isLoggedIn } = useAuth();

    // [SOVEREIGN v3] 使用金幣系統主權餘額
    const coinBalance = coinSystem.coins;
    const aiCredits = user?.ai_credits || 0;

    // Custom Hook for Book Selection Logic
    const {
        selectedScope,
        selectedBooks,
        showBookPanel,
        handleScopeSelect,
        toggleBook,
        selectAllInScope,
        clearAllInScope,
        updateBookChapterRange,
        isBookSelected,
        getSelectedBooksForGame,
        availableBooks,
        allCategories
    } = useBookSelection();

    // Modals
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');

    // Handle Auto Open Help (from Admin return)
    // useEffect(() => {
    //     if (helpInitialTab) {
    //         setShowHelp(true);
    //         if (onHelpOpened) onHelpOpened();
    //     }
    // }, [helpInitialTab, onHelpOpened]);

    const handleStartIntro = () => {
        setIsTransitioning(true);
        if (hasQuestionMusic) soundManager.playBGM('theme');
        setTimeout(() => {
            setShowIntro(false);
        }, 4500);
    };

    // 經典問答與快問快答進入選書流程後才播放背景音樂。
    useEffect(() => {
        if (!showIntro && hasQuestionMusic) {
            soundManager.playBGM('theme');
        } else if (!hasQuestionMusic) {
            soundManager.stopBGM();
        }
    }, [hasQuestionMusic, showIntro]);

    // [MERGED] 直接啟動遊戲，無需二次確認 Modal
    const handleStartGame = () => {
        if ((selectedScope !== 'full') && selectedBooks.length === 0) {
            setWarningMessage('至少要選擇一卷！');
            return;
        }

        try {
            const bookSelections = getSelectedBooksForGame();

            if (bookSelections.length === 0) {
                setWarningMessage('請至少選擇一個範圍或書卷！');
                return;
            }

            // 預載入經文資料 (背景執行，不阻塞 UI)
            // [SOVEREIGN V8.x Fix] 避免無限挑戰/全本聖經模式下觸發 66 個 API 請求癱瘓伺服器導致 524 Timeout
            if (!isInfiniteMode && bookSelections.length <= 3) {
                bookSelections.forEach(selection => {
                    fetch(`/api/quiz/context?book=${encodeURIComponent(selection.book)}&startChapter=${selection.startChapter}&endChapter=${selection.endChapter}`)
                        .then(() => console.log(`[Preload] Cached verses for ${selection.book}`))
                        .catch(err => console.warn('[Preload] Failed:', err.message));
                });
            }

            const extraOptions = {
                isInfiniteMode: gameMode === 'classic' ? isInfiniteMode : false,
                questionCount: isInfiniteMode ? 9999 : (isCasualMode ? questionCount : undefined)
            };
            onStartGame(bookSelections, extraOptions);
        } catch (error) {
            console.error('Start Game Error:', error);
            alert('啟動遊戲時發生錯誤: ' + error.message);
        }
    };

    // Intro Screen
    if (showIntro) {
        return <IntroAnimation
            showIntro={showIntro}
            isTransitioning={isTransitioning}
            onStartIntro={handleStartIntro}
            onBack={onBack}
        />;
    }

    // Dynamic Background based on Mode
    // Classic: Slate-900 (Dark Blue/Grey)
    // Casual: Emerald-900/90 (Dark Greenish)
    // Speed: Purple-950 to Pink-950 gradient
    // Multiplayer: Indigo-900 to Purple-900 to Pink-900 gradient
    const getBgClass = () => {
        const base = "h-full w-full text-slate-900 p-2 md:p-6 flex flex-col items-center overflow-hidden animate-fade-in safe-area-pl safe-area-pr safe-area-pb";
        if (isMultiplayerMode) {
            return `${base} bg-slate-100`;
        }
        if (isSpeedMode) {
            return `${base} bg-slate-100`;
        }
        if (isCasualMode) {
            return `${base} bg-slate-100`;
        }
        return `${base} bg-slate-100`;
    };
    const bgClass = getBgClass();

    // 模式徽章 (標頭旁小標籤)
    const getModeBadge = () => {
        if (isMultiplayerMode) return { emoji: '🎮', text: '連線模式', style: 'bg-blue-500/20 text-blue-300 border border-blue-500/50' };
        if (isSpeedMode) return { emoji: '⚡', text: '快答模式', style: 'bg-purple-500/20 text-purple-300 border border-purple-500/50' };
        if (isCasualMode) return { emoji: '📖', text: '練習模式', style: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' };
        return { emoji: '🏆', text: '經典模式', style: 'bg-amber-500/20 text-amber-300 border border-amber-500/50' };
    };

    return (
        <div className={bgClass}>
            {/* Header - Compact for Landscape */}
            <header className="w-full max-w-[1600px] flex justify-between items-center mb-2 border-b border-slate-200 pb-2 safe-area-pt shrink-0">
                <div className="flex items-center gap-[1vw]">
                    {/* Back Button */}
                    <button
                        onClick={onBack}
                        className="p-[1vw] rounded-xl hover:bg-white text-slate-500 hover:text-indigo-700 transition-colors flex items-center gap-[0.5vw] font-bold border border-transparent hover:border-slate-200"
                        title="返回模式選擇"
                    >
                        <span className="text-[3vmin]">←</span> <span className="hidden md:inline text-[2vmin]">模式選擇</span>
                    </button>

                    <h1 className="text-[5vmin] font-bold whitespace-nowrap overflow-hidden text-ellipsis text-indigo-700">
                        聖經智匯問答
                    </h1>
                    {(() => {
                        const badge = getModeBadge();
                        return (
                            <span className={`hidden md:inline-flex items-center gap-1 text-[1.6vmin] font-bold px-2 py-0.5 rounded-full ${badge.style}`}>
                                {badge.emoji} {badge.text}
                            </span>
                        );
                    })()}
                </div>

                <div className="flex gap-[1vw] items-center">
                    {/* Leaderboard Button */}
                    {gameMode === 'classic' && (
                        <button
                            onClick={() => setShowLeaderboard(true)}
                            className="bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-600 font-bold px-4 py-2 rounded-xl text-[2vmin] transition-colors flex items-center gap-2"
                        >
                            <span>🏆</span>
                            <span className="hidden md:inline">無限挑戰榜</span>
                        </button>
                    )}

                    {/* Balance Display (classic/speed mode only, not casual or multiplayer) */}
                    {!isCasualMode && !isMultiplayerMode && (
                        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                            {/* Coins */}
                            <div className="flex items-center gap-2" title="金幣餘額">
                                <span className="text-[3vmin]">💰</span>
                                <span className="text-yellow-400 font-bold text-[2.5vmin]">{coinBalance}</span>
                                {!isLoggedIn && coinBalance > 0 && (
                                    <span className="text-yellow-500/60 text-[2vmin]" title="未保存">⚠️</span>
                                )}
                            </div>
                            
                            {/* AI Credits */}
                            <div className="w-[1px] h-4 bg-slate-200"></div>
                            <div className="flex items-center gap-2" title="智匯點數">
                                <span className="text-[3vmin]">✨</span>
                                <span className="text-cyan-400 font-bold text-[2.5vmin]">{aiCredits}</span>
                            </div>
                        </div>
                    )}
                    {hasQuestionMusic ? <VolumeControl /> : null}
                </div>
            </header>

            {/* Main Content Area - Split Columns */}
            <main className="w-full max-w-[1600px] flex-1 flex items-stretch justify-center overflow-hidden gap-3">
                <div className="flex flex-row items-stretch w-full justify-center transition-all duration-500 overflow-hidden">

                    {/* 1. Left Column: Scope Selection */}
                    <ScopeSelector
                        selectedScope={selectedScope}
                        onSelectScope={handleScopeSelect}
                        allCategories={allCategories}
                        isInfiniteMode={isInfiniteMode}
                        setIsInfiniteMode={setIsInfiniteMode}
                        gameMode={gameMode}
                    />

                    {/* 2. Middle Column: Sliding Book Panel */}
                    <BookSelector
                        showBookPanel={showBookPanel}
                        selectedScope={selectedScope}
                        availableBooks={availableBooks}
                        isBookSelected={isBookSelected}
                        onToggleBook={toggleBook}
                        onSelectAll={selectAllInScope}
                        onClearAll={clearAllInScope}
                        allCategories={allCategories}
                        onSelectScope={handleScopeSelect}
                        selectedBooks={selectedBooks}
                        gameMode={gameMode}
                        isInfiniteMode={isInfiniteMode}
                        setIsInfiniteMode={setIsInfiniteMode}
                    />

                    {/* 3. Right Column: Selected Books & Start Button */}
                    <SelectedBooksPanel
                        selectedScope={selectedScope}
                        selectedBooks={selectedBooks}
                        onToggleBook={toggleBook}
                        onUpdateChapterRange={updateBookChapterRange}
                        onStartGame={handleStartGame}
                        gameMode={gameMode}
                        isCasualMode={isCasualMode}
                        questionCount={questionCount}
                        onQuestionCountChange={setQuestionCount}
                        bibleVersion={bibleVersion}
                        onVersionChange={onVersionChange}
                        includeGeography={includeGeography}
                        onToggleGeography={onToggleGeography}
                        includeEncyclopedia={includeEncyclopedia}
                        onToggleEncyclopedia={onToggleEncyclopedia}
                    />
                </div>
            </main>

            {/* Modals */}
            {showLeaderboard && (
                <LeaderboardModal 
                    onClose={() => setShowLeaderboard(false)} 
                    mode={isInfiniteMode ? "infinite" : "classic"}
                />
            )}
            {warningMessage && <WarningModal message={warningMessage} onClose={() => setWarningMessage('')} />}
            <div className="fixed bottom-2 right-3 text-slate-400 text-[10px] select-none pointer-events-none">v5.1.0</div>
        </div>
    );
}
