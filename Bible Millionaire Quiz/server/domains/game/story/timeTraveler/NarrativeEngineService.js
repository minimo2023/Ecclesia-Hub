import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';
import { ContentManager } from '../../../content/bible/ContentManager.js';
import { usersDb, dbOps } from '../../../../database/index.js';
import { safeParseJSON } from '../../../../utils/ai-parser.js';

/**
 * 聖經時空旅人 - 核心敘事引擎 (V2 Logos-Powered)
 * 負責處理玩家單回合行動，整合地圖地理、歷史藍圖與動態對話。
 */
const BIBLE_BOOKS_ORDER = [
    '創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記', '撒母耳記上', '撒母耳記下',
    '列王紀上', '列王紀下', '歷代志上', '歷代志下', '以斯拉記', '尼希米記', '以斯帖記', '約伯記', '詩篇', '箴言',
    '傳道書', '雅歌', '賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書',
    '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書',
    '馬太福音', '馬可福音', '路加福音', '約翰福音', '使徒行傳', '羅馬書', '哥林多前書', '哥林多後書', '加拉太書',
    '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書', '提多書',
    '腓利門書', '希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', '約翰二書', '約翰三書', '猶大書', '啟示錄'
];

// V3 Intent Definitions
const IntentTypes = {
    OBSERVE: 'observe',          // 看、聽、感受
    APPROACH: 'approach',        // 靠近某人/某事件
    INTERACT: 'interact',        // 問路人、簡單互動
    DIALOGUE: 'dialogue',        // 明確對話
    REFLECT: 'reflect',          // 思考 / 默想 / 提問神學
    EXPERIMENT: 'experiment',    // 試探性行為（但未破壞）
    INTERFERE: 'interfere',      // 嘗試改變事件
    BREAK_CANON: 'break_canon'   // 明確違反（救人、阻止神蹟等）
};

const RiskLevels = {
    SAFE: 'safe',
    SOFT: 'soft',
    HIGH: 'high',
    CRITICAL: 'critical'
};

const PromptRouting = {
    observe: 'story_observation',
    approach: 'story_positioning',
    interact: 'story_interaction',
    dialogue: 'story_dialogue',
    reflect: 'story_reflection',
    experiment: 'story_soft_barrier',
    interfere: 'story_fate_barrier',
    break_canon: 'story_fate_barrier_strict'
};

function classifyIntent(action, isFreeText) {
    if (!isFreeText) {
        // 根據按鈕預設類別判定 (由 frontend 傳入或在此對應)
        const btnIntent = action.toLowerCase();
        if (btnIntent.includes('詢問') || btnIntent.includes('說')) return IntentTypes.DIALOGUE;
        if (btnIntent.includes('看') || btnIntent.includes('聽')) return IntentTypes.OBSERVE;
        if (btnIntent.includes('靠近')) return IntentTypes.APPROACH;
        return IntentTypes.INTERACT;
    }

    // 自由文本關鍵字判定
    const text = action.toLowerCase();
    if (text.includes('救') || text.includes('阻止') || text.includes('改')) return IntentTypes.BREAK_CANON;
    if (text.includes('殺') || text.includes('搶') || text.includes('打')) return IntentTypes.INTERFERE;
    if (text.includes('試') || text.includes('碰')) return IntentTypes.EXPERIMENT;
    if (text.includes('想') || text.includes('為') || text.includes('神')) return IntentTypes.REFLECT;
    if (text.includes('說') || text.includes('問')) return IntentTypes.DIALOGUE;
    if (text.includes('走') || text.includes('靠')) return IntentTypes.APPROACH;
    if (text.includes('看') || text.includes('視')) return IntentTypes.OBSERVE;

    return IntentTypes.INTERACT;
}

