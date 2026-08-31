import React from 'react';
import LifelineModal from './LifelineModal';
import ReportModal from './ReportModal';
import LoadingScreen from './LoadingScreen';
import CountdownScreen from './CountdownScreen';
import VictoryScreen from './VictoryScreen';
import QuestionDisplay from './QuestionDisplay';
import AnswerOptions from './AnswerOptions';
import LifelinesPanel from './LifelinesPanel';
import GameControls from './GameControls';
import CoinDisplay from './CoinDisplay';
import SpeedModeTimer from './SpeedModeTimer';
import VolumeControl from './VolumeControl';
import ExitConfirmationModal from './shared/ExitConfirmationModal';
import { PRIZE_LEVELS } from '../data/constants';
import { database } from '../services/database/DatabaseAdapter';

import { useAuth } from '../../../contexts/AuthContext';

export default function GameScreen(props) {
    // Destructure everything from props
    const {
        // Lifelines
        lifelineStatus,
        hiddenOptions,
        fiftyFiftyAnimating,
        focusedOptionIndex,
        activeModal,
        handleFiftyFifty,
        handleAskAudience,
        openPhoneFriend,
        selectExpert,
        closeModal,

        // Game Logic
        currentLevel,
        currentQuestion,
        selectedOption,

        gameState,
        isCorrect,
        showOptions,
        loadingMessage,
        loadingProgress,
        loadError,
        countdown,
        displayedQuestion,
        isReading,
        skipReading,
        selectOption,
        confirmAnswer,
        handleSpeedAnswer,
        proceedNext,
        handleVictory,
        fadeOut,
        restartGame,

        // Parent Props
        onExit,
        onLoadErrorExit = onExit,
        options = {},

        // Coin System
        coinSystem,
        isClassicMode,
        isLoggedIn,

        // Speed Mode
        isSpeedMode,
        streakCount,
        extraTimeBonus,
        timeLimit,
        handleQuestionTimeout,

        // Bonus for animations
        lastAnimationAmt,
        lastSpentAmt,
        lastSpentId
    } = props;

    // Debug: Check isSpeedMode value
    // console.log('GameScreen isSpeedMode:', isSpeedMode, 'options.gameMode:', options?.gameMode);

    // Centralized Modals from Props
    const {
        showExitConfirm,
        showReportModal,
        onWalkAwayRequest,
        confirmWalkAway,
        cancelWalkAway,
        onReportRequest,
        closeReportModal
    } = props;

    const { user } = useAuth(); // Get user for expert personalization

    // Handle Answer Confirmation with Sound
    const handleConfirmClick = async (overrideIndex = null) => {
        // Audio is handled in useGameLogic now to prevent double sounds
        await confirmAnswer(overrideIndex);
    };

    // Handle Victory Replay
    const handleVictoryReplay = () => {
        restartGame();
    };

    // Helper: Get streak bonus percentage for display
    const getStreakBonusPercent = (streak) => {
        if (streak >= 15) return '20%';
        if (streak >= 10) return '15%';
        if (streak >= 5) return '10%';
        return null;
    };

    // RENDER: Countdown Screen
    if (countdown !== null) {
        return <CountdownScreen countdown={countdown} />;
    }

    // RENDER: Loading Screen
    if (gameState === 'loading') {
        return <LoadingScreen message={loadingMessage} progress={loadingProgress} fadeOut={fadeOut} />;
    }

    // RENDER: Victory Screen
    if (gameState === 'victory') {
        return <VictoryScreen onVictory={handleVictory} onRestart={handleVictoryReplay} />;
    }

    // RENDER: Fallback for missing question
    if (!currentQuestion) {
        if (gameState === 'loading') {
            return <div className="flex items-center justify-center h-screen text-2xl text-slate-900">載入題目中...</div>;
        }

        const inventoryUnavailable = [
            'INSUFFICIENT_PLAYABLE_INVENTORY',
            'INSUFFICIENT_DIFFICULTY_INVENTORY'
        ].includes(loadError?.code);

        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-100 text-slate-900 gap-4">
                <div className="text-6xl mb-4">{inventoryUnavailable ? '📚' : '😵'}</div>
                <p className="text-2xl text-rose-600">
                    {inventoryUnavailable ? '此範圍題庫尚未準備完成' : '無法載入題目'}
                </p>
                <p className="text-slate-500">
                    {loadError?.message || '可能是網路連線問題或服務暫時無法使用'}
                </p>
                <button
                    onClick={restartGame}
                    className="mt-4 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
                >
                    {inventoryUnavailable ? '重新檢查題庫' : '重新嘗試'}
                </button>
                <button
                    onClick={onLoadErrorExit}
                    className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-colors"
                >
                    返回選單
                </button>
            </div>
        );
    }

    // RENDER: Main Game Screen
    return (
        <div className={`flex flex-col min-h-screen overflow-y-auto relative ${isSpeedMode ? 'bg-gradient-to-br from-slate-100 via-indigo-100 to-orange-100' : 'bg-slate-100'}`}>

            {/* Speed Mode Timer */}
            {isSpeedMode && (
                <SpeedModeTimer
                    key={currentQuestion?.id || 'timer'}
                    isActive={gameState === 'playing'}
                    timeLimit={timeLimit}
                    extraTimeBonus={extraTimeBonus}
                    onTimeout={handleQuestionTimeout}
                    onBuyTime={() => coinSystem?.redeemLifeline('addTime')}
                    canAffordTime={coinSystem?.canAfford?.('addTime')}
                    timeCost={coinSystem?.LIFELINE_COSTS?.addTime || 10}
                    streakCount={streakCount}
                    gameState={gameState}
                    isPaused={!!activeModal || showReportModal || showExitConfirm || isReading || fiftyFiftyAnimating || coinSystem?.isLoading}
                />
            )}

            {/* Top Bar */}
            <div className={`bg-white/95 border-slate-200 border-b py-6 px-8 flex justify-center items-center gap-16 shadow-sm`}>
                {/* Speed Mode Title Badge */}
                {isSpeedMode && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full">
                        <span className="text-white font-bold text-lg">⚡ 快問快答</span>
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <span className={`text-xl tracking-widest ${isSpeedMode ? 'text-violet-600' : 'text-slate-500'}`}>
                        {options.gameMode === 'casual' ? '剩餘' : isSpeedMode ? '第' : 'LEVEL'}
                    </span>
                    <span className={`text-6xl font-bold ${isSpeedMode ? 'text-pink-400' : 'text-orange-500'}`}>
                        {options.gameMode === 'casual' ? (options.questionCount - currentLevel) : (currentLevel + 1)}
                    </span>
                    <span className={`text-2xl ${isSpeedMode ? 'text-violet-600' : 'text-slate-500'}`}>
                        {isSpeedMode ? '題' : (options.isInfiniteMode ? '/∞' : `/${options.gameMode === 'casual' ? options.questionCount : 15}`)}
                    </span>
                </div>
                {/* Desktop Coin Display */}
                <div className="flex items-center gap-8">
                    <div className="flex flex-col items-center">
                        <span className="text-lg text-amber-500/80 font-bold mb-1">智匯金幣</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-amber-400 drop-shadow-md">
                                💰 {coinSystem?.coins || 0}
                            </span>
                            {options.gameMode !== 'casual' && (
                                <span className="text-lg font-bold text-emerald-400">
                                    (+{coinSystem?.coinsEarnedThisGame || 0})
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Desktop Points Display */}
                    <div className="h-10 w-px bg-slate-100"></div>
                    <div className="flex flex-col items-center">
                        <span className="text-lg text-cyan-500/80 font-bold mb-1">智匯點數</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-sky-600 drop-shadow-md">
                                ✨ {user?.ai_credits || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Classic Mode: Category Bonus */}
                {options.gameMode !== 'casual' && !isSpeedMode && coinSystem?.hasBonus && currentLevel >= 4 && (
                    <>
                        <div className="h-12 w-px bg-slate-100"></div>
                        <div className="flex items-center gap-2 text-2xl text-yellow-300 animate-pulse">
                            🌟 {currentLevel >= 10 ? '+15%' : '+10%'} 加成
                        </div>
                    </>
                )}

                {/* Speed Mode: Show Streak with End-Game Bonus Preview */}
                {options.gameMode !== 'casual' && isSpeedMode && streakCount >= 2 && (
                    <>
                        <div className="h-12 w-px bg-slate-100"></div>
                        <div className="flex items-center gap-2 text-2xl text-pink-400 animate-pulse">
                            🔥 {streakCount}連勝
                            {getStreakBonusPercent(streakCount) && (
                                <span className="text-orange-500 text-xl">
                                    (+{getStreakBonusPercent(streakCount)}%)
                                </span>
                            )}
                        </div>
                    </>
                )}
                
                <div className="h-12 w-px bg-slate-100"></div>
                {(options.gameMode === 'classic' || isSpeedMode) ? <VolumeControl /> : null}
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 flex justify-center ${isSpeedMode ? 'p-4' : 'p-8'}`}>
                <div className={`${isSpeedMode ? 'max-w-6xl' : 'max-w-7xl'} w-full grid grid-cols-12 gap-8 my-auto`}>

                    {/* Left Column: Question & Answers */}
                    <div className={`col-span-12 ${options.gameMode === 'casual' ? 'lg:col-span-12 max-w-5xl mx-auto w-full' : 'lg:col-span-9'} flex flex-col gap-8`}>
                        <QuestionDisplay
                            displayedQuestion={displayedQuestion}
                            currentQuestion={currentQuestion}
                            isReading={isReading}
                            onSkip={skipReading}
                            isSpeedMode={isSpeedMode}
                        />

                        <AnswerOptions
                            currentQuestion={currentQuestion}
                            hiddenOptions={hiddenOptions}
                            fiftyFiftyAnimating={fiftyFiftyAnimating || coinSystem?.isLoading}
                            focusedOptionIndex={focusedOptionIndex}
                            selectedOption={selectedOption}
                            gameState={gameState}
                            showOptions={showOptions}
                            lastAnimationAmt={lastAnimationAmt} // Corrected name
                            onSelectOption={(index) => {
                                if (isSpeedMode) {
                                    handleSpeedAnswer(index);
                                } else {
                                    selectOption(index);
                                }
                            }}
                        />
                    </div>

                    {/* Right Column: Lifelines */}
                    {options.gameMode !== 'casual' && (
                        <div className="col-span-12 lg:col-span-3 flex justify-center lg:justify-start">
                            <LifelinesPanel
                                lifelineStatus={lifelineStatus}
                                onFiftyFifty={(bypass) => handleFiftyFifty(currentQuestion, bypass)}
                                onPhoneFriend={openPhoneFriend}
                                onAskAudience={(bypass) => handleAskAudience(currentQuestion, currentLevel, bypass)}
                                onWalkAway={onWalkAwayRequest}
                                disabled={gameState !== 'playing' || isReading}
                                coinSystem={coinSystem}
                                isClassicMode={isClassicMode}
                                isSpeedMode={isSpeedMode}
                                isLoggedIn={isLoggedIn}
                                lastSpentAmt={lastSpentAmt} // For animation
                                lastSpentId={lastSpentId}   // For animation
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Bar: Action Buttons */}
            <div className="pb-8 flex justify-center">
                <GameControls
                    variant="desktop"
                    gameState={gameState}
                    selectedOption={selectedOption}
                    isCorrect={isCorrect}
                    onConfirm={handleConfirmClick}
                    onNext={proceedNext}
                    onReplay={restartGame}
                    onExit={onExit}
                    onReport={onReportRequest}
                    gameMode={options.gameMode}
                    isSpeedMode={isSpeedMode}
                />
            </div>

            {/* Modals */}
            {activeModal && (
                <LifelineModal
                    type={activeModal.type}
                    data={activeModal.data}
                    onClose={closeModal}
                    onExpertSelect={(expert) => selectExpert(expert, currentQuestion)}
                />
            )}

            {showExitConfirm && (
                <ExitConfirmationModal
                    onConfirm={confirmWalkAway}
                    onCancel={cancelWalkAway}
                    currentPrize={coinSystem?.coinsEarnedThisGame || 0}
                />
            )}

            {showReportModal && (
                <ReportModal
                    question={currentQuestion}
                    onClose={closeReportModal}
                    onSubmit={async (reportData) => {
                        try {
                            await database.add('reports', reportData);
                            closeReportModal();
                            alert("感謝您的回報！我們會盡快處理。");
                        } catch (error) {
                            console.error("Error saving report:", error);
                            alert("回報發送失敗，請稍後再試。");
                        }
                    }}
                />
            )}

            {/* Debug Button */}
            <div className="absolute bottom-4 right-4 opacity-50 hover:opacity-100 transition-opacity">
                <button
                    onClick={onReportRequest}
                    className="text-xs text-slate-600 hover:text-slate-500 bg-white/90 px-2 py-1 rounded"
                >
                    顯示隱藏的提示
                </button>
            </div>
        </div>
    );
}
