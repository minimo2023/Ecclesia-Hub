import { initializeInfrastructure, dbOps } from '../server/database/index.js';
import dotenv from 'dotenv';
dotenv.config();

async function verify() {
    console.log('📡 [IdentityProbe] Re-igniting infrastructure for seeding...');
    try {
        // [SOVEREIGN 1.1] This will trigger the auto-ignition and seeding
        await initializeInfrastructure();
        
        console.log('\n--- ✍️ PHYSICAL TRACE: DEVOTIONAL AUTHORS ---');
        const count = await dbOps.notesDb.get('SELECT COUNT(*) as total FROM public.devotional_authors');
        console.log(`Total Authors in DB: ${count?.total || 0}`);
        
        const authors = await dbOps.notesDb.all('SELECT name, style_id FROM public.devotional_authors ORDER BY style_id, name');
        if (authors && authors.length > 0) {
            console.table(authors);
            console.log('✅ SUCCESS: Your original personas have been RESTORED.');
        } else {
            console.log('❌ FATAL: Authors are still MISSING.');
        }
        console.log('--------------------------------------------');
        
        process.exit(0);
    } catch (e) {
        console.error('❌ Verification Failed:', e.message);
        process.exit(1);
    }
}

verify();
