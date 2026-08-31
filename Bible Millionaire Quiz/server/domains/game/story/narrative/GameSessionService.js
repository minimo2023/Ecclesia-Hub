/**
 * Game Session Service - 負責處理使用者的遊玩進度與 Session 狀態
 * Handles user game sessions and progress persistence.
 */
import { dbOps } from '../../../../database/index.js';
import { narrativeService } from './NarrativeService.js';
import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';

class GameSessionService {
    /**
     * Helper: Assign IDs to new blocks
     */
    _assignBlockIds(blocks) {
        return blocks.map(b => ({
            ...b,
            id: b.id || `blk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        }));
    }

    /**
     * Helper: Generate Turn Options via AI
     */
    async _buildTurnOptions(session, sceneDetails, recentFeed) {
        try {
            const aiResult = await LogosEngine.askBrain('action_options', {
                story_title: sceneDetails.title,
                main_goal: sceneDetails.main_goal,
                phase: 'intro',
                last_blocks: recentFeed.slice(-5), // Give it slightly more context
                entities: sceneDetails.characters.map(c => c.name)
            });

            return {
                mainline: aiResult.mainline || [],
                interaction: aiResult.interaction || [],
                dialogue: aiResult.dialogue || [],
                system: aiResult.system || [],
                freeInputEnabled: true,
                perspectiveEnabled: false
            };
        } catch (err) {
            console.error('[Session] TurnOptionBuilder failed:', err);
            return {
                mainline: [{ actionId: 'fallback_advance', label: '繼續探索' }],
                interaction: [],
                dialogue: [],
                system: [],
                freeInputEnabled: true,
                perspectiveEnabled: false
            };
        }
    }

    /**
     * 啟動新 Session 或恢復已存出的 Session
     */
    async startOrResumeSession(userId, storyId, options = {}) {
        let story = await narrativeService.getStoryInfo(storyId);

        if (!story) {
            console.warn(`[Session] WARNING: Story ${storyId} not found. Creating dynamic rescue story.`);
            await dbOps.narrativeOps.saveStory({
                story_id: storyId, title: options.title || `聖經故事：${storyId}`, entry_scene_id: 'start', status: 'draft'
            });
            await dbOps.narrativeOps.saveSceneBlueprint({
                story_id: storyId, scene_id: 'start', title: '故事開始', main_goal: '體驗這段聖經歷史的開端',
                main_choice_label: '繼續探索', next_scene_id: 'end_of_mvp', scripture_refs_json: options.scriptureRefs || [], generation_mode: 'ai_assisted'
            });
            story = await narrativeService.getStoryInfo(storyId);
        }

        if (!story) throw new Error(`Rescue failed: Story not found or cannot be created: ${storyId}`);

        const session = await dbOps.getOrCreateNarrativeSession(userId, storyId);
        const sceneDetails = await narrativeService.getSceneWithDetails(storyId, session.current_scene_id, session.session_id);

        let feedBlocks = typeof session.feed_history === 'string' ? JSON.parse(session.feed_history || '[]') : (session.feed_history || []);
        let availableActions = typeof session.current_available_actions === 'string' ? JSON.parse(session.current_available_actions || '{}') : (session.current_available_actions || {});

        // Turn 1 Initialization
        if (!feedBlocks || feedBlocks.length === 0 || !availableActions || !availableActions.mainline || availableActions.mainline.length === 0) {
            feedBlocks = this._assignBlockIds(this._mapSceneToFeed(sceneDetails));
            availableActions = await this._buildTurnOptions(session, sceneDetails, feedBlocks);

            await dbOps.usersDb.run(
                "UPDATE narrative_game_sessions SET feed_history = ?, current_available_actions = ? WHERE session_id = ?",
                [JSON.stringify(feedBlocks), JSON.stringify(availableActions), session.session_id]
            );
        }

        const storyCatalog = await dbOps.narrativeOps.getStoryCatalog();
        const storyEntry = storyCatalog.find(s => s.story_id === storyId);

        import('fs').then(fs => fs.writeFileSync('debug_actions.json', JSON.stringify({ feedBlocks, availableActions }, null, 2)));

        return {
            storyMeta: { storyId: session.story_id, title: storyEntry?.title || session.story_id, subtitle: storyEntry?.subtitle || "" },
            sessionId: session.session_id, currentSceneId: session.current_scene_id,
            feedBlocks, availableActions, status: session.session_status
        };
    }

    /**
     * 恢復指定的 Session
     */
    async resumeSession(userId, sessionId) {
        const session = await dbOps.usersDb.get(
            "SELECT * FROM narrative_game_sessions WHERE session_id = ? AND user_id = ?", [sessionId, userId]
        );
        if (!session || session.session_status !== 'active') throw new Error('Active session not found or unauthorized');

        let feedBlocks = typeof session.feed_history === 'string' ? JSON.parse(session.feed_history || '[]') : (session.feed_history || []);
        let availableActions = typeof session.current_available_actions === 'string' ? JSON.parse(session.current_available_actions || '{}') : (session.current_available_actions || {});

        // Phase 1.9 Legacy Session Healing: Re-initialize missing actions if restoring an old state
        if (!feedBlocks || feedBlocks.length === 0 || !availableActions || !availableActions.mainline || availableActions.mainline.length === 0) {
            const sceneDetails = await narrativeService.getSceneWithDetails(session.story_id, session.current_scene_id, session.session_id);
            if (!feedBlocks || feedBlocks.length === 0) {
                feedBlocks = this._assignBlockIds(this._mapSceneToFeed(sceneDetails));
            }
            availableActions = await this._buildTurnOptions(session, sceneDetails, feedBlocks);

            await dbOps.usersDb.run(
                "UPDATE narrative_game_sessions SET feed_history = ?, current_available_actions = ? WHERE session_id = ?",
                [JSON.stringify(feedBlocks), JSON.stringify(availableActions), session.session_id]
            );
        }

        const storyCatalog = await dbOps.narrativeOps.getStoryCatalog();
        const storyEntry = storyCatalog.find(s => s.story_id === session.story_id);

        return {
            storyMeta: { storyId: session.story_id, title: storyEntry?.title || session.story_id, subtitle: storyEntry?.subtitle || "" },
            sessionId: session.session_id, currentSceneId: session.current_scene_id,
            feedBlocks, availableActions, status: session.session_status
        };
    }

    /**
     * 統一處理玩家的回合行動 (Phase 1.9 Turn-Based Loop)
     */
    async processTurnAction(userId, sessionId, actionPayload) {
        const session = await dbOps.usersDb.get(
            "SELECT * FROM narrative_game_sessions WHERE session_id = ? AND user_id = ?", [sessionId, userId]
        );
        if (!session) throw new Error('Session not found or unauthorized');

        const { story_id, current_scene_id } = session;
        const scene = await narrativeService.getSceneWithDetails(story_id, current_scene_id, sessionId);

        let history = typeof session.feed_history === 'string' ? JSON.parse(session.feed_history || '[]') : (session.feed_history || []);
        if (!history) history = [];

        let newBlocks = [];
        const userQueryOrAction = actionPayload.text || actionPayload.label || actionPayload.actionId;

        // Record player action in the permanent feed history
        const playerBlock = {
            id: `blk_usr_${Date.now()}`,
            type: actionPayload.type === 'free_input' ? 'character_speech' : 'system_note',
            speaker: actionPayload.type === 'free_input' ? '你 (觀察者)' : undefined,
            text: actionPayload.type === 'free_input' ? userQueryOrAction : `— 採取行動：${actionPayload.label} —`
        };

        // 1. 系統判定行動類型並分派給對應模型
        if (actionPayload.type === 'dialogue' || actionPayload.type === 'free_input') {
            const aiResult = await LogosEngine.askBrain('story_interaction', {
                mode: 'character_reply',
                user_query: userQueryOrAction,
                target_npc: actionPayload.label || '場景人物',
                scene_context: scene,
                last_blocks: history.slice(-5)
            });
            newBlocks = this._assignBlockIds(aiResult.blocks);
        } else if (actionPayload.type === 'system') {
            newBlocks = this._assignBlockIds([{ type: 'system_note', text: `系統紀錄：您選擇了「${actionPayload.label}」` }]);
        } else {
            const aiResult = await LogosEngine.askBrain('story_interaction', {
                mode: 'narrative_offset',
                scene_context: scene,
                user_query: userQueryOrAction,
                last_blocks: history.slice(-5)
            });
            newBlocks = this._assignBlockIds(aiResult.blocks);
        }

        // 把新產生的 blocks 加入歷史
        const updatedHistory = [...history, playerBlock, ...newBlocks];

        // 呼叫 TurnOptionBuilder 產生下一套按鈕
        const nextActions = await this._buildTurnOptions(session, scene, updatedHistory);

        // 更新資料庫
        const nextTurnId = (session.current_turn_id || 1) + 1;
        await dbOps.usersDb.run(
            "UPDATE narrative_game_sessions SET feed_history = ?, current_available_actions = ?, current_turn_id = ? WHERE session_id = ?",
            [JSON.stringify(updatedHistory), JSON.stringify(nextActions), nextTurnId, sessionId]
        );

        return {
            sessionId, storyId: story_id, currentSceneId: current_scene_id,
            feedBlocks: updatedHistory, availableActions: nextActions, status: session.session_status
        };
    }

    /**
     * 將 Scene 資料對應為首次進入的 Feed Blocks
     */
    _mapSceneToFeed(scene) {
        const blocks = [];
        blocks.push({ type: 'divider', label: scene.title });
        if (scene.entry_text) blocks.push({ type: 'narration', text: scene.entry_text });
        if (scene.characters && scene.characters.length > 0) {
            scene.characters.forEach(c => {
                if (c.overlay?.introduction) {
                    blocks.push({ type: 'system_note', text: `[人物情報] ${c.display_name}：${c.overlay.introduction}` });
                }
            });
        }
        return blocks;
    }
}

export const gameSessionService = new GameSessionService();
