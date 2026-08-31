/**
 * CompletionCheck
 * Logic to determine if a narrative session should transition to the Epilogue.
 */
class CompletionCheck {
    /**
     * Check if the scene is complete
     * @param {Object} state - Current session state
     * @returns {boolean}
     */
    isFinished(state) {
        // Simple logic: check the AI flagged is_complete or all beats are done
        const beatsDone = state.logic.immutable_beats.every(b => b.is_done);
        return state.logic.is_complete || beatsDone;
    }
}

export const completionCheck = new CompletionCheck();
