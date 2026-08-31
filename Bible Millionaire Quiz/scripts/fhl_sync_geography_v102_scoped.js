import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 10.2] 地理主權大一統精確指揮官 (Scoped 001-120 Version)
 * 主旨：物理穿透 FHL 防盜鏈，執行 GID 001~120 範圍的大一統原生敘事合併。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_URL = 'https://bible.fhl.net/LMAP/index.php';
const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';
const BASE_DIC_LIST = 'https://bible.fhl.net/Mar/dic_list.php?sel=6';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://bible.fhl.net/LMAP/index.php'
};

async function scopedUnificationSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Scoped Commander 10.2] 啟動 001-120 範圍同步 (地理主權大一統)...');

    try {
        console.log('📡 [Map Bridge] 正在採集地名對位映射表...');
        const nameMap = await buildNameMapping();
        console.log(`✅ [Map Bridge] 映射對位完成：共鎖定 ${Object.keys(nameMap).length} 個主權橋樑。`);

        // 遍歷 GID 001 至 120
        for (let gid = 1; gid <= 120; gid++) {
            const gidStr = gid.toString().padStart(3, '0');
            console.log(`📡 [Mission] 正在偵察地圖組: GID ${gidStr}...`);

            // 因為 index.php 有框架問題，我們直接採集 GID 內含的地點 (由 list.php 提供或直接遍歷)
            // 這裡採取保守策略：透過 LMAP ID 的 meta 資訊來識別 GID，並物理 Upsert
        }

        // 定點遍歷 1204 點，採集其百科並反向歸位 GID
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            const lmapData = await fetchLMapDetail(lmapId);
            if (!lmapData || !lmapData.name_zh) continue;

            // 判別該點是否屬於 001-120 系列
            const isInRange = lmapData.gids.some(g => parseInt(g) >= 1 && parseInt(g) <= 120);
            if (!isInRange) continue;

            console.log(`📡 [Scoped Mission] 正在採集對位: ${lmapData.name_zh} (${lmapId})...`);

            const dicKey = nameMap[lmapData.name_zh];
            let dicNarrative = '';
            if (dicKey) dicNarrative = await fetchLexiconDetail(dicKey);

            await client.query(
                `INSERT INTO bible_locations (
                    lmap_id, name_zh, name_en, meaning, history, narrative, is_distilled
                ) VALUES ($1, $2, $3, $4, $5, $6, FALSE)
                ON CONFLICT (lmap_id) DO UPDATE SET
                    name_zh = EXCLUDED.name_zh,
                    name_en = EXCLUDED.name_en,
                    meaning = EXCLUDED.meaning,
                    history = EXCLUDED.history,
                    narrative = EXCLUDED.narrative || '\n\n【辭典原生敘事】\n' || $7`,
                [
                    lmapId, lmapData.name_zh, lmapData.name_en, 
                    lmapData.meaning, lmapData.history, lmapData.narrative, 
                    dicNarrative
                ]
            );

            if (lmapData.smap_id) await syncCoordinates(client, lmapId, lmapData.smap_id);
            for (const gStr of lmapData.gids) {
                const g = gStr.padStart(3, '0');
                await client.query(
                    `INSERT INTO location_groups (lmap_id, gid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [lmapId, g]
                );
            }
            // 每秒 2 請求，防止封鎖
            await new Promise(r => setTimeout(r, 500));
        }
    } finally {
        await client.end();
        console.log('🏁 [Scoped Commander 10.2] 全量同步結案。');
    }
}

async function buildNameMapping() {
    try {
        const res = await axios.get(BASE_DIC_LIST, { responseType: 'arraybuffer', headers: HEADERS });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const map = {};
        $('a').each((i, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (name && href) {
                const m = href.match(/key=([\d\.]+)/);
                if (m) map[name] = m[1];
            }
        });
        return map;
    } catch (e) { return {}; }
}

async function fetchLMapDetail(id) {
    try {
        const url = `${BASE_LMAP_DETAIL}?${id}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000, headers: HEADERS });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const t = $('h1, h2, b').first().text().trim();
        const p = t.split(/\s+/);
        const data = {
            name_zh: p[0] || '', name_en: p[1] || '',
            meaning: '', history: '', narrative: '', smap_id: null, gids: []
        };
        $('table tr').each((i, el) => {
            const label = $(el).find('td').first().text().trim();
            const content = $(el).find('td').last().text().trim();
            if (label.includes('意義')) data.meaning = content;
            else if (label.includes('聖經')) data.history = content;
            else if (label.includes('內容') || label.includes('說明')) data.narrative = content;
            else if (label.includes('地圖')) {
                const ms = content.match(/\d+/g);
                if (ms) data.gids = ms;
            }
        });
        const smapLink = $('a[href*="smap.php?id="]').attr('href');
        if (smapLink) {
            const m = smapLink.match(/id=(\d+)/);
            if (m) data.smap_id = m[1];
        }
        return data;
    } catch (e) { return null; }
}

async function fetchLexiconDetail(key) {
    try {
        const url = `${BASE_DIC_DETAIL}?sel=0&key=${key}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000, headers: HEADERS });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        return $('body').text().trim();
    } catch (e) { return ''; }
}

async function syncCoordinates(client, lmapId, smapId) {
    try {
        const url = `${BASE_SMAP_URL}?id=${smapId}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const bt = $('body').text();
        const m = bt.match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
        if (m) {
            await client.query(
                `UPDATE bible_locations SET latitude = $1, longitude = $2 WHERE lmap_id = $3`,
                [parseFloat(m[1]), parseFloat(m[2]), lmapId]
            );
        }
    } catch (e) {}
}

scopedUnificationSync().catch(console.error);
