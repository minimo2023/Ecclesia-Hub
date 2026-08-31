import express from 'express';
import multer from 'multer';
import { authenticateToken, optionalAuthenticateToken, requireRole } from '../../middleware/auth.js';
import recordingStorage from './recording-storage.js';
import {
    addComment,
    blockMember,
    createRecording,
    createModerationPlaybackTicket,
    createRecordingPlaybackTicket,
    createShare,
    createSharePlaybackTicket,
    deleteComment,
    deleteRecording,
    getRecording,
    getOwnedRecording,
    getShare,
    listComments,
    listCommunity,
    listMine,
    listModerationQueue,
    listNotifications,
    markNotificationsRead,
    moderateComment,
    moderateRecording,
    reportRecording,
    replaceRecordingAsset,
    resolvePlaybackTicket,
    revokeShare,
    setReaction,
    updateRecording
} from './recording-service.js';
import { MAX_RECORDING_BYTES } from './recording-validation.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: MAX_RECORDING_BYTES, fields: 20 }
});

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

function sendError(res, error) {
    if (error?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'AUDIO_TOO_LARGE', message: '錄音檔不可超過 5MB' });
    }
    const status = Number(error?.status || 500);
    if (status >= 500) console.error('[ScriptureRecording]', error);
    else console.warn('[ScriptureRecording] Request rejected', {
        status,
        code: error?.code || 'SCRIPTURE_RECORDING_FAILED'
    });
    return res.status(status).json({
        success: false,
        error: error?.code || 'SCRIPTURE_RECORDING_FAILED',
        message: status >= 500 && process.env.NODE_ENV === 'production' ? '朗讀服務暫時無法使用' : error?.message
    });
}

const asyncRoute = handler => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (error) {
        sendError(res, error);
    }
};

function sendAudio(req, res, recording) {
    const total = Number(recording.byteSize);
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', recording.mimeType || 'audio/webm');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!range) {
        res.status(200).setHeader('Content-Length', total);
        const stream = recordingStorage.createReadStream(recording.storageKey);
        stream.on('error', error => {
            console.error('[ScriptureRecording] Audio stream failed:', error.message);
            if (!res.headersSent) res.status(404).end();
            else res.destroy(error);
        });
        return stream.pipe(res);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
    if (!match[1] && !match[2]) return res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
    const suffixLength = !match[1] ? Number(match[2]) : null;
    const start = suffixLength === null ? Number(match[1]) : Math.max(0, total - suffixLength);
    const requestedEnd = suffixLength === null && match[2] ? Number(match[2]) : total - 1;
    const end = Math.min(requestedEnd, total - 1);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total) {
        return res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    const stream = recordingStorage.createReadStream(recording.storageKey, { start, end });
    stream.on('error', error => {
        console.error('[ScriptureRecording] Range stream failed:', error.message);
        if (!res.headersSent) res.status(404).end();
        else res.destroy(error);
    });
    return stream.pipe(res);
}

router.post('/recordings', authenticateToken, upload.single('audio'), asyncRoute(async (req, res) => {
    const result = await createRecording({
        userId: req.user.userId,
        clientRequestId: req.get('Idempotency-Key'),
        input: req.body,
        file: req.file
    });
    ok(res, result, result.reused ? 200 : 201);
}));

router.get('/recordings/mine', authenticateToken, asyncRoute(async (req, res) => {
    ok(res, { items: await listMine(req.user.userId, req.query.kind) });
}));

router.get('/recordings/:id', authenticateToken, asyncRoute(async (req, res) => {
    ok(res, { recording: await getRecording(req.params.id, req.user.userId) });
}));

router.post('/recordings/:id/assets', authenticateToken, upload.single('audio'), asyncRoute(async (req, res) => {
    const result = await replaceRecordingAsset({
        recordingId: req.params.id,
        userId: req.user.userId,
        clientRequestId: req.get('Idempotency-Key'),
        input: req.body,
        file: req.file
    });
    ok(res, result, result.reused ? 200 : 201);
}));

router.get('/recordings/:id/audio', authenticateToken, asyncRoute(async (req, res) => {
    const recording = await getOwnedRecording(req.params.id, req.user.userId);
    sendAudio(req, res, recording);
}));

