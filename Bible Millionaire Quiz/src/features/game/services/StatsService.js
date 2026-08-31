import { database } from './database/DatabaseAdapter';
import { COLLECTIONS } from '../config/collections';

/**
 * Service for tracking question statistics via Event Sourcing
 * Simplified to only log events, avoiding complex client-side logic and permission issues.
 */
class StatsService {
    constructor() {
        this.attemptsCollection = COLLECTIONS.ATTEMPTS;
        this.questionsCollection = COLLECTIONS.QUESTIONS;
    }

    /**
     * Record a question attempt (answer) - Event Sourcing Style
     * Simply logs the attempt. Backend scripts will handle aggregation.
     * @param {string} questionId - Question ID
     * @param {boolean} isCorrect - Whether answer was correct
     * @param {number} level - Game level (1-15)
     */
    async recordAttempt(questionId, isCorrect, level) {
        if (!questionId) {
            console.error("❌ recordAttempt: Missing questionId!");
            return;
        }

        try {
            const attemptData = {
                questionId: String(questionId),
                isCorrect: Boolean(isCorrect),
                level: Number(level),
                timestamp: new Date().toISOString(),
                clientTimestamp: Date.now()
            };

            // 🛡️ [Security Check] Only record to server if the active auth session exists
            if (sessionStorage.getItem('authToken')) {
                await database.add(this.attemptsCollection, attemptData);
                console.log(`📝 Logged attempt for ${questionId} (Correct: ${isCorrect})`);
            } else {
                console.log(`📝 [Guest Mode] Attempt logged locally for ${questionId}`);
            }
        } catch (error) {
            // Silently fail or log warning, don't crash the game
            console.warn('⚠️ Failed to log attempt (non-critical):', error);
        }
    }

    /**
     * Save a question to database
     * Simplified: Only saves the question. Stats initialization is handled by backend.
     * @param {Object} question - Question object
     */
    async saveQuestionWithStats(question, wasAnsweredCorrectly, level) {
        try {
            // 1. Save question to questions collection (if not exists)
            const existingQuestion = await database.get(this.questionsCollection, question.id);

            if (!existingQuestion) {
                await database.save(this.questionsCollection, question.id, {
                    book: question.book,
                    chapter: question.chapter,
                    difficulty: question.difficulty,
                    question: question.question,
                    options: question.options,
                    answer: question.answer,
                    createdAt: Date.now(),
                    verified: false,
                    source: question.source || 'ai'
                });
                console.log(`💾 Saved new question: ${question.id}`);
            }

            // 2. Log the initial attempt
            await this.recordAttempt(question.id, wasAnsweredCorrectly, level);

        } catch (error) {
            console.error('Error saving question:', error);
        }
    }

    // Deprecated: Logic moved to backend scripts
    async checkAndAdjustDifficulty(_questionId, _correctRate, _currentDifficulty) {
        // No-op
    }
}

export const statsService = new StatsService();

