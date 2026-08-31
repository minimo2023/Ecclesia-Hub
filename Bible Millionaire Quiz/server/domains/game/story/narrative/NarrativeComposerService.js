import { dbOps } from '../../../../database/index.js';
import { ContentManager } from '../../../content/bible/ContentManager.js';
import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';

/**
 * NarrativeComposerService
 *
 * 核心職責：場景內容合成與組裝 (Scene Composition)
 */
class NarrativeComposer {
    /**
     * 合成場景 Payload
     */
    async composeScenePayload(storyId, sceneId, sessionId = null) {
        // 1. 獲取場景骨架 (Blueprint)
        let blueprint = await dbOps.getSceneBlueprint(storyId, sceneId);

        // 救援邏輯：如果因為斷線或異常導致 start 場景遺失，則自動補回一個草稿骨架
        if (!blueprint && sceneId === 'start') {
            console.warn(`[Composer] Rescuing missing start blueprint for ${storyId}. Creating a fresh one.`);
            blueprint = {
                story_id: storyId,
                scene_id: 'start',
                title: '故事序幕',
                entry_text: '',
                main_goal: '體驗這段聖經歷史的開端',
                main_choice_label: '繼續探索',
                next_scene_id: 'end_of_mvp',
                scripture_refs_json: [],
                generation_mode: 'ai_assisted'
            };
            await dbOps.narrativeOps.saveSceneBlueprint(blueprint).catch(e => console.error('Failed to rescue blueprint', e));
        }

        if (!blueprint) {
            throw new Error(`Scene Blueprint not found: ${sceneId}`);
        }

        // 2. 組裝上下文 (Context Assembly)
        const context = await this._assembleContext(blueprint);

        // 3. 解決文本內容 (Content Resolution)
        const resolvedText = await this._resolveEntryText(blueprint, context);

        // 4. 解析角色資訊 (Character Summaries)
        const characters = await this._resolveCharacters(storyId, sceneId, blueprint.character_ids);

        // 5. 解析知識點 (Lore Buttons)
        const lore = await dbOps.getSceneLore(storyId, blueprint.lore_keys);

        // 6. 整合最終 Payload (Minimization)
        return {
            story_id: storyId,
            scene_id: sceneId,
            title: blueprint.title,
            entry_text: resolvedText,
            main_goal: blueprint.main_goal,
            main_choice_label: blueprint.main_choice_label,
            next_scene_id: blueprint.next_scene_id,
            is_terminal: Boolean(blueprint.is_terminal),
            characters: characters.map(c => ({
                id: c.character_id,
                name: c.display_name,
                identity: c.identity,
                role: c.role_type,
                emotion: c.overlay?.emotional_state || 'neutral'
            })),
            lore: lore.map(l => ({
                key: l.lore_key,
                title: l.title,
                category: l.category
            })),
            scripture_context: blueprint.scripture_refs_json, // 只傳引用
            generation_mode: blueprint.generation_mode,
            entry_text_source: blueprint.entry_text_source
        };
    }

    /**
     * 內部方法：從 contentDb 撈取相關資料
     */
    async _assembleContext(blueprint) {
        const refs = blueprint.scripture_refs_json || [];

        const context = {
            verses: [],
            entities: []
        };

        // 1. 獲取經文本文
        for (const ref of refs) {
            const chapterData = await ContentManager.getChapterVerses(ref.book_id, ref.chapter);
            const versesInRange = chapterData.filter(v => v.verse >= ref.verse_start && v.verse <= ref.verse_end);
            context.verses.push(...versesInRange);
        }

        return context;
    }

    /**
     * 內部方法：解決場景本文
     */
    async _resolveEntryText(blueprint, context) {
        if (blueprint.generation_mode === 'fixed') {
            return blueprint.entry_text;
        }

        if (blueprint.entry_text && blueprint.entry_text.trim() !== '') {
            return blueprint.entry_text;
        }

        return this._generateAISceneText(blueprint, context);
    }

    /**
     * 內部方法：解析角色 Overlays
     */
    async _resolveCharacters(storyId, sceneId, characterIds) {
        if (!characterIds || characterIds.length === 0) return [];

        const baseChars = await dbOps.getSceneCharacters(storyId, characterIds);
        const charsWithOverlays = [];

        for (const char of baseChars) {
            const overlay = await dbOps.getCharacterOverlay(storyId, sceneId, char.character_id);
            charsWithOverlays.push({
                ...char,
                overlay: overlay || null
            });
        }
        return charsWithOverlays;
    }

    /**
     * 核心邏輯：Phase 1.8 AI 場景草稿生成
     */
    async _generateAISceneText(blueprint, context) {
        try {
            console.log(`[Composer] Drafting AI scene text for ${blueprint.scene_id}...`);
            const story = await dbOps.getStory(blueprint.story_id);
            const storyTitle = story?.title || blueprint.story_id;

            const draftingResult = await LogosEngine.askBrain('story_scene_drafting', {
                story_title: storyTitle,
                scene_title: blueprint.title,
                main_goal: blueprint.main_goal,
                verses: context.verses
            });

            console.log('[Composer] Raw AI Drafting Result:', JSON.stringify(draftingResult, null, 2));

            if (draftingResult && draftingResult.entry_text) {
                // 自動將產生的本文寫入 DB，避免每次重新整理都重新調用 AI
                blueprint.entry_text = draftingResult.entry_text;
                // 注意：這需要呼叫 dbOps 來更新。我們在這裡背景處理。
                // 若能在這裡轉為 fixed 模式更好，表示已由 AI 提供完成版草稿
                blueprint.generation_mode = 'fixed';
                dbOps.narrativeOps.saveSceneBlueprint(blueprint).catch(err =>
                    console.error('[Composer] Background save of AI drafted scene failed:', err)
                );

                // 自動將產生的 Lore 寫入 DB 以便後續查看 (非優先，但建議實作)
                if (draftingResult.lore_items && draftingResult.lore_items.length > 0) {
                    this._backgroundSaveLore(blueprint.story_id, draftingResult.lore_items);
                }

                return draftingResult.entry_text;
            }

            return this._generateFallbackText(blueprint, context);
        } catch (error) {
            console.error('[Composer] AI Drafting failed:', error);
            return this._generateFallbackText(blueprint, context);
        }
    }

    /**
     * 備援邏輯：場景本文失效時的 Deterministic Fallback
     */
    _generateFallbackText(blueprint, context) {
        let text = `[系統提示：本場景為動態合成模式，AI 生成暫時不可用] \n\n`;

        if (context.verses.length > 0) {
            text += `依據經文來源：\n`;
            context.verses.forEach(v => {
                text += `(${v.chapter}:${v.verse}) ${v.text}\n`;
            });
        } else {
            text += `本場景尚未配置 entry_text，且未找到相關經文參考。\n`;
            text += `目標：${blueprint.main_goal || '無'}`;
        }

        return text;
    }

    /**
     * 背景保存產生出來的 Lore
     */
    async _backgroundSaveLore(storyId, loreItems) {
        try {
            for (const item of loreItems) {
                // TODO: 這裡可以串接 dbOps.narrativeOps.saveStoryLore 如果有的話
                // 暫時 Log，避免阻塞主流程
                console.log(`[Composer] AI suggested lore: ${item.title}`);
            }
        } catch (e) {
            console.error('Background lore save failed', e);
        }
    }
}

export const NarrativeComposerService = new NarrativeComposer();
