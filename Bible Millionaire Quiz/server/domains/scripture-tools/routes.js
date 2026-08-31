import express from 'express';
import orderLabRoutes from './order.routes.js';
import recordingRoutes from './recording.routes.js';
import {
    buildScriptureSearchQuery,
    searchScripture,
    sendScriptureSearchError
} from '../content/bible/ScriptureContentService.js';

const router = express.Router();
const ORDER_ENABLED = process.env.SCRIPTURE_ORDER_ENABLED === 'true'
    || process.env.SCRIPTURE_ORDER_LAB_ENABLED === 'true'
    || (process.env.NODE_ENV !== 'production'
        && process.env.SCRIPTURE_ORDER_ENABLED !== 'false'
        && process.env.SCRIPTURE_ORDER_LAB_ENABLED !== 'false');
const RECORDINGS_ENABLED = process.env.SCRIPTURE_RECORDINGS_ENABLED === 'true';
const COMMUNITY_ENABLED = RECORDINGS_ENABLED && process.env.SCRIPTURE_COMMUNITY_ENABLED === 'true';

if (ORDER_ENABLED) {
    router.use('/order', orderLabRoutes);
} else {
    router.use('/order', (_req, res) => res.status(404).json({
        success: false,
        error: 'SCRIPTURE_ORDER_DISABLED',
        message: '經文四宮格目前未開放'
    }));
}

if (RECORDINGS_ENABLED) {
    router.use((req, res, next) => {
        if (!COMMUNITY_ENABLED && (req.path.startsWith('/community') || req.path.startsWith('/notifications') || req.path.startsWith('/moderation'))) {
            return res.status(404).json({ success: false, error: 'SCRIPTURE_COMMUNITY_DISABLED' });
        }
        return next();
    });
    router.use('/', recordingRoutes);
}

export { buildScriptureSearchQuery };

router.get('/status', (_req, res) => {
    res.json({
        success: true,
        features: {
            readAloud: 'available',
            localRecording: RECORDINGS_ENABLED ? 'member_only' : 'disabled',
            scriptureSearch: 'available',
            personalRecords: RECORDINGS_ENABLED ? 'available' : 'disabled',
            sharing: RECORDINGS_ENABLED ? 'available' : 'disabled',
            community: COMMUNITY_ENABLED ? 'available' : 'disabled',
            groups: 'not_planned',
            nearbyChurches: process.env.CCNDA_API_KEY ? 'provider_configured' : 'planned',
            scriptureOrder: ORDER_ENABLED ? 'available' : 'disabled'
        }
    });
});

router.get('/search', async (req, res) => {
    try {
        const result = await searchScripture({
            query: req.query.q,
            version: req.query.version,
            book: req.query.book,
            limit: req.query.limit
        });
        res.json({ success: true, ...result });
    } catch (error) {
        sendScriptureSearchError(res, error);
    }
});

export default router;