function assessRisk(intent) {
    switch (intent) {
        case IntentTypes.OBSERVE:
        case IntentTypes.REFLECT:
            return RiskLevels.SAFE;
        case IntentTypes.APPROACH:
        case IntentTypes.INTERACT:
        case IntentTypes.DIALOGUE:
            return RiskLevels.SOFT;
        case IntentTypes.EXPERIMENT:
            return RiskLevels.HIGH;
        case IntentTypes.INTERFERE:
        case IntentTypes.BREAK_CANON:
            return RiskLevels.CRITICAL;
        default:
            return RiskLevels.SAFE;
    }
}

// V3 Token 壓縮策略
function compressFeed(history) {
    return (history || []).slice(-5).map(b => ({
        t: b.intent || 'narration',
        x: (b.outcome || b.text || '').slice(0, 120) // 限制長度
    }));
}

function compressSceneState(scene, v2Scene, story) {
    return {
        title: story?.title || scene.title,
        loc: scene.geography || '歷史現場',
        goal: v2Scene?.goal || scene.title,
        chars: (scene.npcs || []).slice(0, 5).map(n => n.name)
    };
}

function selectPromptSize(risk, turnCount) {
    if (risk === RiskLevels.CRITICAL || turnCount % 5 === 0) return 'full';
    if (risk === RiskLevels.HIGH || turnCount % 3 === 0) return 'medium';
    return 'minimal';
}

function getBookOrder(ref) {
    if (!ref) return 999;
    const bookMatch = ref.match(/^([\u4e00-\u9fa5]+|[a-zA-Z\s]+)(?=\s+\d+)/);
    const name = bookMatch ? bookMatch[1].trim() : ref;
    const index = BIBLE_BOOKS_ORDER.indexOf(name);
    return index !== -1 ? index : 999;
}

async function updateGlobalMemory(userId, globalEntityId, newInteraction, currentRef) {
    if (!userId || !globalEntityId || !newInteraction) return;

    // 取得現有記憶
    const existing = await usersDb.get('SELECT memory_summary FROM narrative_global_memories WHERE user_id = $1 AND global_entity_id = $2', [userId, globalEntityId]);

    // 簡單的摘要邏輯：保留最後 3 句最重要的互動。
    let memory = existing?.memory_summary || '';
    const lines = memory.split('\n').filter(l => l.trim());
    lines.push(`時空點[${currentRef}]: ${(newInteraction || '').substring(0, 100)}`);

    const updatedMemory = lines.slice(-5).join('\n'); // 保持最後 5 條紀錄

    await usersDb.run(`
        INSERT INTO narrative_global_memories (user_id, global_entity_id, memory_summary, last_interaction_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, global_entity_id) DO UPDATE SET
            memory_summary = EXCLUDED.memory_summary,
            last_interaction_at = EXCLUDED.last_interaction_at
    `, [userId, globalEntityId, updatedMemory]);
}

