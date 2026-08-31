import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    host: process.env.DB_HOST_PG || 'localhost',
    port: parseInt(process.env.DB_PORT_PG || '5433'),
    user: process.env.DB_USER_PG || 'dev',
    password: process.env.DB_PASSWORD_PG || 'dev123',
    database: process.env.DB_NAME_PG || 'bible_quiz_dev'
});

async function cleanupLocations() {
    console.log('🧹 Deep Cleaning Locations Description...');
    const res = await pool.query('SELECT id, name_ch, description FROM locations');
    let updatedCount = 0;

    for (const row of res.rows) {
        let { id, name_ch, description } = row;
        let cleanDesc = description;

        // 1. Remove navigation artifacts (already done, but double check)
        cleanDesc = cleanDesc.replace(/回查詢頁\s+(同|回)?聖經查詢\s+編號\s+\d+/gi, '');
        cleanDesc = cleanDesc.replace(/回查詢頁\s+聖經查詢\s+編號\s+\d+/gi, '');
        
        // 2. Remove Technical Labels
        cleanDesc = cleanDesc.replace(/型態\s+\d+/g, '');
        cleanDesc = cleanDesc.replace(/梁天樞編號\s*\d*/g, '');
        cleanDesc = cleanDesc.replace(/聖經地名大全/g, '');
        
        // 3. Remove Redundant Self-Reference (e.g. "Abila ...")
        const escapedName = name_ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp('^' + escapedName + '\\s+', 'i');
        cleanDesc = cleanDesc.replace(nameRegex, '');

        // 4. Format "Other Names" labels
        cleanDesc = cleanDesc.replace(/其他名\s+see\s+/gi, '(其他參照: ');
        if (cleanDesc.includes('(其他參照: ') && !cleanDesc.includes(')')) {
            cleanDesc += ')';
        }
        cleanDesc = cleanDesc.replace(/其他名\s+/gi, '(其他名稱: ');
        if (cleanDesc.includes('(其他名稱: ') && !cleanDesc.includes(')')) {
            cleanDesc += ')';
        }

        // 5. Final Polishing
        cleanDesc = cleanDesc.replace(/\s+/g, ' ').trim();
        
        // If the description became just "(其他參照: ...)", that's fine.
        // If it's empty, we might want to keep it empty or put a placeholder.

        if (cleanDesc !== description) {
            await pool.query('UPDATE locations SET description = $1 WHERE id = $2', [cleanDesc, id]);
            updatedCount++;
        }
    }
    console.log(`✅ [Locations] Deep cleaned ${updatedCount} rows.`);
}

async function cleanupObjects() {
    console.log('🧹 Deep Cleaning Bible Objects Description...');
    const res = await pool.query('SELECT id, name_zh, description FROM bible_objects');
    let updatedCount = 0;

    for (const row of res.rows) {
        let { id, name_zh, description } = row;
        let cleanDesc = description;

        // Remove redundant labels usually at start
        cleanDesc = cleanDesc.replace(/標題\s+\d*\.?\d*\s*[^分\s]+/gi, '');
        cleanDesc = cleanDesc.replace(/分類\s+[^內\s]+/gi, '');
        cleanDesc = cleanDesc.replace(/信望愛聯合聖經公會.*中的字典內容/gi, '');
        
        // Remove trailing navigation
        cleanDesc = cleanDesc.replace(/\[\s*回上一層\s*\]/gi, '');

        // Final Polishing
        cleanDesc = cleanDesc.replace(/\s+/g, ' ').trim();

        if (cleanDesc !== description) {
            await pool.query('UPDATE bible_objects SET description = $1 WHERE id = $2', [cleanDesc, id]);
            updatedCount++;
        }
    }
    console.log(`✅ [BibleObjects] Deep cleaned ${updatedCount} rows.`);
}

async function run() {
    try {
        await cleanupLocations();
        await cleanupObjects();
        console.log('🏁 Deep cleansing complete!');
    } catch (err) {
        console.error('❌ Cleansing Error:', err);
    } finally {
        await pool.end();
    }
}

run();
