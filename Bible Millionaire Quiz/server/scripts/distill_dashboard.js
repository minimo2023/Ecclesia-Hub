import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DEFAULT_GEMINI_MODEL } from '../infrastructure/ai/model-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PORT = 3006;
const TWD_RATE = 32;
const FLASH_INPUT_PRICE = 0.075 / 1000000;
const FLASH_OUTPUT_PRICE = 0.3 / 1000000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEYS.split(',')[0]);
const model = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

// --- CONSTITUTION ---
const PROMPT_CONSTITUTION = `
## 隞餃??格?
撠?[皞? ?脰???撅方???蝣潦?頧??箏?蜓甈?蝺??亥?璅惜??## 頛詨蝯? (JSON Array Only)
[
  { "book": "?詨?", "chapter": 0, "layer_type": "ID"|"FUNC"|"THEO"|"SYMB", "theme": "銝駁?", "content": "蝎曄??批捆", "dispute_level": "LOW"|"MED"|"HIGH", "is_standard_answer": BOOLEAN }
]
`;

let currentConnections = [];

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    } else if (req.url === '/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        currentConnections.push(res);
        req.on('close', () => {
            currentConnections = currentConnections.filter(c => c !== res);
        });
    } else if (req.url === '/start' && req.method === 'POST') {
        startDistillation();
        res.writeHead(200);
        res.end('Started');
    } else {
        res.writeHead(404);
        res.end();
    }
});

function broadcast(data) {
    currentConnections.forEach(res => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

async function startDistillation() {
    const sqlite = new Database(path.join(__dirname, '../../data/content.db'));
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    
    await pg.connect();
    const rows = sqlite.prepare('SELECT id, name, description FROM lexicons').all();
    
    let totalTokens = 0;
    let totalTWD = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
            const result = await model.generateContent([PROMPT_CONSTITUTION, row.description]);
            const response = await result.response;
            const segments = JSON.parse(response.text().replace(/```json|```/g, '').trim());
            const usage = response.usageMetadata;
            
            const cost = ((usage.promptTokenCount * FLASH_INPUT_PRICE) + (usage.candidatesTokenCount * FLASH_OUTPUT_PRICE)) * TWD_RATE;
            totalTokens += (usage.promptTokenCount + usage.candidatesTokenCount);
            totalTWD += cost;

            for (const s of segments) {
                await pg.query('INSERT INTO knowledge_segments (book, chapter, layer_type, theme, content, dispute_level, is_standard_answer, attribution, section_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', 
                [s.book || row.name, s.chapter || 0, s.layer_type, s.theme, s.content, s.dispute_level, s.is_standard_answer, 'lexicon_migration', 'lexicon']);
            }

            broadcast({
                index: i + 1,
                total: rows.length,
                name: row.name,
                tokens: totalTokens,
                cost: totalTWD.toFixed(4)
            });
        } catch (e) {
            broadcast({ error: `Error at ${row.name}: ${e.message}` });
        }
    }
    
    broadcast({ complete: true });
    await pg.end();
    sqlite.close();
}

server.listen(PORT, () => {
    console.log(`?? Isolated Distillation Dashboard running at http://localhost:${PORT}`);
});
