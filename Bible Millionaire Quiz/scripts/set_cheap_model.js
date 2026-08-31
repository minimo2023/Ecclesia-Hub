import { dbOps, initializeInfrastructure } from './database/index.js';

async function main() {
    try {
        await initializeInfrastructure();
        console.log('🔄 Updating default AI model to gemini-2.5-flash-lite...');
        await dbOps.db.query("UPDATE ai_gov.ai_system_config SET value = 'gemini-2.5-flash-lite' WHERE key = 'default_ai_model'");
        console.log('✅ Successfully updated default_ai_model to gemini-2.5-flash-lite');
        process.exit(0);
    } catch (e) {
        console.error('❌ Failed:', e);
        process.exit(1);
    }
}

main();
