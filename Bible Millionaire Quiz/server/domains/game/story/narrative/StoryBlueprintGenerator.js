import { dbOps } from '../../../../database/index.js';
import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';
import { randomUUID } from 'crypto';

/**
 * StoryBlueprintGenerator (JIT AI 開發機)
 * 負責將玩家選定的經文，轉化為嚴格且可重複執行的 SQLite Blueprint 資料結構。
 */
class StoryBlueprintGenerator {
    /**
     * 產生整個故事的 Blueprint 並寫入資料庫
     * @param {string} scriptureReference e.g. "馬可福音 5:25-34"
     * @param {string} passageText 完整的經文文字
     * @param {string} userId (Audit usage)
     * @returns {Promise<string>} story_id
     */
    static async generateBlueprintFromScripture(scriptureReference, passageText, userId) {
        console.log(`\n[StoryBlueprintGenerator] 🚀 起始 JIT 開發機: ${scriptureReference}`);

        try {
            // Check if it already exists by primary_source roughly (or we can just skip this if the router checks it)
            // For MVP, assume the caller already checked.

            const prompt = `您是世界頂級的『聖經互動敘事架構師』與資料庫設計師。
玩家剛選定了這段經文：【${scriptureReference}】
經文內容：
${passageText}

您的任務是將這段經文『解構』並『轉換』為符合我們「遊戲引擎 Schema」的嚴格 JSON 藍圖。

### 【十三條不可侵犯的全局戒律】
1. 不可改寫節點 (Immutable Beats)：聖經記載的具體事件、醫治結果、神蹟過程、核心對話，絕對不可替換或改變。
2. 張力與懸念分場 (Tension-Based Scene Cuts)：場景不按節數切，而是按敘事張力與懸念切分。每場必須有具體目標 (Goal)。
3. Interpretation Beats (視角切入)：允許加入文化背景、群眾壓力等非事件的情感鋪墊。
4. 知識邊界 (Knowledge Scopes)：NPC 只知道他該知道的事。神性知識不可隨意賦予凡人。
5. 匿名角色的代表性：無名角色（如：門徒之一）要有代表性的反應。
6. 有限的內心獨白：玩家角色的內心戲必須克制，不可喧賓奪主。
7. 線程控制 (Threads)：區分 active(當前), active_background(背景推進), paused(暫停)。例如崖魯在血漏婦人事件中屬於 active_background 乾著急。
8. 玩家的有限代理權 (Witness/Participant Boundaries)：玩家不能當主動推動神蹟的人。
9. 錯過容忍度 (Missable vs Required Beats)：允許玩家因為某些行動錯過支線資訊，但主線 beat 必定發生。
10. AI 的效能歸位：AI 只能用來說明、潤飾，不准 AI 取代 Engine 的決策邏輯。Engine 負責驗證按鈕！
11. NPC 階級系統 (Archetypes & Slots)：NPC 必須要有明確的類型（canonical, scene_fixed, ambient_archetype）與互動深度。
12. (不適用於此生成器，這是事前評估層)
13. 模組重用與上下文覆蓋 (Overlays)：如果這是一個被夾在中間的故事（例如血漏婦人），它應該被標記為 reusable_as_module: true。

### 【資料結構要求】
1. \`story\`: 故事主體 (不可空)
2. \`npc_archetypes\`: 至少包含 2-3 個符合第 11 戒律的 NPC 原型 (NPCs)。
3. \`lore\`: 至少包含 2 條文化背景知識 (Lore)。
4. \`scenes\`: 至少切分 2-4 個場景。
    - 每個 scene 的 \`actions.mainline\` 至少提供 1-2 個推動主線的選擇 (必須設定 \`targetSceneId\`)。
    - 主線 Action 必須且只能引導至另一個 scene_id (或者結束則 null)。

請回傳符合預期 \`story_blueprint_generation\` Schema 的嚴格 JSON。不需回應其他解釋。`;

            console.log(`[StoryBlueprintGenerator] 🧠 呼叫 LogosEngine (Task: story_blueprint_generation)...`);

            // Expected to cost some tokens. Use lower temperature for deterministic structure.
            const blueprintRaw = await LogosEngine.askBrain('blueprint_builder', { scriptureReference, passageText }, {
                temperature: 0.1
            });

            if (!blueprintRaw || !blueprintRaw.story || !blueprintRaw.scenes || blueprintRaw.scenes.length === 0) {
                throw new Error("AI failed to generate a valid blueprint.");
            }

            // AI might not generate UUIDs or proper IDs, let's normalize them
            const blueprint = this._normalizeBlueprintIDs(blueprintRaw, scriptureReference);

            console.log(`[StoryBlueprintGenerator] ✅ AI 生成完成。準備寫入資料庫... (Story ID: ${blueprint.story.id})`);
            await this._persistBlueprintToDB(blueprint);
            console.log(`[StoryBlueprintGenerator] 💾 藍圖寫入完成。`);

            return blueprint.story.id;

        } catch (error) {
            console.error('[StoryBlueprintGenerator] Error generating blueprint:', error);
            throw error;
        }
    }

