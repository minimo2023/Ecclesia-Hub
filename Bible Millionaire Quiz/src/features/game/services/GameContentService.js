/**
 * Game Content Service (Frontend)
 * 
 * Interface to the Logos Engine for game content generation.
 */

import apiClient from '../../../services/ApiClient';

class GameContentService {

    /**
     * Generate a trivia question for a specific game level
     * @param {string} book - Bible Book (e.g., 'Gen')
     * @param {number} chapter - Chapter number
     * @param {string} difficulty - 'easy', 'medium', 'hard'
     * @param {string} locale - 'zh-TW' or 'en'
     * @param {string} userContext - Optional audience context
     */
    async generateTrivia(book, chapter, difficulty = 'medium', locale = 'zh-TW', userContext = null) {
        try {
            const context = { book, chapter };
            // Pass difficulty as part of userContext string for now, or we can update backend schema to accept it explicitly.
            // Backend schema has 'difficulty' in output, but LogosEngine instructions inject it via context?
            // Let's prepend difficulty to userContext to guide the Brain.

            const enhancedContext = `Difficulty: ${difficulty}. ${userContext || ''}`;

            const result = await apiClient.logosAsk('game_trivia', context, {
                locale,
                userContext: enhancedContext
            });

            return result; // Expected: { question, options, answer, difficulty, explanation }

        } catch (error) {
            console.error('[GameContent] Generate Trivia Failed:', error);
            return null; // Handle fallback in UI
        }
    }
}

export const gameContentService = new GameContentService();
