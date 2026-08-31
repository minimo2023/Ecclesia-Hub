import express from 'express';
import { optionalAuthenticateToken } from '../../middleware/auth.js';
import { EconomyError } from '../economy/AssetLedgerService.js';
import { OrderLabError, OrderLabService } from './order-service.js';

const router = express.Router();

router.use(optionalAuthenticateToken);

function send(res, data, status = 200) {
    res.status(status).json({ success: true, data });
}

function route(handler) {
    return async (req, res) => {
        try {
            await handler(req, res);
        } catch (error) {
            const known = error instanceof OrderLabError || error instanceof EconomyError;
            if (!known) console.error('[ScriptureOrderLab]', error);
            res.status(known ? error.status : 500).json({
                success: false,
                error: known ? error.code : 'ORDER_LAB_FAILED',
                message: known ? error.message : '經文四宮格暫時無法使用'
            });
        }
    };
}

router.get('/bootstrap', route(async (req, res) => {
    send(res, await OrderLabService.bootstrap(req));
}));

router.get('/passages', route(async (_req, res) => {
    send(res, { passages: await OrderLabService.passages() });
}));

router.get('/history', route(async (req, res) => {
    send(res, await OrderLabService.personalHistory(req, req.query || {}));
}));

router.get('/chapter', route(async (req, res) => {
    send(res, await OrderLabService.chapter(req.query || {}));
}));

router.post('/custom-preview', route(async (req, res) => {
    send(res, await OrderLabService.customPreview(req.body || {}));
}));

router.post('/sessions', route(async (req, res) => {
    send(res, await OrderLabService.createSession(req, req.body || {}), 201);
}));

router.post('/sessions/:id/selections', route(async (req, res) => {
    send(res, await OrderLabService.select(req, req.params.id, req.body || {}));
}));

router.post('/sessions/:id/resume', route(async (req, res) => {
    send(res, await OrderLabService.resume(req, req.params.id, req.body || {}));
}));

router.post('/sessions/:id/hints', route(async (req, res) => {
    send(res, await OrderLabService.hint(req, req.params.id, req.body || {}));
}));

router.post('/sessions/:id/demo', route(async (req, res) => {
    send(res, await OrderLabService.demo(req, req.params.id, req.body || {}));
}));

router.post('/sessions/:id/abandon', route(async (req, res) => {
    send(res, await OrderLabService.abandon(req, req.params.id, req.body || {}));
}));

router.post('/sessions/:id/forfeit', route(async (req, res) => {
    send(res, await OrderLabService.forfeit(req, req.params.id, req.body || {}));
}));

router.post('/sessions/:id/publish', route(async (req, res) => {
    send(res, await OrderLabService.publish(req, req.params.id, req.body || {}));
}));

router.get('/lab-leaderboard', route(async (req, res) => {
    send(res, await OrderLabService.leaderboard(req.query.scope));
}));

router.post('/lab-shares', route(async (req, res) => {
    send(res, await OrderLabService.createShare(req, req.body || {}), 201);
}));

router.get('/lab-shares/:token', route(async (req, res) => {
    send(res, await OrderLabService.getShare(req.params.token));
}));

export default router;
