
/**
 * API Client for Biblical Intelligence Service
 * Handles communication with the local backend (Node.js)
 */

// Use environment variable or default to relative path (empty string) for Single Entry Point
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const getAccessToken = () => sessionStorage.getItem('authToken');

const getAuthHeaders = () => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

class ApiClient {
    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    /**
     * Generate quiz questions via backend AI
     * @param {Object} params 
     * @returns {Promise<Array>}
     */
    async generateQuiz(params) {
        try {
            // Add timeout to prevent infinite loading on slow networks
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(`${this.baseUrl}/api/generate/quiz`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(params),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            return result.data;
        } catch (error) {
            console.error('[ApiClient] Generate Quiz Failed:', error);
            throw error;
        }
    }

    /**
     * Generate expert/NPC response via backend AI
     * @param {Object} params 
     * @returns {Promise<string>}
     */
    async generateExpertResponse(params) {
        try {
            const response = await fetch(`${this.baseUrl}/api/generate/expert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            // Return just the text content
            return result.data.text;
        } catch (error) {
            console.error('[ApiClient] Generate Expert Response Failed:', error);
            throw error;
        }
    }

    /**
     * Verify answer on the server side
     * @param {string} answerToken 
     * @param {number|string} selectedOption 
     * @returns {Promise<Object>} { isCorrect, correctAnswerText, correctAnswerIndex }
     */
    async verifyAnswer(answerToken, selectedOption) {
        try {
            const gameSessionId = sessionStorage.getItem('active_game_reward_session');
            const response = await fetch(`${this.baseUrl}/api/quiz/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ answerToken, selectedOption, gameSessionId })
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            return result;
        } catch (error) {
            console.error('[ApiClient] Verify Answer Failed:', error);
            throw error;
        }
    }

    async recordTimeout(answerToken) {
        const gameSessionId = sessionStorage.getItem('active_game_reward_session');
        const token = getAccessToken();
        if (!gameSessionId || !token || !answerToken) return { success: true, localOnly: true };
        const response = await fetch(`${this.baseUrl}/api/game-sessions/${encodeURIComponent(gameSessionId)}/attempts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ answerToken, selectedOption: null })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error || '無法記錄超時作答');
        }
        return data;
    }

    /**
     * Get 50:50 lifeline hidden options from server
     * @param {string} answerToken 
     * @returns {Promise<Array>} indices to hide
     */
    async getFiftyFifty(answerToken) {
        try {
            const response = await fetch(`${this.baseUrl}/api/quiz/lifeline/5050`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerToken })
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            return result.hiddenOptions;
        } catch (error) {
            console.error('[ApiClient] 50:50 Failed:', error);
            throw error;
        }
    }

    /**
     * Get Audience lifeline stats from server
     * @param {string} answerToken 
     * @param {number} currentLevel 
     * @returns {Promise<Object>} { stats, averageAccuracy }
     */
    async getAudience(answerToken, currentLevel) {
        try {
            const response = await fetch(`${this.baseUrl}/api/quiz/lifeline/audience`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerToken, currentLevel })
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            return { stats: result.stats, averageAccuracy: result.averageAccuracy };
        } catch (error) {
            console.error('[ApiClient] Audience Failed:', error);
            throw error;
        }
    }

    /**
     * Generic GET request
     * @param {string} endpoint 
     * @param {Object} options 
     */
    async get(endpoint, options = {}) {
        try {
            let url = `${this.baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

            // Handle query parameters
            if (options.params) {
                const query = new URLSearchParams(options.params).toString();
                url += `?${query}`;
            }

            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };

            // Add Auth token if available
            const token = getAccessToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers,
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`[ApiClient] GET ${endpoint} failed:`, error);
            throw error;
        }
    }

    /**
     * Ask Logos Engine (Brain)
     * @param {string} taskType - 'game_trivia', 'devotional_guide', etc.
     * @param {Object} context - { book, chapter }
     * @param {Object} options - { forceRefresh, locale, userContext }
     */
    async logosAsk(taskType, context, options = {}) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for AI

            const response = await fetch(`${this.baseUrl}/api/logos/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ taskType, context, options }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `API Error: ${response.statusText}`);
            }

            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('[ApiClient] Logos Ask Failed:', error);
            throw error;
        }
    }
}

const apiClient = new ApiClient();
export default apiClient;
