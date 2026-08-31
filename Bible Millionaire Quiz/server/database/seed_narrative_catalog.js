import { dbOps } from './index.js';

async function seedCatalog() {
    console.log('🌱 Seeding Narrative Story Catalog...');
    
    try {
        const jonahStory = {
            story_id: 'jonah',
            title: '約拿書：逃避與呼召',
            subtitle: 'Jonah: The Prophet on the Run',
            summary: '前往約帕港口，體驗那一場逃往大魚腹中的風暴。面對神的呼召，約拿選擇了逃避，卻在絕境中經歷了救贖。',
            theme_tags_json: ['順服', '逃避', '呼召', '神蹟', '悔改'],
            character_tags_json: ['約拿', '水手', '大魚'],
            event_tags_json: ['約帕港口', '海上風暴', '大魚吞下'],
            primary_source_refs_json: [
                { book_id: 'Jonah', chapter: 1, verse_start: 1, verse_end: 17 }
            ],
            status: 'published'
        };

        await dbOps.narrativeOps.saveStoryCatalog(jonahStory);
        console.log('✅ Jonah story added to catalog.');
        
        // Add a stub for potential generatable stories to help AI understand the "generatable" concept if needed
        const jesusWine = {
            story_id: 'jesus_wine_cana',
            title: '迦南婚宴：變水為酒',
            subtitle: 'Wedding at Cana',
            summary: '耶穌在迦南的婚宴上行了第一個神蹟，將水變為好酒。',
            theme_tags_json: ['神蹟', '豐盛', '首個神蹟'],
            character_tags_json: ['耶穌', '馬利亞'],
            event_tags_json: ['婚宴', '水變為酒'],
            primary_source_refs_json: [
                { book_id: 'John', chapter: 2, verse_start: 1, verse_end: 11 }
            ],
            status: 'published' // We'll mark it published but treat it as generatable if it has no scenes yet
        };
        // Actually, we'll only seed Jonah for now to keep it clean. 
        // Generatable stories should probably be detected by AI from Bible content directly, 
        // but having them in catalog helps the AI know we "support" them.
        
        console.log('✅ Seeding complete.');
    } catch (e) {
        console.error('❌ Seeding failed:', e);
    }
}

seedCatalog();
