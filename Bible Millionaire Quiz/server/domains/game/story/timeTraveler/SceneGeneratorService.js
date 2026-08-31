import { ContentManager } from '../../../content/bible/ContentManager.js';
import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';
import { usersDb } from '../../../../database/index.js';
import { safeParseJSON } from '../../../../utils/ai-parser.js';
import crypto from 'crypto';

const BIBLE_BOOKS_ORDER = [
    '創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記', '撒母耳記上', '撒母耳記下',
    '列王紀上', '列王紀下', '歷代志上', '歷代志下', '以斯拉記', '尼希米記', '以斯帖記', '約伯記', '詩篇', '箴言',
    '傳道書', '雅歌', '賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書',
    '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書',
    '馬太福音', '馬可福音', '路加福音', '約翰福音', '使徒行傳', '羅馬書', '哥林多前書', '哥林多後書', '加拉太書',
    '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書', '提多書',
    '腓利門書', '希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', '約翰二書', '約翰三書', '猶大書', '啟示錄'
];

function getBookOrder(ref) {
    if (!ref) return 999;
    const bookMatch = ref.match(/^([\u4e00-\u9fa5]+|[a-zA-Z\s]+)(?=\s+\d+)/);
    const name = bookMatch ? bookMatch[1].trim() : ref;
    const index = BIBLE_BOOKS_ORDER.indexOf(name);
    return index !== -1 ? index : 999;
}

/**
 * 聖經時空旅人 - 動態場景產生器 (V2 Blueprint-Driven)
 * 核心職責：
 * 1. 管理故事藍圖 (Story Blueprint) 的生命週期。
 * 2. 透過 LogosEngine 生成結構化的「不可侵犯律法 (Immutable Beats)」。
 * 3. 將 V2 藍圖映射至 Time Traveler 運行時場景空間。
 */

