import React, { useEffect, useRef, useState, useCallback } from 'react';
import GameScreen from './GameScreen';
import MobileGameScreen from './mobile/MobileGameScreen';
import { useGameLogic } from '../hooks/useGameLogic';
import { useLifelines } from '../hooks/useLifelines';
import { useGameAudio } from '../hooks/useGameAudio';
import { useCoinSystem } from '../../../hooks/useCoinSystem';
import { useAuth } from '../../../contexts/AuthContext';

export default function GameManager({
    selectedBooks,
    options,
    onGameEnd,
    onExit: _onExit,
    useMobileInterface
}) {
    // 1. Initialize Hooks
    const lifelines = useLifelines();
    const { resetLifelines } = lifelines;
    const { isLoggedIn, user, refreshUser } = useAuth();

    // Coin system - only for classic mode and speed mode
    const coinSystem = useCoinSystem();
    const isClassicMode = options?.gameMode === 'classic';
    const isSpeedMode = options?.isSpeedMode || options?.gameMode === 'speed';
    const finishingRef = useRef(false);
    const newClientSessionKey = () => globalThis.crypto?.randomUUID?.()
        || `game_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const clientSessionKeyRef = useRef(null);

    // Debug Logging
    useEffect(() => {
        console.log('[GameManager] Mount Debug:', {
            isLoggedIn,
            userCoins: coinSystem?.coins,
            sessionCoins: coinSystem?.sessionCoins,
            isClassicMode,
            isSpeedMode
        });
    }, [isLoggedIn, coinSystem.coins, coinSystem.sessionCoins, isClassicMode, isSpeedMode]);

    // LocalStorage key for guest coins (survives refresh, persists until merged)
    const GUEST_COINS_KEY = 'guest_coins';
    const GUEST_STREAK_KEY = 'bible_quiz_guest_streak';

    // For logged-in users, we use these to track session display too
    const [bonusCoins, setBonusCoins] = useState(0);
    const bonusRef = React.useRef(0);

    // Missing State Fixed
    const [currentGameCoins, setCurrentGameCoins] = useState(0);
    const currentGameRef = React.useRef(0);
    const [guestBaseCoins, setGuestBaseCoins] = useState(0);
    const guestBaseRef = React.useRef(0);

    // Speed Mode Stats
    const [extraTimeBonus, setExtraTimeBonus] = useState(0);
    const [streakCount, setStreakCount] = useState(() => {
        if (isLoggedIn) return 0;
        try {
            const saved = localStorage.getItem('bible_quiz_guest_streak');
            return saved ? parseInt(saved, 10) : 0;
        } catch { return 0; }
    });

    // Tracking reward for animation (+X)
    const [lastAnimationAmt, setLastAnimationAmt] = useState(0);
    const [lastSpentAmt, setLastSpentAmt] = useState(0);
    const [lastSpentId, setLastSpentId] = useState(null);

    // Sync guest streak only
    React.useEffect(() => {
        if (!isLoggedIn && (isClassicMode || isSpeedMode)) {
            try {
                localStorage.setItem('bible_quiz_guest_streak', streakCount.toString());
            } catch (e) {
                console.warn('Failed to save guest streak:', e);
            }
        }
    }, [streakCount, isLoggedIn, isClassicMode, isSpeedMode]);

    const LARGE_CATEGORIES = ['摩西五經', '福音書', '保羅書信', '歷史書', '先知書', '智慧書', '全部經卷'];

    const gameLogicRef = useRef(null);

    const hasLargeCategoryBonus = () => {
        if (!selectedBooks || selectedBooks.length === 0) return false;
        if (selectedBooks.length >= 5) return true;
        return selectedBooks.some(book => {
            if (typeof book === 'string') {
                return LARGE_CATEGORIES.some(cat => book.includes(cat) || cat === book);
            } else if (book?.book) {
                return LARGE_CATEGORIES.some(cat => book.book.includes(cat) || cat === book.book);
            }
            return false;
        });
    };

    // 3. Game End & Coin Settlement
    const handleGameEndIntercept = (finalScore, reason, extraData = {}) => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        const activeGameLogic = gameLogicRef.current;
        let displayScore = finalScore;

        // Calculate Finals
        let currentRun = currentGameRef.current;
        let base = guestBaseRef.current;
        let finalBonus = bonusRef.current || bonusCoins;
        let earnedBonus = 0;

        // Classic Bonus
        if (isClassicMode && reason === 'victory') {
            const classicConfig = coinSystem.economyConfig?.classic_reward_config || { victoryBonus: 0.20 };
            const bonusRate = classicConfig.victoryBonus || 0.20;
            const totalForCalc = base + currentRun;
            earnedBonus = Math.ceil(totalForCalc * bonusRate);
            // Add bonus to current run for display
            currentRun += earnedBonus;
        }

        // Speed Mode Bonus
        if (isSpeedMode) {
            const speedConfig = coinSystem.economyConfig?.speed_reward_config || {
                streakBonuses: [{ streak: 5, bonus: 0.10 }, { streak: 10, bonus: 0.15 }, { streak: 15, bonus: 0.20 }]
            };
            const streakBonuses = speedConfig.streakBonuses || [];

            const currentStreak = streakCount;
            const totalForCalc = base + currentRun;

            // Find highest applicable bonus
            const applicableBonus = [...streakBonuses]
                .sort((a, b) => b.streak - a.streak)
                .find(b => currentStreak >= b.streak);

            if (applicableBonus) {
                earnedBonus = Math.ceil(totalForCalc * applicableBonus.bonus);
            }

            currentRun += earnedBonus;
        }

        // Update State
        setCurrentGameCoins(currentRun);
        currentGameRef.current = currentRun;
        if (earnedBonus > 0) {
            setBonusCoins(prev => prev + earnedBonus);
            bonusRef.current = (bonusRef.current || 0) + earnedBonus;
        }

        // Infinite Mode Rewards & Milestone
        if (options.isInfiniteMode) {
            const levelReached = activeGameLogic?.currentLevel || 1;
            
            // Dynamic Bonus (Starts at level 16, +5% every 20 levels, max 100%)
            if (levelReached >= 16) {
                const infiniteConfig = coinSystem.economyConfig?.infinite_reward_config || {
                    boostRatePer20Levels: 0.05,
                    maxBoostMultiplier: 1.0,
                    milestoneOddHundredCoinsMultiplier: 100,
                    milestoneEvenHundredPointsMultiplier: 5
                };
                
                const multiplier = Math.min(
                    infiniteConfig.maxBoostMultiplier || 1.0, 
                    Math.floor((levelReached - 1) / 20) * (infiniteConfig.boostRatePer20Levels || 0.05)
                );
                
                if (multiplier > 0) {
                    const infiniteBonus = Math.ceil(currentRun * multiplier);
                    currentRun += infiniteBonus;
                    earnedBonus += infiniteBonus;
                    
                    setCurrentGameCoins(currentRun);
                    currentGameRef.current = currentRun;
                    setBonusCoins(prev => prev + infiniteBonus);
                    bonusRef.current = (bonusRef.current || 0) + infiniteBonus;
                }
            }

        }

        // Force reason to 'speed-complete' if in Speed Mode to ensure correct screen
        // Speed Mode doesn't have a "failure" state, just completion
        if (isSpeedMode) {
            reason = 'speed-complete';
        }

        // Final Total Calculation
        const finalTotal = base + currentRun;

        // Setup display score
        // User Request: Display "Green Accumulation" (Session Earnings) on result screen
        displayScore = currentRun;

        // Detect if extraData is array
        let normalizedExtra = {};
        if (Array.isArray(extraData)) {
            normalizedExtra = { wrongAnswers: extraData };
        } else {
            normalizedExtra = extraData;
        }

        const finishWithServerSettlement = async () => {
            const settlement = await coinSystem.settleSession(reason);
            const hasAuthoritativeResult = isLoggedIn && settlement?.success && !settlement.localOnly;
            const authoritativeCoins = hasAuthoritativeResult
                ? Number(settlement.coinsAwarded || 0)
                : finalTotal;
            const authoritativeScore = hasAuthoritativeResult
                ? Number(settlement.serverScore || 0)
                : displayScore;

            onGameEnd(authoritativeCoins, reason, {
                ...normalizedExtra,
                serverScore: authoritativeScore,
                coinsEarned: authoritativeCoins,
                pointsEarned: Number(settlement?.pointsAwarded || 0),
                bonusCoins: hasAuthoritativeResult ? 0 : finalBonus + earnedBonus,
                pendingSettlement: false,
                correctCount: hasAuthoritativeResult
                    ? settlement.correctCount
                    : (isSpeedMode ? (activeGameLogic?.correctCount || 0) : undefined),
                settlementError: settlement?.success ? null : settlement?.error
            });
        };
        void finishWithServerSettlement();
    };

    // 11. Handle Restart
    const handleRestartGame = async () => {
        // Committing current earnings to base for next game?
        // If we restart, essentially we bank the previous run (if we want to keep it).
        // Since we didn't "Lose" everything (Arcade style), yes we bank it.
        const total = guestBaseRef.current + currentGameRef.current;

        setGuestBaseCoins(total);
        guestBaseRef.current = total;

        // Reset Current Session
        setCurrentGameCoins(0);
        currentGameRef.current = 0;

        setBonusCoins(0);
        bonusRef.current = 0;
        setStreakCount(0);
        setExtraTimeBonus(0);

        finishingRef.current = false;
        clientSessionKeyRef.current = newClientSessionKey();
        if (isLoggedIn) {
            await coinSystem.startGameSession({
                mode: options?.gameMode || (isSpeedMode ? 'speed' : 'classic'),
                questionCount: options?.questionCount || 15,
                selectedBooks,
                isInfiniteMode: Boolean(options?.isInfiniteMode),
                clientSessionKey: clientSessionKeyRef.current
            });
        }

        gameLogicRef.current?.restartGame();
    };

    const gameLogic = useGameLogic(selectedBooks, handleGameEndIntercept, resetLifelines, options);
    const coinSystemRef = useRef(coinSystem);
    const gameAudioRef = useRef(null);
    const initialGameConfigRef = useRef({
        isLoggedIn,
        isClassicMode,
        isSpeedMode,
        selectedBooks,
        options
    });

    useEffect(() => {
        gameLogicRef.current = gameLogic;
        coinSystemRef.current = coinSystem;
    }, [gameLogic, coinSystem]);
    const {
        isGameReady,
        gameState,
        currentQuestion
    } = gameLogic;

    // Centralized Modals State
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);

    const handleWalkAwayRequest = useCallback(() => {
        setShowExitConfirm(true);
    }, []);

    const confirmWalkAway = useCallback(() => {
        setShowExitConfirm(false);
        gameLogic.walkAway();
    }, [gameLogic]);

    const cancelWalkAway = useCallback(() => {
        setShowExitConfirm(false);
    }, []);

    const handleReportRequest = useCallback(() => {
        setShowReportModal(true);
    }, []);

    const closeReportModal = useCallback(() => {
        setShowReportModal(false);
    }, []);

    const gameAudio = useGameAudio({ backgroundMusicEnabled: isClassicMode || isSpeedMode });

    useEffect(() => {
        gameAudioRef.current = gameAudio;
    }, [gameAudio]);

    // 4. Initialize Game Data
    useEffect(() => {
        let cancelled = false;
        const initial = initialGameConfigRef.current;
        const activeCoinSystem = coinSystemRef.current;
        if (initial.isClassicMode || initial.isSpeedMode) {
            activeCoinSystem.resetSession();

            if (initial.isLoggedIn) {
                // If logged in, coins are server side.
                // We track "earned this game" purely for display.
                setCurrentGameCoins(0);
                currentGameRef.current = 0;
                setGuestBaseCoins(0);
                guestBaseRef.current = 0;
            }

            setBonusCoins(0);
            bonusRef.current = 0;
            setStreakCount(0);
            setExtraTimeBonus(0);

            try {
                sessionStorage.removeItem(GUEST_STREAK_KEY);
            } catch { }
        }

        const initializeGame = async () => {
            if (!clientSessionKeyRef.current) clientSessionKeyRef.current = newClientSessionKey();
            if (initial.isLoggedIn) {
                const result = await activeCoinSystem.startGameSession({
                    mode: initial.options?.gameMode || (initial.isSpeedMode ? 'speed' : 'classic'),
                    questionCount: initial.options?.questionCount || 15,
                    selectedBooks: initial.selectedBooks,
                    isInfiniteMode: Boolean(initial.options?.isInfiniteMode),
                    clientSessionKey: clientSessionKeyRef.current
                });
                if (!result.success) {
                    console.error('[GameManager] Failed to create authoritative game session:', result.error);
                }
            }
            if (!cancelled) gameLogicRef.current?.loadAllQuestions();
        };
        void initializeGame();

        // Cleanup on unmount to prevent duplicate loads (Strict Mode)
        return () => {
            cancelled = true;
            gameLogicRef.current?.cleanup?.();
        };
    }, []);

    useEffect(() => {
        if (isGameReady && gameState === 'loading') {
            gameAudioRef.current?.playCountdownSequence(gameLogicRef.current?.setCountdown, () => {
                gameLogicRef.current?.setGameState('playing');
            });
        }
    }, [isGameReady, gameState]);

    // [V4.2 SOVEREIGN] 移除重複觸發：音效主權歸一化至 App.jsx 畫面切換層。
    /* 
    useEffect(() => {
        if (gameState === 'victory') {
            playVictoryMusic();
        } else if (gameState === 'gameover') {
            playGameOverMusic();
        }
    }, [gameState]);
    */

    const currentQuestionId = currentQuestion?.id;
    const lifelinesRef = useRef(lifelines);
    useEffect(() => {
        lifelinesRef.current = lifelines;
    }, [lifelines]);
    useEffect(() => {
        if (currentQuestionId) {
            lifelinesRef.current.setHiddenOptions([]);
            setExtraTimeBonus(0);
        }
    }, [currentQuestionId]);

    const handleWrongAnswerExit = () => {
        if (isSpeedMode) {
            // Debug Log
            console.log('[GameManager] Speed Mode Exit. Stats:', {
                correctCount: gameLogic.correctCount,
                wrongAnswers: gameLogic.wrongAnswers,
                totalAnswered: gameLogic.totalAnswered
            });

            // Speed Mode exit should show results summary, not failure
            handleGameEndIntercept(gameLogic.correctCount, 'speed-complete', {
                correctCount: gameLogic.correctCount,
                wrongAnswers: gameLogic.wrongAnswers,
                totalAnswered: gameLogic.totalAnswered
            });
        } else {
            handleGameEndIntercept(gameLogic.score, 'gameover');
        }
    };

    const handleConfirmWithCoins = async () => {
        const result = await gameLogic.confirmAnswer();

        if (isClassicMode) {
            if (result) {
                const classicConfig = coinSystem.economyConfig?.classic_reward_config || {
                    perQuestion: 1,
                    categoryBonuses: [
                        { minBooks: 5, bonus: 0.10 }, 
                        { minBooks: 11, bonus: 0.15 }
                    ]
                };
                
                const categoryBonuses = classicConfig.categoryBonuses || [];

                let earnAmount = classicConfig.perQuestion || 1;
                let bonus = 0;

                if (hasLargeCategoryBonus()) {
                    const bookCount = selectedBooks?.length || 0; // Simplified count check
                    // Find highest applicable category bonus from config
                    const applicableBonus = [...categoryBonuses]
                        .sort((a, b) => b.minBooks - a.minBooks)
                        .find(b => bookCount >= b.minBooks || (bookCount === 0 && b.minBooks === 5)); 

                    if (applicableBonus) {
                        bonus = Math.ceil(earnAmount * applicableBonus.bonus);
                    }
                }

                const totalToEarn = earnAmount + bonus;

                // local cumulative (no immediate API call)
                coinSystem.earnCoins(totalToEarn, 'classic_correct_answer');
                setLastAnimationAmt(totalToEarn);

                if (bonus > 0) {
                    setBonusCoins(prev => {
                        const newVal = prev + bonus;
                        bonusRef.current = newVal;
                        return newVal;
                    });
                }

                // Track locally for Game Manager logic
                setCurrentGameCoins(prev => {
                    const newVal = prev + totalToEarn;
                    currentGameRef.current = newVal;
                    return newVal;
                });
            } else {
                // Incorrect answer: reset reward animation and RECALCULATE BONUS
                setLastAnimationAmt(0);
                
                // Rule: Keep base coins per question, but reset accumulated bonus pool
                if (bonusRef.current > 0) {
                    const bonusToReset = bonusRef.current;
                    console.log(`[GameManager] Resetting bonus pool on error: -${bonusToReset}`);
                    coinSystem.earnCoins(-bonusToReset, 'classic_bonus_reset');
                    setBonusCoins(0);
                    bonusRef.current = 0;
                    setCurrentGameCoins(prev => prev - bonusToReset);
                    currentGameRef.current = currentGameRef.current - bonusToReset;
                }
            }
        }
        return result;
    };

    // Wrapper for Speed Mode Answer to handle coins/streak
    const handleSpeedAnswerWithCoins = async (index) => {
        // Call the raw logic first
        const result = await gameLogic.handleSpeedAnswer(index);

        if (result) {
            // Correct: Increase Streak & Coins
            const newStreak = streakCount + 1;
            setStreakCount(newStreak);
            
            const baseEarn = 2; // Flat 2 coins per speed answer
            let bonus = 0;
            
            const speedConfig = coinSystem.economyConfig?.speed_reward_config || {
                streakBonuses: [
                    { streak: 5, bonus: 0.10 }, 
                    { streak: 10, bonus: 0.15 }, 
                    { streak: 15, bonus: 0.20 }
                ]
            };
            const streakBonuses = speedConfig.streakBonuses || [];
            
            // Streak Bonus Rule from Config
            const applicableBonus = [...streakBonuses]
                .sort((a, b) => b.streak - a.streak)
                .find(b => newStreak >= b.streak);

            if (applicableBonus) {
                bonus = Math.ceil(baseEarn * applicableBonus.bonus);
            }

            const totalToEarn = baseEarn + bonus;

            // local cumulative
            coinSystem.earnCoins(totalToEarn, 'speed_correct_answer');
            setLastAnimationAmt(totalToEarn);

            if (bonus > 0) {
                setBonusCoins(prev => {
                    const newVal = prev + bonus;
                    bonusRef.current = newVal;
                    return newVal;
                });
            }

            // Track locally for Game Manager logic
            setCurrentGameCoins(prev => {
                const newVal = prev + totalToEarn;
                currentGameRef.current = newVal;
                return newVal;
            });
        } else {
            // Wrong: Reset Streak & reward animation and RECALCULATE BONUS
            setLastAnimationAmt(0);
            setStreakCount(0);
            
            // Rule: Keep base but reset bonus pool
            if (bonusRef.current > 0) {
                const bonusToReset = bonusRef.current;
                console.log(`[GameManager] Speed Mode Bonus Reset: -${bonusToReset}`);
                coinSystem.earnCoins(-bonusToReset, 'speed_bonus_reset');
                setBonusCoins(0);
                bonusRef.current = 0;
                setCurrentGameCoins(prev => prev - bonusToReset);
                currentGameRef.current = currentGameRef.current - bonusToReset;
            }
        }
        return result;
    };



    const activeBalance = isLoggedIn ? coinSystem.coins : (guestBaseCoins + currentGameCoins);

    const getDynamicCost = (type) => {
        let baseCost = coinSystem.LIFELINE_COSTS?.[type] || 0;
        if (type === 'phoneFriend') {
            if (lifelines.expertCallsThisGame >= 3) {
                // 第 4 次起扣智匯點數，不扣金幣
                baseCost = 0;
            } else {
                baseCost = lifelines.expertCallsThisGame > 0 ? lifelines.expertCallsThisGame * 15 : 15;
            }
        }
        return baseCost;
    };

    // Check affordable
    const canAffordCheck = (type) => {
        return activeBalance >= getDynamicCost(type);
    };

    const handleRedeemLifeline = async (lifelineType) => {
        if (!isClassicMode && !isSpeedMode) return { success: false, error: '此模式不支援智匯金幣兌換' };

        const dynamicCost = getDynamicCost(lifelineType);

        // Optimistic UI Update for +5s
        if (lifelineType === 'addTime') {
            setExtraTimeBonus(prev => prev + 5);
            setLastSpentAmt(dynamicCost);
            setLastSpentId(lifelineType);
            setTimeout(() => setLastSpentId(null), 1500);

            // Let it resolve in the background
            coinSystem.redeemLifeline(lifelineType, dynamicCost).then(result => {
                if (!result.success) {
                    setExtraTimeBonus(prev => prev - 5); // Revert on fail
                }
            });
            return { success: true };
        }

        const result = await coinSystem.redeemLifeline(lifelineType, dynamicCost);
        if (result.success) {
            setLastSpentAmt(result.spent || dynamicCost);
            setLastSpentId(lifelineType);
            // Clear animation after delay
            setTimeout(() => setLastSpentId(null), 1500);

            lifelines.restoreLifeline(lifelineType, gameLogic.currentLevel);
        }
        return result;
    };

    // Wrapper to ensure bonus time resets BEFORE level change triggers render
    const handleNextLevel = () => {
        setExtraTimeBonus(0);
        gameLogic.nextLevel();
    };

    const handleQuestionTimeoutWithStreak = () => {
        console.log('[GameManager] handleQuestionTimeoutWithStreak called. SpeedMode:', isSpeedMode);
        setLastAnimationAmt(0); // Reset reward animation state
        
        // Rule: Reset bonus pool on timeout
        if (bonusRef.current > 0) {
            const bonusToReset = bonusRef.current;
            coinSystem.earnCoins(-bonusToReset, 'timeout_bonus_reset');
            setBonusCoins(0);
            bonusRef.current = 0;
            setCurrentGameCoins(prev => prev - bonusToReset);
            currentGameRef.current = currentGameRef.current - bonusToReset;
        }

        if (isSpeedMode) {
            setStreakCount(0);
            setTimeout(() => {
                setExtraTimeBonus(0);
                if (gameLogic.nextLevel) gameLogic.nextLevel();
            }, 2000);
        }
        gameLogic.handleQuestionTimeout?.();
    };

    const gameProps = {
        selectedBooks,
        options,
        onGameEnd: handleGameEndIntercept,
        onExit: handleWrongAnswerExit,
        onLoadErrorExit: _onExit,
        ...lifelines,
        ...gameLogic,
        nextLevel: handleNextLevel,
        ...gameAudio,
        confirmAnswer: handleConfirmWithCoins,
        handleSpeedAnswer: handleSpeedAnswerWithCoins,
        handleQuestionTimeout: handleQuestionTimeoutWithStreak,
        // [SOVEREIGN] selectExpert 包裝版：注入 user 與 refreshUser
        selectExpert: (expert, question, _user, cs) =>
            lifelines.selectExpert(expert, question, user, cs, refreshUser),
        coinSystem: {
            coins: coinSystem.coins,          // 當前總餘額（顯示用）
            activeBalance: coinSystem.coins,   // 邏輯判斷用（同上）
            sessionCoins: coinSystem.sessionCoins,
            coinsEarnedThisGame: coinSystem.sessionCoins,
            bonusCoins,
            hasBonus: hasLargeCategoryBonus(),
            canAfford: canAffordCheck,
            spendCoins: coinSystem.spendCoins,
            redeemLifeline: handleRedeemLifeline,
            LIFELINE_COSTS: {
                ...coinSystem.LIFELINE_COSTS,
                phoneFriend: getDynamicCost('phoneFriend')
            },
            isLoading: coinSystem.isLoading
        },
        isSpeedMode,
        streakCount,
        extraTimeBonus,
        timeLimit: options?.timeLimit || 7,
        isClassicMode,

        isLoggedIn,
        restartGame: handleRestartGame,
        lastAnimationAmt, // Pass for animation
        lastSpentAmt,  // Pass for animation
        lastSpentId,    // Pass for animation
        
        // Centralized Modals
        showExitConfirm,
        showReportModal,
        onWalkAwayRequest: handleWalkAwayRequest,
        confirmWalkAway,
        cancelWalkAway,
        onReportRequest: handleReportRequest,
        closeReportModal
    };

    return useMobileInterface ? (
        <MobileGameScreen {...gameProps} />
    ) : (
        <GameScreen {...gameProps} />
    );
}
