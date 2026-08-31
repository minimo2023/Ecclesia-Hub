import express from 'express';
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { authenticateToken } from '../../../middleware/auth.js';
import { requireAiCredits } from '../../../middleware/creditMiddleware.js';
import { evaluateTopic } from './timeTraveler/EvaluatorService.js';
import { getOrGenerateScene } from './timeTraveler/SceneGeneratorService.js';
import { processPlayerAction } from './timeTraveler/NarrativeEngineService.js';
import { usersDb } from '../../../database/index.js';
import { safeParseJSON } from '../../../utils/ai-parser.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * @route POST /api/time-traveler/evaluate
 * @desc 玩家輸入主題，系統判定對應經文與是否適合進入主故事
 */
router.post('/evaluate', authenticateToken, async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic || typeof topic !== 'string' || topic.trim() === '') {
            return res.status(400).json({ error: 'Valid topic string is required' });
        }

        const userId = req.user.userId || req.user.id;
        console.log(`[TimeTraveler] Evaluating topic: "${topic}" for User: ${userId}`);

        // Evaluate the topic using LLM
        const evaluation = await evaluateTopic(topic);

        // Get real balance
        const balance = await usersDb.get(`
            SELECT bonus_ai_credits + exchange_ai_credits + paid_ai_credits as total
            FROM user_ai_credit_wallet
            WHERE user_id = $1
        `, [userId]);

        res.json({
            success: true,
            topic,
            evaluation,
            ai_credits_remaining: balance?.total ?? 0
        });

    } catch (error) {
        console.error('[TimeTraveler Route] Evaluate Error:', error);
        res.status(500).json({ error: 'Failed to evaluate topic. Please try again later.' });
    }
});

/**
 * @route POST /api/time-traveler/start-session
 * @desc ...
 */
router.post('/start-session', authenticateToken, async (req, res) => {
    try {
        const { topic, scripture_reference } = req.body;
        const userId = req.user.userId || req.user.id;

        console.log(`🚀 [TimeTraveler] V3 Starting Session: ${topic}`);

        // 1. Use the new Logos V3 Entry Pipeline
        const playerIntent = topic || scripture_reference;
        const exploration = await LogosEngine.startExploration(playerIntent);

        if (!exploration.ok) {
            return res.status(400).json({ error: exploration.reason, message: exploration.message });
        }

        const { state, assessment } = exploration;

        // 2. Generate/Save Scene Packet (Legacy Bridge for now)
        const scenePacket = await getOrGenerateScene(state.metadata.source, topic || assessment.title, '');

        // 3. Create Session with V3 State
        const sessionId = 'tt_sess_' + crypto.randomBytes(8).toString('hex');

        await usersDb.run(`
            INSERT INTO time_traveler_sessions (
                id, user_id, scene_id, story_id, current_state, sync_rate, status, context_history
            ) VALUES ($1, $2, $3, $4, 'active', 100, 'active', $5)
        `, [
            sessionId, userId, scenePacket.id, scenePacket.story_id, JSON.stringify([])
        ]);

        // Note: We might store more of 'state' in a new table later,
        // but for now, we ensure the session is properly linked.

        const balance = await usersDb.get(`
            SELECT bonus_ai_credits + exchange_ai_credits + paid_ai_credits as total
            FROM user_ai_credit_wallet
            WHERE user_id = $1
        `, [userId]);

        res.json({
            success: true,
            session_id: sessionId,
            scene: {
                ...scenePacket,
                v3_assessment: assessment // Pass new metadata to frontend
            },
            ai_credits_remaining: balance?.total ?? 0
        });

    } catch (error) {
        console.error('[TimeTraveler Route] Start Session Error:', error);
        res.status(500).json({ error: 'Failed to start time traveler session: ' + error.message });
    }
});

/**
 * @route POST /api/time-traveler/action
 * @desc 玩家執行行為 (點擊動態按鈕或手動輸入)，系統將交給 NarrativeEngine 處理
 */
