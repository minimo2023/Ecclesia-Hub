import { dbOps } from '../database/index.js';

console.log('Applying Schema Hotfix: Adding Central Bank columns...');
(async () => {
    try {
        // Wait for DB init (though import triggers it, connection might take ms)
        setTimeout(async () => {
            await dbOps.gamesDb.exec(`
                ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_index INTEGER;
                ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence TEXT;
                ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT;
                ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags JSONB;
                ALTER TABLE questions ADD COLUMN IF NOT EXISTS options JSONB;
            `);
            console.log('✅ Schema Updated Successfully');
        }, 1000);
    } catch (e) {
        console.error('❌ Hotfix Error:', e);
    }
})();
