import crypto from 'crypto';
import express from 'express';
import { dbOps } from '../../database/index.js';
import { optionalAuthenticateToken } from '../../middleware/auth.js';

const router = express.Router();
const CATEGORIES = new Set(['network', 'api', 'navigation', 'audio', 'sync', 'crash', 'performance']);
const CONTEXT_KEYS = new Set(['path', 'status', 'operation', 'durationMs', 'offline', 'screen', 'retryCount']);

router.use(optionalAuthenticateToken);

router.get('/bootstrap', async (req, res) => {
    res.json({
        success: true,
        serverTime: new Date().toISOString(),
        app: { minimumVersion: process.env.APP_MINIMUM_VERSION || '0.1.0', latestVersion: process.env.APP_LATEST_VERSION || '0.1.0', androidClosedTest: true },
        features: {
            scripture: true,
            devotion: true,
            readingPlans: true,
            voiceBlessing: process.env.SCRIPTURE_RECORDINGS_ENABLED === 'true',
            scriptureCommunity: process.env.SCRIPTURE_COMMUNITY_ENABLED === 'true',
            scriptureOrder: process.env.SCRIPTURE_ORDER_GAME_ENABLED !== 'false',
            scriptureRain: process.env.SCRIPTURE_RAIN_ENABLED !== 'false',
            multiplayerPlayer: true,
            expedition: true,
            cloze: false,
            stories: false
        },
        session: req.user ? { authenticated: true, userId: req.user.userId } : { authenticated: false }
    });
});

router.post('/diagnostics/batch', async (req, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!events.length || events.length > 50) {
        return res.status(400).json({ success: false, error: 'DIAGNOSTIC_BATCH_SIZE_INVALID' });
    }
    const installationId = clean(req.body?.installationId, 128);
    const platform = clean(req.body?.platform || req.get('X-Client-Platform'), 16);
    const appVersion = clean(req.body?.appVersion || req.get('X-App-Version'), 32);
    if (!['android', 'ios'].includes(platform)) return res.status(400).json({ success: false, error: 'APP_PLATFORM_INVALID' });
    let accepted = 0;
    await dbOps.usersDb.transaction(async tx => {
        for (const event of events) {
            const category = clean(event?.category, 32);
            const eventCode = clean(event?.code, 80);
            if (!CATEGORIES.has(category) || !/^[A-Z0-9_:-]{3,80}$/u.test(eventCode)) continue;
            const context = {};
            for (const [key, value] of Object.entries(event?.context || {})) {
                if (!CONTEXT_KEYS.has(key) || !['string', 'number', 'boolean'].includes(typeof value)) continue;
                context[key] = typeof value === 'string' ? value.slice(0, 160) : value;
            }
            const occurredAt = Number.isFinite(Date.parse(event?.occurredAt)) ? new Date(event.occurredAt) : new Date();
            await tx.run(`INSERT INTO app_diagnostics
                (id, user_id, installation_id, app_platform, app_version, category, event_code, message, context, occurred_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, [crypto.randomUUID(), req.user?.userId || null, installationId, platform, appVersion, category, eventCode, clean(event?.message, 240), JSON.stringify(context), occurredAt]);
            accepted += 1;
        }
    });
    return res.json({ success: true, accepted, rejected: events.length - accepted });
});

function clean(value, max) { return String(value || '').trim().slice(0, max); }
export default router;
