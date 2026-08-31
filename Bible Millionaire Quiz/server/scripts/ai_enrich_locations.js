import pg from 'pg';
import dotenv from 'dotenv';
import geminiClient from '../services/gemini-client.js';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    host: process.env.DB_HOST_PG || 'localhost',
    port: parseInt(process.env.DB_PORT_PG || '5433'),
    user: process.env.DB_USER_PG || 'dev',
    password: process.env.DB_PASSWORD_PG || 'dev123',
    database: process.env.DB_NAME_PG || 'bible_quiz_dev'
});

// 中央化模型調用
async function callAI(prompt) {
    return await geminiClient.callGemini(prompt, {
        moduleName: 'location_enricher',
        temperature: 0.7
    });
}

async function enrichLocation(id, name, originalDesc) {
    console.log(`🧠 Enriching ${name} (${id})...`);
    try {
        const prompt = `你是一位專業的聖經百科與地理學者。請為地點「${name}」提供一段高品質的聖經地誌介紹（約 100-150 字）。
        目前的原始說明是：「${originalDesc}」。
        
        【任務要求】：
        1. 語言：必須使用正體中文（台灣）。
        2. 內容：包含地理位置、聖經背景、相關經文。如果原始說明提到「see [某地]」，請解釋兩者的關聯。
        3. 屬性校核：如果「${name}」實際上是【人物】（如 Hadadezer）或【器物】而非具體地點，請在描述開頭註明「（聖經人物/物件）」並簡述其與聖經地理的關聯性。
        4. 格式：純文字。輸出內容必須比原始說明更詳盡且優質。`;

        const text = await callAI(prompt);
        
        if (text) {
            await pool.query('UPDATE locations SET description = $1 WHERE id = $2', [text, id]);
            console.log(`✅ Success: ${name}`);
        }
    } catch (err) {
        console.error(`❌ Failed to enrich ${name}:`, err.message);
    }
}

async function run() {
    try {
        // 全量補全：只要字數不足 120 字的，通通進行 AI 升級
        const res = await pool.query(`
            SELECT id, name_ch, description 
            FROM locations 
            WHERE length(description) < 120 
            AND name_ch NOT LIKE 'Unknown%' 
            ORDER BY length(description) ASC 
            LIMIT 500
        `);
        
        console.log(`🚀 Starting Intelligent Enrichment for ${res.rows.length} items...`);
        
        for (const row of res.rows) {
            // 如果含有「參照」，嘗試找出參照目標的資訊
            let context = '';
            const seeMatch = row.description.match(/參照:\s*([^)]+)/);
            if (seeMatch) {
                const targetName = seeMatch[1].trim();
                const targetRes = await pool.query("SELECT description FROM locations WHERE name_ch LIKE $1 LIMIT 1", [`%${targetName}%`]);
                if (targetRes.rows.length > 0 && targetRes.rows[0].description.length > 50) {
                    context = `（註：FHL 指出該地與 ${targetName} 有關，而 ${targetName} 的說明為：${targetRes.rows[0].description}）`;
                }
            }

            await enrichLocation(row.id, row.name_ch, row.description + context);
            // 延遲以避免 Rate Limit (Flash 每分鐘 15 次免費，Pro 則更少，這裡設 4 秒一次比較保險)
            await new Promise(r => setTimeout(r, 4000));
        }
        
        console.log('🏁 Intelligent Enrichment complete!');
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await pool.end();
    }
}

run();
