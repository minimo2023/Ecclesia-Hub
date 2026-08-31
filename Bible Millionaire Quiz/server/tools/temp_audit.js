import { usersDb, initializeDatabases } from './database/core.js';

async function run() {
    await initializeDatabases();
    const tables = [
        'bible_verses', 
        'locations', 
        'verse_locations', 
        'commentaries', 
        'resources', 
        'ai_summaries', 
        'bible_books',
        'narrative_story_lore',
        'narrative_story_characters'
    ];
    
    console.log('--- Database Content Audit ---');
    for (const table of tables) {
        try {
            const count = await usersDb.get(`SELECT count(*) as count FROM ${table}`);
            console.log(`${table}: ${count.count}`);
        } catch(e) {
            console.log(`${table}: [Error or Missing] ${e.message}`);
        }
    }
    process.exit(0);
}

run();
