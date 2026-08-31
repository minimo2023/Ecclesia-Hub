import { useState, useEffect, useRef } from 'react';
import { useQuestionData } from './core/useQuestionData';
import { useGameFlow } from './core/useGameFlow';
import { useGameAudio } from './useGameAudio';

/**
 * Main Game Logic Hook (Orchestrator)
 * Combines data loading and game flow logic
 */
export function useGameLogic(selectedBooks, onGameEnd, resetLifelines = null, options = {}) {
    // 1. Core Hooks
    const data = useQuestionData(selectedBooks, options);
    const flow = useGameFlow(onGameEnd, options);
    const audio = useGameAudio();

    // 2. UI Specific State
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [displayedQuestion, setDisplayedQuestion] = useState('');
    const [isReading, setIsReading] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [isGameReady, setIsGameReady] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);

    // Speed Mode: Question Timer
    const [questionTimer, setQuestionTimer] = useState(null);
    const isSpeedMode = options.isSpeedMode || options.gameMode === 'speed';

    const lastReadQuestionId = useRef(null);
    const readingIntervalRef = useRef(null);
    const optionsDelayRef = useRef(null);

    const clearReadingTimers = () => {
        if (readingIntervalRef.current) clearInterval(readingIntervalRef.current);
        if (optionsDelayRef.current) clearTimeout(optionsDelayRef.current);
        readingIntervalRef.current = null;
        optionsDelayRef.current = null;
    };

    // 3. Initialize Game
    const loadAllQuestions = async () => {
        flow.setGameState('loading');
        setIsGameReady(false);
        setFadeOut(false);
        setCountdown(null);
        // audio.stopAllSounds(); // REMOVED: Allow theme music to play during loading screen

        const success = await data.loadQuestions(options.initialQuestions, options.questionCount, options);

        if (success) {
            // Transition Sequence
            await new Promise(r => setTimeout(r, 1000)); // Trivia pause
            setFadeOut(true);
            await new Promise(r => setTimeout(r, 500));  // Fade out

            // Signal ready for countdown (GameManager handles the actual countdown)
            setIsGameReady(true);

        } else {
            // onGameEnd(0, 'error'); // STOP: Don't exit game, let GameScreen show error UI
            flow.setGameState('error'); // Triggers "Unable to Load" screen in GameScreen
        }
    };

    // ... (keep existing useEffects) ...

    // 7. Victory Handler Wrapper
    // 由 VictoryScreen.onVictory 回調，音效立即播放後進入結算
    // （VictoryScreen 已有 3 秒倒數動畫，不需額外延遲）
    const handleVictory = () => {
        audio.playVictoryMusic();
        flow.handleVictory();
    };

    const confirmAnswer = async (overrideIndex = null) => {
        // Use override index if provided (for instant answer), otherwise use state
        const indexToUse = overrideIndex !== null ? overrideIndex : flow.selectedOption;

        // If we still don't have an index, abort
        if (indexToUse === null || indexToUse === undefined) return false;

        // forceSubmit = true when using overrideIndex (Speed Mode Instant Answer)
        const forceSubmit = overrideIndex !== null;
        const result = await flow.submitAnswer(currentQuestion, indexToUse, forceSubmit);
        
        if (result === 'locked') return false;
        
        if (result) {
            audio.playCorrectSound();
        } else {
            audio.playWrongSound();
            // In speed mode, don't play game over music on wrong answer
            // [V4.2 SOVEREIGN] 移除提前播放：失敗音樂應在離開遊戲進入結算畫面時播放，而非在作答瞬間播放。
            // if (!result && options.gameMode !== 'casual' && !isSpeedMode) {
            //     audio.playGameOverMusic();
            // }
        }
        return result;
    };

    // Speed Mode: Handle timeout
    const handleQuestionTimeout = () => {
        if (currentQuestion && flow.gameState === 'playing') {
            flow.handleTimeout(currentQuestion);
            audio.playWrongSound();
        }
    };

    // Dedicated Handler for Speed Mode Answer
    const handleSpeedAnswer = async (index) => {

        // 1. Pre-checks handled by submitAnswer (state etc.)

        // 2. Submit Logic (Force = true)
        const result = await flow.submitAnswer(currentQuestion, index, true);

        if (result === 'locked') return false;

        // 3. Audio Logic (Independent of Game Over logic for speed mode)
        if (result === true) {
            audio.playCorrectSound();
        } else if (result === false) {
            audio.playWrongSound();
            // Speed mode continues even on wrong answer, so no Game Over music here
        }

        return result;
    };



    // 4. Sync Question with Level
    useEffect(() => {
        if (data.questionsLoaded && data.allQuestions.length > 0) {

            // Trigger load more check based on progress
            if (data.checkAndLoadMore) {
                data.checkAndLoadMore(flow.currentLevel);
            }

            if (flow.currentLevel < data.allQuestions.length) {
                // Only update if not answered (preserve UI state)
                if (flow.gameState !== 'answered') {
                    const newQuestion = data.allQuestions[flow.currentLevel];

                    // CRITICAL: Only update if question actually exists and is different
                    if (newQuestion && newQuestion.question) {
                        // Prevent setting the same question (causes UI flicker)
                        if (!currentQuestion || currentQuestion.id !== newQuestion.id) {
                            setCurrentQuestion(newQuestion);

                            // Reset reading state for new question
                            if (lastReadQuestionId.current !== newQuestion.id) {
                                setDisplayedQuestion('');
                                setIsReading(false);
                            }
                        }
                    } else {
                        // Question not loaded yet - keep current question displayed
                        console.log(`[useGameLogic] Level ${flow.currentLevel} question not ready, waiting...`);
                    }
                }

                // Auto-start playing if ready
                if (flow.gameState !== 'loading' && flow.gameState !== 'answered' && flow.gameState !== 'victory' && flow.gameState !== 'gameover') {
                    flow.setGameState('playing');
                }
            }
        }
    }, [flow.currentLevel, data.questionsLoaded, data.allQuestions, flow.gameState]);

    // 5. Reading Effect
    useEffect(() => {
        if (currentQuestion && flow.gameState === 'playing') {
            if (lastReadQuestionId.current === currentQuestion.id) return;

            lastReadQuestionId.current = currentQuestion.id;
            clearReadingTimers();
            setIsReading(true);
            setDisplayedQuestion('');
            flow.setShowOptions(false);

            let index = 0;
            const text = currentQuestion.question;
            const interval = setInterval(() => {
                if (index < text.length) {
                    setDisplayedQuestion(text.slice(0, index + 1));
                    index++;
                } else {
                    clearInterval(interval);
                    readingIntervalRef.current = null;
                    setIsReading(false);
                    // Add delay before showing options for better pacing
                    optionsDelayRef.current = setTimeout(() => {
                        flow.setShowOptions(true);
                        optionsDelayRef.current = null;
                    }, 500);
                }
            }, 50);
            readingIntervalRef.current = interval;

            return clearReadingTimers;
        }
    }, [currentQuestion, flow.gameState]);

    // 6. Actions
    const skipReading = () => {
        if (isReading && currentQuestion) {
            clearReadingTimers();
            setIsReading(false);
            setDisplayedQuestion(currentQuestion.question);
            flow.setShowOptions(true);
        }
    };



    const restartGame = () => {
        // Reset ALL state
        clearReadingTimers();
        data.resetData();
        flow.resetFlow();

        setCurrentQuestion(null);
        setDisplayedQuestion('');
        setIsReading(false);
        setCountdown(null);
        setIsGameReady(false);
        setFadeOut(false);
        lastReadQuestionId.current = null;

        // Reset lifelines if provided
        if (resetLifelines) {
            resetLifelines();
        }

        // Reload
        setTimeout(loadAllQuestions, 100);
    };

    return {
        // Data
        allQuestions: data.allQuestions,
        questionsLoaded: data.questionsLoaded,
        loadingMessage: data.loadingMessage,
        loadingProgress: data.loadingProgress,
        loadError: data.error,

        // Flow
        currentLevel: flow.currentLevel,
        gameState: flow.gameState,
        isCorrect: flow.isCorrect,
        selectedOption: flow.selectedOption,
        showOptions: flow.showOptions,
        score: flow.score,
        correctCount: flow.correctCount,
        totalAnswered: flow.totalAnswered,

        // UI
        currentQuestion,
        displayedQuestion,
        isReading,
        countdown,
        isGameReady,
        fadeOut,
        questionTimer,
        isSpeedMode,

        // Audio
        playCorrectSound: audio.playCorrectSound,
        playWrongSound: audio.playWrongSound,

        // Actions
        loadAllQuestions,
        selectOption: flow.setSelectedOption,
        confirmAnswer,
        proceedNext: flow.nextLevel,
        handleVictory,
        walkAway: flow.walkAway,
        restartGame,
        cleanup: data.resetData, // Expose cleanup for unmount
        skipReading,
        setGameState: flow.setGameState,
        setCountdown,
        setQuestionTimer,
        handleQuestionTimeout,
        handleSpeedAnswer
    };
}
