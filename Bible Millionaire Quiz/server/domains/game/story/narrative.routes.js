/**
 * Narrative API Routes — Phase 2.0 (Clean)
 * 只有 2 個核心端點：/start 和 /turn
 */
import express from 'express';
import { turnEngine } from './narrative/TurnEngine.js';
import { LogosEngine } from '../../../infrastructure/ai/LogosEngine.js';
import { dbOps } from '../../../database/index.js';
import PassageModeAssessor from './narrative/PassageModeAssessor.js';
import StoryBlueprintGenerator from './narrative/StoryBlueprintGenerator.js';
import { ContentManager } from '../../content/bible/ContentManager.js';

const router = express.Router();

/**
 * POST /api/narrative/start
 * 開始一個新的回合制文字冒險遊戲
 */
router.post('/start', async (req, res) => {
    try {
        let { userId, storyId, title, scriptureRefs } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'Missing userId' });
        }

        // 1. Check if it's an existing valid blueprint
        let exists = false;
        if (storyId && !storyId.startsWith('dynamic_')) {
            const story = await dbOps.usersDb.get("SELECT id FROM narrative_stories_v2 WHERE id = $1", [storyId]);
            exists = !!story;
        }

        // 2. If it doesn't exist, we must generate it JIT
        if (!exists) {
            if (!scriptureRefs || scriptureRefs.length === 0) {
                return res.status(400).json({ success: false, message: 'Missing scripture references for generation' });
            }

            // Stringify refs for searching text
            const refString = typeof scriptureRefs[0] === 'string' ? scriptureRefs[0] : `${scriptureRefs[0].book_id} ${scriptureRefs[0].chapter}`;
            // Fetch passage text
            const passageText = await ContentManager.getPassageContent(refString) || refString;

            // Step A: Assess if playable
            const assessment = await PassageModeAssessor.assessPassage(refString, passageText);

            if (assessment.recommended_mode === 'non_story_content' || assessment.recommended_mode === 'lore_reflection') {
                return res.status(400).json({
                    success: false,
                    message: `經文不適合作為敘事互動。(${assessment.reason})`
                });
            }

            // Step B: Generate Blueprint
            storyId = await StoryBlueprintGenerator.generateBlueprintFromScripture(refString, passageText, userId);
        }

        // 3. Start or Resume the game using the Turn Engine
        const state = await turnEngine.startOrResumeGame(userId, storyId, { title, scriptureRefs });
        res.json({ success: true, state });
    } catch (error) {
        console.error('[Route] /start error:', error);
        try {
            const fs = await import('fs');
            fs.appendFileSync('narrative_error.log', `\n[${new Date().toISOString()}] /start error:\n${error.stack}\n`);
        } catch (e) {}
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/narrative/turn
 * 執行一個回合行動（所有行動類型都走這裡）
 */
router.post('/turn', async (req, res) => {
    try {
        const { userId, sessionId, action } = req.body;
        if (!userId || !sessionId || !action) {
            return res.status(400).json({ success: false, message: 'Missing userId, sessionId, or action' });
        }

        const state = await turnEngine.executeTurn(userId, sessionId, action);
        res.json({ success: true, state });
    } catch (error) {
        console.error('[Route] /turn error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/narrative/classify
 * AI 分類聖經主題（供前端搜尋用）
 */
router.post('/classify', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ success: false, message: 'Missing query' });
        }
        const catalog = await dbOps.narrativeOps.getStoryCatalog();
        const classification = await LogosEngine.askBrain('story_theme_classification', { query, catalog });
        res.json({ success: true, classification });
    } catch (error) {
        console.error('[Route] /classify error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