router.post('/recordings/:id/playback-ticket', optionalAuthenticateToken, asyncRoute(async (req, res) => {
    const ticket = await createRecordingPlaybackTicket(req.params.id, req.user?.userId || null);
    ok(res, { ticket, expiresInSeconds: 300 });
}));

router.patch('/recordings/:id', authenticateToken, asyncRoute(async (req, res) => {
    ok(res, { recording: await updateRecording(req.params.id, req.user.userId, req.body) });
}));

router.delete('/recordings/:id', authenticateToken, asyncRoute(async (req, res) => {
    await deleteRecording(req.params.id, req.user.userId);
    ok(res, { deleted: true });
}));

router.post('/recordings/:id/shares', authenticateToken, asyncRoute(async (req, res) => {
    const share = await createShare(req.params.id, req.user.userId, {
        ...req.body,
        clientRequestId: req.get('Idempotency-Key')
    });
    ok(res, share, share.reused ? 200 : 201);
}));

router.delete('/shares/:shareId', authenticateToken, asyncRoute(async (req, res) => {
    await revokeShare(req.params.shareId, req.user.userId);
    ok(res, { revoked: true });
}));

router.get('/shares/:token', optionalAuthenticateToken, asyncRoute(async (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    ok(res, await getShare(req.params.token));
}));

router.post('/shares/:token/playback-ticket', optionalAuthenticateToken, asyncRoute(async (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    ok(res, { ticket: await createSharePlaybackTicket(req.params.token), expiresInSeconds: 300 });
}));

router.get('/audio/:ticket', asyncRoute(async (req, res) => {
    const recording = await resolvePlaybackTicket(req.params.ticket);
    sendAudio(req, res, recording);
}));

router.get('/community/recordings', optionalAuthenticateToken, asyncRoute(async (req, res) => {
    ok(res, await listCommunity({ userId: req.user?.userId || null, ...req.query }));
}));

router.post('/community/recordings/:id/reactions', authenticateToken, asyncRoute(async (req, res) => {
    ok(res, await setReaction(req.params.id, req.user.userId, req.body?.reactionType));
}));

router.get('/community/recordings/:id/comments', optionalAuthenticateToken, asyncRoute(async (req, res) => {
    ok(res, { items: await listComments(req.params.id, req.user?.userId || null) });
}));

router.post('/community/recordings/:id/comments', authenticateToken, asyncRoute(async (req, res) => {
    const comment = await addComment(req.params.id, req.user.userId, req.body?.content, req.get('Idempotency-Key'));
    ok(res, { comment }, 201);
}));

router.delete('/community/comments/:commentId', authenticateToken, asyncRoute(async (req, res) => {
    await deleteComment(req.params.commentId, req.user.userId);
    ok(res, { deleted: true });
}));

router.post('/community/recordings/:id/reports', authenticateToken, asyncRoute(async (req, res) => {
    ok(res, await reportRecording(req.params.id, req.user.userId, req.body?.reason, req.body?.detail));
}));

router.post('/community/blocks', authenticateToken, asyncRoute(async (req, res) => {
    await blockMember(req.user.userId, req.body?.blockedUserId);
    ok(res, { blocked: true });
}));

router.get('/notifications', authenticateToken, asyncRoute(async (req, res) => {
    ok(res, { items: await listNotifications(req.user.userId) });
}));

router.post('/notifications/read', authenticateToken, asyncRoute(async (req, res) => {
    await markNotificationsRead(req.user.userId);
    ok(res, { read: true });
}));

const moderation = [authenticateToken, requireRole(['admin_ops'])];

router.get('/moderation/queue', ...moderation, asyncRoute(async (_req, res) => {
    ok(res, { items: await listModerationQueue() });
}));

router.post('/moderation/recordings/:id/playback-ticket', ...moderation, asyncRoute(async (req, res) => {
    ok(res, { ticket: await createModerationPlaybackTicket(req.params.id), expiresInSeconds: 180 });
}));

router.post('/moderation/recordings/:id', ...moderation, asyncRoute(async (req, res) => {
    await moderateRecording(req.params.id, req.user.userId, req.body?.action, req.body?.reason);
    ok(res, { updated: true });
}));

router.post('/moderation/comments/:id', ...moderation, asyncRoute(async (req, res) => {
    await moderateComment(req.params.id, req.user.userId, req.body?.action, req.body?.reason);
    ok(res, { updated: true });
}));

export default router;
