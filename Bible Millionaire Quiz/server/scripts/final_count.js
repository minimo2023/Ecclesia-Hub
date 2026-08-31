
import { initializeDatabases } from '../database/core.js';

async function run() {
    try {
        const { contentDb } = await initializeDatabases();
        console.log('✅ Connection established via Core module.');
        
        const targets = [
            { table: 'lexicons', col: 'description' },
            { table: 'extracted_text', col: 'content' },
            { table: 'bible_objects', col: 'description' },
            { table: 'commentaries', col: 'content' }
        ];

        console.log('\n--- [Sovereign Database Audit Result] ---');
        for (const item of targets) {
            try {
                const res = await contentDb.get(`SELECT COUNT(*) as count FROM ${item.table}`);
                const lenRes = await contentDb.get(`SELECT SUM(LENGTH(COALESCE(${item.col}::text, ''))) as len FROM ${item.table}`);
                console.log(`Table: ${item.table.padEnd(15)} | Rows: ${res.count.toString().padEnd(6)} | Total Chars: ${lenRes.len || 0}`);
            } catch(e) {
                console.warn(`⚠️ Table ${item.table} access skipped or failed: ${e.message}`);
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Census Script Failed:', error);
        process.exit(1);
    }
}

run();
