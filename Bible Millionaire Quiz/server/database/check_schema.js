import { contentDb } from './index.js';

async function checkSchema() {
    try {
        const res = await contentDb.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'narrative_story_scenes'
            ORDER BY ordinal_position;
        `);
        console.log('--- narrative_story_scenes Columns ---');
        res.forEach(col => console.log(`${col.column_name}: ${col.data_type}`));
    } catch (e) {
        console.error('Error checking schema:', e);
    }
}

checkSchema();
