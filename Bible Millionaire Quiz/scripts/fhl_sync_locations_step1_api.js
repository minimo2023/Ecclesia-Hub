import axios from 'axios';
import FormData from 'form-data';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 12.0] 第一階段：地理主權光速入庫 (JSON API + Locations Table)
 * 主旨：直接存取 LMAP/search.php 隱藏 API，秒速獲取包含萬字敘事的精確地理資訊。
 * 嚴格遵守：(1) 僅寫入 locations 表
 *           (2) 儲存 dec1(經文) / dec2(地圖) 於自身以供第二步取用
 *           (3) 絕對不觸碰 lexicons
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_API = 'https://bible.fhl.net/LMAP/search.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';

async function step1ApiSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [JSON API Commander] 啟動地點主權光速入庫...');

    try {
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            
            // 1. 發送 POST API 請求
            const fd = new FormData();
            fd.append('lid', lmapId);
            
            let dataArr;
            try {
                const res = await axios.post(BASE_LMAP_API, fd, { 
                    headers: fd.getHeaders(),
                    timeout: 5000 
                });
                dataArr = res.data;
            } catch(e) {
                console.error(`⚠️ [API Error] LMAP ${lmapId} 請求跳出: ${e.message}`);
                continue;
            }

            if (!dataArr || dataArr.length === 0 || !dataArr[0].cname) {
                continue; // 空白或無效點
            }

            const locData = dataArr[0];
            const nameZh = (locData.cname || '').trim();
            const nameEn = (locData.ename || '').trim();
            const meaning = (locData.cexp || '').trim();
            const narrative = (locData.dec || '').trim(); // 大量敘事！
            const versesRaw = (locData.dec1 || '').trim();
            const mapsRaw = (locData.dec2 || '').trim();
            const pointId = locData.id;

            console.log(`⚡ [Location Secured] 採集主權: ${nameZh} (${lmapId}) [附帶巨觀敘事長度: ${narrative.length}]`);

            // 2. 獲取空間 GPS 座標 (若存在 SMap ID)
            let lat = null, lon = null;
            if (pointId && String(pointId).trim() !== "" && parseInt(pointId) >= 0) {
                try {
                    const smapRes = await axios.get(`${BASE_SMAP_URL}?id=${pointId}`, { 
                        responseType: 'arraybuffer', timeout: 3000 
                    });
                    const $ = cheerio.load(iconv.decode(smapRes.data, 'utf-8'));
                    const bt = $('body').text();
                    const m = bt.match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
                    if (m) {
                        lat = parseFloat(m[1]);
                        lon = parseFloat(m[2]);
                    }
                } catch(e) {}
            }

            // 3. 封裝過渡期數據供 Step 2 使用
            const metadata = {
                lmap_id: lmapId,
                raw_maps_dec2: mapsRaw,
                raw_smap_id: pointId
            };

            // 4. 嚴格寫入隔離表 (locations)，以 UPSERT 保護資料
            // 採用您架構中的專屬對齊欄位
            await client.query(
                `INSERT INTO locations (
                    id, name_zh, name_en, meaning, description, 
                    lat, lon, verse_refs, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    name_zh = EXCLUDED.name_zh,
                    name_en = EXCLUDED.name_en,
                    meaning = EXCLUDED.meaning,
                    description = EXCLUDED.description,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    verse_refs = EXCLUDED.verse_refs,
                    metadata = locations.metadata || EXCLUDED.metadata`,
                [
                    `LOC_${lmapId}`,  // 建立唯一 ID
                    nameZh, 
                    nameEn, 
                    meaning, 
                    narrative,        // 大量敘事寫入 description
                    lat, 
                    lon, 
                    versesRaw,        // 經文出處，留給第二部拆解
                    JSON.stringify(metadata)
                ]
            );

            // 每筆間隔 100 毫秒即可，因為是 JSON API 且極穩定
            await new Promise(r => setTimeout(r, 100));
        }
    } finally {
        await client.end();
        console.log('🏁 [JSON API Commander] 地點主權全量入庫完成！');
    }
}

step1ApiSync().catch(console.error);
