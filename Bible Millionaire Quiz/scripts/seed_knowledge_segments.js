/**
 * knowledge_segments 填充腳本 v1.0
 *
 * 資料來源: Postgres bible_verses (92,373筆) + lexicons (723筆)
 * 目標: 為每個書卷章節生成 ID層(識別事實) + FUNC層(功能事實) 各3條
 * 預期筆數: ~66本 × 平均25章 × 6條 ≈ 9,900筆
 *
 * 執行方式:
 *   GEMINI_API_KEYS=key1,key2,key3,key4,key5 node scripts/seed_knowledge_segments.js
 *   GEMINI_API_KEYS=... node scripts/seed_knowledge_segments.js --resume   (斷點續傳)
 *   GEMINI_API_KEYS=... node scripts/seed_knowledge_segments.js --book Gen  (單書卷測試)
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 設定 ─────────────────────────────────────────────────────────────────────
const DB = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'dev',
    password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_v3',
};

const RESUME_FILE = path.join(__dirname, '../tmp/ks_progress.json');
const SKIP_FILE = path.join(__dirname, '../tmp/ks_skipped.json');
const RATE_LIMIT_MS = 4500; // ~13 req/min per key (Gemini free = 15 RPM)
const MAX_RETRIES = 3;

// 讀取 Gemini API Keys
const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').filter(k => k.trim());
if (rawKeys.length === 0) {
    console.error('❌ 需要設定 GEMINI_API_KEYS 環境變數 (逗號分隔)');
    process.exit(1);
}
const keys = rawKeys; // 支援任意數量，付費 key 排最後當保底
let keyIndex = 0;
let lastCallTime = 0;

function getNextKey() {
    const key = keys[keyIndex % keys.length];
    keyIndex++;
    return key;
}

// ─── Gemini 呼叫 ──────────────────────────────────────────────────────────────
async function callGemini(prompt, retries = 0) {
    // Rate limiting
    const now = Date.now();
    const waitMs = RATE_LIMIT_MS / keys.length - (now - lastCallTime);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    lastCallTime = Date.now();

    const apiKey = getNextKey();
    const model = 'gemini-2.5-flash-lite'; // 使用免費版本
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
            })
        });

        if (res.status === 429) {
            if (retries < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 10000));
                return callGemini(prompt, retries + 1);
            }
            throw new Error('Rate limit exceeded after retries');
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
        if (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 5000));
            return callGemini(prompt, retries + 1);
        }
        throw e;
    }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(bookZh, chapter, verseTexts, lexiconHints) {
    const passage = verseTexts.slice(0, 20).map(v => `${v.verse}. ${v.text}`).join('\n');
    const hints = lexiconHints.length ? `\n相關詞彙: ${lexiconHints.join('、')}` : '';

    return `你是聖經知識專家。請為以下聖經章節生成知識摘要。

章節: ${bookZh} 第${chapter}章
經文:
${passage}${hints}

請生成2種類型的知識條目（JSON格式），每種各3條，每條content不超過80字：

{
  "ID": [
    {"theme": "主題名稱", "content": "識別性事實：人物/地點/事件的具體描述", "dispute_level": "LOW"},
    {"theme": "主題名稱", "content": "...", "dispute_level": "LOW"},
    {"theme": "主題名稱", "content": "...", "dispute_level": "LOW"}
  ],
  "FUNC": [
    {"theme": "主題名稱", "content": "功能性事實：行動/結果/意義的描述", "dispute_level": "LOW"},
    {"theme": "主題名稱", "content": "...", "dispute_level": "LOW"},
    {"theme": "主題名稱", "content": "...", "dispute_level": "LOW"}
  ]
}

規則：
- ID層：描述「是什麼」（人物身份、地點特徵、物品名稱）
- FUNC層：描述「做了什麼/有何功能」（行動、結果、象徵）
- dispute_level: 有聖經明確記載的用LOW，需詮釋的用MED，神學爭議的用HIGH
- 只回傳JSON，不要其他文字`;
}

// ─── 解析 AI 回應 ─────────────────────────────────────────────────────────────
function parseResponse(text, bookZh, chapter, testament) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [];
        const data = JSON.parse(jsonMatch[0]);
        const results = [];

        for (const layerType of ['ID', 'FUNC']) {
            const items = data[layerType] || [];
            for (const item of items) {
                if (!item.theme || !item.content) continue;
                results.push({
                    book: bookZh,
                    chapter,
                    testament,
                    layer_type: layerType,
                    theme: item.theme.slice(0, 100),
                    content: item.content.slice(0, 200),
                    dispute_level: ['LOW','MED','HIGH'].includes(item.dispute_level) ? item.dispute_level : 'LOW',
                    is_standard_answer: item.dispute_level !== 'HIGH',
                    attribution: 'bible_verses_v1',
                    section_type: 'chapter'
                });
            }
        }
        return results;
    } catch (e) {
        return [];
    }
}

// ─── 主程式 ───────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const isResume = args.includes('--resume');
    const targetBook = args.find(a => a.startsWith('--book='))?.split('=')[1]
                    || (args.indexOf('--book') >= 0 ? args[args.indexOf('--book') + 1] : null);

    const pool = new Pool(DB);
    const client = await pool.connect();

    // 確保 tmp 目錄
    fs.mkdirSync(path.join(__dirname, '../tmp'), { recursive: true });

    // 載入進度
    let done = new Set();
    if (isResume && fs.existsSync(RESUME_FILE)) {
        done = new Set(JSON.parse(fs.readFileSync(RESUME_FILE, 'utf8')));
        console.log(`📂 Resume: ${done.size} 個章節已完成`);
    }

    const skipped = [];

    try {
        // 取得書卷章節清單（使用 Postgres bible_verses）
        let chapQuery = `
            SELECT book, chapter,
                   CASE WHEN book IN ('Matthew','Mark','Luke','John','Acts','Romans',
                        '1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians',
                        'Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy',
                        'Titus','Philemon','Hebrews','James','1 Peter','2 Peter',
                        '1 John','2 John','3 John','Jude','Revelation') THEN 'NT' ELSE 'OT' END as testament
            FROM bible_verses
            WHERE version = 'CUV_TRAD'
            GROUP BY book, chapter, testament
            ORDER BY testament DESC, book, chapter
        `;
        if (targetBook) {
            // 允許中文或英文書名
            chapQuery = chapQuery.replace('WHERE version', `WHERE book = '${targetBook}' AND version`);
        }

        const chapters = await client.query(chapQuery);
        console.log(`📚 待處理: ${chapters.rows.length} 個章節 (${keys.length} 組 API Key)\n`);

        // 建立書名中文對照
        const bookZhMap = new Map();
        const bookMapRows = await client.query(`
            SELECT DISTINCT book FROM bible_verses WHERE version = 'CUV_TRAD'
        `);

        // 載入 lexicons 索引（用於關鍵字提示）
        const lexRows = await client.query(`SELECT name_zh FROM lexicons WHERE is_distilled = TRUE LIMIT 500`);
        const lexNames = lexRows.rows.map(r => r.name_zh.split(/[（(、\s]/)[0].trim()).filter(n => n.length >= 2);

        let processed = 0, inserted = 0, skippedCount = 0;
        const total = chapters.rows.length;

        for (const { book, chapter, testament } of chapters.rows) {
            const key = `${book}:${chapter}`;
            if (done.has(key)) { processed++; continue; }

            // 取得該章經文
            const verses = await client.query(`
                SELECT verse, text FROM bible_verses
                WHERE book = $1 AND chapter = $2 AND version = 'CUV_TRAD'
                ORDER BY verse
            `, [book, chapter]);

            if (verses.rows.length === 0) { done.add(key); continue; }

            // 取書卷中文名 (bible_verses.book 是英文全名，需要轉換)
            const bookZh = getChineseName(book);

            // 找關鍵字命中
            const fullText = verses.rows.map(v => v.text).join('');
            const hints = lexNames.filter(n => fullText.includes(n)).slice(0, 5);

            // 呼叫 AI
            let segments = [];
            try {
                const prompt = buildPrompt(bookZh, chapter, verses.rows, hints);
                const response = await callGemini(prompt);
                segments = parseResponse(response, bookZh, chapter, testament);
            } catch (e) {
                console.error(`\n  ⚠️  ${book} ${chapter} AI 失敗: ${e.message}`);
                skipped.push({ book, chapter, error: e.message });
                skippedCount++;
                done.add(key);
                continue;
            }

            // 批次寫入
            for (const seg of segments) {
                try {
                    await client.query(`
                        INSERT INTO knowledge_segments
                        (book, chapter, testament, layer_type, theme, content, dispute_level, is_standard_answer, attribution, section_type)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    `, [seg.book, seg.chapter, seg.testament, seg.layer_type, seg.theme,
                        seg.content, seg.dispute_level, seg.is_standard_answer, seg.attribution, seg.section_type]);
                    inserted++;
                } catch (e) {
                    // 忽略重複
                }
            }

            done.add(key);
            processed++;

            // 進度顯示
            const pct = Math.round(processed / total * 100);
            process.stdout.write(`\r  進度: ${processed}/${total} (${pct}%) | 已寫入: ${inserted} 條 | 跳過: ${skippedCount}`);

            // 每 50 章存一次進度
            if (processed % 50 === 0) {
                fs.writeFileSync(RESUME_FILE, JSON.stringify([...done]));
                if (skipped.length) fs.writeFileSync(SKIP_FILE, JSON.stringify(skipped, null, 2));
            }
        }

        // 最終儲存
        fs.writeFileSync(RESUME_FILE, JSON.stringify([...done]));
        if (skipped.length) fs.writeFileSync(SKIP_FILE, JSON.stringify(skipped, null, 2));

        const finalCount = await client.query('SELECT COUNT(*) FROM knowledge_segments');
        console.log(`\n\n✅ 完成!`);
        console.log(`   knowledge_segments: ${finalCount.rows[0].count} 筆`);
        console.log(`   本次新增: ${inserted} 條`);
        if (skippedCount) console.log(`   ⚠️  跳過: ${skippedCount} 章 (見 tmp/ks_skipped.json)`);

    } finally {
        client.release();
        await pool.end();
    }
}

// 英文書名 → 繁體中文
function getChineseName(enName) {
    const MAP = {
        'Genesis':'創世記','Exodus':'出埃及記','Leviticus':'利未記','Numbers':'民數記',
        'Deuteronomy':'申命記','Joshua':'約書亞記','Judges':'士師記','Ruth':'路得記',
        '1 Samuel':'撒母耳記上','2 Samuel':'撒母耳記下','1 Kings':'列王紀上','2 Kings':'列王紀下',
        '1 Chronicles':'歷代志上','2 Chronicles':'歷代志下','Ezra':'以斯拉記','Nehemiah':'尼希米記',
        'Esther':'以斯帖記','Job':'約伯記','Psalms':'詩篇','Proverbs':'箴言',
        'Ecclesiastes':'傳道書','Song of Solomon':'雅歌','Isaiah':'以賽亞書','Jeremiah':'耶利米書',
        'Lamentations':'耶利米哀歌','Ezekiel':'以西結書','Daniel':'但以理書','Hosea':'何西阿書',
        'Joel':'約珥書','Amos':'阿摩司書','Obadiah':'俄巴底亞書','Jonah':'約拿書',
        'Micah':'彌迦書','Nahum':'那鴻書','Habakkuk':'哈巴谷書','Zephaniah':'西番雅書',
        'Haggai':'哈該書','Zechariah':'撒迦利亞書','Malachi':'瑪拉基書',
        'Matthew':'馬太福音','Mark':'馬可福音','Luke':'路加福音','John':'約翰福音',
        'Acts':'使徒行傳','Romans':'羅馬書','1 Corinthians':'哥林多前書','2 Corinthians':'哥林多後書',
        'Galatians':'加拉太書','Ephesians':'以弗所書','Philippians':'腓立比書','Colossians':'歌羅西書',
        '1 Thessalonians':'帖撒羅尼迦前書','2 Thessalonians':'帖撒羅尼迦後書',
        '1 Timothy':'提摩太前書','2 Timothy':'提摩太後書','Titus':'提多書','Philemon':'腓利門書',
        'Hebrews':'希伯來書','James':'雅各書','1 Peter':'彼得前書','2 Peter':'彼得後書',
        '1 John':'約翰一書','2 John':'約翰二書','3 John':'約翰三書','Jude':'猶大書','Revelation':'啟示錄'
    };
    return MAP[enName] || enName;
}

main().catch(e => { console.error('\n❌ Fatal:', e); process.exit(1); });
