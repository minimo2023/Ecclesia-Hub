import React from 'react';
import MobileQuestionDisplay from './MobileQuestionDisplay';
import MobileAnswerOptions from './MobileAnswerOptions';
import MobileLifelinesPanel from './MobileLifelinesPanel';
import LoadingScreen from '../LoadingScreen';
import CountdownScreen from '../CountdownScreen';
import VictoryScreen from '../VictoryScreen';
import GameControls from '../GameControls';
import ReportModal from '../ReportModal';
import ExitConfirmationModal from '../shared/ExitConfirmationModal';
import LifelineModal from '../LifelineModal';
import SpeedModeTimer from '../SpeedModeTimer';
import { PRIZE_LEVELS } from '../../data/constants';
import { database } from '../../services/database/DatabaseAdapter';
import { useAuth } from '../../../../contexts/AuthContext';

export default function MobileGameScreen(props) {
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
        handleSpeedAnswer, // New prop
        proceedNext,
        handleVictory,
        fadeOut,
        restartGame,

        // Parent Props
        options,
        onExit,
        onLoadErrorExit = onExit,

        // Coin System & Speed Mode
        coinSystem,
        isSpeedMode,
        streakCount,
        extraTimeBonus,
        timeLimit,
        handleQuestionTimeout,
        lastAnimationAmt
    } = props;

    // Get current user for expert greeting and ai_credits display
    const { user } = useAuth();

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

    // Handle Answer Confirmation with Sound
    const handleConfirmClick = async (overrideIndex = null) => {
        await confirmAnswer(overrideIndex);
    };

    // Handle Victory Replay
    const handleVictoryReplay = () => {
        restartGame();
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
            return <div className="flex items-center justify-center h-[100dvh] text-2xl text-white">載入題目中...</div>;
        }

        const inventoryUnavailable = [
            'INSUFFICIENT_PLAYABLE_INVENTORY',
            'INSUFFICIENT_DIFFICULTY_INVENTORY'
        ].includes(loadError?.code);

        return (
            <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-900 text-white gap-4 p-6 text-center">
                <div className="text-6xl mb-2">{inventoryUnavailable ? '📚' : '😵'}</div>
                <p className="text-xl text-red-400 font-bold">
                    {inventoryUnavailable ? '此範圍題庫尚未準備完成' : '無法載入題目'}
                </p>
                <p className="text-sm text-slate-400 mb-4">
                    {loadError?.message || '可能該書卷沒有足夠的題目，或系統連線異常'}
                </p>
                <button
                    onClick={restartGame}
                    className="w-full max-w-[200px] py-3 bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors font-bold"
                >
                    {inventoryUnavailable ? '重新檢查題庫' : '重新嘗試'}
                </button>
                <button
                    onClick={onLoadErrorExit}
                    className="w-full max-w-[200px] py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors font-bold"
                >
                    返回選單
                </button>
            </div>
        );
    }


    // RENDER: Main Game Screen
    // Theme switching for Speed Mode (Mobile Light Rose Theme)
    const bgClass = isSpeedMode 
        ? "bg-[#FFF5F7] text-[#4A3B32]" 
        : "bg-[#FDF8EE] text-[#4A3B32]";
        
    return (
        <div className={`flex-1 flex flex-col min-h-0 w-full overflow-hidden relative ${bgClass}`}>
            {/* Top Bar - Safe Area */}
            <div className="h-2 safe-area-pt z-20"></div>

            {/* Header: Placeholder, Title, Assets, Sound */}
            <header className="flex items-center justify-between px-3 py-2 shrink-0">
                {/* 隱藏左上角返回，保留一個佔位符保持版面平衡 */}
                <div className="w-10 h-10 shrink-0"></div>
                
                <h1 className={`text-[16px] sm:text-[18px] font-bold tracking-widest truncate mx-2 ${isSpeedMode ? 'text-rose-800' : 'text-[#6B4E31]'}`}>
                    {isSpeedMode ? '快問快答' : '聖經問答'}
                </h1>

                <div className="flex items-center shrink-0">
                    {/* Unified Assets Pill (Mobile Light Style) */}
                    <div className={`flex items-center px-2.5 py-1 rounded-xl border ${isSpeedMode ? 'bg-rose-50 border-rose-200' : 'bg-[#EFE5D0] border-[#D9CDB8]'}`}>
                        {/* Coins */}
                        <div className="flex items-center gap-1">
                            <span className="text-[14px]">💰</span>
                            <span className={`font-bold text-[13px] ${isSpeedMode ? 'text-rose-700' : 'text-[#8B6B4A]'}`}>{coinSystem?.coins || 0}</span>
                        </div>
                        
                        {/* Separator */}
                        <div className={`w-[1px] h-3.5 mx-2 ${isSpeedMode ? 'bg-rose-200' : 'bg-[#D9CDB8]'}`}></div>
                        
                        {/* AI Credits */}
                        <div className="flex items-center gap-1">
                            <span className="text-[14px]">✨</span>
                            <span className={`font-bold text-[13px] ${isSpeedMode ? 'text-rose-700' : 'text-[#8B6B4A]'}`}>{user?.ai_credits || 0}</span>
                        </div>
                    </div>

                    <button className={`p-1.5 rounded-full transition-colors ml-1.5 ${isSpeedMode ? 'text-rose-800 active:bg-rose-200' : 'text-[#6B4E31] active:bg-[#D9CDB8]'}`}>
                        {/* Sound Icon */}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    </button>
                </div>
            </header>

            {/* Timer (Speed Mode) */}
            {isSpeedMode && (
                <div className="px-4 shrink-0 flex justify-center mt-1 mb-2">
                    <SpeedModeTimer
                        key={currentQuestion?.id || currentLevel || 'timer'}
                        isActive={gameState === 'playing' && currentQuestion}
                        gameState={gameState}
                        isPaused={activeModal !== null || showExitConfirm || showReportModal || isReading || fiftyFiftyAnimating || coinSystem?.isLoading}
                        timeLimit={timeLimit}
                        onTimeout={handleQuestionTimeout}
                        extraTimeBonus={extraTimeBonus}
                        onBuyTime={() => coinSystem?.redeemLifeline('addTime')}
                        canAffordTime={coinSystem?.canAfford?.('addTime')}
                        timeCost={coinSystem?.LIFELINE_COSTS?.addTime || 10}
                        streakCount={streakCount}
                        className="w-full max-w-sm" // 覆寫原本的 fixed 定位，改為內嵌
                    />
                </div>
            )}

            {/* Progress Bar Area */}
            <div className="px-6 py-2 shrink-0 flex items-center justify-between gap-4">
                <span className={`text-[14px] font-bold whitespace-nowrap ${isSpeedMode ? 'text-rose-800' : 'text-[#8B6B4A]'}`}>
                    {options.gameMode === 'casual' ? '題目' : '關卡'} {currentLevel + 1} / {options.gameMode === 'casual' ? options.questionCount : 15}
                </span>
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${isSpeedMode ? 'bg-rose-100' : 'bg-[#EFE5D0]'}`}>
                    <div 
                        className={`h-full rounded-full transition-all duration-500 ${isSpeedMode ? 'bg-rose-400' : 'bg-[#8B6B4A]'}`}
                        style={{ width: `${((currentLevel + 1) / (options.gameMode === 'casual' ? options.questionCount : 15)) * 100}%` }}
                    />
                </div>
            </div>

            {/* Portrait Main Content */}
            <main className="flex-1 min-h-0 flex flex-col overflow-y-auto px-5 pb-6 pt-2 gap-4 custom-scrollbar">
                
                {/* 題目區 */}
                <div className="shrink-0 animate-fade-in-smooth">
                    <MobileQuestionDisplay
                        displayedQuestion={displayedQuestion}
                        currentQuestion={currentQuestion}
                        isReading={isReading}
                        onSkip={skipReading}
                        isSpeedMode={isSpeedMode}
                    />
                </div>

                {/* 選項區 */}
                <div className="flex-1 shrink-0 flex flex-col justify-center py-2 animate-fade-in-smooth">
                    <MobileAnswerOptions
                        currentQuestion={currentQuestion}
                        hiddenOptions={hiddenOptions}
                        fiftyFiftyAnimating={fiftyFiftyAnimating}
                        focusedOptionIndex={focusedOptionIndex}
                        selectedOption={selectedOption}
                        gameState={gameState}
                        showOptions={showOptions}
                        lastAnimationAmt={lastAnimationAmt}
                        isSpeedMode={isSpeedMode}
                        onSelectOption={(index) => {
                            if (isSpeedMode) {
                                handleSpeedAnswer(index);
                            } else {
                                selectOption(index);
                            }
                        }}
                    />
                </div>

            </main>

            {/* 底部求救與確認區 (Fixed at bottom) */}
            <div className="shrink-0 flex flex-col gap-4 px-5 pb-6 pt-2 bg-gradient-to-t from-slate-50/80 to-transparent">
                {/* 橫向求救工具 */}
                {options.gameMode !== 'casual' && (
                    <MobileLifelinesPanel
                        lifelineStatus={lifelineStatus}
                        onFiftyFifty={(bypass) => handleFiftyFifty(currentQuestion, bypass)}
                        onPhoneFriend={openPhoneFriend}
                        onAskAudience={(bypass) => handleAskAudience(currentQuestion, 0, bypass)}
                        onWalkAway={onWalkAwayRequest}
                        disabled={gameState !== 'playing' || isReading}
                        onRedeemLifeline={coinSystem?.redeemLifeline}
                        canAfford={coinSystem?.canAfford}
                        lifelineCosts={coinSystem?.LIFELINE_COSTS}
                        variant="earth-tone-row"
                        isSpeedMode={isSpeedMode}
                    />
                )}

                {/* 確認按鈕 */}
                <GameControls
                    variant="earth-tone"
                    gameState={gameState}
                    selectedOption={selectedOption}
                    isCorrect={isCorrect}
                    onConfirm={() => handleConfirmClick()}
                    onNext={proceedNext}
                    onReplay={restartGame}
                    onExit={onExit}
                    onReport={onReportRequest}
                    gameMode={options.gameMode}
                    isSpeedMode={isSpeedMode}
                    controlWidth="full"
                />
            </div>

            {/* Modals Overlay */}
            {showExitConfirm && (
                <ExitConfirmationModal
                    onConfirm={confirmWalkAway}
                    onCancel={cancelWalkAway}
                    currentPrize={coinSystem?.coinsEarnedThisGame || 0}
                />
            )}

            {activeModal && (
                <LifelineModal
                    type={activeModal.type}
                    data={activeModal.data}
                    averageAccuracy={activeModal.averageAccuracy}
                    onClose={closeModal}
                    onExpertSelect={(expert) => selectExpert(expert, currentQuestion, user, coinSystem)}
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
                        } catch (error) {
                            console.error("Error saving report:", error);
                        }
                    }}
                />
            )}
        </div>
    );
}
