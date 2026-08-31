/**
 * NarrativeRenderer (v3.2 Sovereign Sync)
 * Synthesizes the final cinematic response based on state and logic flags.
 */
class NarrativeRenderer {
    constructor(engine) {
        this.engine = engine;
    }

    /**
     * Render a single turn via Sovereign AI Pipeline
     * @param {Object} input - Player input
     * @param {Object} state - Current session state
     * @param {Object} anchorResult - Validation from ChronicleAnchor
     */
    async render(input, state, anchorResult) {
        console.log(`🎨 [Logos] Rendering turn via Sovereign Pipe... (Status: ${anchorResult.validation_status})`);

        // 1. Build context-aware prompt data
        const contextData = {
            pacing: state.logic.pacing,
            current_focus: anchorResult.validation_status === 'paradox' ? 'DESTINY_WALL' : 'NORMAL'
        };

        // 2. Build Rich Turn Prompt
        const rawPrompt = `
SESSION_CONTEXT:
- Location: ${state.narrative.current_location}
- Source: ${state.metadata.source}
- Active Beats: ${JSON.stringify(state.logic.immutable_beats.filter(b => !b.is_done))}

LOGIC_GATE:
- Validation: ${anchorResult.validation_status}
- Paradox Reason: ${anchorResult.logic_reason || 'N/A'}

PLAYER_TURN: "${input}"
`;

        try {
            // [SOVEREIGN] 歸一化呼叫：經由主引擎進行分發與計費監控
            const result = await this.engine.askBrain('interaction_engine', {
                ...contextData,
                rawPrompt, // 傳入自定義渲染的 Prompt 內容
                temperature: 0.8
            });

            return result;
        } catch (e) {
            console.error('❌ [NarrativeRenderer] Render failed:', e.message);
            throw e;
        }
    }
}

export { NarrativeRenderer };