export async function processPlayerAction(session, scene, actionText, isFreeText = false, correlationId = null) {
    if (!actionText) throw new Error("Action text is required.");

    // 1. 取得 V2 核心上下文
    const storyId = session.story_id;
    const story = await usersDb.get('SELECT * FROM narrative_stories_v2 WHERE id = $1', [storyId]);
    const v2SceneId = scene.id.replace('v2_bridge_', '');
    const v2Scene = await usersDb.get('SELECT * FROM narrative_story_scenes_v2 WHERE id = $1', [v2SceneId]);

    // 2. 意圖分類與風險評估 (V3 Router)
    const intent = classifyIntent(actionText, isFreeText);
    const risk = assessRisk(intent);
    const taskType = PromptRouting[intent] || 'story_interaction';
    const history = session.context_history || [];
    const turnCount = history.length;
    const promptSize = selectPromptSize(risk, turnCount);

    // 2.5 節奏感測 (Pacing & Nudge)
    // 計算在當前場景停留了幾回合，並對比藍圖預算
    const sceneTurnCount = history.filter(b => b.scene_id === scene.id).length;
    const pacingThreshold = v2Scene?.estimated_turns || 5;
    const pacingScale = Math.min(10, Math.ceil((sceneTurnCount + 1) / pacingThreshold * 5)); // 標準化為 1-10 級

    // 3. Token 壓縮策略 (V3 Compression)
    const compressedScene = compressSceneState(scene, v2Scene, story);
    const compressedFeed = compressFeed(session.context_history);

    // 4. 初始化地理與全域記憶
    await ContentManager.initialize();
    const scriptureRef = story?.primary_source || scene.canonical_anchor;
    const bookName = scriptureRef.match(/^([\u4e00-\u9fa5]+|[a-zA-Z\s]+)(?=\s+\d+)/)?.[1]?.trim() || scriptureRef;
    const geoContext = await ContentManager.getQuestionContext(bookName, 0, 0);
    const currentBookOrder = getBookOrder(scriptureRef);
    const chapterMatch = scriptureRef.match(/\s+(\d+)(?::\d+)?/);
    const chapterNum = chapterMatch ? parseInt(chapterMatch[1]) : 0;
    const globalMemories = [];

    // 載入 NPC 記憶 (時序過濾)
    if (scene.npcs?.length > 0) {
        for (const npc of scene.npcs) {
            const archetype = await usersDb.get('SELECT global_entity_id FROM narrative_npc_archetypes WHERE id = $1', [npc.archetype_id || npc.id]);
            if (archetype?.global_entity_id) {
                const memory = await usersDb.get('SELECT memory_summary FROM narrative_global_memories WHERE user_id = $1 AND global_entity_id = $2', [session.user_id, archetype.global_entity_id]);
                if (memory?.memory_summary) {
                    if (archetype.global_entity_id === 'global_jesus') {
                        globalMemories.push({ npc: npc.name, memory: memory.memory_summary, is_omniscient: true });
                    } else {
                        const filtered = memory.memory_summary.split('\n').filter(line => {
                            const match = line.match(/時空點\[([\u4e00-\u9fa5]+\s+\d+:\d+)\]/);
                            return !match || getBookOrder(match[1]) <= currentBookOrder;
                        });
                        if (filtered.length > 0) globalMemories.push({ npc: npc.name, memory: filtered.join('\n') });
                    }
                }
            }
        }
    }

    // 4.5 攝影機焦點解析 (Cinematography Focus)
    let currentFocus = null;
    if (actionText.includes('看') || actionText.includes('觀察') || actionText.includes('打量')) {
        const targetMatch = actionText.match(/(?:看著|觀察|打量|盯著)([\u4e00-\u9fa5]+|[a-zA-Z\s]+)/);
        if (targetMatch) currentFocus = targetMatch[1];
    } else if (actionText.includes('問') || actionText.includes('說') || actionText.includes('對')) {
        const npcMatch = actionText.match(/(?:向|問|對|跟)([\u4e00-\u9fa5]+|[a-zA-Z\s]+)(?:說|問)?/);
        if (npcMatch) currentFocus = `${npcMatch[1]} (互動對象)`;
    }

    // 5. 呼叫 LogosEngine (V3 Cinematic Interaction)
    // 獲取場景主線狀態
    const blueprintActions = safeParseJSON(v2Scene?.actions_json, {});
    const mainlineBlueprint = blueprintActions.mainline || [];

    // 檢查哪些主線已完成 (透過歷史紀錄比對 label)
    const finishedMainlineLabels = history.map(h => h.action);
    const pendingMainline = mainlineBlueprint.filter(m => !finishedMainlineLabels.includes(m.label));
    const allMainlineDone = mainlineBlueprint.length > 0 && pendingMainline.length === 0;

    const interactionResult = await LogosEngine.askBrain('interaction_engine', {
        input: actionText,
        risk: risk,
        pacing: pacingScale,
        current_focus: currentFocus,
        is_scene_complete: allMainlineDone, // 告知 AI 此場景主線已全數達成，可轉場
        scene: {
            ...compressedScene,
            geography: geoContext.geography,
            global_memories: globalMemories,
            immutable_beats: safeParseJSON(story?.immutable_beats_json, [])
        },
        feed: compressedFeed
    }, { priority: true, correlationId, userId: session.user_id });

    // 6. 呼叫 LogosEngine: turn_option_building
    const optionsResult = await LogosEngine.askBrain('action_options', {
        story_title: compressedScene.title,
        main_goal: compressedScene.goal,
        pacing: pacingScale,
        phase: v2Scene?.title,
        last_blocks: interactionResult.narrative?.environment || '',
        entities: scene.npcs,
        blueprint_mainline: pendingMainline // 傳入尚未完成的主線，供 AI 穩定渲染
    }, { priority: true, correlationId, userId: session.user_id });

    // 7. 合併結果 (V3 Flex-Stack 整合渲染)
    const n = interactionResult.narrative;
    const l = interactionResult.logic || {};

    // 建立沈浸式主敘事
    let fullNarrative = '';
    if (n.preamble) fullNarrative += `${n.preamble}\n\n`;
    fullNarrative += `${n.environment}\n\n`;

    if (n.dialogue && n.dialogue.length > 0) {
        fullNarrative += n.dialogue.map(d => `${d.identity}：「${d.content}」`).join('\n\n') + '\n\n';
    }

    fullNarrative += n.action;

    const barrierText = (l.paradox_prevention ? '\n\n🚨 [命運攔截] ' + l.paradox_prevention : '');
    fullNarrative += barrierText;

    // Navigator 的聲音獨立於主敘事
    const finalResponse = `【時空導航：${interactionResult.navigator_feedback}】\n\n${fullNarrative}`;

    // 同步率計算
    let syncRateChange = l.paradox_prevention ? -15 : 2;

    // 8. 更新全域記憶 (Phase 3)
    if (interactionResult.characters && fullNarrative) {
        for (const char of interactionResult.characters) {
            const archetype = await usersDb.get('SELECT global_entity_id FROM narrative_npc_archetypes WHERE id = $1', [char.name]);
            if (archetype?.global_entity_id) {
                await updateGlobalMemory(session.user_id, archetype.global_entity_id, fullNarrative, scriptureRef);
            }
        }
    }

    // 9. 按鈕合併邏輯 (RPG 穩定主線方案)
    // 優先保留未完成的主線，其餘由 AI 動態補充
    const mainlineButtons = pendingMainline.map(m => ({ action: m.label, intent: 'intervention' }));
    const dynamicButtons = [
        ...(optionsResult.interaction || []).map(a => ({ action: a.label, intent: 'interaction' })),
        ...(optionsResult.dialogue || []).map(a => ({ action: a.label, intent: 'conversation' })),
        ...(optionsResult.system || []).map(a => ({ action: a.label, intent: 'observation' }))
    ];

    return {
        intent: l.paradox_prevention ? 'violation' : intent,
        scene_id: scene.id,
        narrative_response: finalResponse,
        structured_response: interactionResult,
        sync_rate_change: syncRateChange,
        witness_fragment: n.environment.substring(0, 30) + '...',
        new_buttons: [...mainlineButtons, ...dynamicButtons].slice(0, 5) // 擴展到 5 個選項
    };
}

export async function _handleSceneTransition(fromScene, toScene, overlayModule = null) {
    // 呼叫 AI 生成轉場敘事
    const transitionResult = await LogosEngine.askBrain('scene_transition', {
        from_scene: { title: fromScene.title, goal: fromScene.goal },
        to_scene: { title: toScene.title, goal: toScene.goal },
        is_overlay: !!overlayModule,
        overlay_info: overlayModule
    });

    return {
        narration: transitionResult.transition_text,
        background_pressure: transitionResult.background_pressure,
        next_scene_id: transitionResult.scene_loaded || toScene.id
    };
}
