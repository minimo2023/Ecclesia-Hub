/**
 * SegmentationEngine (v3.2 Sovereign Sync)
 * Analyzes scripture content for storyability and cuts it into playable beats.
 */
class SegmentationEngine {
    constructor(engine) {
        this.engine = engine; // Central Logos brain reference
    }

    /**
     * Assess a passage and generate an initial blueprint via Sovereign AI Pipe
     * @param {Object} coordinate - The scripture info { book_id, chapter, etc }
     * @param {string} content - The actual fiber of the text
     * @returns {Promise<Object>} The assessment result
     */
    async assess(coordinate, content) {
        console.log(`🎬 [Logos] Assessing narrative potential via Sovereign Pipe for ${coordinate.book_id} ${coordinate.chapter}...`);

        // [SOVEREIGN] 準備 context，交由 askBrain 的中央提示詞管理 (passage_assessment.md)
        const contextData = {
            book_id: coordinate.book_id,
            chapter: coordinate.chapter,
            verse_range: `${coordinate.verse_start}-${coordinate.verse_end}`,
            content: content
        };

        try {
            // [SOVEREIGN] 統一使用 askBrain 呼叫，由引擎管理提示詞與計費標籤
            const result = await this.engine.askBrain('scene_assessor', contextData);

            console.log(`✅ [Logos] Assessment complete. Mode: ${result.recommended_mode}, Score: ${result.dramatic_score}`);

            return result;
        } catch (e) {
            console.error('❌ [SegmentationEngine] Assessment failed:', e.message);
            // 發生錯誤時的安全回退：標記為非故事內容，避免崩潰
            return {
                recommended_mode: 'non_story_content',
                reason: 'Internal assessment engine error'
            };
        }
    }
}

export { SegmentationEngine };
