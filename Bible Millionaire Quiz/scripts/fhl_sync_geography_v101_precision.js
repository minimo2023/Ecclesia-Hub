import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 10.1.1] 聖經地理大一統精確指揮官 (Precision Raw Merger)
 * 主旨：採用「名稱對位」而非 ID 對位。物理覆蓋 (Upsert) 現有資料，不執行任何清空。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';
const BASE_DIC_LIST = 'https://bible.fhl.net/Mar/dic_list.php?sel=6';

async function precisionUnificationSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Precision Commander 101] 啟動精確大一統同步 (非破壞性模式)...');

    try {
        // 第一階段：建立「地名 <=> 辭典 ID」主權映射表
        console.log('📡 [Map Bridge] 正在建立名稱映射資料庫...');
        const nameMap = await buildNameMapping();
        console.log(`✅ [Map Bridge] 已物化鎖定 ${Object.keys(nameMap).length} 個主權橋樑。`);

        // 第二階段：直接遍歷 1204 個物理定點 (LMAP 主導)
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            
            // 抓取 LMAP 原生百科
            const lmapData = await fetchLMapDetail(lmapId);
            if (!lmapData || !lmapData.name_zh) continue;

            console.log(`📡 [Mission] 正在精確對位: ${lmapData.name_zh} (ID ${lmapId})...`);

            // 根據地名尋找辭典編號
            const dicKey = nameMap[lmapData.name_zh];
            let dicNarrative = '';
            if (dicKey) {
                console.log(`🔗 [Bridge] 發現對位辭典編號: ${dicKey}. 正在抓取敘事...`);
                dicNarrative = await fetchLexiconDetail(dicKey);
            }

            // 物理覆蓋入庫 (UPSERT)
            await client.query(
                `INSERT INTO bible_locations (
                    lmap_id, name_zh, name_en, meaning, history, narrative, is_distilled
                ) VALUES ($1, $2, $3, $4, $5, $6, FALSE)
                ON CONFLICT (lmap_id) DO UPDATE SET
                    name_zh = EXCLUDED.name_zh,
                    name_en = EXCLUDED.name_en,
                    meaning = EXCLUDED.meaning,
                    history = EXCLUDED.history,
                    narrative = EXCLUDED.narrative || '\n\n【辭典原生敘事遺產】\n' || $7`,
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

            // 座標歸位
            if (lmapData.smap_id) {
                await syncCoordinates(client, lmapId, lmapData.smap_id);
            }

            // 地圖組反向歸位
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
        console.log('🏁 [Precision Commander 101] 精確大一統任務結案。');
    }
}

async function buildNameMapping() {
    const res = await axios.get(BASE_DIC_LIST, { responseType: 'arraybuffer' });
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
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
        const html = iconv.decode(res.data, 'utf-8');
        const $ = cheerio.load(html);
        const titleText = $('h1, h2, b').first().text().trim();
        const parts = titleText.split(/\s+/);
        const data = {
            name_zh: parts[0] || '',
            name_en: parts[1] || '',
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
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        return $('body').text().trim();
    } catch (e) { return ''; }
}

async function syncCoordinates(client, lmapId, smapId) {
    try {
        const url = `${BASE_SMAP_URL}?id=${smapId}`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
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

precisionUnificationSync().catch(console.error);
