import logosEngine from '../../../../infrastructure/ai/LogosEngine.js';

/**
 * 評估玩家輸入的主題，並將其對位至正典經文。
 * 這是「動態場景管線」的守門員 (Evaluator v3.2 Sovereign Sync)。
 * @param {string} topic 玩家輸入的開放性主題或關鍵字
 * @returns {Promise<Object>} 結構化 JSON 判定結果
 */
export async function evaluateTopic(topic) {
    if (!topic) throw new Error('Topic is required for evaluation');

    console.log(`🔍 [Logos] Evaluating topic via Sovereign Pipe: "${topic}"`);

    try {
        // [SOVEREIGN] 歸一化：由主引擎單例進行任務分發，自動掛載 1000 元預算標籤
        const result = await logosEngine.askBrain('topic_evaluator', {
            input: topic,
            temperature: 0.1 // 確保輸出穩定
        });

        return result;
    } catch (error) {
        console.error('[EvaluatorService] Sovereign Brain failed:', error.message);
        throw new Error('Failed to evaluate topic via LLM Sovereign Hub');
    }
}