export async function getOrGenerateScene(scripture_reference, topic) {
    if (!scripture_reference) throw new Error("Missing scripture reference");
    await ContentManager.initialize();

    // 1. 產生故事 ID (基於經文範圍的穩定 Hash)
    const storyId = 'st_v2_' + crypto.createHash('md5').update(scripture_reference).digest('hex').substring(0, 10);

    // 2. 檢查是否已有 V2 藍圖故事
    let story = await usersDb.get('SELECT * FROM narrative_stories_v2 WHERE id = $1', [storyId]);

    if (!story) {
        console.log(`[SceneGenerator] 🚀 啟動 LogosEngine V2 藍圖生成流程: ${scripture_reference}`);

        // 獲取經文本文作為 Ground Truth
        const passageText = await ContentManager.getPassageContent(scripture_reference);

        // 呼叫 LogosEngine 生成完整藍圖
        const blueprint = await LogosEngine.askBrain('blueprint_builder', {
            scriptureReference: scripture_reference,
            passageText: passageText,
            userIntent: topic
        });

        if (!blueprint || !blueprint.story) {
            throw new Error("Failed to generate narrative blueprint via LogosEngine.");
        }

        // 3. 核心修正：將所有內部 ID 加上 storyId 前綴，確保全域唯一性
        console.log(`[SceneGenerator] 🔍 執行 ID 前綴化，StoryId: ${storyId}`);
        prefixBlueprintIds(blueprint, storyId);

        // 3b. 進階規劃 (Phase 2)：建立全域實體連結
        // 嘗試將故事角色連結至全域資料庫（例如將「摩西」連結至全域摩西實體）
        await mapGlobalEntities(blueprint);

        // 4. 儲存藍圖至資料庫 (V2 Tables)
        await usersDb.transaction(async (tx) => {
            // A. 儲存故事主表
            await tx.run(`
                INSERT INTO narrative_stories_v2 (
                    id, title, primary_source, immutable_beats_json, threads_json, start_scene_id, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'published')
                ON CONFLICT (id) DO NOTHING
            `, [
                storyId,
                blueprint.story.title || scripture_reference,
                scripture_reference,
                JSON.stringify(blueprint.story.immutable_beats || []),
                JSON.stringify(blueprint.story.threads || []),
                blueprint.story.start_scene_id || `${storyId}_scene_start`
            ]);

            // B. 儲存 NPC 原型
            if (blueprint.npc_archetypes) {
                for (const npc of blueprint.npc_archetypes) {
                    console.log(`[SceneGenerator] 💾 正在儲存 NPC: ${npc.id} (${npc.label})`);
                    await tx.run(`
                        INSERT INTO narrative_npc_archetypes (
                            id, story_id, npc_type, label, social_role, speech_style,
                            knowledge_scope, theological_authority, interaction_depth, persistence,
                            global_entity_id, source_archetype_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        npc.id,
                        storyId,
                        npc.npc_type || 'historical',
                        npc.label || 'Unknown',
                        npc.social_role || '',
                        npc.speech_style || '',
                        npc.knowledge_scope || 'Scripture basis',
                        npc.theological_authority || 'none',
                        npc.interaction_depth || 'light',
                        npc.persistence || 'scene',
                        npc.global_entity_id || null,
                        npc.source_archetype_id || null
                    ]);
                }
            }

            // C. 儲存場景
            if (blueprint.scenes) {
                for (const scene of blueprint.scenes) {
                    await tx.run(`
                        INSERT INTO narrative_story_scenes_v2 (
                            id, story_id, title, goal, must_happen_json, entry_text, actions_json
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        scene.id, storyId, scene.title, scene.goal,
                        JSON.stringify(scene.must_happen || []),
                        scene.entry_text,
                        JSON.stringify(scene.actions || {})
                    ]);

                    // D. 儲存場景 NPC 插槽
                    if (scene.npc_slots) {
                        for (const slot of scene.npc_slots) {
                            await tx.run(`
                                INSERT INTO narrative_scene_npc_slots (
                                    id, scene_id, slot_id, archetype_id, headcount, is_interactive, priority
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                                ON CONFLICT (id) DO NOTHING
                            `, [
                                `${scene.id}_${slot.slot_id}`, scene.id, slot.slot_id, slot.archetype_id,
                                slot.headcount || 1, slot.is_interactive || false, slot.priority || 'medium'
                            ]);
                        }
                    }
                }
            }

            // E. 儲存知識點 (Lore)
            if (blueprint.lore) {
                for (const l of blueprint.lore) {
                    await tx.run(`
                        INSERT INTO narrative_story_lore_v2 (id, story_id, title, content, category)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO NOTHING
                    `, [l.id, storyId, l.title, l.content, l.category]);
                }
            }
        })();

        // 重新讀取剛存好的故事
        story = await usersDb.get('SELECT * FROM narrative_stories_v2 WHERE id = $1', [storyId]);
        console.log(`[SceneGenerator] ✅ V2 藍圖儲存成功: ${story.title}`);
    }

    // 4. 映射第一場景至運行時場景 (Backward Compatibility Layer)
    const startSceneId = story.start_scene_id;
    const v2Scene = await usersDb.get('SELECT * FROM narrative_story_scenes_v2 WHERE id = $1 AND story_id = $2', [startSceneId, storyId]);
    if (!v2Scene) throw new Error(`V2 Start Scene not found: ${startSceneId}`);

    // 加載 NPC 資訊
    const npcSlots = await usersDb.query(`
        SELECT s.*, a.label, a.social_role
        FROM narrative_scene_npc_slots s
        JOIN narrative_npc_archetypes a ON s.archetype_id = a.id
        WHERE s.scene_id = $1
    `, [v2Scene.id]);

    // 格式轉換為 Time Traveler Packets
    const scenePacketId = `v3_session_${v2Scene.id}`; // Force V3 prefix to bypass legacy v2_bridge cache

    // 檢查快取 (V3 Registry)
    let ttScene = await usersDb.get('SELECT * FROM time_traveler_scenes WHERE id = $1', [scenePacketId]);

    if (!ttScene) {
        // 解析按鈕
        const v2Actions = safeParseJSON(v2Scene.actions_json, {});
        const initialButtons = [
            ...(v2Actions.mainline || []).map(a => ({ action: a.label, intent: 'intervention', target_scene_id: a.targetSceneId })),
            ...(v2Actions.interaction || []).map(a => ({ action: a.label, intent: 'observation' })),
            ...(v2Actions.dialogue || []).map(a => ({ action: a.label, intent: 'conversation' })),
            ...(v2Actions.system || []).map(a => ({ action: a.label, intent: 'interaction' }))
        ];

        await usersDb.run(`
            INSERT INTO time_traveler_scenes (
                id, canonical_anchor, title, rules_json, npcs_json, initial_narrative, initial_buttons_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            scenePacketId,
            story.primary_source, // 使用經文參考作為關鍵錨點
            v2Scene.title,
            JSON.stringify(story.immutable_beats_json || []), // 確保轉為 JSON 字串
            JSON.stringify(npcSlots.map(s => ({ id: s.slot_id, name: s.label, role_type: s.is_interactive ? 'main' : 'background' }))),
            v2Scene.entry_text,
            JSON.stringify(initialButtons)
        ]);

        ttScene = await usersDb.get('SELECT * FROM time_traveler_scenes WHERE id = $1', [scenePacketId]);
    }

    return {
        id: ttScene.id,
        story_id: storyId, // 額外回傳 V2 Story ID 供後續 Action 追蹤
        title: ttScene.title,
        canonical_anchor: ttScene.canonical_anchor,
        rules: safeParseJSON(ttScene.rules_json, []),
        npcs: safeParseJSON(ttScene.npcs_json, []),
        initial_narrative: ttScene.initial_narrative,
        initial_buttons: safeParseJSON(ttScene.initial_buttons_json, []),
        is_v2: true,
        is_cached: true
    };
}

/**
 * 輔助函數：將藍圖中的所有 ID 加上 storyId 前綴，確保全域唯一性
 * 採用原地修改 (In-place mutation) 以確保所有引用同步更新
 */
function prefixBlueprintIds(blueprint, storyId) {
    if (!blueprint) return;

    // 1. 前綴化 NPC 原型 ID
    if (blueprint.npc_archetypes && Array.isArray(blueprint.npc_archetypes)) {
        blueprint.npc_archetypes.forEach(npc => {
            if (npc.id && !npc.id.startsWith(storyId)) {
                const oldId = npc.id;
                npc.id = `${storyId}_${oldId}`;
                console.log(`[Prefixer] 👤 NPC ID: ${oldId} -> ${npc.id}`);
            }
        });
    }

    // 2. 前綴化 知識點 (Lore) ID
    if (blueprint.lore && Array.isArray(blueprint.lore)) {
        blueprint.lore.forEach(l => {
            if (l.id && !l.id.startsWith(storyId)) {
                l.id = `${storyId}_${l.id}`;
            }
        });
    }

    // 3. 前綴化 場景 ID 與其內部的引用
    if (blueprint.scenes && Array.isArray(blueprint.scenes)) {
        blueprint.scenes.forEach(scene => {
            if (scene.id && !scene.id.startsWith(storyId)) {
                const oldSceneId = scene.id;
                scene.id = `${storyId}_${oldSceneId}`;
                console.log(`[Prefixer] 🎬 Scene ID: ${oldSceneId} -> ${scene.id}`);
            }

            // A. 更新場景內的 NPC 插槽引用
            if (scene.npc_slots && Array.isArray(scene.npc_slots)) {
                scene.npc_slots.forEach(slot => {
                    if (slot.archetype_id && !slot.archetype_id.startsWith(storyId)) {
                        slot.archetype_id = `${storyId}_${slot.archetype_id}`;
                    }
                });
            }

            // B. 更新場景內的 動作 (Actions) 引用
            if (scene.actions) {
                const prefixGroup = (arr) => {
                    if (!Array.isArray(arr)) return;
                    arr.forEach(act => {
                        if (act.targetSceneId && !act.targetSceneId.startsWith(storyId)) {
                            act.targetSceneId = `${storyId}_${act.targetSceneId}`;
                        }
                        if (act.loreId && !act.loreId.startsWith(storyId)) {
                            act.loreId = `${storyId}_${act.loreId}`;
                        }
                    });
                };
                prefixGroup(scene.actions.mainline);
                prefixGroup(scene.actions.interaction);
                prefixGroup(scene.actions.dialogue);
                prefixGroup(scene.actions.system);
            }
        });
    }

    // 4. 更新 故事主表 的起始場景 ID
    if (blueprint.story && blueprint.story.start_scene_id) {
        if (!blueprint.story.start_scene_id.startsWith(storyId)) {
            blueprint.story.start_scene_id = `${storyId}_${blueprint.story.start_scene_id}`;
        }
    }
}

/**
 * 輔助函數 (Phase 2)：將藍圖角色對照至全域實體庫
 */
async function mapGlobalEntities(blueprint) {
    if (!blueprint.npc_archetypes || blueprint.npc_archetypes.length === 0) return;

    // 確保全域實體表有基礎資料 (第一次執行時)
    await seedGlobalEntities();

    // 取得當前書卷時序，防止神學時空衝突 (例如：耶穌不應在舊約直接以 NPC 身分出現)
    const bookOrder = getBookOrder(blueprint.story.primary_source);
    const isNewTestament = bookOrder >= 39; // 從馬太福音 (Index 39) 開始

    // 取得所有全域實體
    const globalEntities = await usersDb.query('SELECT id, canonical_name, aliases_json FROM narrative_global_entities');

    for (const npc of blueprint.npc_archetypes) {
        const label = npc.label;
        // 簡單的名稱比對邏輯 (未來可升級為 AI 語意比對)
        const match = globalEntities.find(ge => {
            // 特殊規則：global_jesus 只在馬太福音之後的時空生效
            if (ge.id === 'global_jesus' && !isNewTestament) return false;

            if (ge.canonical_name === label) return true;
            const aliases = safeParseJSON(ge.aliases_json, []);
            return aliases.includes(label);
        });

        if (match) {
            npc.global_entity_id = match.id;
            console.log(`[GlobalInterface] 🔗 已連結角色: "${label}" -> 全域實體: ${match.id}`);

            // 尋找此全域實體是否已有對應的「先行藍圖」原型 (用於結構繼承)
            const existingArchetype = await usersDb.get(`
                SELECT id FROM narrative_npc_archetypes
                WHERE global_entity_id = $1
                AND id != $2
                ORDER BY created_at DESC LIMIT 1
            `, [match.id, npc.id]);

            if (existingArchetype) {
                npc.source_archetype_id = existingArchetype.id;
                console.log(`[GlobalInterface] 🧩 發現可引用原型: ${existingArchetype.id}`);
            }
        }
    }
}

/**
 * 輔助函數 (Phase 2)：初始化常用的全域實體 (Seed)
 */
async function seedGlobalEntities() {
    const count = await usersDb.get('SELECT COUNT(*) as count FROM narrative_global_entities');
    if (count.count > 0) return;

    console.log('[GlobalInterface] 🌱 正在初始化全域實體庫...');
    const seeds = [
        { id: 'global_jesus', category: 'person', name: '耶穌', aliases: ['耶穌基督', '基督', '主耶穌', '拿撒勒人耶穌'] },
        { id: 'global_moses', category: 'person', name: '摩西', aliases: [] },
        { id: 'global_paul', category: 'person', name: '保羅', aliases: ['掃羅', '大數的掃羅', '使徒保羅'] },
        { id: 'global_peter', category: 'person', name: '彼得', aliases: ['西門', '西門彼得', '磯法'] },
        { id: 'global_pharaoh', category: 'person', name: '法老', aliases: ['埃及王'] },
        { id: 'global_satan', category: 'person', name: '撒旦', aliases: ['魔鬼', '古蛇', '大龍', '路西法', '惡者'] }
    ];

    for (const s of seeds) {
        await usersDb.run(`
            INSERT INTO narrative_global_entities (id, category, canonical_name, aliases_json)
            VALUES ($1, $2, $3, $4)
        `, [s.id, s.category, s.name, JSON.stringify(s.aliases)]);
    }
}
