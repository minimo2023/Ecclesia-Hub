/**
 * TurnEngine.js — Phase 2.1 Blueprint-Driven 敘事引擎
 *
 * 職責：管理遊戲回合循環。
 * 設計原則：
 *   - 以 DB (narrative_stories_v2 等) 的 Blueprint 為唯一真理。
 *   - 選項 (Actions)、場景跳轉、過場完全 deterministic。
 *   - AI 只負責「場景切換時的過場描述」與「NPC對話回應」，不可發散或自創主線。
 */
import { dbOps } from '../../../../database/index.js';
import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';
import crypto from 'crypto';

class TurnEngineService {

    // ─── 公開方法 ───────────────────────────────────────

    /**
     * 開新局或接續舊局 (startOrResumeGame)
     * 從 DB Blueprint 讀取首個 scene，放生舊 Session。
     */
    async startOrResumeGame(userId, storyId, options = {}) {
        // 1. 將既有 active session 標記為 abandoned
        await dbOps.usersDb.run(
            "UPDATE narrative_game_sessions SET session_status = 'abandoned' WHERE user_id = $1 AND story_id = $2 AND session_status = 'active'",
            [userId, storyId]
        );

        // 2. 讀取 Story Blueprint
        const story = await dbOps.usersDb.get("SELECT * FROM narrative_stories_v2 WHERE id = $1", [storyId]);
        if (!story) throw new Error(`Story blueprint not found for id: ${storyId}`);

        const startSceneId = story.start_scene_id;
        const scene = await this._getSceneBlueprint(storyId, startSceneId);

        // 3. 建立新 session
        const sessionId = `ns_${crypto.randomUUID().split('-')[0]}`;

        // 4. 解析起點的 Actions
        const actions = this._parseActionsJSON(scene.actions_json);

        // 5. 組裝首回合的 feedBlocks (不需要 AI 呼叫)
        const feedBlocks = this._assignBlockIds([
            { type: 'divider', label: scene.title || story.title },
            { type: 'narration', text: scene.entry_text }
        ]);

        const dbPayload = { actions, sceneState: { current_scene_id: startSceneId, timeline_position: 'opening' } };

        await dbOps.usersDb.run(
            `INSERT INTO narrative_game_sessions (session_id, user_id, story_id, current_scene_id, session_status, current_turn_id, feed_history, current_available_actions)
             VALUES ($1, $2, $3, $4, 'active', 0, $5, $6)`,
            [sessionId, userId, storyId, startSceneId, JSON.stringify(feedBlocks), JSON.stringify(dbPayload)]
        );

        console.log(`[TurnEngine] ✅ Game started (Blueprint-Driven). Session: ${sessionId}, Start Scene: ${startSceneId}`);

        return {
            sessionId,
            storyId,
            feedBlocks,
            actions,
            sceneState: dbPayload.sceneState,
            turnNumber: 1
        };
    }

    /**
     * 執行一個回合 (executeTurn)
     * 嚴格驗證 action -> AI Narration -> 狀態推移 -> 從 DB 拿新 options
     */
    async executeTurn(userId, sessionId, actionInput) {
        const session = await dbOps.usersDb.get(
            "SELECT * FROM narrative_game_sessions WHERE session_id = $1 AND user_id = $2",
            [sessionId, userId]
        );
        if (!session) throw new Error('Session not found');

        const feedHistory = this._parseJSON(session.feed_history, []);
        const dbPayload = this._parseJSON(session.current_available_actions, {});
        const sceneState = dbPayload.sceneState || {};
        const availableActions = dbPayload.actions || { mainline: [], interaction: [], dialogue: [], system: [] };

        console.log('[TurnEngine] executeTurn:', { input: actionInput.actionId, currentScene: session.current_scene_id });

        // 1. 驗證玩家傳來的 Action (防止前端竄改)
        const validatedAction = this._validateAction(actionInput, availableActions);
        const userText = validatedAction.label || validatedAction.text || '繼續探索';
        const playerBlock = this._createPlayerBlock(validatedAction, userText);

        let aiBlocks = [];
        let nextSceneId = session.current_scene_id;

        // 2. 處理行動 (System 抽離 AI，直接讀 DB)
        if (validatedAction.type === 'system') {
            aiBlocks = await this._handleSystemAction(session.story_id, validatedAction);
        } else {
            // 呼叫 AI 補足「過程描述 (Narration)」
            aiBlocks = await this._generateNarration(validatedAction, sceneState, feedHistory.slice(-5));

            // 決定下一個 Scene ID (引擎邏輯層，非 AI)
            if (validatedAction.targetSceneId) {
                nextSceneId = validatedAction.targetSceneId;
            }
        }

        // 3. 更新 feed
        const newBlocks = this._assignBlockIds(aiBlocks);
        const updatedFeed = [...feedHistory, playerBlock, ...newBlocks];

        // 4. 定義下一回合選項 (從 DB 拿新的 Blueprint，取代 AI Options)
        let nextActions;
        const targetScene = await this._getSceneBlueprint(session.story_id, nextSceneId);

        // 若換場了，送出換場 Divider 與 entry_text
        if (nextSceneId !== session.current_scene_id) {
            const entryBlocks = this._assignBlockIds([
                { type: 'divider', label: targetScene.title },
                { type: 'narration', text: targetScene.entry_text }
            ]);
            updatedFeed.push(...entryBlocks);
        }

        nextActions = this._parseActionsJSON(targetScene.actions_json);
        // Disable free input for MVP consistency
        nextActions.freeInputEnabled = false;

        // 5. 更新 DB
        const nextTurn = (session.current_turn_id || 1) + 1;
        sceneState.current_scene_id = nextSceneId;
        const nextPayload = { actions: nextActions, sceneState };

        await dbOps.usersDb.run(
            `UPDATE narrative_game_sessions
             SET feed_history = $1, current_available_actions = $2, current_turn_id = $3, current_scene_id = $4, updated_at = NOW()
             WHERE session_id = $5`,
            [JSON.stringify(updatedFeed), JSON.stringify(nextPayload), nextTurn, nextSceneId, sessionId]
        );

        console.log(`[TurnEngine] ✅ Turn ${nextTurn} completed. Moved to Scene: ${nextSceneId}`);

        return {
            sessionId,
            feedBlocks: updatedFeed,
            actions: nextActions,
            turnNumber: nextTurn
        };
    }

