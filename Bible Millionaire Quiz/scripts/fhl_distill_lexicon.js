import pkg from 'pg';
const { Client } = pkg;
import { LogosEngine } from '../server/services/LogosEngine.js';

// 資料庫配置
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

/**
 * 批量蒸餾引擎 (並行提速 v4.4)
 */
async function distillAll() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Logos] 啟動道引擎百科全量蒸餾 (並行加速模式 v4.4)');

    try {
        const res = await client.query(
            'SELECT id, name_zh, description, discussion, symbolism FROM lexicons WHERE is_distilled = false ORDER BY id ASC'
        );
        
        console.log(`📊 待處理筆數: ${res.rows.length}`);

        const CONCURRENCY_LIMIT = 5; // 並行數
        for (let i = 0; i < res.rows.length; i += CONCURRENCY_LIMIT) {
            const chunk = res.rows.slice(i, i + CONCURRENCY_LIMIT);
            
            await Promise.all(chunk.map(async (row) => {
                console.log(`✨ [Logos] 正在並行蒸餾: [${row.id}] ${row.name_zh}...`);
                const context = {
                    topic: row.name_zh,
                    description: row.description || '',
                    discussion: row.discussion || '',
                    symbolism: row.symbolism || '',
                    input: `請蒸餾百科實體: ${row.name_zh}`
                };

                try {
                    const response = await LogosEngine.askBrain('lexicon_distillation', context);
                    let distilled;

                    // 強悍的 JSON 清洗邏輯
                    let cleanedText = (typeof response === 'string' ? response : JSON.stringify(response))
                        .replace(/```json/gi, '').replace(/```/gi, '').trim();
                    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) cleanedText = jsonMatch[0];
                    distilled = JSON.parse(cleanedText);

                    if (distilled && !distilled.error) {
                        await client.query(
                            'UPDATE lexicons SET distilled_json = $1, is_distilled = true WHERE id = $2',
                            [JSON.stringify(distilled), row.id]
                        );
                        console.log(`✅ [${row.name_zh}] 蒸餾對位完成。`);
                    }
                } catch (err) {
                    console.error(`❌ [${row.name_zh}] 失敗:`, err.message);
                }
            }));
            
            // 物理節流：保護 API 配額 (Chunk 間暫停)
            await new Promise(r => setTimeout(r, 1500));
        }
    } finally {
        await client.end();
    }
}

distillAll().catch(console.error);
