import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

// 環境對位
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, '../public/assets/lexicon');
const FHL_BASE_URL = 'https://bible.fhl.net/Mar/';

// 資料庫配置 (PostgreSQL)
const dbConfig = {
    user: 'dev',
    host: 'localhost',
    database: 'bible_quiz_v3',
    password: 'dev123',
    port: 5432,
};

// 物理編碼解碼器 (FHL Mar 辭典系列現已切換為 UTF-8)
const decoder = new TextDecoder('utf-8');

/**
 * 延遲函數 (穩、準原則：不對 FHL 造成過大負擔)
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 取得 HTML 並轉換為 Big5 文本
 */
async function fetchBig5(url) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    return decoder.decode(buffer);
}

/**
 * 下載影像主權
 */
async function downloadImage(filename) {
    const url = `${FHL_BASE_URL}${filename}`;
    const localPath = path.join(ASSETS_DIR, filename);
    
    if (fs.existsSync(localPath)) return filename;

    try {
        // [穩、準] 確保子目錄存在
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(localPath, Buffer.from(buffer));
        console.log(`🖼️  影像主權入庫: ${filename}`);
        return filename;
    } catch (e) {
        console.error(`❌ 影像下載失敗: ${filename}`, e.message);
        return null;
    }
}

/**
 * 智慧辨識與精煉 (核心 logic)
 */
function distillContent(html) {
    // 先移除導航與腳註
    let cleanHtml = html;
    const navEnd = html.indexOf('<hr>'); // 跳過上方導航
    if (navEnd !== -1) cleanHtml = html.substring(navEnd);

    // 移除 HTML 標籤
    const text = cleanHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 試探邊界
    const startMarkers = ['描述', '意義', '說明'];
    const endMarkers = ['經文出處', '參考資料', '回上級'];
    
    let startIdx = -1;
    for (const m of startMarkers) {
        const idx = text.indexOf(m);
        if (idx !== -1) { startIdx = idx; break; }
    }

    let endIdx = -1;
    for (const m of endMarkers) {
        const idx = text.indexOf(m, startIdx !== -1 ? startIdx : 0);
        if (idx !== -1) { endIdx = idx; break; }
    }
    
    if (startIdx !== -1 && endIdx !== -1) {
        return text.substring(startIdx, endIdx).trim();
    }
    
    return text.substring(0, 800);
}

/**
 * 啟動百科主權同步 (Phase 7.0)
 */
async function syncLexicon(category = 2, truncate = true) {
    const client = new Client(dbConfig);
    await client.connect();
    console.log(`🚀 啟動聖經百科主權同步 (分類: ${category})...`);

    // Step 0: [穩、準] 確保資料表存在
    await client.query(`
        CREATE TABLE IF NOT EXISTS lexicons (
            id SERIAL PRIMARY KEY,
            category INTEGER, -- 0:動物, 1:植物, 2:物件
            key_id TEXT, -- FHL 原始編號 (如 1.1.1)
            name_zh TEXT NOT NULL,
            name_en TEXT,
            content_raw TEXT, -- 原始抓取之完整說明
            content_ai TEXT, -- [AI 辨識] 精鍊後的百科解說
            quiz_pool JSONB DEFAULT '[]', -- [AI 預生成] 專屬題庫庫
            image_local TEXT, -- 本地影像路徑 (public/assets/lexicon/...)
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, key_id)
        );
        CREATE INDEX IF NOT EXISTS idx_lexicon_cat_key ON lexicons(category, key_id);
    `);
    console.log('✅ 資料表結構驗證通過。');

    if (truncate) {
        console.log(`🧹 物理清除舊有分類 ${category} 數據...`);
        await client.query('DELETE FROM lexicons WHERE category = $1', [category]);
    }

    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    try {
        // Step 1: 抓取目錄 (同時抓取編號與名稱)
        const catalogUrl = `${FHL_BASE_URL}dic_show.php?sel=${category}`;
        const catalogHtml = await fetchBig5(catalogUrl);
        
        // 匹配連結與標籤: <a href="dic_detail.php?sel=2&key=1.1.1">1.1.1 軛(yoke)</a>
        const linkPattern = /dic_detail\.php\?sel=[0-2]&key=([^\"\'\s>]+)\">([^<]+)<\/a>/g;
        const entries = [];
        let match;
        while ((match = linkPattern.exec(catalogHtml)) !== null) {
            entries.push({ key: match[1], label: match[2].trim() });
        }
        
        console.log(`📋 偵察完畢：發現 ${entries.length} 個百科條目。`);

        // Step 2: 逐一入庫
        for (const entry of entries) {
            const { key, label } = entry;

            // [穩、準] 噪音過濾: 跳過目錄、介紹等非實物條目
            if (key.startsWith('0') || label.includes('目錄') || label.includes('介紹')) {
                console.log(`⏩ 跳過噪音條目: ${label}`);
                continue;
            }

            const detailUrl = `${FHL_BASE_URL}dic_detail.php?sel=${category}&key=${key}`;
            const detailHtml = await fetchBig5(detailUrl);

            // 解析中英文名: 從 label 提取 (例如 "1.1.1 軛(yoke)")
            const namePart = label.replace(/^[0-9.]+/, '').trim();
            const nameZh = namePart.split('(')[0].trim();
            const nameEnMatch = namePart.match(/\((.*?)\)/);
            const nameEn = nameEnMatch ? nameEnMatch[1].trim() : '';

            // 物理萃取描述
            const contentRaw = distillContent(detailHtml);

            // 影像主權: <img src="a_2_1.1.1.jpg" ...>
            const imgMatch = detailHtml.match(/src="([^"]+\.jpg)"/i);
            let imagePath = null;
            if (imgMatch) {
                imagePath = await downloadImage(imgMatch[1]);
            }

            // Upsert 入庫
            await client.query(`
                INSERT INTO lexicons (category, key_id, name_zh, name_en, content_raw, image_local)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (category, key_id) DO UPDATE 
                SET name_zh = EXCLUDED.name_zh, 
                    name_en = EXCLUDED.name_en, 
                    content_raw = EXCLUDED.content_raw,
                    image_local = EXCLUDED.image_local;
            `, [category, key, nameZh, nameEn, contentRaw, imagePath]);

            console.log(`✅ 已同步: ${key} ${nameZh}`);
            await sleep(200); // 穩、準原則：節流
        }

    } catch (e) {
        console.error('❌ 同步引擎發生故障:', e);
    } finally {
        await client.end();
    }
}

// 執行
const cat = process.argv[2] ? parseInt(process.argv[2]) : 2;
syncLexicon(cat);
