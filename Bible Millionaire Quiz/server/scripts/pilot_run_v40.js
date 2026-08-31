import { Client } from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DEFAULT_GEMINI_MODEL } from '../infrastructure/ai/model-policy.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

// --- CONFIGURATION ---
const TWD_RATE = 32; // 1 USD = 32 TWD
const FLASH_INPUT_PRICE = 0.075 / 1000000;
const FLASH_OUTPUT_PRICE = 0.3 / 1000000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEYS.split(',')[0]);
const model = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

// --- CONSTITUTION ---
const PROMPT_CONSTITUTION = `
## 任務目標
將 [源數據] 進行「四層語意分碼」，轉化為具備主權界線的知識標籤。

## 處理規則 (The Four-Layer Constitution)
1. Layer: ID (文本識別) - 物件描述、出處、敘事角色。
2. Layer: FUNC (文本功能) - 在經文敘事或禮儀中的具體作用。
3. Layer: THEO (常見意涵) - 傳統神學理解（須加框架語，如「常被理解為」）。標註為 is_standard_answer = false.
4. Layer: SYMB (象徵詮釋) - 高度靈意化或超出語境的詮釋。標註為 is_standard_answer = false.

## 輸出結構 (JSON Array Only)
[
  {
    "book": "書名", "chapter": 0, "layer_type": "ID"|"FUNC"|"THEO"|"SYMB",
    "theme": "主題", "content": "精煉內容(150字內)", "dispute_level": "LOW"|"MED"|"HIGH",
    "is_standard_answer": BOOLEAN
  }
]
`;

async function runDistiller() {
    const sqlite = new Database(path.join(__dirname, '../../data/content.db'));
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    
    await pg.connect();
    console.log('🚀 Distillation Engine Started V40.19');
    console.log('---------------------------------------');

    // 1. Get raw lexicons
    const rawLexicons = sqlite.prepare('SELECT id, name, description, discussion FROM lexicons').all().slice(0, 5);
    console.log(`📡 Found ${rawLexicons.length} objects for distillation.`);

    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let totalCostTWD = 0;

    for (const [index, row] of rawLexicons.entries()) {
        try {
            console.log(`\n[${index + 1}/${rawLexicons.length}] Distilling: ${row.name}...`);
            
            const rawContent = `NAME: ${row.name}\nDESC: ${row.description}\nDISC: ${row.discussion || ''}`;
            const result = await model.generateContent([PROMPT_CONSTITUTION, rawContent]);
            const response = await result.response;
            const text = response.text().replace(/```json|```/g, '').trim();
            const segments = JSON.parse(text);

            // Real-time financial audit
            const usage = response.usageMetadata;
            if (usage) {
                totalTokensInput += usage.promptTokenCount;
                totalTokensOutput += usage.candidatesTokenCount;
                const costUSD = (usage.promptTokenCount * FLASH_INPUT_PRICE) + (usage.candidatesTokenCount * FLASH_OUTPUT_PRICE);
                const costTWD = costUSD * TWD_RATE;
                totalCostTWD += costTWD;
                console.log(`📊 Batch Cost: NT$ ${costTWD.toFixed(4)} | Total Tokens: ${totalTokensInput + totalTokensOutput}`);
            }

            // Insert into Postgres
            for (const seg of segments) {
                await pg.query(
                    'INSERT INTO knowledge_segments (book, chapter, layer_type, theme, content, dispute_level, is_standard_answer, attribution, section_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                    [seg.book, seg.chapter, seg.layer_type, seg.theme, seg.content, seg.dispute_level, seg.is_standard_answer, 'fhl_lexicon', 'lexicon']
                );
            }
            
            // Real-time Dashboard Update
            if ((index + 1) % 5 === 0) {
                console.log(`\n💰 [DASHBOARD] Progress: ${index + 1}/${rawLexicons.length} | Cumulative Cost: NT$ ${totalCostTWD.toFixed(2)}`);
            }

        } catch (err) {
            console.error(`❌ Distillation Error [${row.name}]:`, err.message);
        }
    }

    console.log('\n--- [MISSION COMPLETE V40.19] ---');
    console.log(`🎉 Total Processed: ${rawLexicons.length}`);
    console.log(`💰 Total Final Cost: NT$ ${totalCostTWD.toFixed(2)}`);
    
    await pg.end();
    sqlite.close();
}

runDistiller();
