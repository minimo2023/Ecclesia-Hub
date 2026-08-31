import React, { useEffect, useState } from 'react';

export default function GameControls({
    variant = 'desktop', // 'mobile' or 'desktop'
    gameState,
    selectedOption,
    isCorrect,
    onConfirm,
    onNext,
    onReplay,
    onExit, // This will be the "Select Books" action
    onReport, // Optional report handler
    nextLabel = "下一題 ➜", // Custom label for next button
    gameMode = 'normal', // 'normal' or 'casual' or 'speed'
    isSpeedMode = false,
    autoNextDelay = 1200, // Shorter delay for tension (ms)
    controlWidth = 'default' // 'full' or 'default'
}) {
    const [autoNextCountdown, setAutoNextCountdown] = useState(null);

    // Common Logic
    const isAnswered = gameState === 'answered' || gameState === 'victory' || gameState === 'gameover';
    const hasSelected = selectedOption !== null && selectedOption !== undefined;

    // Speed Mode: Auto-proceed to next question after answer
    useEffect(() => {
        if (isSpeedMode && gameState === 'answered') {
            // Start countdown
            const totalMs = autoNextDelay;
            const steps = Math.ceil(totalMs / 100);
            let step = steps;

            const timer = setInterval(() => {
                step--;
                setAutoNextCountdown(Math.ceil((step / steps) * 100));

                if (step <= 0) {
                    clearInterval(timer);
                    setAutoNextCountdown(null);
                    onNext?.();
                }
            }, 100);

            return () => {
                clearInterval(timer);
                setAutoNextCountdown(null);
            };
        }
    }, [isSpeedMode, gameState, autoNextDelay, onNext]);

    // Platform-specific Base Styles
    const mobileBase = "w-full py-3 rounded-xl text-xl font-bold shadow-lg active:scale-95 transition border-2";
    const desktopBase = "px-24 py-8 rounded-full text-3xl font-bold shadow-lg transform hover:scale-105 transition border-4";
    const desktopSmallBase = "px-16 py-6 rounded-full text-2xl font-bold shadow-lg transform hover:scale-105 transition border-4";

    // 1. Confirm Button
    // In Speed Mode, we hide the confirm button because clicking an option instantly confirms
    if (!isAnswered && !isSpeedMode) {
        const isFull = controlWidth === 'full';
        const isMobileOrEarth = variant === 'mobile' || variant === 'earth-tone';
        const confirmMobileBase = `${isFull ? 'w-full' : 'w-1/2 mx-auto block'} py-4 rounded-xl text-xl font-bold shadow-sm active:scale-95 transition border-2`;
        const baseStyle = isMobileOrEarth ? confirmMobileBase : desktopBase;
        
        let activeStyle = "bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white border-orange-300 shadow-lg";
        let disabledStyle = "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200";

        if (variant === 'earth-tone') {
            activeStyle = "bg-[#8B6B4A] hover:bg-[#6B4E31] text-slate-900 border-[#8B6B4A]";
            disabledStyle = "bg-[#EFE5D0] text-[#D1BFAE] cursor-not-allowed border-[#EFE5D0]";
        }

        return (
            <button
                onClick={onConfirm}
                disabled={!hasSelected}
                className={`${baseStyle} ${hasSelected ? activeStyle : disabledStyle}`}
            >
                確定回答
            </button>
        );
    }

    // Speed Mode: Show NOTHING (Controls are hidden, options handle interaction)
    // We moved visual feedback to the buttons themselves (Watermark)
    if (isSpeedMode && (gameState === 'playing' || gameState === 'answered')) {
        return null;
    }



    const isMobileOrEarth = variant === 'mobile' || variant === 'earth-tone';

    // 2. Result Buttons (Next / Exit / Replay & Exit)
    return (
        <div className={`flex ${isMobileOrEarth ? 'flex-col w-full gap-2' : 'gap-6 justify-center'} animate-slide-up`}>
            {isCorrect || (gameMode === 'casual' && gameState === 'answered') ? (
                // Correct answer OR Casual Mode answered: Show Next button
                <button
                    onClick={onNext}
                    className={`${isMobileOrEarth ? mobileBase : desktopBase} ${
                        variant === 'earth-tone'
                            ? 'bg-[#6B4E31] hover:bg-[#8B6B4A] text-slate-900 border-[#6B4E31]'
                            : 'bg-green-600 hover:bg-green-500 text-slate-900 border-green-400/50'
                    }`}
                >
                    {nextLabel}
                </button>
            ) : gameState === 'gameover' || gameState === 'victory' ? (
                // Game Over or Victory: Show Replay and Exit buttons
                <div className={`flex ${isMobileOrEarth ? 'gap-2 w-full' : 'gap-4'}`}>
                    <button
                        onClick={onReplay}
                        className={`${isMobileOrEarth ? "flex-1 " + mobileBase : desktopSmallBase} ${
                            variant === 'earth-tone'
                                ? 'bg-[#8B6B4A] hover:bg-[#6B4E31] text-slate-900 border-[#8B6B4A]'
                                : 'bg-yellow-600 hover:bg-yellow-500 text-slate-900 border-yellow-500'
                        } whitespace-nowrap`}
                    >
                        🔄 重新挑戰
                    </button>
                    <button
                        onClick={onExit}
                        className={`${isMobileOrEarth ? "flex-1 " + mobileBase : desktopSmallBase} ${
                            variant === 'earth-tone'
                                ? 'bg-[#FDF8EE] hover:bg-[#F5EDDD] text-[#8B6B4A] border-[#D1BFAE]'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300'
                        } whitespace-nowrap`}
                    >
                        ⬅️ 重選經卷
                    </button>
                </div>
            ) : (
                // Wrong answer (still on game screen) OR Playing state if manual controls needed
                // Speed Mode: Hide Exit button
                !isSpeedMode && (
                    <button
                        onClick={gameState === 'answered' ? onNext : onExit}
                        className={`${isMobileOrEarth ? (controlWidth === 'full' ? 'w-full' : 'w-1/2 mx-auto block') + ' py-3 rounded-xl text-xl font-bold shadow-lg active:scale-95 transition border-2' : desktopBase} ${
                            variant === 'earth-tone'
                                ? 'bg-[#EFE5D0] hover:bg-[#D1BFAE] text-[#6B4E31] border-[#C2B099]'
                                : 'bg-yellow-600 hover:bg-yellow-500 text-slate-900 border-yellow-400/50'
                        }`}
                    >
                        {gameState === 'answered' ? '查看結算' : '離開'}
                    </button>
                )
            )}

            {/* Mobile Report Button (Optional integration) */}
            {isMobileOrEarth && onReport && (
                <button
                    onClick={onReport}
                    className={`flex items-center justify-center gap-2 w-full py-2 text-sm rounded-lg border transition mt-2 ${
                        variant === 'earth-tone'
                            ? 'bg-[#FDF8EE]/50 hover:bg-[#F5EDDD] text-[#A88B70] hover:text-[#8B6B4A] border-[#EFE5D0] hover:border-[#D1BFAE]'
                            : 'bg-white/90 hover:bg-red-900/30 text-slate-500 hover:text-red-300 border-slate-200 hover:border-red-800/50'
                    }`}
                >
                    🚩 覺得這題有問題？回報錯誤
                </button>
            )}
        </div>
    );
}
