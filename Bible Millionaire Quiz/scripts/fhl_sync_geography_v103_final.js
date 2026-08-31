import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 10.3] 聖經地理大一統補綴指揮官 (Environment-Aware Sync)
 * 主旨：物理感應 Referer 環境，完成 GID 001~120 的原生敘事合併。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';
const BASE_DIC_LIST = 'https://bible.fhl.net/Mar/dic_list.php?sel=6';

const COMMON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function finalSovereignSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Final Commander 10.3] 啟動環境感知大一統同步...');

    try {
        // 第一階段：採集映射 (使用 Mar Referer)
        console.log('📡 [Map Bridge] 正在採集地名辭典 ID...');
        const nameMap = await buildNameMapping();
        console.log(`✅ [Map Bridge] 鎖定成功：${Object.keys(nameMap).length} 個主權橋樑。`);

        // 第二階段：GID 系列同步 (001-120)
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            
            // 抓取 LMAP (使用 LMAP Referer)
            const lmapData = await fetchLMapDetail(lmapId);
            if (!lmapData || !lmapData.name_zh) continue;

            // 物理限定：僅同步 GID 001-120 範圍
            const isInRange = lmapData.gids.some(g => {
                const num = parseInt(g);
                return num >= 1 && num <= 120;
            });
            if (!isInRange) continue;

            console.log(`📡 [Sovereign Mission] 正在歸併採集: ${lmapData.name_zh} (${lmapId})...`);

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
                    narrative = EXCLUDED.narrative || '\n\n【辭典詳細敘事】\n' || $7`,
                [lmapId, lmapData.name_zh, lmapData.name_en, lmapData.meaning, lmapData.history, lmapData.narrative, dicNarrative]
            );

            // 座標歸位
            if (lmapData.smap_id) await syncCoordinates(client, lmapId, lmapData.smap_id);
            
            // 地圖組歸位
            for (const g of lmapData.gids) {
                await client.query(`INSERT INTO location_groups (lmap_id, gid) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [lmapId, g.padStart(3, '0')]);
            }

            await new Promise(r => setTimeout(r, 600)); // 物理避障延遲
        }
    } finally {
        await client.end();
        console.log('🏁 [Final Commander 10.3] 任務大捷。');
    }
}

async function buildNameMapping() {
    const res = await axios.get(BASE_DIC_LIST, { 
        responseType: 'arraybuffer', 
        headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://bible.fhl.net/Mar/dic_list.php' } 
    });
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
        const res = await axios.get(`${BASE_LMAP_DETAIL}?${id}`, { 
            responseType: 'arraybuffer', 
            timeout: 8000, 
            headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://bible.fhl.net/LMAP/index.php' } 
        });
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
        const res = await axios.get(`${BASE_DIC_DETAIL}?sel=0&key=${key}`, { 
            responseType: 'arraybuffer', 
            timeout: 8000, 
            headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://bible.fhl.net/Mar/dic_detail.php' } 
        });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        return $('body').text().trim();
    } catch (e) { return ''; }
}

async function syncCoordinates(client, lmapId, smapId) {
    try {
        const res = await axios.get(`${BASE_SMAP_URL}?id=${smapId}`, { responseType: 'arraybuffer' });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const m = $('body').text().match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
        if (m) await client.query(`UPDATE bible_locations SET latitude = $1, longitude = $2 WHERE lmap_id = $3`, [parseFloat(m[1]), parseFloat(m[2]), lmapId]);
    } catch (e) {}
}

finalSovereignSync().catch(console.error);
