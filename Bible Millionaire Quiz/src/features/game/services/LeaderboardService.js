import { database } from './database/DatabaseAdapter';
import { COLLECTIONS } from '../config/collections';

/**
 * Service for managing leaderboard scores
 */
class LeaderboardService {
    constructor() {
        this.collection = COLLECTIONS.LEADERBOARD;
    }

    /**
     * Save a score to database
     * @param {Object} scoreData - Score data to save
     * @param {string} scoreData.name - Player name
     * @param {number} scoreData.score - Player score
     * @param {boolean} scoreData.isVictory - Whether this was a complete victory
     * @param {string} scoreData.date - ISO date string
     */
    async saveScore(scoreData) {
        // Scores are persisted by the server when a verified game session is
        // settled. Keeping this method as a compatibility no-op prevents older
        // result screens from attempting a client-authoritative write.
        console.info('Leaderboard is server-managed; client score submission skipped.', {
            isVictory: Boolean(scoreData?.isVictory)
        });
        return 'server-managed';
    }

    /**
     * Get top scores from database
     * @param {number} limitCount - Number of top scores to retrieve
     * @returns {Promise<Array>} Array of score objects
     */
    async getTopScores(limitCount = 50) {
        try {
            const allScores = await database.query(this.collection);

            // Sort by score descending and limit
            const topScores = allScores
                .sort((a, b) => b.score - a.score)
                .slice(0, limitCount);

            console.log(`📊 Retrieved ${topScores.length} scores from database`);
            return topScores;
        } catch (error) {
            console.error('❌ Failed to load leaderboard scores:', error);
            return []; // Return empty array on error
        }
    }
}

export const leaderboardService = new LeaderboardService();

