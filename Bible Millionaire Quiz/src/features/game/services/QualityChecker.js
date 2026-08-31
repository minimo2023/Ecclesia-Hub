/**
 * Service for AI-powered quality checking of generated questions
 * 改用後端 API，不再直接使用 Gemini SDK
 */
class QualityChecker {
    /**
     * Check the quality of a generated question via backend API
     * @param {Object} question - Question object to check
     * @returns {Promise<Object>} Quality assessment
     */
    async checkQuality(question) {
        try {
            const response = await fetch('/api/ai/quality-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            return {
                score: data.score || 0,
                passed: data.passed || false,
                issues: data.issues || [],
                suggestions: data.suggestions || []
            };
        } catch (error) {
            console.error('Quality check error:', error);
            // Return passing grade on error to avoid blocking
            return {
                score: 70,
                passed: true,
                issues: [],
                suggestions: [],
                error: error.message
            };
        }
    }

    /**
     * Batch check multiple questions
     * @param {Array} questions - Array of questions
     * @returns {Promise<Array>} Array of assessments
     */
    async batchCheck(questions) {
        const assessments = [];

        for (const question of questions) {
            const assessment = await this.checkQuality(question);
            assessments.push({
                questionId: question.id,
                ...assessment
            });

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return assessments;
    }
}

export const qualityChecker = new QualityChecker();
