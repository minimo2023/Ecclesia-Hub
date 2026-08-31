import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 10.1.2] 地理主權大一統精確指揮官 (Referer-Injected Version)
 * 主旨：物理穿透 FHL 防盜鏈，執行地名對位之大一統原生敘事合併。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';
const BASE_DIC_LIST = 'https://bible.fhl.net/Mar/dic_list.php?sel=6';

// 物理標頭 (關鍵鑰匙)
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://bible.fhl.net/LMAP/index.php'
};

async function injectedPrecisionSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Injected Commander 10.1.2] 啟動物理穿透同步 (地理主權大一統)...');

    try {
        // 第一階段：建立「地名 <=> 辭典 ID」映射
        console.log('📡 [Map Bridge] 正在採集地名對位映射表...');
        const nameMap = await buildNameMapping();
        console.log(`✅ [Map Bridge] 映射對位完成：共鎖定 ${Object.keys(nameMap).length} 個主權橋樑。`);

        // 第二階段：遍歷 1204 個物理定點
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            
            // 抓取 LMAP 主權原百科
            const lmapData = await fetchLMapDetail(lmapId);
            if (!lmapData || !lmapData.name_zh) continue;

            console.log(`📡 [Mission] 正在精確對位採集: ${lmapData.name_zh} (${lmapId})...`);

            // 地名對位
            const dicKey = nameMap[lmapData.name_zh];
            let dicNarrative = '';
            if (dicKey) {
                dicNarrative = await fetchLexiconDetail(dicKey);
            }

            // 物理覆寫 (UPSERT)
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
                    lmapId, 
                    lmapData.name_zh, 
                    lmapData.name_en, 
                    lmapData.meaning, 
                    lmapData.history, 
                    lmapData.narrative,
                    dicNarrative
                ]
            );

            // 座標與地圖組歸位 (SMap)
            if (lmapData.smap_id) await syncCoordinates(client, lmapId, lmapData.smap_id);
            if (lmapData.gids) {
                for (const gid of lmapData.gids) {
                    await client.query(
                        `INSERT INTO location_groups (lmap_id, gid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [lmapId, gid.padStart(3, '0')]
                    );
                }
            }
        }
    } finally {
        await client.end();
        console.log('🏁 [Injected Commander 10.1.2] 全量大一統同步結案。');
    }
}

async function buildNameMapping() {
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
}

async function fetchLMapDetail(id) {
    try {
        const url = `${BASE_LMAP_DETAIL}?${id}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000, headers: HEADERS });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const titleText = $('h1, h2, b').first().text().trim();
        const parts = titleText.split(/\s+/);
        const data = {
            name_zh: parts[0] || '', name_en: parts[1] || '',
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

injectedPrecisionSync().catch(console.error);
