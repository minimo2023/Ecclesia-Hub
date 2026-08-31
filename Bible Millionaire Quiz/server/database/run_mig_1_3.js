import { contentDb } from './index.js';
import { migrateNarrativeScenesV2 } from './schemas_pg.js';

async function runMigration() {
    try {
        await migrateNarrativeScenesV2(contentDb);
        console.log('✅ Migration Phase 1.3 successful');
    } catch (e) {
        console.error('❌ Migration failed:', e);
    }
}

runMigration();
