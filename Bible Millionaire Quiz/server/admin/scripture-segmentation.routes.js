import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
    SegmentationCruiseError,
    cancelSegmentationCruise,
    pauseSegmentationCruise,
    resumeSegmentationCruise,
    segmentationCruiseExceptions,
    segmentationCruiseOverview,
    startSegmentationCruise
} from '../domains/scripture-tools/segmentation-cruise-service.js';

const router = express.Router();
const adminOnly = [authenticateToken, requireRole(['super_admin', 'admin_ops', 'admin_content'])];

function sendError(res, error) {
    const status = error instanceof SegmentationCruiseError ? error.status : 500;
    res.status(status).json({
        success: false,
        error: error?.code || 'SCRIPTURE_SEGMENTATION_ADMIN_FAILED',
        message: status === 500 ? '切片巡航管理操作失敗' : error.message
    });
}

router.get('/overview', ...adminOnly, async (_req, res) => {
    try {
        res.json({ success: true, ...(await segmentationCruiseOverview()) });
    } catch (error) {
        sendError(res, error);
    }
});

router.get('/exceptions', ...adminOnly, async (req, res) => {
    try {
        const items = await segmentationCruiseExceptions({
            runId: req.query.runId || null,
            limit: req.query.limit,
            offset: req.query.offset
        });
        res.json({ success: true, items });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/runs', ...adminOnly, async (req, res) => {
    try {
        const run = await startSegmentationCruise({
            dryRun: req.body?.dryRun !== false,
            batchSize: req.body?.batchSize,
            createdBy: req.user?.userId || null
        });
        res.status(202).json({ success: true, run });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/runs/:id/pause', ...adminOnly, async (req, res) => {
    try {
        res.json({ success: true, run: await pauseSegmentationCruise(req.params.id) });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/runs/:id/resume', ...adminOnly, async (req, res) => {
    try {
        res.json({ success: true, run: await resumeSegmentationCruise(req.params.id) });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/runs/:id/cancel', ...adminOnly, async (req, res) => {
    try {
        res.json({ success: true, run: await cancelSegmentationCruise(req.params.id) });
    } catch (error) {
        sendError(res, error);
    }
});

export default router;