    /**
     * 正規化 AI 產生的 ID，確保格式一致且不衝突
     */
    static _normalizeBlueprintIDs(blueprint, ref) {
        const timestamp = Date.now().toString(36);
        const refSlug = ref.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10).toLowerCase();
        const basePrefix = `story_${refSlug}_${timestamp}`;

        // Normalize Story ID
        blueprint.story.id = blueprint.story.id || basePrefix;

        // Map old IDs to new IDs for internal linking
        const idMapping = { scenes: {}, npcs: {}, loris: {} };

        // Normalize Scenes
        blueprint.scenes.forEach((scene, index) => {
            const newId = `${basePrefix}_scene_${index + 1}`;
            if (scene.id) idMapping.scenes[scene.id] = newId;
            // Also map implicit start scene
            if (blueprint.story.start_scene_id === scene.id) {
                blueprint.story.start_scene_id = newId;
            }
            scene.id = newId;
        });

        // 確保 start_scene_id 正確對應到第一個 scene (如果 AI 弄錯了)
        if (!blueprint.scenes.find(s => s.id === blueprint.story.start_scene_id)) {
            blueprint.story.start_scene_id = blueprint.scenes[0].id;
        }

        // Normalize NPCs
        blueprint.npc_archetypes.forEach((npc, index) => {
            const newId = `${basePrefix}_npc_${index + 1}`;
            if (npc.id) idMapping.npcs[npc.id] = newId;
            npc.id = newId;
        });

        // Normalize Lore
        blueprint.lore.forEach((l, index) => {
            const newId = `${basePrefix}_lore_${index + 1}`;
            if (l.id) idMapping.loris[l.id] = newId;
            l.id = newId;
        });

