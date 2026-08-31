const { Client } = require('pg');
const Database = require('better-sqlite3');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// Absolute awareness for production stability
const ENV_PATH = path.join(__dirname, '../../.env');
require('dotenv').config({ path: ENV_PATH });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEYS.split(',')[0]);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const PROMPT = "Distill bible raw lexicon into 4 layers: ID, FUNC, THEO, SYMB. Respond ONLY with a JSON array of objects.";

async function run() {
    const SQLITE_PATH = path.resolve(__dirname, '../../data/content.db');
    if (!fs.existsSync(SQLITE_PATH)) { throw new Error('Physical DB path error: ' + SQLITE_PATH); }
    
    const sqlite = new Database(SQLITE_PATH);
    const connStr = "postgresql://" + process.env.DB_USER + ":" + process.env.DB_PASSWORD + "@" + process.env.DB_HOST + ":" + process.env.DB_PORT + "/" + process.env.DB_NAME;
    const pg = new Client({ connectionString: connStr });
    
    await pg.connect();
    const rows = sqlite.prepare("SELECT name, description FROM lexicons").all();
    let totalTWD = 0;

    for (let i = 0; i < rows.length; i++) {
        try {
            const res = await model.generateContent([PROMPT, rows[i].description]);
            const text = res.response.text().replace(/```json|```/g, "").trim();
            const segments = JSON.parse(text);
            const usage = res.response.usageMetadata;
            const cost = ((usage.promptTokenCount * 0.075 / 1000000) + (usage.candidatesTokenCount * 0.3 / 1000000)) * 32;
            totalTWD += cost;

            for (const s of segments) {
                await pg.query("INSERT INTO knowledge_segments (book, chapter, layer_type, theme, content, dispute_level, is_standard_answer, attribution, section_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", 
                [s.book || rows[i].name, s.chapter || 0, s.layer_type, s.theme, s.content, s.dispute_level, s.is_standard_answer, "silent_v40", "lexicon"]);
            }
        } catch (e) {
            // Silently log or retry in real production, here we just skip if fatal
        }
    }
    pg.end(); sqlite.close();
}

run().catch(console.error);