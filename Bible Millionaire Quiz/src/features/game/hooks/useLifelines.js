import { useState } from 'react';
import apiClient from '../../../services/ApiClient';

export function useLifelines() {
    const [lifelineStatus, setLifelineStatus] = useState({
        fiftyFifty: true,
        phoneFriend: true,
        askAudience: true
    });

    const [expertCallsThisGame, setExpertCallsThisGame] = useState(0);

    const [hiddenOptions, setHiddenOptions] = useState([]);
    const [fiftyFiftyAnimating, setFiftyFiftyAnimating] = useState(false);
    const [focusedOptionIndex, setFocusedOptionIndex] = useState(-1);
    const [activeModal, setActiveModal] = useState(null);
    const [audienceRestoreLevel, setAudienceRestoreLevel] = useState(0);

    /**
     * Execute 50/50 lifeline via Server
     */
    const handleFiftyFifty = async (currentQuestion, bypassCheck = false) => {
        if (!bypassCheck && !lifelineStatus.fiftyFifty) return;

        setLifelineStatus(prev => ({ ...prev, fiftyFifty: false }));
        setFiftyFiftyAnimating(true);

        try {
            const indicesToHide = await apiClient.getFiftyFifty(currentQuestion.answerToken);

            let jumps = 0;
            const maxJumps = 16;

            const optionQueue = [];
            for (let i = 0; i < maxJumps / 4; i++) {
                optionQueue.push(0, 1, 2, 3);
            }
            optionQueue.sort(() => Math.random() - 0.5);

            const animate = () => {
                if (jumps >= maxJumps) {
                    setFiftyFiftyAnimating(false);
                    setFocusedOptionIndex(-1);
                    setHiddenOptions(indicesToHide);
                    return;
                }

                setFocusedOptionIndex(optionQueue[jumps]);
                jumps++;

                let delay = 80;
                if (jumps > maxJumps * 0.6) {
                    delay = 180;
                } else if (jumps > maxJumps * 0.3) {
                    delay = 120;
                }

                setTimeout(animate, delay);
            };

            animate();
        } catch (error) {
            console.error('50:50 Server Error:', error);
            setFiftyFiftyAnimating(false);
        }
    };

    /**
     * Execute Ask Audience lifeline via Server
     */
    const handleAskAudience = async (currentQuestion, currentLevel = 0, bypassCheck = false) => {
        if (!bypassCheck && !lifelineStatus.askAudience) return;
        setLifelineStatus(prev => ({ ...prev, askAudience: false }));

        try {
            const result = await apiClient.getAudience(currentQuestion.answerToken, currentLevel);
            setActiveModal({
                type: 'audience',
                data: result.stats,
                averageAccuracy: result.averageAccuracy
            });
        } catch (error) {
            console.error('Ask Audience Server Error:', error);
        }
    };

    /**
     * Open Phone a Friend selection modal
     */
    const openPhoneFriend = (bypassCheck = false) => {
        if (!bypassCheck && !lifelineStatus.phoneFriend) return;
        setActiveModal({ type: 'phone-select' });
        // [SOVEREIGN 1.5] Moved deduction to selectExpert to ensure non-deduct on failure
    };

    /**
     * Select expert for Phone a Friend
     * Uses dynamic imports to avoid bundle issues
     */
    const selectExpert = async (expert, currentQuestion, user = null, coinSystem = null, refreshUser = null) => {
        // [SOVEREIGN] 依據需求：智匯點數 (AI Token) 也是「每局新開」
        // expertCallsThisGame 代表這是本局的第幾次呼叫 (0 = 首次)
        
        let aiPointsToDeduct = 0;
        if (expertCallsThisGame === 3) aiPointsToDeduct = 1;      // 第 4 次
        else if (expertCallsThisGame === 4) aiPointsToDeduct = 2; // 第 5 次
        else if (expertCallsThisGame === 5) aiPointsToDeduct = 4; // 第 6 次
        else if (expertCallsThisGame >= 6) aiPointsToDeduct = 8;  // 第 7 次起

        const isAiTokenCost = aiPointsToDeduct > 0;

        if (isAiTokenCost) {
            if (!user) {
                alert('今日免費求助額度已滿，使用進階求助需要登入。');
                return;
            }
            try {
                // [SOVEREIGN] token 統一由 sessionStorage 取得，與整個游戲系統一致
                const token = sessionStorage.getItem('authToken');
                const response = await fetch('/api/users/credits/spend', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'expert_lifeline',
                        gameSessionId: sessionStorage.getItem('active_game_reward_session'),
                        requestId: globalThis.crypto?.randomUUID?.()
                            || `expert_${Date.now()}_${Math.random().toString(36).slice(2)}`
                    })
                });
                const data = await response.json();
                if (!data.success || data.error) {
                    alert(`需要 ${aiPointsToDeduct} 點智匯點數來呼叫專家！餘額不足。`);
                    return;
                }
                // [FIX] 扣點成功後立即刷新 user 物件，讓 UI 即時更新
                if (refreshUser) await refreshUser();
            } catch (err) {
                console.error("Failed to deduct AI points:", err);
                alert('扣除智匯點數失敗，請稍後再試。');
                return;
            }
        }

        // [SOVEREIGN] 金幣扣除邏輯由 GameManager 控制 (逐次 15, 30...)
        
        // 紀錄本局使用的次數，讓 GameManager 可以計算下一次的金幣成本
        setExpertCallsThisGame(prev => prev + 1);

        const delayPromise = new Promise(resolve => setTimeout(resolve, 3000));

        const getFallbackResponse = () => {
            const answer = currentQuestion.answer;
            const optionIndex = currentQuestion.options.indexOf(answer);
            const optionLetter = String.fromCharCode(65 + optionIndex);

            const nickname = user?.displayName || '朋友';

            const messages = [
                `${nickname}，這題我很有把握，答案絕對是 ${optionLetter}。`,
                `${nickname}，根據經文，${optionLetter} 是唯一正確的答案。`,
                `${nickname}，這題很簡單，選 ${optionLetter} 就對了！`,
                `相信我，${nickname}，標準答案就是 ${optionLetter}。`
            ];

            return messages[Math.floor(Math.random() * messages.length)];
        };

        let message = "";
        try {
            // Dynamic import to avoid circular dependencies
            const { generateExpertResponse } = await import('../../../services/gemini');

            const now = new Date();
            const timeString = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

            const nickname = user?.displayName || user?.username || null;

            const aiResponse = await generateExpertResponse(
                expert,
                currentQuestion,
                timeString,
                null, // minutesSinceLastCall 
                {}, // expertStats
                expert.initialEXP?.[currentQuestion.book] || 30,
                expert.stats?.[currentQuestion.book] || 70,
                nickname // New parameter
            );

            // [SOVEREIGN 1.5] Only deduct if response is successful
            const isFailure = !aiResponse || 
                             aiResponse.includes('通訊') || 
                             aiResponse.includes('訊號') || 
                             aiResponse.includes('接聽') || 
                             aiResponse.includes('語音') || 
                             aiResponse.includes('忙碌');
                             
            if (!isFailure) {
                setLifelineStatus(prev => ({ ...prev, phoneFriend: false }));
                // 不再紀錄跨局的 callsToday，只依賴 expertCallsThisGame (在 GameManager 處理)
            }

            message = aiResponse || getFallbackResponse();
        } catch (error) {
            console.error("AI generation failed, using fallback", error);
            message = getFallbackResponse();
        }

        await delayPromise;

        setActiveModal({
            type: 'phone',
            data: {
                name: expert.name,
                message: message,
                avatar: expert.avatar
            }
        });
    };

    /**
     * Close active modal
     */
    const closeModal = () => {
        setActiveModal(null);
    };

    /**
     * Reset all lifelines to initial state
     */
    const resetLifelines = () => {
        setLifelineStatus({
            fiftyFifty: true,
            phoneFriend: true,
            askAudience: true
        });
        setExpertCallsThisGame(0);
        setHiddenOptions([]);
        setFiftyFiftyAnimating(false);
        setFocusedOptionIndex(-1);
        setActiveModal(null);
    };

    /**
     * Restore a single lifeline (used with coin redemption)
     */
    const restoreLifeline = (lifelineType, currentLevel = 0) => {
        const lifelineMap = {
            'fiftyFifty': 'fiftyFifty',
            'askExpert': 'phoneFriend',
            'phoneFriend': 'phoneFriend',
            'audiencePoll': 'askAudience',
            'askAudience': 'askAudience'
        };
        const key = lifelineMap[lifelineType];
        if (key) {
            setLifelineStatus(prev => ({ ...prev, [key]: true }));

            // Reset audience accuracy baseline if audience lifeline is restored
            if (key === 'askAudience') {
                setAudienceRestoreLevel(currentLevel);
                console.log(`🔄 Audience Lifeline Restored at Level ${currentLevel}`);
            }
        }
    };

    return {
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
        resetLifelines,
        restoreLifeline,
        setHiddenOptions,
        setFocusedOptionIndex,
        expertCallsThisGame
    };
}
