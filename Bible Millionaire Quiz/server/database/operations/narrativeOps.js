/**
 * 敘事引擎資料庫操作 (Narrative Engine Operations)
 * 負責故事內容讀取與玩家進度存取
 * 
 * 分責說明：
 * - 靜態內容 (Stories/Scenes/Characters/Lore) 存放於 contentDb
 * - 玩家狀態 (Sessions/Progress/Logs) 存放於 usersDb (或稱 gamesDb，取決於配置)
 */

export function createNarrativeOps(contentDb, usersDb) {
    return {
        // === 故事內容讀取 (contentDb) ===
        
        async getStory(storyId) {
            return await contentDb.get('SELECT * FROM narrative_stories WHERE story_id = ?', [storyId]);
        },

        async saveStory(story) {
            await contentDb.run(`
                INSERT INTO narrative_stories (story_id, title, testament, entry_scene_id, status, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (story_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    testament = EXCLUDED.testament,
                    entry_scene_id = EXCLUDED.entry_scene_id,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
            `, [story.story_id, story.title, story.testament || 'OT', story.entry_scene_id || 'start', story.status || 'draft']);
        },

        async getStoryCatalog() {
            const rows = await contentDb.query('SELECT * FROM narrative_story_catalog WHERE status = $1', ['published']);
            for (const row of rows) {
                try { row.theme_tags_json = typeof row.theme_tags_json === 'string' ? JSON.parse(row.theme_tags_json) : row.theme_tags_json; } catch (e) { row.theme_tags_json = []; }
                try { row.character_tags_json = typeof row.character_tags_json === 'string' ? JSON.parse(row.character_tags_json) : row.character_tags_json; } catch (e) { row.character_tags_json = []; }
                try { row.event_tags_json = typeof row.event_tags_json === 'string' ? JSON.parse(row.event_tags_json) : row.event_tags_json; } catch (e) { row.event_tags_json = []; }
                try { row.primary_source_refs_json = typeof row.primary_source_refs_json === 'string' ? JSON.parse(row.primary_source_refs_json) : row.primary_source_refs_json; } catch (e) { row.primary_source_refs_json = []; }
                try { row.parallel_source_refs_json = typeof row.parallel_source_refs_json === 'string' ? JSON.parse(row.parallel_source_refs_json) : row.parallel_source_refs_json; } catch (e) { row.parallel_source_refs_json = []; }
            }
            return rows;
        },

        async saveStoryCatalog(item) {
            await contentDb.run(`
                INSERT INTO narrative_story_catalog (
                    story_id, title, subtitle, summary, theme_tags_json, character_tags_json, 
                    event_tags_json, primary_source_refs_json, parallel_source_refs_json, status, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (story_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    subtitle = EXCLUDED.subtitle,
                    summary = EXCLUDED.summary,
                    theme_tags_json = EXCLUDED.theme_tags_json,
                    character_tags_json = EXCLUDED.character_tags_json,
                    event_tags_json = EXCLUDED.event_tags_json,
                    primary_source_refs_json = EXCLUDED.primary_source_refs_json,
                    parallel_source_refs_json = EXCLUDED.parallel_source_refs_json,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
            `, [
                item.story_id, item.title, item.subtitle, item.summary, 
                JSON.stringify(item.theme_tags_json || []), JSON.stringify(item.character_tags_json || []),
                JSON.stringify(item.event_tags_json || []), JSON.stringify(item.primary_source_refs_json || []),
                JSON.stringify(item.parallel_source_refs_json || []), item.status || 'published'
            ]);
        },

        async getSceneBlueprint(storyId, sceneId) {
            const row = await contentDb.get(`
                SELECT * FROM narrative_story_scenes 
                WHERE story_id = ? AND scene_id = ?
            `, [storyId, sceneId]);
            
            if (row) {
                // Parse JSON fields
                try { row.lore_keys = typeof row.lore_keys === 'string' ? JSON.parse(row.lore_keys) : row.lore_keys; } catch (e) { row.lore_keys = []; }
                try { row.character_ids = typeof row.character_ids === 'string' ? JSON.parse(row.character_ids) : row.character_ids; } catch (e) { row.character_ids = []; }
                try { row.scripture_refs_json = typeof row.scripture_refs_json === 'string' ? JSON.parse(row.scripture_refs_json) : row.scripture_refs_json; } catch (e) { row.scripture_refs_json = []; }
                try { row.source_entity_ids_json = typeof row.source_entity_ids_json === 'string' ? JSON.parse(row.source_entity_ids_json) : row.source_entity_ids_json; } catch (e) { row.source_entity_ids_json = []; }
                try { row.source_commentary_ids_json = typeof row.source_commentary_ids_json === 'string' ? JSON.parse(row.source_commentary_ids_json) : row.source_commentary_ids_json; } catch (e) { row.source_commentary_ids_json = []; }
            }
            return row || null;
        },

        async saveSceneBlueprint(scene) {
            await contentDb.run(`
                INSERT INTO narrative_story_scenes (
                    story_id, scene_id, title, entry_text, main_goal, main_choice_label, 
                    next_scene_id, scripture_refs_json, generation_mode, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (story_id, scene_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    entry_text = EXCLUDED.entry_text,
                    main_goal = EXCLUDED.main_goal,
                    main_choice_label = EXCLUDED.main_choice_label,
                    next_scene_id = EXCLUDED.next_scene_id,
                    scripture_refs_json = EXCLUDED.scripture_refs_json,
                    generation_mode = EXCLUDED.generation_mode,
                    updated_at = EXCLUDED.updated_at
            `, [
                scene.story_id, scene.scene_id, scene.title, scene.entry_text || '', 
                scene.main_goal, scene.main_choice_label, scene.next_scene_id,
                JSON.stringify(scene.scripture_refs_json || []), scene.generation_mode || 'fixed'
            ]);
        },

        async getSceneLore(storyId, loreKeys) {
            if (!loreKeys || loreKeys.length === 0) return [];
            // Handle array of keys
            const placeholders = loreKeys.map(() => '?').join(',');
            return await contentDb.query(`
                SELECT * FROM narrative_story_lore 
                WHERE story_id = ? AND lore_key IN (${placeholders})
            `, [storyId, ...loreKeys]);
        },

        async getSceneCharacters(storyId, characterIds) {
            if (!characterIds || characterIds.length === 0) return [];
            const placeholders = characterIds.map(() => '?').join(',');
            return await contentDb.query(`
                SELECT * FROM narrative_story_characters 
                WHERE story_id = ? AND character_id IN (${placeholders})
            `, [storyId, ...characterIds]);
        },

        async getCharacterOverlay(storyId, sceneId, characterId) {
            const row = await contentDb.get(`
                SELECT * FROM narrative_story_character_overlays 
                WHERE story_id = ? AND scene_id = ? AND character_id = ?
            `, [storyId, sceneId, characterId]);

            if (row) {
                try { row.knows_json = typeof row.knows_json === 'string' ? JSON.parse(row.knows_json) : row.knows_json; } catch (e) { row.knows_json = []; }
                try { row.can_reveal_json = typeof row.can_reveal_json === 'string' ? JSON.parse(row.can_reveal_json) : row.can_reveal_json; } catch (e) { row.can_reveal_json = []; }
                try { row.should_avoid_json = typeof row.should_avoid_json === 'string' ? JSON.parse(row.should_avoid_json) : row.should_avoid_json; } catch (e) { row.should_avoid_json = []; }
                try { row.response_policy_json = typeof row.response_policy_json === 'string' ? JSON.parse(row.response_policy_json) : row.response_policy_json; } catch (e) { row.response_policy_json = {}; }
            }
            return row || null;
        },

        // === 玩家狀態存取 (usersDb) ===

        async getOrCreateNarrativeSession(userId, storyId) {
            // Find active session
            let session = await usersDb.get(`
                SELECT * FROM narrative_game_sessions 
                WHERE user_id = ? AND story_id = ? AND session_status = 'active'
                ORDER BY created_at DESC LIMIT 1
            `, [userId, storyId]);

            if (!session) {
                // Create new session
                const story = await this.getStory(storyId);
                const entrySceneId = story?.entry_scene_id || 'start';
                
                // Use .get() with RETURNING * to cleanly get the inserted row directly 
                // and bypass PostgresAdapter.run() lastInsertRowid mapping issues.
                session = await usersDb.get(`
                    INSERT INTO narrative_game_sessions (user_id, story_id, current_scene_id, session_status)
                    VALUES (?, ?, ?, 'active')
                    RETURNING *
                `, [userId, storyId, entrySceneId]);
            }
            return session;
        },

        async getActiveSession(userId) {
            return await usersDb.get(`
                SELECT s.*, c.title as story_title
                FROM narrative_game_sessions s
                LEFT JOIN narrative_story_catalog c ON s.story_id = c.story_id
                WHERE s.user_id = ? AND s.session_status = 'active'
                ORDER BY s.created_at DESC LIMIT 1
            `, [userId]);
        },

        async abandonUserActiveSessions(userId) {
            await usersDb.run(`
                UPDATE narrative_game_sessions 
                SET session_status = 'abandoned', updated_at = CURRENT_TIMESTAMP 
                WHERE user_id = ? AND session_status = 'active'
            `, [userId]);
        },

        async updateNarrativeSessionScene(sessionId, nextSceneId) {
            await usersDb.run(`
                UPDATE narrative_game_sessions 
                SET current_scene_id = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE session_id = ?
            `, [nextSceneId, sessionId]);
        },

        async upsertUserStoryProgress(userId, storyId, sceneId) {
            await usersDb.run(`
                INSERT INTO user_story_progress (user_id, story_id, current_scene_id, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, story_id) DO UPDATE SET
                    current_scene_id = EXCLUDED.current_scene_id,
                    updated_at = EXCLUDED.updated_at
            `, [userId, storyId, sceneId]);
        },

        async getSceneState(sessionId, sceneId) {
            const row = await usersDb.get(`
                SELECT * FROM narrative_scene_states 
                WHERE session_id = ? AND scene_id = ?
            `, [sessionId, sceneId]);
            
            if (row && typeof row.local_flags_json === 'string') {
                try { row.local_flags_json = JSON.parse(row.local_flags_json); } catch (e) { row.local_flags_json = {}; }
            }
            return row || null;
        },

        async updateSceneState(sessionId, storyId, sceneId, updates) {
            await usersDb.run(`
                INSERT INTO narrative_scene_states (
                    session_id, story_id, scene_id, goal_progress, is_completed, local_flags_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (session_id, scene_id) DO UPDATE SET
                    goal_progress = COALESCE(?, narrative_scene_states.goal_progress),
                    is_completed = COALESCE(?, narrative_scene_states.is_completed),
                    local_flags_json = COALESCE(?, narrative_scene_states.local_flags_json),
                    updated_at = EXCLUDED.updated_at
            `, [
                sessionId, storyId, sceneId, 
                updates.goalProgress || 0, updates.isCompleted || false, JSON.stringify(updates.localFlags || {}),
                updates.goalProgress, updates.isCompleted, JSON.stringify(updates.localFlags)
            ]);
        }
    };
}
