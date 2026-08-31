import express from 'express';
import { authenticateToken, optionalAuthenticateToken } from '../../../middleware/auth.js';
import { EconomyError } from '../../economy/AssetLedgerService.js';
import {
    ScriptureRainError,
    createScriptureRainSession,
    forfeitScriptureRainSession,
    recordScriptureRainEvent,
    scriptureRainBootstrap,
    scriptureRainChapter,
    scriptureRainPreview,
    startScriptureRainSession,
    spendScriptureRainHint
} from './service.js';

const router = express.Router();
router.use(optionalAuthenticateToken);

function sendError(res, error) {
    if (error instanceof ScriptureRainError || error instanceof EconomyError) {
        return res.status(error.status || 400).json({
            success: false,
            error: error.code,
            message: error.message
        });
    }
    console.error('[ScriptureRain] Unexpected error:', error);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: '經文雨服務暫時無法使用' });
}

router.get('/bootstrap', (_req, res) => {
    res.json({ success: true, ...scriptureRainBootstrap() });
});

router.get('/chapter', async (req, res) => {
    try {
        const chapter = await scriptureRainChapter(req.query || {});
        res.json({ success: true, chapter });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/preview', async (req, res) => {
    try {
        const preview = await scriptureRainPreview(req.body || {});
        res.json({ success: true, preview });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/sessions', async (req, res) => {
    try {
        const session = await createScriptureRainSession(req, req.body || {});
        res.status(201).json({ success: true, session });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/sessions/:sessionId/start', async (req, res) => {
    try {
        const result = await startScriptureRainSession(req, req.params.sessionId, req.body || {});
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/sessions/:sessionId/forfeit', async (req, res) => {
    try {
        const result = await forfeitScriptureRainSession(req, req.params.sessionId, req.body || {});
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/sessions/:sessionId/events', async (req, res) => {
    try {
        const result = await recordScriptureRainEvent(req, req.params.sessionId, req.body || {});
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/sessions/:sessionId/hints', authenticateToken, async (req, res) => {
    try {
        const result = await spendScriptureRainHint({
            userId: req.user.userId,
            sessionId: req.params.sessionId,
            requestId: req.body?.requestId
        });
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error);
    }
});

export default router;