        // Update Scene Internal Links
        blueprint.scenes.forEach(scene => {
            // Update NPC slots mapping
            if (scene.npc_slots) {
                scene.npc_slots.forEach((slot, sIdx) => {
                    const mappedId = idMapping.npcs[slot.archetype_id];
                    if (mappedId) slot.archetype_id = mappedId;

                    const slotNewId = `${scene.id}_slot_${sIdx + 1}`;
                    idMapping.npcs[slot.slot_id] = slotNewId; // for dialogue actions later
                    slot.slot_id = slotNewId;
                });
            }

            // Update cross-scene action links
            if (scene.actions && scene.actions.mainline) {
                scene.actions.mainline.forEach((act, actIdx) => {
                    act.actionId = `${scene.id}_act_main_${actIdx + 1}`;
                    if (act.targetSceneId && idMapping.scenes[act.targetSceneId]) {
                        act.targetSceneId = idMapping.scenes[act.targetSceneId];
                    }
                });
            }
            if (scene.actions && scene.actions.interaction) {
                scene.actions.interaction.forEach((act, actIdx) => {
                    act.actionId = `${scene.id}_act_int_${actIdx + 1}`;
                    if (act.targetSceneId && idMapping.scenes[act.targetSceneId]) {
                        act.targetSceneId = idMapping.scenes[act.targetSceneId];
                    }
                });
            }
            if (scene.actions && scene.actions.dialogue) {
                scene.actions.dialogue.forEach((act, actIdx) => {
                    act.actionId = `${scene.id}_act_dlg_${actIdx + 1}`;
                    if (act.targetNpcSlotId && idMapping.npcs[act.targetNpcSlotId]) {
                        act.targetNpcSlotId = idMapping.npcs[act.targetNpcSlotId];
                    }
                });
            }
            if (scene.actions && scene.actions.system) {
                scene.actions.system.forEach((act, actIdx) => {
                    act.actionId = `${scene.id}_act_sys_${actIdx + 1}`;
                    if (act.loreId && idMapping.loris[act.loreId]) {
                        act.loreId = idMapping.loris[act.loreId];
                    }
                });
            }
        });

        return blueprint;
    }

    /**
     * 寫入 Database
     */
    static async _persistBlueprintToDB(blueprint) {
        // We use batchSave/add to abstract Postgres interactions
        const storyData = {
            id: blueprint.story.id,
            title: blueprint.story.title,
            primary_source: blueprint.story.primary_source,
            parallel_refs_json: JSON.stringify(blueprint.story.parallel_refs || []),
            immutable_beats_json: JSON.stringify(blueprint.story.immutable_beats || []),
            threads_json: JSON.stringify(blueprint.story.threads || []),
            start_scene_id: blueprint.story.start_scene_id,
            reusable_as_module: blueprint.story.reusable_as_module || false,
            status: 'published'
        };
        await dbOps.add('narrative_stories_v2', storyData);

        // Save Lore
        for (const l of blueprint.lore) {
            await dbOps.add('narrative_story_lore_v2', {
                id: l.id,
                story_id: storyData.id,
                title: l.title,
                content: l.content,
                category: l.category || 'general'
            });
        }

        // Save NPC Archetypes
        for (const npc of blueprint.npc_archetypes) {
            await dbOps.add('narrative_npc_archetypes', {
                id: npc.id,
                story_id: storyData.id,
                npc_type: npc.npc_type,
                label: npc.label,
                social_role: npc.social_role || '',
                speech_style: npc.speech_style || '',
                knowledge_scope: npc.knowledge_scope,
                theological_authority: npc.theological_authority || 'none',
                interaction_depth: npc.interaction_depth || 'light',
                persistence: npc.persistence || 'scene_only',
                allowed_functions_json: JSON.stringify(npc.allowed_functions || []),
                forbidden_functions_json: JSON.stringify(npc.forbidden_functions || [])
            });
        }

        // Save Scenes & NPC Slots
        for (const scene of blueprint.scenes) {
            await dbOps.add('narrative_story_scenes_v2', {
                id: scene.id,
                story_id: storyData.id,
                title: scene.title,
                goal: scene.goal,
                must_happen_json: JSON.stringify(scene.must_happen || []),
                entry_text: scene.entry_text,
                actions_json: JSON.stringify(scene.actions || {}),
                characters_present_json: JSON.stringify(scene.characters_present || [])
            });

            if (scene.npc_slots && scene.npc_slots.length > 0) {
                for (const slot of scene.npc_slots) {
                    await dbOps.add('narrative_scene_npc_slots', {
                        id: randomUUID(), // slot row id
                        scene_id: scene.id,
                        slot_id: slot.slot_id, // Internal slot ref
                        archetype_id: slot.archetype_id,
                        headcount: slot.headcount || 1,
                        is_interactive: slot.is_interactive || false,
                        priority: slot.priority || 'medium'
                    });
                }
            }
        }
    }
}

export default StoryBlueprintGenerator;
