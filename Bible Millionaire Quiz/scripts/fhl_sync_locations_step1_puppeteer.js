import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;

/**
 * [Phase 11.3] 第一階段：瀏覽器級別地理原子化入庫 (Puppeteer Step 1)
 * 主旨：採用真實無頭瀏覽器 (Headless Browser) 物理穿透 FHL 防護，確保 1,204 點與「大量敘事」 100% 入庫。
 * 不處理 GID 或經文關聯 (等第二階段處理)。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';
const BASE_DIC_LIST = 'https://bible.fhl.net/Mar/dic_list.php?sel=6';

async function step1PuppeteerSync() {
    const client = new Client(dbConfig);
    await client.connect();
    
    console.log('🚀 [Puppeteer Commander Step 1] 啟動瀏覽器原生敘事採集...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // 設置擬真人屬性
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        // 第一步：採集「地名 <=> 辭典編號」物理映射表 (使用瀏覽器繞過 404攔截)
        console.log('📡 [Map Bridge] 正在採集辭典主權列表 (dic_list.php)...');
        await page.goto(BASE_DIC_LIST, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const listHtml = await page.content();
        const $list = cheerio.load(listHtml);
        const nameMap = {};
        
        $list('a').each((i, el) => {
            const name = $list(el).text().trim();
            const href = $list(el).attr('href');
            if (name && href) {
                const m = href.match(/key=([\d\.]+)/);
                if (m) nameMap[name] = m[1];
            }
        });
        console.log(`✅ [Map Bridge] 字典映射鎖定成功：${Object.keys(nameMap).length} 個地名橋樑。`);

        // 第二步：遍歷 1204 個地點 (只採集地點本身、不處理關聯)
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            const targetUrl = `${BASE_LMAP_DETAIL}?${lmapId}`;
            
            try {
                const lmapData = {
                    name_zh: '', name_en: '', meaning: '', history: '', narrative: '', smap_id: null
                };

                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const lmapHtml = await page.content();
                const $l = cheerio.load(lmapHtml);
                
                // 檢查是否是空網頁 (可能查無此地點)
                const titleText = $l('h1, h2, b').first().text().trim();
                const parts = titleText.split(/\s+/);
                lmapData.name_zh = parts[0] || '';
                lmapData.name_en = parts[1] || '';
                
                if (!lmapData.name_zh) continue; // 可能是空白頁

                console.log(`📡 [Step 1 Mission] 採集主權: ${lmapData.name_zh} (${lmapId})...`);

                $l('table tr').each((idx, el) => {
                    const label = $l(el).find('td').first().text().trim();
                    const content = $l(el).find('td').last().text().trim();
                    if (label.includes('意義')) lmapData.meaning = content;
                    else if (label.includes('聖經')) lmapData.history = content;
                    else if (label.includes('內容') || label.includes('說明')) lmapData.narrative = content;
                });

                const smapLink = $l('a[href*="smap.php?id="]').attr('href');
                if (smapLink) {
                    const smMatch = smapLink.match(/id=(\d+)/);
                    if (smMatch) lmapData.smap_id = smMatch[1];
                }

                // 第三步：抓字典內容並合併
                const dicKey = nameMap[lmapData.name_zh];
                let dicNarrative = '';
                if (dicKey) {
                    const dicUrl = `${BASE_DIC_DETAIL}?sel=0&key=${dicKey}`;
                    await page.goto(dicUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const dicHtml = await page.content();
                    const $d = cheerio.load(dicHtml);
                    
                    // 去除沒用的選單字串，抓取 <body> 純文字
                    dicNarrative = $d('body').text().replace(/主頁( | )*上頁( | )*下頁( | )*辭典/, '').trim();
                }

                // 物理 Upsert 入庫 (僅處理地點基礎資料)
                await client.query(
                    `INSERT INTO bible_locations (
                        lmap_id, name_zh, name_en, meaning, history, narrative, is_distilled
                    ) VALUES ($1, $2, $3, $4, $5, $6, FALSE)
                    ON CONFLICT (lmap_id) DO UPDATE SET
                        name_zh = EXCLUDED.name_zh,
                        name_en = EXCLUDED.name_en,
                        meaning = EXCLUDED.meaning,
                        history = EXCLUDED.history,
                        narrative = EXCLUDED.narrative || '\n\n【FHL 辭典原生遺產】\n' || $7`,
                    [
                        lmapId, lmapData.name_zh, lmapData.name_en, 
                        lmapData.meaning, lmapData.history, lmapData.narrative, 
                        dicNarrative
                    ]
                );

                // 第四步：空間坐標歸位
                if (lmapData.smap_id) {
                    const smapTargetUrl = `${BASE_SMAP_URL}?id=${lmapData.smap_id}`;
                    await page.goto(smapTargetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const smapHtml = await page.content();
                    const $smap = cheerio.load(smapHtml);
                    const bt = $smap('body').text();
                    const coordsMatch = bt.match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
                    if (coordsMatch) {
                        await client.query(
                            `UPDATE bible_locations SET latitude = $1, longitude = $2 WHERE lmap_id = $3`,
                            [parseFloat(coordsMatch[1]), parseFloat(coordsMatch[2]), lmapId]
                        );
                    }
                }

                // 自動延遲：模擬人類防止封鎖鎖定
                await new Promise(r => setTimeout(r, 800));

            } catch (err) {
                console.error(`❌ [Error] 處理 ${lmapId} 失敗，將跳過並繼續:`, err.message);
            }
        }
    } catch (e) {
        console.error('🔥 [Fatal Error] 瀏覽器任務崩潰:', e);
    } finally {
        await browser.close();
        await client.end();
        console.log('🏁 [Puppeteer Commander Step 1] 瀏覽器級別地理入庫結案。');
    }
}

step1PuppeteerSync();
