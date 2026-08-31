import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import FormData from 'form-data';
import iconv from 'iconv-lite';

/**
 * [Phase 12.3] 地理主權最後補完：從 list.php 提取 100% 真相
 * 主旨：(1) 獲取 list.php 所有 ID (2) 補足先前遺漏的 Sub-IDs (如 0012-1)
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_LIST = 'https://bible.fhl.net/LMAP/list.php';
const BASE_LMAP_API = 'https://bible.fhl.net/LMAP/search.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';

async function finalPatchSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [ID List Recon] 啟動地理清單 100% 真相採集...');

    try {
        // 1. 抓取清單頁面
        const resList = await axios.get(BASE_LMAP_LIST, { responseType: 'arraybuffer' });
        const $list = cheerio.load(iconv.decode(resList.data, 'utf-8'));
        const allIds = [];
        $list('a[href*="show.html?"]').each((i, el) => {
            const href = $list(el).attr('href');
            const id = href.split('?')[1];
            if (id) allIds.push(id.trim());
        });

        console.log(`📡 [List Secured] 發現全量 ID 共 ${allIds.length} 個。正在尋找主權缺口...`);

        // 2. 獲取已在庫 ID
        const currentIdsRes = await client.query('SELECT substring(id from 5) as code FROM locations');
        const currentCodes = new Set(currentIdsRes.rows.map(r => r.code));

        const missingIds = allIds.filter(id => !currentCodes.has(id));
        console.log(`🔎 [Gap Found] 檢測到 ${missingIds.length} 個尚未入庫的地點 (包含次級編號)。開始補完...`);

        // 3. 補完同步 (與 Step 1 邏輯一致，但僅處理遺珠)
        for (const lmapId of missingIds) {
            const fd = new FormData();
            fd.append('lid', lmapId);
            
            try {
                const res = await axios.post(BASE_LMAP_API, fd, { 
                    headers: fd.getHeaders(), timeout: 5000 
                });
                const dataArr = res.data;
                if (!dataArr || dataArr.length === 0 || !dataArr[0].cname) continue;

                const locData = dataArr[0];
                const nameZh = (locData.cname || '').trim();
                const narrative = (locData.dec || '').trim();
                const versesRaw = (locData.dec1 || '').trim();
                const mapsRaw = (locData.dec2 || '').trim();
                const pointId = locData.id;

                console.log(`⚡ [Patch Secured] 補完成功: ${nameZh} (${lmapId})`);

                // 獲取座標 (SMap)
                let lat = null, lon = null;
                if (pointId && String(pointId).trim() !== "" && parseInt(pointId) >= 0) {
                    try {
                        const smapRes = await axios.get(`${BASE_SMAP_URL}?id=${pointId}`, { responseType: 'arraybuffer', timeout: 3000 });
                        const $ = cheerio.load(iconv.decode(smapRes.data, 'utf-8'));
                        const bt = $('body').text();
                        const m = bt.match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
                        if (m) { lat = parseFloat(m[1]); lon = parseFloat(m[2]); }
                    } catch(e) {}
                }

                const metadata = { lmap_id: lmapId, raw_maps_dec2: mapsRaw, raw_smap_id: pointId };

                await client.query(
                    `INSERT INTO locations (id, name_zh, name_en, meaning, description, lat, lon, verse_refs, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (id) DO NOTHING`,
                    [`LOC_${lmapId}`, nameZh, (locData.ename||''), (locData.cexp||''), narrative, lat, lon, versesRaw, JSON.stringify(metadata)]
                );
            } catch(e) {
                console.error(`⚠️ [Patch Error] ${lmapId}: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 150));
        }
    } finally {
        await client.end();
        console.log('🏁 [ID List Recon] 地理主權補完結案！');
    }
}

finalPatchSync().catch(console.error);