    // ─── 內部方法 ───────────────────────────────────────

    /**
     * 取得 Scene Blueprint
     */
    async _getSceneBlueprint(storyId, sceneId) {
        const scene = await dbOps.usersDb.get(
            "SELECT * FROM narrative_story_scenes_v2 WHERE story_id = $1 AND id = $2",
            [storyId, sceneId]
        );
        if (!scene) throw new Error(`Scene blueprint not found: ${sceneId}`);
        return scene;
    }

    /**
     * Parsing scene's raw actions to structured format
     */
    _parseActionsJSON(jsonString) {
        const arr = this._parseJSON(jsonString, {});
        return {
            mainline: arr.mainline || [],
            interaction: arr.interaction || [],
            dialogue: arr.dialogue || [],
            system: arr.system || [],
            freeInputEnabled: false // explicitly turned off per 13-commandments MVP rules
        };
    }

    /**
     * Action 驗證器，確保玩家行動合法
     */
    _validateAction(input, availableActions) {
        if (input.type === 'free_input') return { ...input, type: 'free_input' }; // Free input is not strict matched if enabled

        const pool = availableActions[input.type] || [];
        const found = pool.find(a => a.actionId === input.actionId);

        if (!found) {
            console.warn(`[TurnEngine] Invalid action ID: ${input.actionId}. Automatically falling back to a safe action.`);
            // 回退防呆：抓一個主線
            if (availableActions.mainline.length > 0) {
                return { ...availableActions.mainline[0], type: 'mainline' };
            }
            throw new Error('ILLEGAL_ACTION');
        }

        return { ...found, type: input.type, userText: input.text };
    }

    /**
     * System Lore (從資料庫拉，不花 Token)
     */
    async _handleSystemAction(storyId, action) {
        if (!action.loreId) {
            return [{ type: 'system_note', text: `📖 ${action.label}：未能取得詳細知識。` }];
        }

        const lore = await dbOps.usersDb.get(
            "SELECT * FROM narrative_story_lore_v2 WHERE story_id = $1 AND id = $2",
            [storyId, action.loreId]
        );

        if (!lore) {
            return [{ type: 'system_note', text: `📖 ${action.label}：資料庫無對應 Lore。` }];
        }

        return [
            { type: 'system_note', text: `📖【${lore.title}】\n${lore.content}` }
        ];
    }

    /**
     * 呼叫 AI 生成「動作與對話的過程描述」
     */
    async _generateNarration(action, sceneState, recentFeed) {
        let mode = 'narrative_offset';
        let targetNpc = action.label || '場景人物';

        if (action.type === 'dialogue') {
            mode = 'character_reply';
        }

        try {
            const result = await LogosEngine.askBrain('story_interaction', {
                mode,
                user_query: action.label || '繼續觀察',
                target_npc: targetNpc,
                scene_context: sceneState,
                last_blocks: recentFeed
            });

            return result.blocks || [];
        } catch (err) {
            console.error('[TurnEngine] Narration AI failed:', err.message);
            return [{ type: 'narration', text: '在此刻，時間彷彿靜止了一瞬。你深吸了一口氣，準備好面對接下來的轉折。' }];
        }
    }

    // ─── 工具方法 ───────────────────────────────────────

    _createPlayerBlock(action, userText) {
        return {
            id: `blk_player_${Date.now()}`,
            type: action.type === 'free_input' || action.type === 'dialogue' ? 'character_speech' : 'system_note',
            speaker: action.type === 'free_input' || action.type === 'dialogue' ? '你（觀察者）' : null,
            text: action.type === 'free_input' || action.type === 'dialogue' ? userText : `— ${userText} —`
        };
    }

    _assignBlockIds(blocks) {
        return (blocks || []).map(b => ({
            ...b,
            id: b.id || `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        }));
    }

    _parseJSON(str, fallback) {
        if (!str) return fallback;
        if (typeof str === 'object') return str;
        try { return JSON.parse(str); } catch { return fallback; }
    }
}

export const turnEngine = new TurnEngineService();
