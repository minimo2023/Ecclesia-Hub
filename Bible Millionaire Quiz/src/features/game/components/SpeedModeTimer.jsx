import React, { useState, useEffect } from 'react';
import { Clock, Plus, Zap } from 'lucide-react';

/**
 * SpeedModeTimer - 快問快答模式的倒數計時器
 * 顯示剩餘時間，支援 +5秒道具
 */
export default function SpeedModeTimer({
    isActive,
    timeLimit = 10,
    extraTimeBonus = 0,
    onTimeout,
    onBuyTime,
    canAffordTime = false,
    timeCost = 10,
    streakCount = 0,
    gameState,
    className,
    isPaused = false
}) {
    const [timeLeft, setTimeLeft] = useState(timeLimit + extraTimeBonus);
    const [isWarning, setIsWarning] = useState(false);
    const prevBonusRef = React.useRef(extraTimeBonus);

    // Reset timer when new question starts (gameState changes to playing)
    useEffect(() => {
        if (gameState === 'playing' && isActive) {
            setTimeLeft(timeLimit + extraTimeBonus);
            setIsWarning(false);
            prevBonusRef.current = extraTimeBonus; // Sync ref on reset
        }
    }, [gameState, isActive, timeLimit]); // Removed extraTimeBonus from reset dependency

    // Handle extraTimeBonus updates (mid-game)
    useEffect(() => {
        if (extraTimeBonus > prevBonusRef.current) {
            const delta = extraTimeBonus - prevBonusRef.current;
            setTimeLeft(prev => prev + delta);
            prevBonusRef.current = extraTimeBonus;
        }
    }, [extraTimeBonus]);

    // Countdown logic
    useEffect(() => {
        if (!isActive || gameState !== 'playing' || isPaused) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) return 0;
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isActive, gameState, isPaused]);

    // Guard to prevent multiple timeout calls
    const hasTimedOutRef = React.useRef(false);

    // Reset timeout guard when question changes (gameState goes to playing)
    useEffect(() => {
        if (gameState === 'playing' && isActive) {
            hasTimedOutRef.current = false; // Reset guard for new question
        }
    }, [gameState, isActive]);

    // Handle Timeout Trigger safely (outside render cycle)
    useEffect(() => {
        if (timeLeft === 0 && isActive && gameState === 'playing' && !isPaused && !hasTimedOutRef.current) {
            console.log('[SpeedModeTimer] Timeout Triggered!');
            hasTimedOutRef.current = true; // Prevent double calls
            onTimeout?.();
        } else if (timeLeft === 0) {
            console.log('[SpeedModeTimer] Timeout skipped. Active:', isActive, 'State:', gameState, 'Paused:', isPaused, 'Guard:', hasTimedOutRef.current);
        }
    }, [timeLeft, isActive, gameState, isPaused, onTimeout]);

    // Calculate progress percentage
    const totalTime = timeLimit + extraTimeBonus;
    const progress = (timeLeft / totalTime) * 100;

    // Color based on time remaining
    const getTimerColor = () => {
        if (timeLeft <= 3) return 'text-red-400 animate-pulse';
        if (timeLeft <= 5) return 'text-orange-400';
        return 'text-cyan-400';
    };

    const getProgressColor = () => {
        if (timeLeft <= 3) return 'bg-red-500';
        if (timeLeft <= 5) return 'bg-orange-500';
        return 'bg-cyan-500';
    };

    if (!isActive) return null;

    return (
        <div className={className || "fixed top-4 left-1/2 -translate-x-1/2 z-50"}>
            <div className="bg-slate-900/90 backdrop-blur-sm rounded-2xl px-6 py-3 border border-slate-700 shadow-xl">
                <div className="flex items-center gap-4">
                    {/* Timer Display */}
                    <div className="flex items-center gap-2">
                        <Clock className={`w-6 h-6 ${getTimerColor()}`} />
                        <span className={`text-3xl font-bold font-mono ${getTimerColor()}`}>
                            {timeLeft}
                        </span>
                        <span className="text-slate-400 text-sm">秒</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${getProgressColor()}`}
                            style={{
                                width: `${progress}%`,
                                transition: 'width 1s linear' // Force linear 1s transition to match tick rate
                            }}
                        />
                    </div>

                    {/* +5 Sec Button */}
                    <button
                        onClick={onBuyTime}
                        disabled={!canAffordTime || isPaused}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold transition-all relative z-50 pointer-events-auto
                            ${canAffordTime && !isPaused
                                ? 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            }`}
                    >
                        <Plus className="w-4 h-4" />
                        5秒
                        <span className="text-xs opacity-75">({timeCost}💰)</span>
                    </button>

                    {/* Streak Counter */}
                    {streakCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-amber-600/30 rounded-lg border border-amber-500/50">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-amber-300 font-bold text-sm">{streakCount}連</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
