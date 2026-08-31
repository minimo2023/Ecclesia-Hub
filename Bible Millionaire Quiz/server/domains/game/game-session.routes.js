import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { verifyAnswerToken } from '../../utils/tokenHandler.js';
import { isVerifiedAnswerCorrect } from '../../utils/answerVerification.js';
import {
    abandonGameSession,
    createGameSession,
    getGameSession,
    recordVerifiedAttempt,
    settleGameSession,
    toSafeGameRewardError
} from './rewards/GameRewardService.js';

const router = express.Router();
router.use(authenticateToken);

const handleError = (res, error, context) => {
    const safe = toSafeGameRewardError(error);
    if (safe.status >= 500) console.error(`[GameSession] ${context}:`, error);
    return res.status(safe.status).json({ success: false, error: safe.code, message: safe.message });
};

router.post('/', async (req, res) => {
    try {
        const session = await createGameSession(req.user.userId, req.body || {});
        return res.status(201).json({
            success: true,
            session: {
                id: session.id,
                mode: session.mode,
                questionCount: Number(session.questionCount),
                status: session.status,
                expiresAt: session.expiresAt
            }
        });
    } catch (error) {
        return handleError(res, error, 'create');
    }
});

router.post('/:sessionId/attempts', async (req, res) => {
    try {
        const decoded = verifyAnswerToken(req.body?.answerToken);
        if (!decoded) {
            return res.status(400).json({ success: false, error: 'INVALID_ANSWER_TOKEN' });
        }
        const isCorrect = isVerifiedAnswerCorrect(decoded, req.body?.selectedOption);
        const attempt = await recordVerifiedAttempt(
            req.user.userId,
            req.params.sessionId,
            decoded,
            isCorrect,
            {
                selectedOption: req.body?.selectedOption,
                responseMs: req.body?.responseMs
            }
        );
        return res.json({ success: true, isCorrect, ...attempt });
    } catch (error) {
        return handleError(res, error, 'attempt');
    }
});

router.post('/:sessionId/settle', async (req, res) => {
    try {
        const result = await settleGameSession(
            req.user.userId,
            req.params.sessionId,
            req.body?.reason
        );
        return res.json(result);
    } catch (error) {
        return handleError(res, error, 'settle');
    }
});

router.post('/:sessionId/abandon', async (req, res) => {
    try {
        return res.json(await abandonGameSession(req.user.userId, req.params.sessionId));
    } catch (error) {
        return handleError(res, error, 'abandon');
    }
});

router.get('/:sessionId', async (req, res) => {
    try {
        return res.json({ success: true, session: await getGameSession(req.user.userId, req.params.sessionId) });
    } catch (error) {
        return handleError(res, error, 'get');
    }
});

export default router;
