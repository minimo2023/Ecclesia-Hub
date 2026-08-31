/**
 * ScriptureResolver (v3.2 Sovereign Sync)
 * Bridges the gap between fuzzy player intent and precise biblical coordinates.
 */
class ScriptureResolver {
    constructor(engine) {
        this.engine = engine; // Central Logos brain reference
    }

    /**
     * Resolve player intent to a scripture coordinate
     * @param {string} intent - Player's natural language intent
     * @returns {Promise<Object>} The resolved coordinate
     */
    async resolve(intent) {
        if (!intent) throw new Error('Intent is required for resolution');

        console.log(`🔍 [Logos] Resolving intent via Sovereign Pipe: "${intent}"`);

        try {
            // [SOVEREIGN] 重構：統一使用 askBrain 呼叫，由引擎管理提示詞 (scripture_resolver.md)
            const result = await this.engine.askBrain('scripture_locator', {
                input: intent,
                temperature: 0.1 // 解析任務需要最高精確度
            });

            console.log(`✅ [Logos] Resolved to: ${result.book_id} ${result.chapter}:${result.verse_start}-${result.verse_end} (${result.confidence})`);

            return result;
        } catch (e) {
            console.error('❌ [ScriptureResolver] Resolution failed:', e.message);
            throw e;
        }
    }
}

export { ScriptureResolver };
