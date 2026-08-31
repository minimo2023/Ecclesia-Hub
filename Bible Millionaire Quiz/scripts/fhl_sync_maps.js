/**
 * FHL_SYNC_MAPS.JS (v1.0)
 * 聖經地圖位圖與整合說明同步計畫 (Phase 5.0)
 * 
 * 功能：
 * 1. 遍歷 GID 索引。
 * 2. 物理下載 .gif 地圖影像。
 * 3. 抓取地圖下方的「整合敘事 (Narrative)」文字。
 * 4. 建立「地點 ↔ 地圖」的物理關聯。
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pg;
const decoder = new TextDecoder('big5');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const ASSET_DIR = './public/assets/maps';

async function fetchBig5(url) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    return decoder.decode(buffer);
}

async function downloadImage(url, filename) {
    const filePath = path.join(ASSET_DIR, filename);
    if (fs.existsSync(filePath)) return filename;
    
    const res = await fetch(url);
    const fileStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
    return filename;
}

async function getGids() {
    const html = await fetchBig5('https://bible.fhl.net/LMAP/index.php');
    // 從 <option value="024"> 或類似結構中提取 GID
    const matches = html.match(/value="([0-9a-zA-Z]+)"/g) || [];
    const gids = matches.map(m => m.split('"')[1]).filter(id => id && id.length <= 4);
    return [...new Set(gids)];
}

async function syncMap(gid) {
    console.log(`🚀 [GID ${gid}] 啟動雙源同步 (index.php + smap.php)...`);
    const indexUrl = `https://bible.fhl.net/LMAP/index.php?gid=${gid}`;
    const smapUrl = `https://bible.fhl.net/LMAP/smap.php?gid=${gid}`;
    
    // 1. 獲取敘事頁面 (index.php)
    const indexHtml = await fetchBig5(indexUrl);
    const titleMatch = indexHtml.match(/<title>([^<]+)/i);
    const title = titleMatch ? titleMatch[1].trim() : `Map ${gid}`;

    // 提取整合敘事
    const narrativeStart = indexHtml.indexOf('說明');
    let narrative = '';
    if (narrativeStart !== -1) {
        narrative = indexHtml.substring(narrativeStart, narrativeStart + 5000)
            .split('<br>').join('\n')
            .replace(/<[^>]*>/g, '')
            .trim();
    }

    // 2. 獲取連結頁面與影像 (smap.php)
    const smapHtml = await fetchBig5(smapUrl);
    const imgMatch = smapHtml.match(/src="([^"]+\.GIF)"/i);
    let localPath = null;
    if (imgMatch) {
        const imgSrc = imgMatch[1].includes('/') ? imgMatch[1] : `map/${imgMatch[1]}`;
        const imgUrl = `https://bible.fhl.net/LMAP/${imgSrc}`;
        localPath = await downloadImage(imgUrl, path.basename(imgMatch[1]));
    }

    // 3. 入庫 maps 表
    await pool.query(`
        INSERT INTO maps (gid, title, image_local, narrative)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (gid) DO UPDATE SET
            title = EXCLUDED.title,
            image_local = EXCLUDED.image_local,
            narrative = EXCLUDED.narrative
    `, [gid, title, localPath ? `assets/maps/${localPath}` : null, narrative]);

    // 4. 提取地點關聯 (從 smap.php 抓取 ID)
    const locIdPattern = /(?:show\.html|smap\.php)\?([0-9]{4})/g;
    const locIds = [];
    let match;
    while ((match = locIdPattern.exec(smapHtml)) !== null) {
        locIds.push(match[1]);
    }
    const uniqueLocIds = [...new Set(locIds)];

    for (const locId of uniqueLocIds) {
        try {
            const locIdFull = `FHL_LMAP_${locId}`;
            await pool.query(`
                INSERT INTO location_maps (location_id, map_id)
                VALUES ($1, $2)
                ON CONFLICT (location_id, map_id) DO NOTHING
            `, [locIdFull, gid]);
        } catch (linkErr) {
            // 記錄警告但不崩潰
            console.warn(`  ⚠️ [GID ${gid}] 關聯地點 ${locId} 失敗:`, linkErr.message);
        }
    }

    console.log(`✅ [GID ${gid}] 完成: 敘事(${narrative.length}字), 地點(${uniqueLocIds.length}個)。`);
}

async function run() {
    console.log('🌊 啟動地圖敘事主權同步計畫 (遞增遍歷模式)...');
    // 直接遍歷 001 到 150, 確保主權獲取
    const gids = [];
    for (let i = 1; i <= 150; i++) {
        gids.push(i.toString().padStart(3, '0'));
    }
    console.log(`📋 共有 ${gids.length} 個預期圖幅待處理。`);

    for (let i = 0; i < gids.length; i++) {
        try {
            await syncMap(gids[i]);
            // 適度延遲防止 403
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            console.error(`❌ [GID ${gids[i]}] 失敗:`, e.message);
        }
    }

    console.log('🎉 地圖敘事同步完成！');
    process.exit(0);
}

run();
