/**
 * Question Generator API - Unified Sovereign Pipeline
 * Redirects all generation requests to QuestionCore
 */
import { Router } from 'express';
import { generateBatch } from '../engine/QuestionCore.js';
import { ExpertService } from '../../../infrastructure/ExpertService.js';
import { verifyAnswerToken } from '../../../utils/tokenHandler.js';
import { requireNewQuestionCorpus } from '../../content/bible/BibleCorpusPolicy.js';
import { authenticateToken, optionalAuthenticateToken } from '../../../middleware/auth.js';
import { aiExpertIpLimiter, aiUserLimiter } from '../../../middleware/rateLimiter.js';

const router = Router();
const MAX_BATCH_COUNT = 15;
const MAX_BOOK_SELECTIONS = 10;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/**
 * POST /api/generate/expert
 * 專家求助 API。訪客可用，但必須提出伺服器簽發的答案 token。
 */
router.post('/expert', optionalAuthenticateToken, aiExpertIpLimiter, aiUserLimiter, async (req, res) => {
    try {
        const { expert, question, context_prompt, playerName } = req.body;
        if (!expert || typeof expert !== 'object' || typeof expert.name !== 'string' || expert.name.length > 80) {
            return res.status(400).json({ success: false, error: 'INVALID_EXPERT' });
        }
        if (!question || typeof question !== 'object' || typeof question.question !== 'string') {
            return res.status(400).json({ success: false, error: 'INVALID_QUESTION' });
        }
        if (question.question.length > 1000
            || !Array.isArray(question.options)
            || question.options.length < 2
            || question.options.length > 6
            || question.options.some(option => typeof option !== 'string' || option.length > 500)) {
            return res.status(400).json({ success: false, error: 'QUESTION_PAYLOAD_TOO_LARGE' });
        }
        if (typeof context_prompt === 'string' && context_prompt.length > 4000) {
            return res.status(400).json({ success: false, error: 'CONTEXT_TOO_LARGE' });
        }

        const decoded = verifyAnswerToken(question.answerToken);
        if (!req.user && !decoded) {
            return res.status(400).json({ success: false, error: 'INVALID_ANSWER_TOKEN' });
        }

        const advice = await ExpertService.generateAdvice({
            expert,
            question: {
                ...question,
                answer: decoded?.answer ?? question.answer,
                correctIndex: decoded?.correctIndex ?? question.correctIndex
            },
            playerName,
            contextPrompt: context_prompt
        });
        res.json({ success: true, data: { text: advice } });
    } catch (error) {
        console.error('Expert route error:', error);
        res.status(500).json({ error: error.message });
    }
});

// All remaining generation endpoints stay member-only.
router.use(authenticateToken, aiUserLimiter);

/**
 * POST /api/generate/v2/quiz-batch
 * 批次出題 (由 QuestionCore 接管)
 */
router.post('/quiz-batch', async (req, res) => {
    try {
        const { bookSelections, count = 15, difficulty = 'medium' } = req.body;
        if (!Array.isArray(bookSelections) || bookSelections.length === 0 || bookSelections.length > MAX_BOOK_SELECTIONS) {
            return res.status(400).json({ success: false, error: 'INVALID_BOOK_SELECTIONS' });
        }

        const requestedCount = Number.parseInt(count, 10);
        if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > MAX_BATCH_COUNT) {
            return res.status(400).json({ success: false, error: 'INVALID_QUESTION_COUNT' });
        }

        if (!ALLOWED_DIFFICULTIES.has(difficulty)) {
            return res.status(400).json({ success: false, error: 'INVALID_DIFFICULTY' });
        }

        const normalizedSelections = bookSelections.map((selection) => ({
            book: String(selection?.book || '').trim(),
            startChapter: Number.parseInt(selection?.startChapter || '1', 10),
        }));
        if (normalizedSelections.some((selection) => !selection.book || selection.book.length > 80 || selection.startChapter < 1)) {
            return res.status(400).json({ success: false, error: 'INVALID_BOOK_SELECTION' });
        }

        console.log(`🚀 [Generator] Batch Generation via QuestionCore: ${requestedCount} questions`);
        await requireNewQuestionCorpus(req.body?.version || 'CUV_TRAD');

        const allQuestions = [];
        for (const select of normalizedSelections) {
            const batchCount = Math.ceil(requestedCount / normalizedSelections.length);
            const batch = await generateBatch({
                book: select.book,
                chapter: select.startChapter || 1,
                count: batchCount,
                targetDifficulty: difficulty
            });
            allQuestions.push(...batch);
        }

        res.json({
            success: true,
            data: allQuestions.slice(0, requestedCount),
            metadata: {
                requested: requestedCount,
                generated: allQuestions.length
            }
        });
    } catch (error) {
        console.error('Quiz batch error:', error);
        const productionBlocked = error.code === 'NEW_QUESTION_PRODUCTION_DISABLED'
            || error.code === 'CORPUS_EVIDENCE_DISABLED'
            || error.code === 'CORPUS_INCOMPLETE';
        res.status(productionBlocked ? 503 : 500).json({ error: error.message, code: error.code || 'GENERATION_FAILED' });
    }
});

export default router;
