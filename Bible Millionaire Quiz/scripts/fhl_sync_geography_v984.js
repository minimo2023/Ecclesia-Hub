import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 9.8.4] 地理主權終極指揮官
 * 定製：地點優先 (Location-First) + 大量敘事集成 (Rich Narrative)
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_URL = 'https://bible.fhl.net/LMAP/index.php';
const BASE_SHOW_URL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';

async function sync984() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [984 Commander] 啟動地理主權重啟任務 (GID 001-120 Scoping)');

    try {
        // 第一階段：遍歷 GID (001-120)
        for (let gid = 1; gid <= 120; gid++) {
            const gidStr = gid.toString().padStart(3, '0');
            console.log(`📡 [Scope] 正在偵察地圖組: GID ${gidStr}...`);

            const url = `${BASE_LMAP_URL}?gid=${gidStr}`;
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const html = iconv.decode(response.data, 'utf-8');
            const $ = cheerio.load(html);

            // 1. 抓取地圖組標題與敘事 (Narrative Catching)
            const title = $('h3').first().text().trim() || $('title').text().trim();
            // 在地圖組頁面中，敘事通常在表格之後或段落中
            const introNarrative = $('body').text().split('關鍵字')[0].split(title)[1]?.trim() || '';

            await client.query(
                `INSERT INTO bible_map_groups (gid, title, narrative) VALUES ($1, $2, $3)
                 ON CONFLICT (gid) DO UPDATE SET title = EXCLUDED.title, narrative = EXCLUDED.narrative`,
                [gidStr, title, introNarrative]
            );

            // 2. 抓取地點清單
            const locationIds = [];
            $('a[href*="show.html?"]').each((i, el) => {
                const href = $(el).attr('href');
                const idMatch = href.match(/show\.html\?(\d+)/);
                if (idMatch) locationIds.push(idMatch[1]);
            });

            const uniqueIds = [...new Set(locationIds)];
            console.log(`📍 [GID ${gidStr}] 發現 ${uniqueIds.length} 個地點。同步中...`);

            for (const lmapId of uniqueIds) {
                await syncLocationDetail(client, lmapId, gidStr);
            }
        }
    } finally {
        await client.end();
        console.log('🏁 [984 Commander] 任務結案。');
    }
}

async function syncLocationDetail(client, lmapId, gid) {
    try {
        const url = `${BASE_SHOW_URL}?${lmapId}`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const html = iconv.decode(response.data, 'utf-8');
        const $ = cheerio.load(html);

        const data = {
            id: lmapId,
            name_zh: '',
            name_en: '',
            meaning: '',
            history: '',
            narrative: '',
            smap_id: null
        };

        // 物理採獲標題
        const titleText = $('h1, h2, b').first().text().trim();
        const parts = titleText.split(/\s+/);
        data.name_zh = parts[0] || '';
        data.name_en = parts[1] || '';

        // 物理分段 (敘事維度)
        $('table tr').each((i, el) => {
            const label = $(el).find('td').first().text().trim();
            const content = $(el).find('td').last().text().trim();

            if (label.includes('意義')) data.meaning = content;
            else if (label.includes('聖經') || label.includes('經文')) data.history = content;
            else if (label.includes('內容') || label.includes('說明')) data.narrative = content;
        });

        // 獲取 SMap ID
        const smapLink = $('a[href*="smap.php?id="]').attr('href');
        if (smapLink) {
            const match = smapLink.match(/id=(\d+)/);
            if (match) data.smap_id = match[1];
        }

        // 入庫 bible_locations
        await client.query(
            `INSERT INTO bible_locations (lmap_id, name_zh, name_en, meaning, history, narrative)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (lmap_id) DO UPDATE SET
             name_zh = EXCLUDED.name_zh, name_en = EXCLUDED.name_en, 
             meaning = EXCLUDED.meaning, history = EXCLUDED.history, narrative = EXCLUDED.narrative`,
            [data.id, data.name_zh, data.name_en, data.meaning, data.history, data.narrative]
        );

        // 關聯 GID
        await client.query(
            `INSERT INTO location_groups (lmap_id, gid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [data.id, gid]
        );

        // 如果有 SMap ID，同步座標
        if (data.smap_id) {
            await syncCoordinates(client, data.id, data.smap_id);
        }

    } catch (e) {
        console.error(`❌ [Location ${lmapId}] 同步失敗:`, e.message);
    }
}

async function syncCoordinates(client, lmapId, smapId) {
    try {
        const url = `${BASE_SMAP_URL}?id=${smapId}`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const html = iconv.decode(response.data, 'utf-8');
        const $ = cheerio.load(html);

        // 採樣座標
        const bodyText = $('body').text();
        const coordMatch = bodyText.match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            await client.query(
                `UPDATE bible_locations SET latitude = $1, longitude = $2 WHERE lmap_id = $3`,
                [lat, lng, lmapId]
            );
            console.log(`📍 [GPS] ${lmapId} 座標歸位: ${lat}, ${lng}`);
        }
    } catch (e) {
        // 座標抓取可容忍失敗
    }
}

sync984().catch(console.error);
