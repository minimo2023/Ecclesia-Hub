/**
 * Logos Engine API Routes
 *
 * "The central nervous system connecting the body (Frontend) to the brain (LogosEngine)."
 */

import express from 'express';
import logosEngine from '../../../infrastructure/ai/LogosEngine.js';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();
const PUBLIC_LOGOS_TASKS = new Set(['game_trivia']);

// Rate limiter for AI endpoints (Prevent abuse)
const logosLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { success: false, error: 'Too many requests to Logos Engine, please try again later.' }
});

// POST /api/logos/ask
// The unified entry point for intelligent tasks.
router.post('/ask', logosLimiter, async (req, res) => {
    try {
        const { taskType, context, options } = req.body;

        if (!PUBLIC_LOGOS_TASKS.has(taskType)) {
            return res.status(400).json({ success: false, error: 'Unsupported taskType' });
        }

        const book = typeof context?.book === 'string' ? context.book.trim() : '';
        const chapter = Number(context?.chapter);
        if (!book || book.length > 80 || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
            return res.status(400).json({ success: false, error: 'Missing biblical context (book/chapter)' });
        }

        // Delegate to Brain (Sovereign Sync: Use the singleton instance)
        const result = await logosEngine.askBrain(taskType, { ...context, book, chapter }, options);

        // Return standardized response
        res.json({
            success: true,
            task: taskType,
            data: result
        });

    } catch (error) {
        console.error('❌ [Logos API] Error:', error);
        res.status(500).json({
            success: false,
            error: 'LOGOS_ENGINE_ERROR'
        });
    }
});

export default router;
