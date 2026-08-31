import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken } from '../../middleware/auth.js';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../utils/secrets.js';
import {
    applyAICreditSpendTx,
    applyCoinDeltaTx,
    EconomyError
} from '../economy/AssetLedgerService.js';
import { recordSessionLifelineTx } from './rewards/GameRewardService.js';

const router = express.Router();
const JWT_SECRET = getJwtSecret();

const retiredClientAuthority = (_req, res) => res.status(410).json({
    success: false,
    error: 'SERVER_AUTHORITY_REQUIRED',
    message: '此操作已改由伺服器依已驗證事件處理'
});

// ========== Leaderboard API ==========

// GET /leaderboard - Get top scores (PostgreSQL compatible)
router.get('/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;

        // Use PostgreSQL-compatible column names from schemas_pg.js
        const results = await dbOps.gamesDb.query(`
            SELECT
                user_id as id,
                name,
                high_score as score,
                games_played as gamesPlayed,
                last_updated as timestamp
            FROM leaderboard
            ORDER BY high_score DESC
            LIMIT $1
        `, [limit]);

        console.log(`📊 Retrieved ${results.length} leaderboard scores`);
        res.json(results);
    } catch (error) {
        console.error('Leaderboard GET Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /leaderboard - Add/Update a score (PostgreSQL compatible - Upsert pattern)
router.post('/leaderboard', authenticateToken, retiredClientAuthority);

// GET /leaderboard/infinite - Get top scores for infinite mode
router.get('/leaderboard/infinite', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const results = await dbOps.gamesDb.query(`
            SELECT
                user_id as id,
                name,
                level,
                date,
                timestamp
            FROM infinite_leaderboard
            ORDER BY level DESC
            LIMIT $1
        `, [limit]);
        res.json(results);
    } catch (error) {
        console.error('Infinite Leaderboard GET Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /leaderboard/infinite - Add/Update score for infinite mode
router.post('/leaderboard/infinite', authenticateToken, retiredClientAuthority);

// ========== User Stats & Coins API ==========

// PUT /users/coins - Add/update coins (after game ends)
router.put('/users/coins', authenticateToken, retiredClientAuthority);

// PUT /users/assets/milestone - Reward milestone coins and points
router.put('/users/assets/milestone', authenticateToken, retiredClientAuthority);

// POST /users/coins/spend - Deduct coins for lifeline usage
router.post('/users/coins/spend', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lifelineType, gameSessionId, requestId } = req.body;
        const allowedLifelines = new Set(['fiftyFifty', 'phoneFriend', 'askAudience', 'addTime']);
        if (!allowedLifelines.has(lifelineType)) {
            return res.status(400).json({ success: false, error: 'INVALID_LIFELINE' });
        }
        if (!/^[A-Za-z0-9:_-]{8,120}$/.test(String(requestId || ''))) {
            return res.status(400).json({ success: false, error: 'INVALID_REQUEST_ID' });
        }

        // Load costs from dynamic configuration
        let LIFELINE_COSTS = {
            fiftyFifty: 10,
            phoneFriend: 15,
            askAudience: 15,
            addTime: 10
        };

        try {
            const configRow = await dbOps.gamesDb.get("SELECT value FROM expedition_config WHERE key = 'lifeline_costs'");
            if (configRow) {
                const dbCosts = (configRow.value && typeof configRow.value === 'string') ? JSON.parse(configRow.value) : configRow.value;
                LIFELINE_COSTS = { ...LIFELINE_COSTS, ...dbCosts };
            }
        } catch (e) {
            console.error('Failed to load lifeline_costs config:', e);
        }

        let cost = Number(LIFELINE_COSTS[lifelineType]);
        const result = await dbOps.usersDb.transaction(async (tx) => {
            if (lifelineType === 'phoneFriend') {
                if (!gameSessionId) {
                    throw new EconomyError('GAME_SESSION_REQUIRED', '專家求助必須綁定遊戲階段');
                }
                const session = await tx.get(`
                    SELECT user_id, status, lifelines_used
                    FROM game_reward_sessions
                    WHERE id = $1
                    FOR UPDATE
                `, [gameSessionId]);
                if (!session || session.userId !== userId || session.status !== 'active') {
                    throw new EconomyError('GAME_SESSION_INACTIVE', '遊戲階段不存在或已結束', 409);
                }
                const usage = typeof session.lifelinesUsed === 'object'
                    ? session.lifelinesUsed
                    : JSON.parse(session.lifelinesUsed || '{}');
                const used = Number(usage.phoneFriend || 0);
                if (used >= 3) {
                    throw new EconomyError('AI_CREDIT_REQUIRED', '進階專家求助需使用智匯點數', 409);
                }
                cost = used === 0 ? 15 : used * 15;
            }
            if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 500) {
                throw new EconomyError('INVALID_LIFELINE_COST', '求助工具費用設定不正確');
            }
            const debit = await applyCoinDeltaTx(tx, {
                userId,
                delta: -cost,
                reasonCode: `spend_lifeline_${lifelineType}`,
                sourceId: gameSessionId || null,
                idempotencyKey: `lifeline:${userId}:${requestId}`,
                metadata: { lifelineType }
            });
            if (!debit.duplicate) {
                await recordSessionLifelineTx(tx, userId, gameSessionId, lifelineType);
            }
            return debit;
        });

        res.json({ success: true, coins: result.balance, spent: Math.abs(result.delta), duplicate: result.duplicate });

    } catch (error) {
        console.error('Coins Spend Error:', error);
        if (error instanceof EconomyError) {
            return res.status(error.status).json({ success: false, error: error.code, message: error.message });
        }
        res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
});

// POST /users/credits/spend - Deduct AI credits for expert lifeline or other usages
router.post('/users/credits/spend', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { action, gameSessionId, requestId } = req.body;
        if (action !== 'expert_lifeline' || !gameSessionId) {
            return res.status(400).json({ success: false, error: 'INVALID_CREDIT_ACTION' });
        }
        if (!/^[A-Za-z0-9:_-]{8,120}$/.test(String(requestId || ''))) {
            return res.status(400).json({ success: false, error: 'INVALID_REQUEST_ID' });
        }

        const result = await dbOps.usersDb.transaction(async (tx) => {
            const session = await tx.get(`
                SELECT user_id, status, lifelines_used
                FROM game_reward_sessions
                WHERE id = $1
                FOR UPDATE
            `, [gameSessionId]);
            if (!session || session.userId !== userId || session.status !== 'active') {
                throw new EconomyError('GAME_SESSION_INACTIVE', '遊戲階段不存在或已結束', 409);
            }
            const usage = typeof session.lifelinesUsed === 'object'
                ? session.lifelinesUsed
                : JSON.parse(session.lifelinesUsed || '{}');
            const used = Number(usage.phoneFriend || 0);
            if (used < 3) {
                throw new EconomyError('COIN_LIFELINE_REQUIRED', '目前應使用智匯金幣兌換求助', 409);
            }
            const cost = used === 3 ? 1 : used === 4 ? 2 : used === 5 ? 4 : 8;
            const debit = await applyAICreditSpendTx(tx, {
                userId,
                amount: cost,
                reasonCode: 'expert_lifeline',
                sourceId: gameSessionId,
                idempotencyKey: `expert:${userId}:${requestId}`,
                metadata: { expertCallNumber: used + 1 }
            });
            if (!debit.duplicate) {
                await recordSessionLifelineTx(tx, userId, gameSessionId, 'phoneFriend');
            }
            return debit;
        });

        res.json({ success: true, credits: result.balance, spent: Math.abs(result.delta), duplicate: result.duplicate });

    } catch (error) {
        console.error('AI Credits Spend Error:', error);
        if (error instanceof EconomyError) {
            return res.status(error.status).json({ success: false, error: error.code, message: error.message });
        }
        res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
});

// PUT /users/stats - Update game statistics (total games, correct answers)
router.put('/users/stats', authenticateToken, retiredClientAuthority);

// POST /users/merge - Merge guest data into account
router.post('/users/merge', authenticateToken, retiredClientAuthority);

/**
 * [V9.13 Alignment] POST /attempts
 * 專屬作答歷史紀錄接口：取代 db_generic.js 的功能。
 * 這能確保資料被正確寫入 user_question_history 表。
 */
router.post('/attempts', authenticateToken, retiredClientAuthority);

// POST /game/rating - Submit game module rating
router.post('/game/rating', async (req, res) => {
    try {
        const { mode, rating } = req.body;

        // Optional user identification via auth header, since rating is allowed for guests
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.userId || decoded.id;
            } catch (e) {
                // Ignore token errors for rating, treat as guest
            }
        }

        if (!mode || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Invalid rating data' });
        }

        await dbOps.gamesDb.query(
            `INSERT INTO game_ratings (user_id, mode, rating) VALUES ($1, $2, $3)`,
            [userId, mode, rating]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Submit Rating Error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit rating' });
    }
});

export default router;
