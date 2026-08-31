
import { generateDevotional, initDevotionalService } from '../services/devotional.js';
import { ContentManager } from '../services/ContentManager.js';
import { dbOps, initializeInfrastructure } from '../database/index.js';
import { logger } from '../utils/logger.js';

async function testOutput() {
    try {
        console.log('🚀 Starting Devotional Output Test...');
        
        // 1. Initializations
        await initializeInfrastructure();
        await ContentManager.initialize();
        initDevotionalService();
        
        // 2. Clear today's devotional to force a fresh one with new prompts
        const today = new Date().toISOString().split('T')[0];
        console.log(`🧹 Cleaning record for ${today}...`);
        await dbOps.deleteDevotional(today);
        
        // 3. Generate
        console.log('✍️ Generating new devotional with updated prompts...');
        const result = await generateDevotional({ targetDate: today });
        
        console.log('\n--- TEST RESULTS ---');
        console.log(`Author: ${result.author}`);
        console.log(`Title: ${result.title}`);
        console.log(`Scripture: ${result.scriptureReference}`);
        console.log('\n[UNDERSTANDING]');
        console.log(result.understanding);
        console.log('\n[MEDITATION]');
        console.log(result.meditation);
        console.log('\n[PRAYER]');
        console.log(result.prayer);
        console.log('\n[CLOSING WORD]');
        console.log(result.closingWord);
        console.log('--------------------\n');
        
        process.exit(0);
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exit(1);
    }
}

testOutput();
