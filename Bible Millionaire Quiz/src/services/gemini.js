import apiClient from './ApiClient';

/**
 * Generate expert response via Backend API
 * @param {string} personaKey - 'peter', 'paul', 'mary', etc.
 * @param {object} currentQuestion - The question object (book, question, options, answer)
 * @param {string} currentTime - The current time string (e.g., "02:30")
 * @param {number} minutesSinceLastCall - Minutes since last call
 * @param {object} expertStats - Global stats
 * @param {number} currentEXP - Current EXP
 * @param {number} maxCap - Max Cap
 * @returns {Promise<string>}
 */
export async function generateExpertResponse(
    expert, // Object: {name, focus, persona} or string key if refactoring incomplete
    question,
    currentTime,
    minutesSinceLastCall,
    expertStats = {},
    currentEXP,
    maxCap,
    playerName // New optional argument
) {
    // 1. Construct context on frontend (or delegate to backend logic)
    // To match backend expectation:
    // Backend expects: expert object, question object, time_period, adjusted_exp, max_cap, context_prompt, playerName

    // Determine Time Period for display/logic (simplified here, detailed logic can be on backend or passed)
    const [hours] = currentTime.split(':').map(Number);
    let timePeriod = '未知';
    if (hours >= 6 && hours < 12) timePeriod = '早上';
    else if (hours >= 12 && hours < 18) timePeriod = '下午';
    else if (hours >= 18 && hours < 23) timePeriod = '晚上';
    else timePeriod = '深夜';

    // Construct Context Prompt string to pass to backend
    // (We reuse the logic to ensure backend receives rich context)
    let contextPrompt = `- It is currently ${currentTime} (${timePeriod}).\n`;

    if (minutesSinceLastCall !== null) {
        contextPrompt += minutesSinceLastCall < 5
            ? `- The player called you recently (${Math.floor(minutesSinceLastCall)} mins ago).\n`
            : `- It's been a while since the last call.\n`;
    }

    const totalCalls = expertStats.totalCalls || 0;
    const topicCount = question?.book ? (expertStats.topicCounts?.[question.book] || 0) : 0;
    contextPrompt += `- You have been called ${totalCalls} times in total.\n`;
    contextPrompt += `- You have answered about ${question?.book || 'this book'} ${topicCount} times.\n`;

    const params = {
        expert: expert, // Pass the full expert object as received
        question: {
            question: question?.question || '',
            options: question?.options || [],
            answer: question?.answer || '',
            answerToken: question?.answerToken || null
        },
        time_period: timePeriod,
        adjusted_exp: currentEXP, // Pass base EXP, backend can apply modifiers if needed, or we calculate here
        max_cap: maxCap,
        context_prompt: contextPrompt,
        playerName: playerName // Add playerName to params
    };

    try {
        console.log(`🤖 Consulting Expert (${expert.name}) via BI Backend...`);
        return await apiClient.generateExpertResponse(params);
    } catch (error) {
        console.error("Expert Generation Failed:", error);
        return "（通訊中斷...請稍後再試）";
    }
}
