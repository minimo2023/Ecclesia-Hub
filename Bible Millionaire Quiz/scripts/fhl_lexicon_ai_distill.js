import pkg from 'pg';
import gemini from '../server/services/gemini-client.js';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;
const { callGemini } = gemini;

const dbConfig = {
    user: 'dev', host: 'localhost', database: 'bible_quiz_v3',
    password: 'dev123', port: 5432,
};

// [穩、準] AI 指導語定義
const SYSTEM_INSTRUCTION = `
你是一位精通「聖經考古學」與「百科全書」的大學教授，同時也是一位「聖經百萬大富翁」的遊戲設計師。
你的任務是將原始的辭典文字解構並轉化為高品質的百科主權資產。

## 處理原則：
1. 【提純】：物理移除所有長篇大論的經文編號列表（如：創1:1, 出2:2...），僅保留對物體物理屬性、歷史用途及聖經神學意義的描述。
2. 【結構】：輸出必須分為兩部分：
   - content_ai: 用 Markdown 格式撰寫的百科摘要（約 200-400 字）。
   - quiz_pool: 一個包含 2 個物件的 JSON 陣列。
3. 【出題規約】：
   - 第一題：側重該物件的「百科硬知識」 (例如：材質、物理原理)。
   - 第二題：側重該物件在「聖經敘事」中的象徵或角色。
   - 每題必須提供 A, B, C, D 四個選項，並註明正確答案索引(0-3)與精闢解析。

## 輸出格式 (JSON)：
{
  "content_ai": "...",
  "quiz_data": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answerIndex": 0,
      "explanation": "..."
    }
  ]
}
`;

async function distill(limit = 5) {
    const client = new Client(dbConfig);
    await client.connect();
    
    console.log(`🤖 啟動 AI 智慧提純指揮官 (樣測限制: ${limit} 筆)...`);
    
    const records = await client.query(`
        SELECT id, name_zh, content_raw 
        FROM lexicons 
        WHERE content_ai IS NULL 
        ORDER BY category DESC, key_id ASC 
        LIMIT $1
    `, [limit]);

    for (const row of records.rows) {
        console.log(`\n🧠 正在精煉: 【${row.name_zh}】...`);
        
        try {
            const prompt = `請處理以下聖經百科條目：\n名稱：${row.name_zh}\n原始內容：${row.content_raw}`;
            const responseText = await callGemini(prompt, {
                systemInstruction: SYSTEM_INSTRUCTION,
                json: true,
                maxAttempts: 3
            });

            // 清理可能的 Markdown 標籤以解析 JSON
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanJson);

            await client.query(
                'UPDATE lexicons SET content_ai = $1, quiz_pool = $2 WHERE id = $3',
                [result.content_ai, JSON.stringify(result.quiz_data), row.id]
            );
            
            console.log(`✅ 【${row.name_zh}】精煉成功，題庫已物理入庫。`);
        } catch (e) {
            console.error(`❌ 【${row.name_zh}】解析失敗: ${e.message}`);
        }
    }

    await client.end();
    console.log('\n🏁 樣測全量結束。');
}

// 執行
distill(5);
