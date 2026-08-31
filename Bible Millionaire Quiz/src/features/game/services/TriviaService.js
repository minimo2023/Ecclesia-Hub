import { STATIC_TRIVIA } from '../data/staticTrivia';

/**
 * Service for managing Bible trivia facts
 * Now uses a static list of 200 facts instead of AI generation
 */
class TriviaService {
    constructor() {
        this.triviaPool = [...STATIC_TRIVIA];
    }

    /**
     * Get trivia facts (Now 100% Static from Local)
     * @param {Array} bookSelections - IGNORED (Using global static pool)
     * @param {number} count - Number of trivia facts to return
     * @returns {Promise<Array>} Array of trivia strings
     */
    async generateTrivia(bookSelections = [], count = 3) {
        // 1. [SOVEREIGN] Initialize from API only once
        if (!this.isSynced) {
            try {
                const response = await fetch('/api/quiz/trivia?book=Global');
                if (response.ok) {
                    const data = await response.json();
                    // Handle both direct array response or { success, trivia: [] } format
                    const newTrivia = Array.isArray(data) ? data : (data.trivia || []);
                    if (newTrivia.length > 0) {
                        this.triviaPool = newTrivia;
                        this.isSynced = true;
                        console.log(`🚀 [TriviaService] Synced ${this.triviaPool.length} items from backend.`);
                    }
                }
            } catch (e) {
                console.warn('⚠️ [TriviaService] Failed to sync from API, using fallback.');
            }
        }

        // 2. [LOCAL-ONLY] Always serve from current pool
        const shuffled = [...this.triviaPool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }
}

export const triviaService = new TriviaService();
