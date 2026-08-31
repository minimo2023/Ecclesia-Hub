import pg from 'pg';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'dev',
  password: process.env.DB_PASSWORD || 'dev123',
  database: process.env.DB_NAME || 'bible_quiz_v3'
});

const big5Decoder = new TextDecoder('big5');

// HTML 降噪模組 (Markdown 橋接器)
function denoiseHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '')
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[回上一頁\]/g, '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s\s+/g, ' ')
    .trim();
}

/**
 * 抓取並解碼 (Big5)
 */
async function fetchBig5(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return big5Decoder.decode(buffer);
}

async function syncGeographyV3_1() {
  const client = await pool.connect();
  try {
    console.log('🌍 啟動地理指揮官 v3.1 (Absolute Inventory Mode)...');

    // 1. 抓取地點總清單 (list.php)
    console.log('📖 正在解析全量地點索引 (list.php)...');
    const indexHtml = await fetchBig5('https://bible.fhl.net/LMAP/list.php');
    const allIds = [...indexHtml.matchAll(/show\.html\?([0-9a-zA-Z-]+)/g)].map(m => m[1]);
    
    // 移除重複 ID
    const uniqueIds = [...new Set(allIds)];
    console.log(`✅ 發現 ${uniqueIds.length} 個物理地點 ID`);

    // 2. 逐一採集 (深挖五維數據)
    for (const fullId of uniqueIds) {
      process.stdout.write(`  [ID ${fullId}] 採集中... `);
      
      try {
        const lmapUrl = `https://bible.fhl.net/LMAP/show.html?${fullId}`;
        const lmapHtml = await fetchBig5(lmapUrl);

        // 數據解析
        const zhMatch = lmapHtml.match(/中文地名[^\w\n]*([^<]+)/i);
        const enMatch = lmapHtml.match(/英文地名[^\w\n]*([^<]+)/i);
        const nameZh = zhMatch ? zhMatch[1].trim() : '';
        const nameEn = enMatch ? enMatch[1].trim() : '';

        // 地名含義 (Meaning)
        const meaningMatch = lmapHtml.match(/地名含義[^\w\n]*([^<]+)/i);
        const meaning = meaningMatch ? meaningMatch[1].trim() : '';

        // 歷史描述 (Description)
        const description = denoiseHtml(lmapHtml);

        // 對位座標 (SMap)
        let lat = null, lon = null;
        const smapIdMatch = lmapHtml.match(/smap\.php\?id=([0-9]+)/i);
        if (smapIdMatch) {
          const smapId = smapIdMatch[1];
          const smapHtml = await fetchBig5(`https://bible.fhl.net/new/smap.php?id=${smapId}`);
          const coordMatch = smapHtml.match(/showmap\.php\?x=([\d\.]+)&y=([\d\.]+)&site=([^">]+)/);
          if (coordMatch) {
            lat = parseFloat(coordMatch[1]);
            lon = parseFloat(coordMatch[2]);
          }
        }

        // 3. 持久化 (Locations)
        const locId = `FHL_LMAP_${fullId}`;
        await client.query(`
          INSERT INTO locations (id, code, name_zh, name_en, lat, lon, meaning, description, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FHL_LMAP_V3_1')
          ON CONFLICT (id) DO UPDATE SET
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            meaning = EXCLUDED.meaning,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        `, [locId, fullId, nameZh, nameEn, lat, lon, meaning, description]);

        // 4. 反向映射經文 (Inverse Mapping)
        const verseMatches = [...lmapHtml.matchAll(/search\.php\?keyword=%23([^">]+)/g)];
        let mapCount = 0;
        for (let vm of verseMatches) {
          const verseKey = decodeURIComponent(vm[1]).replace(/\+/g, ' '); 
          const vParts = verseKey.match(/^([0-9\s]*[A-Za-z\u4e00-\u9fa5]+)\s*(\d+):(\d+)/);
          if (vParts) {
            const [_, bookKey, chapter, verse] = vParts;
            await client.query(`
              INSERT INTO verse_locations (book, chapter, verse, location_id, source)
              VALUES ($1, $2, $3, $4, 'FHL_LINK_V3_1')
              ON CONFLICT DO NOTHING
            `, [bookKey.trim(), parseInt(chapter), parseInt(verse), locId]);
            mapCount++;
          }
        }

        process.stdout.write(`✅ 已入庫 (座標: ${lat||'無'}, 經文清單: ${mapCount})\n`);

        // 禮貌性延遲
        await new Promise(r => setTimeout(r, 100));

      } catch (err) {
        console.error(`\n❌ ID ${fullId} 失敗:`, err.message);
      }
    }

    console.log('\n✨ 地理主權同步任務 (Absolute Mode) 圓滿達成！');
    process.exit(0);
  } catch (err) {
    console.error('❌ 指揮官崩潰:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

syncGeographyV3_1();
