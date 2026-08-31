import { useState, useRef } from 'react';
import { questionService } from '../../features/game/services/questions';
import { triviaService } from '../../features/game/services/TriviaService';
const MAX_FETCH_BATCH = 3;
const MAX_EXCLUDE_ITEMS = 40;

export function useQuestionData(selectedBooks, hookOptions = {}) {
    // 1. Core State
    const [allQuestions, setAllQuestions] = useState([]);
    const [questionsLoaded, setQuestionsLoaded] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('正在連接 AI 題庫...');
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [error, setError] = useState(null);

    // 2. Refs (Persist across renders)
    // Stores options for subsequent background fetches
    const loadConfigRef = useRef({ targetCount: 15, options: {} });
    const isFetchingRef = useRef(false);
    const abortRef = useRef(false);
    const triviaIntervalRef = useRef(null);
    const progressIntervalRef = useRef(null);
    const blueprintRef = useRef(null);

    // 3. Helper: Fetch Background Chunk (Replenish)
    const fetchRemainingInBackground = async (currentList, batchSize) => {
        const { targetCount, options } = loadConfigRef.current;

        if (isFetchingRef.current) return;
        if (currentList.length >= targetCount) return;
        if (abortRef.current) return;

        const remaining = targetCount - currentList.length;
        if (remaining <= 0) return;

        const countToFetch = Math.min(remaining, batchSize, 12); // 背景抓取可以一次拿多題 (最高12題)
        isFetchingRef.current = true;

        console.log(`[UseQuestionData] Background fetching chunk of ${countToFetch} questions (Target: ${targetCount})...`);

        try {
            const excludeList = currentList.map(q => q.question);
            const globalExcludes = questionService.getGlobalExcludeList(50);
            const allExcludes = [...globalExcludes, ...excludeList];

            const { questions, blueprint: bp } = await questionService.getQuestionsV2(
                selectedBooks,
                countToFetch,
                options.gameMode || 'classic',
                allExcludes,
                {
                    ...options,
                    blueprint: blueprintRef.current,
                    difficultyOffset: currentList.length,
                    totalPlannedCount: targetCount,
                    isBackgroundFetch: true
                }
            );

            if (!abortRef.current && questions && questions.length > 0) {
                setAllQuestions(prev => {
                    const existingIds = new Set(prev.map(p => p.id || p.question));
                    const uniqueNew = questions.filter(n => !existingIds.has(n.id || n.question));
                    if (uniqueNew.length === 0) return prev;
                    const combined = [...prev, ...uniqueNew];
                    console.log(`[UseQuestionData] Updated questions: ${combined.length}/${targetCount}`);
                    return combined;
                });
            }
        } catch (e) {
            console.error('[UseQuestionData] Background fetch error:', e.message);
        } finally {
            isFetchingRef.current = false;
        }
    };

    // 4. Public Method: Trigger Check
    const checkAndLoadMore = (currentIndex) => {
        setAllQuestions(prevQuestions => {
            const { targetCount } = loadConfigRef.current;
            const remainingBuffer = prevQuestions.length - currentIndex;

            // Background Loading Strategy
            const TRIGGER_THRESHOLD = 2; // Trigger when 2 or fewer remaining
            const BATCH_SIZE = 12; // 一次在背景抓剩下的 12 題

            if (remainingBuffer <= TRIGGER_THRESHOLD && prevQuestions.length < targetCount && !isFetchingRef.current) {
                console.log(`[UseQuestionData] Buffer low (${remainingBuffer}), triggering background load of ${BATCH_SIZE}...`);
                fetchRemainingInBackground(prevQuestions, BATCH_SIZE);
            }
            return prevQuestions;
        });
    };

    // 5. Main Load Method
    const loadQuestions = async (initialQuestions = [], targetCount = 15, options = {}) => {
        // Reset State
        loadConfigRef.current = { targetCount, options };
        setLoadingProgress(0);
        setQuestionsLoaded(false);
        setError(null);
        abortRef.current = false;
        isFetchingRef.current = false;

        // Setup Trivia & Progress Simulation  
        const triviaArrayRef = { current: [] };
        const startTime = Date.now();
        const ESTIMATED_TIME_PER_QUESTION = 800; // [V6] DB 即時選題，估算時間縮短
        const estimatedTotalTime = targetCount * ESTIMATED_TIME_PER_QUESTION;
        let triviaIndex = 0;

        const startProgressSimulation = () => {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (triviaIntervalRef.current) clearInterval(triviaIntervalRef.current);

            progressIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const currentProgress = Math.min(90, (elapsed / estimatedTotalTime) * 100);
                setLoadingProgress(Math.round(currentProgress));
            }, 200);

            triviaIntervalRef.current = setInterval(() => {
                if (triviaArrayRef.current.length > 0) {
                    const msg = `📖 ${triviaArrayRef.current[triviaIndex % triviaArrayRef.current.length]}`;
                    setLoadingMessage(msg);
                }
                triviaIndex++;
            }, 3000);

            setLoadingMessage('🤖 AI 正在研讀經文...');
        };

        try {
            triviaService.generateTrivia(selectedBooks, 5).then(trivia => {
                if (!abortRef.current) triviaArrayRef.current = trivia;
            }).catch(console.error);

            startProgressSimulation();

            let currentQ = initialQuestions ? [...initialQuestions] : [];

            // [V6] DB 即時選題，無 AI 等待，一次拿滿 targetCount 題
            const countNeeded = targetCount - currentQ.length;

            if (countNeeded > 0) {
                console.log(`[UseQuestionData] Initial load: ${countNeeded} questions (with global history seed)`);
                
                const globalExcludes = questionService.getGlobalExcludeList(50);
                const currentExcludes = currentQ.map(q => q.question);
                
                const { questions, blueprint } = await questionService.getQuestionsV2(
                    selectedBooks,
                    countNeeded,
                    options.gameMode || 'classic',
                    [...globalExcludes, ...currentExcludes],
                    options
                );
                if (blueprint && blueprint.length > 0) blueprintRef.current = blueprint;
                currentQ = [...currentQ, ...questions];
            }

            if (currentQ.length < targetCount) {
                const inventoryError = new Error(
                    `目前選擇範圍只有 ${currentQ.length} 題通過品質驗證，尚不足本模式需要的 ${targetCount} 題。請擴大書卷範圍或稍後再試。`
                );
                inventoryError.code = 'INSUFFICIENT_PLAYABLE_INVENTORY';
                inventoryError.availableCount = currentQ.length;
                inventoryError.requiredCount = targetCount;
                throw inventoryError;
            }

            if (abortRef.current) return false;

            setAllQuestions(currentQ);

            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (triviaIntervalRef.current) clearInterval(triviaIntervalRef.current);

            setLoadingProgress(100);
            setLoadingMessage('準備完畢！遊戲開始...');
            setQuestionsLoaded(true);

            // 若因部分書卷 404（無題）導致不足，背景補齊
            setTimeout(() => {
                if (!abortRef.current && currentQ.length < targetCount) {
                    fetchRemainingInBackground(currentQ, 15);
                }
            }, 500);

            return true;

        } catch (err) {
            const inventoryUnavailable = [
                'INSUFFICIENT_DIFFICULTY_INVENTORY',
                'INSUFFICIENT_PLAYABLE_INVENTORY'
            ].includes(err?.code);
            if (inventoryUnavailable) console.warn('Question inventory unavailable:', err.message);
            else console.error('Load failed:', err);
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (triviaIntervalRef.current) clearInterval(triviaIntervalRef.current);
            setError(err);
            setLoadingMessage(
                err?.code === 'INSUFFICIENT_PLAYABLE_INVENTORY'
                    ? '這個範圍的合格題目尚未補齊'
                    : '載入失敗，請重試'
            );
            return false;
        }
    };

    const resetData = () => {
        abortRef.current = true;
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        if (triviaIntervalRef.current) clearInterval(triviaIntervalRef.current);

        setAllQuestions([]);
        setQuestionsLoaded(false);
        setLoadingProgress(0);
        setError(null);
    };

    return {
        allQuestions,
        questions: allQuestions, // Alias
        questionsLoaded,
        loadingMessage,
        loadingProgress,
        error,
        loadQuestions,
        checkAndLoadMore, // Expose for GameLogic
        resetData
    };
}
