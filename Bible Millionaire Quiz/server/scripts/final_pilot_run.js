import { Client } from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveGeminiModel } from '../infrastructure/ai/model-policy.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MODEL_NAME = resolveGeminiModel(process.env.GEMINI_MODEL);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEYS.split(',')[0]);
const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `
## 任務目標
將 [源文本] 的原始內容進行「四層語意分碼」，轉化為具備主權界線的知識標籤。

## 處理規則 (The Four-Layer Constitution)
1. **第一層：文本識別 (ID)**：這是什麼物件、出現在哪、與何人何事有關（僅限文本描述）。
2. **第二層：文本功能 (FUNC)**：該物件在該段敘事、禮儀或比喻中扮演什麼角色。
3. **第三層：常見意涵 (THEO)**：教會傳統、神學詮釋常如何理解此物（須加「常被理解為」等框架）。
4. **第四層：象徵詮釋 (SYMB)**：高度靈意化、象徵化、超出直接語境的詮釋。

## 執行規範
- **缺失處理**：若原文未具備某層資訊，禁止生成該分段，內容直接留空。
- **反歧義 [Anti-Ambiguity]**：禁止進行主觀神學詮釋、教義解經或寓意化。僅允許提取「客觀、且在學理上有定論的歷史、地理、考古或原文字義事實」。

## 輸出結構規範 (JSON Array Only)
[
  {
    "book": "書名",
    "chapter": 數字,
    "layer_type": "ID" | "FUNC" | "THEO" | "SYMB",
    "theme": "主題",
    "content": "精煉內容(150字內)",
    "dispute_level": "LOW" | "MED" | "HIGH",
    "is_standard_answer": BOOLEAN
  }
]
`
});

async function runPilot() {
    const sqlite = new Database(path.join(__dirname, '../../data/content.db'));
    const ids = [
        '2c8c21c8-2448-4966-afb7-abc37754d142', // 神的羔羊
        '8d37089b-bb67-42cb-95b2-b785708929f0', // 善惡樹的果子
        'c921f7da-c925-469d-87b5-9a3838a4633a'  // 尼布甲尼撒的大金像
    ];

    const results = [];

    for (const id of ids) {
        const row = sqlite.prepare(`
            SELECT r.title, et.content 
            FROM resources r
            JOIN extracted_text et ON r.id = et.resource_id
            WHERE r.id = ?
        `).get(id);

        if (!row) continue;
        console.log(`Distilling: ${row.title}...`);

        const result = await model.generateContent(`ITEM: ${row.title}\nTEXT: ${row.content}`);
        const text = (await result.response).text().replace(/```json|```/g, '').trim();
        const segments = JSON.parse(text);
        results.push(...segments);
    }

    console.log('--- PILOT RESULTS JSON ---');
    console.log(JSON.stringify(results, null, 2));
    sqlite.close();
}

runPilot().catch(console.error);
