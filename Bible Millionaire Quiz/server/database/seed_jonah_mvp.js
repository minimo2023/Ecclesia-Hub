/**
 * Jonah MVP Prototype Seeding Script
 * 依照使用者規格書，建立約拿書最小可玩原型 (3 scenes, 2 characters, 2 lore)
 */
import { contentDb } from './index.js';

async function seedJonahMVP() {
    console.log('🌱 Starting Jonah MVP Seeding...');

    try {
        // 1. Narrative Stories
        await contentDb.run(`
            INSERT INTO narrative_stories (story_id, title, testament, genre, entry_scene_id, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (story_id) DO UPDATE SET
                title = EXCLUDED.title,
                entry_scene_id = EXCLUDED.entry_scene_id,
                status = EXCLUDED.status,
                updated_at = CURRENT_TIMESTAMP
        `, ['jonah', '約拿書', 'OT', '敘事錄', 'joppa_port_intro', 'published']);

        // 2. Narrative Story Characters
        const characters = [
            {
                id: 'jonah',
                name: '約拿',
                role: 'main',
                identity: '先知',
                traits: ['抗拒', '敏感', '知道耶和華的主權'],
                speech: '簡短、防備、帶內在掙扎'
            },
            {
                id: 'port_worker',
                name: '港口工人',
                role: 'npc',
                identity: '港邊工作者',
                traits: ['忙碌', '現實', '只關心登船流程'],
                speech: '簡短、直接、務實'
            }
        ];

        for (const char of characters) {
            await contentDb.run(`
                INSERT INTO narrative_story_characters (story_id, character_id, display_name, role_type, identity, core_traits, speech_style)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (story_id, character_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    identity = EXCLUDED.identity,
                    core_traits = EXCLUDED.core_traits,
                    speech_style = EXCLUDED.speech_style,
                    updated_at = CURRENT_TIMESTAMP
            `, ['jonah', char.id, char.name, char.role, char.identity, JSON.stringify(char.traits), char.speech]);
        }

        // 3. Narrative Story Lore
        const lores = [
            {
                key: 'joppa',
                title: '約帕',
                short: '約帕是古代重要港口，常作為出海起點。',
                full: '在這段敘事裡，約帕不只是地名，更是約拿實際踏上逃避之路的地方。',
                rel: '理解約帕的港口角色，能看出約拿不是隨意經過，而是在刻意離開。'
            },
            {
                key: 'tarshish',
                title: '他施',
                short: '他施常被理解為遠離以色列世界邊界的遙遠方向。',
                full: '在約拿書中，他施的重要性不只在地理，而在象徵，表示約拿朝與差遣相反的方向前進。',
                rel: '此刻理解他施，能幫助玩家看懂：這不是旅行，而是逃避。'
            }
        ];

        for (const lore of lores) {
            await contentDb.run(`
                INSERT INTO narrative_story_lore (story_id, lore_key, title, short_text, full_text, relevance_text)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (story_id, lore_key) DO UPDATE SET
                    title = EXCLUDED.title,
                    short_text = EXCLUDED.short_text,
                    full_text = EXCLUDED.full_text,
                    relevance_text = EXCLUDED.relevance_text,
                    updated_at = CURRENT_TIMESTAMP
            `, ['jonah', lore.key, lore.title, lore.short, lore.full, lore.rel]);
        }

        // 4. Narrative Story Scenes
        const scenes = [
            {
                id: 'joppa_port_intro',
                title: '約帕港口',
                text: '你站在約帕繁忙的港口。海浪拍打著石岸，腥鹹的海風吹過。遠處，一個穿著粗糙外袍的男子——約拿，正低頭匆匆走向一艘即將啟航的貨船。',
                goal: '尋找約拿並了解他的意圖',
                choice: '跟著那人走向登船處',
                next: 'follow_jonah',
                lores: ['joppa', 'tarshish'],
                chars: ['jonah', 'port_worker'],
                scripture: [{ book_id: 'jonah', chapter: 1, verse_start: 3, verse_end: 3 }],
                entities: [{ entity_type: 'place', entity_id: 'joppa' }],
                gen_mode: 'fixed'
            },
            {
                id: 'follow_jonah',
                title: '跟隨那人',
                text: '', // 留空，測試 ai_assisted fallback
                goal: '觀察約拿的行為',
                choice: '繼續靠近，觀察他要登哪一艘船',
                next: 'boarding_ship',
                lores: ['joppa', 'tarshish'],
                chars: ['jonah', 'port_worker'],
                scripture: [{ book_id: 'jonah', chapter: 1, verse_start: 3, verse_end: 3 }],
                entities: [{ entity_type: 'person', entity_id: 'jonah' }],
                gen_mode: 'ai_assisted'
            },
            {
                id: 'boarding_ship',
                title: '登船處',
                text: '船板已經放下。約拿正掏出銀錢付給船上的管理人員。這艘船的目的地是他施——一個遠離他家鄉與呼召的方向。他踏上了甲板，背影顯得孤獨而決絕。',
                goal: '見證約拿的逃避',
                choice: null,
                next: null,
                lores: ['tarshish'],
                chars: ['jonah', 'port_worker'],
                scripture: [{ book_id: 'jonah', chapter: 1, verse_start: 3, verse_end: 3 }],
                entities: [],
                gen_mode: 'fixed',
                terminal: true
            }
        ];

        for (const scene of scenes) {
            await contentDb.run(`
                INSERT INTO narrative_story_scenes (
                    story_id, scene_id, title, entry_text, main_goal, 
                    main_choice_label, next_scene_id, lore_keys, character_ids, 
                    is_terminal, scripture_refs_json, source_entity_ids_json, 
                    generation_mode, entry_text_source
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (story_id, scene_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    entry_text = EXCLUDED.entry_text,
                    main_choice_label = EXCLUDED.main_choice_label,
                    next_scene_id = EXCLUDED.next_scene_id,
                    lore_keys = EXCLUDED.lore_keys,
                    character_ids = EXCLUDED.character_ids,
                    is_terminal = EXCLUDED.is_terminal,
                    scripture_refs_json = EXCLUDED.scripture_refs_json,
                    source_entity_ids_json = EXCLUDED.source_entity_ids_json,
                    generation_mode = EXCLUDED.generation_mode,
                    entry_text_source = EXCLUDED.entry_text_source,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                'jonah', scene.id, scene.title, scene.text, scene.goal, 
                scene.choice, scene.next, JSON.stringify(scene.lores), JSON.stringify(scene.chars), 
                scene.terminal || false, JSON.stringify(scene.scripture || []), JSON.stringify(scene.entities || []),
                scene.gen_mode || 'fixed', 'manual'
            ]);
        }

        // 5. Character Overlays
        const overlays = [
            { id: 'jonah', scene: 'joppa_port_intro', state: '焦躁、防備、急於離開' },
            { id: 'jonah', scene: 'follow_jonah', state: '壓抑、急促、更加不想被打擾' },
            { id: 'jonah', scene: 'boarding_ship', state: '決絕、封閉、只想盡快離開' },
            { id: 'port_worker', scene: 'joppa_port_intro', state: '忙碌於清點貨物' }
        ];

        for (const ov of overlays) {
            await contentDb.run(`
                INSERT INTO narrative_story_character_overlays (story_id, scene_id, character_id, emotional_state)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (story_id, scene_id, character_id) DO UPDATE SET
                    emotional_state = EXCLUDED.emotional_state,
                    updated_at = CURRENT_TIMESTAMP
            `, ['jonah', ov.scene, ov.id, ov.state]);
        }

        console.log('✅ Jonah MVP Seeding Completed Successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    }
}

// Execute if run directly
seedJonahMVP();