router.post('/action', authenticateToken, requireAiCredits(1), async (req, res) => {
    try {
        const { session_id, action_text, is_free_text } = req.body;

        if (!session_id || !action_text) {
            return res.status(400).json({ error: 'session_id and action_text are required' });
        }

        const userId = req.user.userId || req.user.id;
        const session = await usersDb.get('SELECT * FROM time_traveler_sessions WHERE id = $1 AND user_id = $2', [session_id, userId]);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'active') return res.status(400).json({ error: `Session is already ${session.status}` });

        const scene = await usersDb.get('SELECT * FROM time_traveler_scenes WHERE id = $1', [session.scene_id]);
        if (!scene) return res.status(404).json({ error: 'Scene data corrupted' });

        const parsedSession = {
            ...session,
            context_history: safeParseJSON(session.context_history, [])
        };
        const parsedScene = {
            ...scene,
            rules: safeParseJSON(scene.rules_json, []),
            npcs: safeParseJSON(scene.npcs_json, [])
        };

        // 2. Pass to Narrative Engine (correlationId links credit deduction ↔ token usage log)
        const correlationId = crypto.randomUUID();
        const turnResult = await processPlayerAction(parsedSession, parsedScene, action_text, is_free_text, correlationId);

        // 3. State Management
        let newSyncRate = session.sync_rate + (turnResult.sync_rate_change || 0);
        if (newSyncRate > 100) newSyncRate = 100;
        let newStatus = 'active';

        // Destabilized / Kickout logic
        let kickoutNarrative = null;
        if (newSyncRate <= 0) {
            newStatus = 'failed';
            newSyncRate = 0;
            kickoutNarrative = "⚠️ 【警告：時空排斥反應】您的同步率已歸零，周遭的影像開始急遽扭曲。你感受到一股不可抗拒的力量將您強制抽離了這個時空。";
            turnResult.narrative_response += "\n\n" + kickoutNarrative;
            turnResult.new_buttons = [];
        }

        // 4. Update History
        parsedSession.context_history.push({
            action: action_text,
            intent: turnResult.intent,
            outcome: turnResult.narrative_response,
            scene_id: turnResult.scene_id // 紀錄此回合發生的場景，供 Pacing 感測使用
        });

        // 5. Write to Database tables (Transactions ideally, but separated for ease)
        await usersDb.run(`
            UPDATE time_traveler_sessions
            SET current_state = $1, sync_rate = $2, context_history = $3, status = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [
            turnResult.intent, newSyncRate, JSON.stringify(parsedSession.context_history), newStatus, session_id
        ]);

        // Witness Logbook update
        if (turnResult.witness_fragment) {
            await usersDb.run(`
                INSERT INTO witness_logs (session_id, user_id, scene_id, fragment)
                VALUES ($1, $2, $3, $4)
            `, [session_id, userId, session.scene_id, turnResult.witness_fragment]);
        }

        // Evolutionary Action Harvesting
        if (turnResult.is_harvestable) {
            await usersDb.run(`
                INSERT INTO action_candidates (scene_id, user_id, action_text, status)
                VALUES ($1, $2, $3, 'pending')
            `, [session.scene_id, userId, action_text]);
            console.log(`[Evolution] Harvested action: ${action_text}`);
        }

        // 6. Deduct 1 AI Credit per turn (correlationId links to token usage log)
        const newBalance = await req.deductAiCredits(1, 'TIME_TRAVEL_DIALOGUE', '聖經時空旅人互動', correlationId);

        res.json({
            success: true,
            turn: turnResult,
            sync_rate: newSyncRate,
            status: newStatus,
            ai_credits_remaining: newBalance
        });

    } catch (error) {
        console.error('[TimeTraveler Action Error]:', error);
        res.status(500).json({ error: 'Failed to process action: ' + error.message });
    }
});

/**
 * @route GET /api/time-traveler/resume
 * @desc 取得玩家目前仍在 active 狀態的最後一個 session
 */
router.get('/resume', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const session = await usersDb.get(`
            SELECT * FROM time_traveler_sessions
            WHERE user_id = $1 AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1
        `, [userId]);

        if (!session) {
            return res.json({ success: true, has_active_session: false });
        }

        const scene = await usersDb.get('SELECT * FROM time_traveler_scenes WHERE id = $1', [session.scene_id]);

        if (!scene) {
            // Scene missing: mark session as failed to prevent future loops, and return no session
            await usersDb.run('UPDATE time_traveler_sessions SET status = $1 WHERE id = $2', ['failed', session.id]);
            return res.json({ success: true, has_active_session: false });
        }

        let history = safeParseJSON(session.context_history, []);

        // Find the last set of generated buttons from the history
        // Actually, the last Narrative turn should contain them, but since we didn't save new_buttons in DB directly,
        // we might just generate a fallback or read from initial_buttons.
        // For MVP, we pass the initial_buttons or let the UI re-evaluate.
        // A better design is to save current_buttons in the session table, but we'll use scene.initial_buttons as fallback.
        let buttons = safeParseJSON(scene.initial_buttons_json, []);

        // Real AI Balance fetch
        const wallet = await usersDb.get('SELECT bonus_ai_credits + exchange_ai_credits + paid_ai_credits as total FROM user_ai_credit_wallet WHERE user_id = $1', [userId]);

        res.json({
            success: true,
            has_active_session: true,
            session_id: session.id,
            scene: {
                ...scene,
                rules: safeParseJSON(scene.rules_json, []),
                npcs: safeParseJSON(scene.npcs_json, []),
                initial_buttons: buttons
            },
            sync_rate: session.sync_rate,
            history: history,
            ai_credits_remaining: wallet?.total ?? 0
        });

    } catch (error) {
        console.error('[TimeTraveler Resume Error]:', error);
        res.status(500).json({ error: 'Failed to check resume status: ' + error.message, stack: error.stack });
    }
});

export default router;
