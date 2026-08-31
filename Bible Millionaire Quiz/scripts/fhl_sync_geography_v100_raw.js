import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 10.0] 聖經地理大一統原生指揮官 (The Raw Sovereign Merger)
 * 主旨：物理合併辭典 (6.x) 與地圖 (LMAP) 內容，100% 保留原生敘事。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';

async function grandUnificationSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Raw Commander 10.0] 啟動聖經地理大一統重啟任務...');

    try {
        // 直接遍歷 1204 個物理定點
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            console.log(`📡 [Mission] 正在採集地點主權: ID ${lmapId}...`);

            // 1. 採集 LMAP 百科敘述
            const lmapData = await fetchLMapDetail(lmapId);
            if (!lmapData) continue;

            // 2. 嘗試對位辭典編號 (sel=6.X)
            // 邏輯：暫時採用 6.X 與 ID 直接對位，或後續透過名稱模糊匹配
            const dicId = `6.${i}`; 
            const dicData = await fetchLexiconDetail(dicId);

            // 3. 物理合併入庫
            await client.query(
                `INSERT INTO bible_locations (
                    lmap_id, name_zh, name_en, meaning, history, narrative, distilled_json
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (lmap_id) DO UPDATE SET
                    name_zh = EXCLUDED.name_zh,
                    name_en = EXCLUDED.name_en,
                    meaning = EXCLUDED.meaning,
                    history = EXCLUDED.history,
                    narrative = EXCLUDED.narrative || '\n\n【辭典遺產】\n' || COALESCE(EXCLUDED.distilled_json, '')`,
                [
                    lmapId, 
                    lmapData.name_zh, 
                    lmapData.name_en, 
                    lmapData.meaning, 
                    lmapData.history, 
                    lmapData.narrative, 
                    dicData // 暫時存入 dicData 以供後續處理或合併
                ]
            );

            // 4. 座標歸位
            if (lmapData.smap_id) {
                await syncCoordinates(client, lmapId, lmapData.smap_id);
            }

            // 5. 建立地圖組關聯
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
        console.log('🏁 [Raw Commander 10.0] 大一統任務結案。');
    }
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
            meaning: '',
            history: '',
            narrative: '',
            smap_id: null,
            gids: []
        };

        $('table tr').each((i, el) => {
            const label = $(el).find('td').first().text().trim();
            const content = $(el).find('td').last().text().trim();

            if (label.includes('意義')) data.meaning = content;
            else if (label.includes('聖經')) data.history = content;
            else if (label.includes('內容') || label.includes('說明')) data.narrative = content;
            else if (label.includes('地圖')) {
                // 抓取地圖編號 GID
                const gidMatches = content.match(/\d+/g);
                if (gidMatches) data.gids = gidMatches;
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
        // 抓取辭典全文作敘事遺產
        return $('body').text().trim();
    } catch (e) { return ''; }
}

async function syncCoordinates(client, lmapId, smapId) {
    try {
        const url = `${BASE_SMAP_URL}?id=${smapId}`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const bodyText = $('body').text();
        const m = bodyText.match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
        if (m) {
            await client.query(
                `UPDATE bible_locations SET latitude = $1, longitude = $2 WHERE lmap_id = $3`,
                [parseFloat(m[1]), parseFloat(m[2]), lmapId]
            );
        }
    } catch (e) {}
}

grandUnificationSync().catch(console.error);
