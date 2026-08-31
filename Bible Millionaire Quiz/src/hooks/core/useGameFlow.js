import { useState, useRef } from 'react';
import { PRIZE_LEVELS } from '../../data/constants';
import apiClient from '../../services/ApiClient';

export function useGameFlow(onGameEnd, options = {}) {
    const { gameMode = 'normal', questionCount = 15, isSpeedMode = false } = options;

    const [currentLevel, setCurrentLevel] = useState(0);
    const [gameState, setGameState] = useState('loading'); // loading, playing, answered, victory
    const [isCorrect, setIsCorrect] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showOptions, setShowOptions] = useState(false);
    const [score, setScore] = useState(0);

    const [wrongAnswers, setWrongAnswers] = useState([]);

    // Speed Mode stats
    const [correctCount, setCorrectCount] = useState(0);
    const [totalAnswered, setTotalAnswered] = useState(0);

    // Prevent double submissions (e.g. rapid clicks or double firing)
    const isSubmittingRef = useRef(false);

    const submitAnswer = async (question, optionIndex, forceSubmit = false) => {
        // 1. Re-entrancy Guard
        if (isSubmittingRef.current) {
            return 'locked';
        }

        // 2. GameState Guard (can be bypassed by forceSubmit)
        if (!forceSubmit && gameState !== 'playing') {
            return false;
        }
        if (!question) return false;

        try {
            // Lock submission
            isSubmittingRef.current = true;

            // Server-Side Verification
            // Handle both answer formats (Letter vs Text)
            const selectedText = question.options[optionIndex];
            
            // Ensure UI shows the selected button immediately
            setSelectedOption(optionIndex);
            
            // Wait for backend verification
            const verifyResult = await apiClient.verifyAnswer(question.answerToken, selectedText || optionIndex);
            
            // Inject the verified answer back into the question object for the UI to highlight correctly
            question.answer = verifyResult.correctAnswerText;
            
            const correct = verifyResult.isCorrect;

            setIsCorrect(correct);
            setGameState('answered');
            setTotalAnswered(prev => prev + 1);

            if (correct) {
                setCorrectCount(prev => prev + 1);
                if (gameMode !== 'casual') {
                    setScore(prev => prev + PRIZE_LEVELS[Math.min(currentLevel, 14)].value);
                }
            } else {
                setWrongAnswers(prev => [...prev, {
                    ...question,
                    selectedAnswer: selectedText,
                    correctAnswer: verifyResult.correctAnswerText,
                }]);
            }

            return correct;

        } catch (error) {
            console.error('[useGameFlow] Error in submitAnswer:', error);
            return false;
        } finally {
            // ALWAYS unlock
            isSubmittingRef.current = false;
        }
    };

    // Speed Mode: Handle timeout (no answer selected)
    const handleTimeout = async (question) => {
        // Race condition guard: If user just answered, ignore timeout
        if (isSubmittingRef.current || gameState !== 'playing' || !question) return;

        // Lock to prevent user from clicking AFTER timeout
        isSubmittingRef.current = true;

        setIsCorrect(false);
        setGameState('answered');
        setTotalAnswered(prev => prev + 1);
        setWrongAnswers(prev => [...prev, {
            ...question,
            selectedAnswer: '(超時未作答)',
            correctAnswer: question.answer,
        }]);

        try {
            await apiClient.recordTimeout(question.answerToken);
        } catch (error) {
            console.error('[useGameFlow] Failed to record timeout:', error);
        } finally {
            // Unlock for next round (handled by nextLevel)
            isSubmittingRef.current = false;
        }
    };



    const nextLevel = () => {
        if (gameMode === 'casual') {
            // 練習模式：做完所有題目，直接進結算（顯示準確率），不需 VictoryScreen
            if (currentLevel >= questionCount - 1) {
                handleVictory();
                return true;
            }
        } else if (isSpeedMode || gameMode === 'speed') {
            // Speed Mode: Always proceed regardless of correct/wrong
            console.log('Speed Mode nextLevel check:', { currentLevel, questionCount, shouldEnd: currentLevel >= questionCount - 1 });
            if (currentLevel >= questionCount - 1) {
                handleSpeedModeEnd();
                return true;
            }
        } else {
            if (!isCorrect) {
                saveScore(score);
                if (options.isInfiniteMode) {
                    // 無限挑戰：答錯即結束，直接進入金幣/點數結算頁
                    onGameEnd(score, 'victory', wrongAnswers);
                } else {
                    onGameEnd(score, 'gameover', wrongAnswers);
                }
                return false;
            }

            if (!options.isInfiniteMode && currentLevel >= 14) {
                // 經典模式通關：顯示 VictoryScreen 過場動畫再進結算
                saveScore(score);
                setGameState('victory'); // VictoryScreen 完成後再呼叫 handleVictory
                return true;
            }
        }

        // Next Question
        setCurrentLevel(prev => prev + 1);
        setIsCorrect(false);
        setSelectedOption(null);
        setGameState('playing');

        // Ensure lock is released for next question
        isSubmittingRef.current = false;

        return true;
    };

    const walkAway = () => {
        saveScore(score);
        if (options.isInfiniteMode) {
            onGameEnd(score, 'victory', wrongAnswers);
        } else {
            onGameEnd(score, 'gameover', wrongAnswers);
        }
    };

    // 由 VictoryScreen 的 onVictory 回調觸發（saveScore 已在 nextLevel 執行）
    const handleVictory = () => {
        onGameEnd(score, 'victory', wrongAnswers);
    };

    // Speed Mode end handler
    const handleSpeedModeEnd = () => {
        console.log('Speed Mode End:', { correctCount, totalAnswered, questionCount });
        setGameState('gameover');

        // Use questionCount as totalAnswered since we always complete all questions
        const finalTotal = questionCount;
        const accuracy = finalTotal > 0 ? Math.round((correctCount / finalTotal) * 100) : 0;

        onGameEnd(correctCount, 'speed-complete', {
            wrongAnswers,
            correctCount,
            totalAnswered: finalTotal,
            accuracy
        });
    };

    const saveScore = (score) => {
        // Store in sessionStorage to ensure it's cleared when the browser/tab closes
        const current = parseInt(sessionStorage.getItem('bible_millionaire_total_score') || '0');
        sessionStorage.setItem('bible_millionaire_total_score', (current + score).toString());
    };

    const resetFlow = () => {
        setCurrentLevel(0);
        setGameState('loading');
        setIsCorrect(false);
        setSelectedOption(null);
        setShowOptions(false);
        setScore(0);
        setWrongAnswers([]);
        setCorrectCount(0);
        setTotalAnswered(0);
    };

    return {
        currentLevel,
        gameState,
        isCorrect,
        selectedOption,
        showOptions,
        score,
        wrongAnswers,
        correctCount,
        totalAnswered,
        setGameState,
        setSelectedOption,
        setShowOptions,
        submitAnswer,
        handleTimeout,
        nextLevel,
        walkAway,
        handleVictory,
        resetFlow
    };
}
