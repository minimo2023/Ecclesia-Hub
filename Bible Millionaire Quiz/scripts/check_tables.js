import { initializeDatabases } from '../server/database/core.js';
import { initializeInfrastructure } from '../server/database/index.js';

async function finalSovereignCheck() {
    console.log('🧪 [SovereignCheck] Starting deep infrastructure scan (V1.1)...');
    try {
        const dbs = await initializeDatabases();
        
        // 1. Wipe corrupted fragments if any (Alpha Cleanup)
        console.log('🧹 [Alpha] Cleaning potential narrative fragments...');
        await dbs.usersDb.exec('DROP TABLE IF EXISTS narrative_dialogue_logs, narrative_character_states, narrative_scene_states, narrative_game_sessions, user_story_progress CASCADE;');
        
        // 2. Full Init
        console.log('🚀 [Boot] Rebuilding 1.1 Modular Infrastructure...');
        await initializeInfrastructure();
        
        // 3. Verify Physical Schemas
        console.log('🔍 [Verify] Scanning physical table layout...');
        const tables = await dbs.usersDb.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema IN ('public', 'ai_gov') 
            ORDER BY table_schema, table_name
        `);
        
        console.log('--- PHYSICAL TABLE MAP (CamelCase Sovereign) ---');
        tables.forEach(t => {
            console.log(`[${t.tableSchema}] ${t.tableName}`);
        });
        console.log('--------------------------');
        
        console.log('✅ [1.1 SOVEREIGN BOOT] SUCCESSFUL!');
        process.exit(0);
    } catch (e) {
        console.error('❌ [1.1 BOOT CRASHED]');
        console.error('Message:', e.message);
        if (e.stack) console.error(e.stack);
        process.exit(1);
    }
}

finalSovereignCheck();
