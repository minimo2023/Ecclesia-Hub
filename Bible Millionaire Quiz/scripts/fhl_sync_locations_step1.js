import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

/**
 * [Phase 11.2] 第一階段：地理主權入庫 (Step 1: Search-Based Merger)
 * 主旨：逐點遍歷 LMAP 0001-1204，透過動態搜索對位辭典敘事，全量保留豐富內文。
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_LMAP_DETAIL = 'https://bible.fhl.net/LMAP/show.html';
const BASE_DIC_SEARCH = 'https://bible.fhl.net/Mar/dic_show.php';
const BASE_DIC_DETAIL = 'https://bible.fhl.net/Mar/dic_detail.php';
const BASE_SMAP_URL = 'https://bible.fhl.net/new/smap.php';

const COMMON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function step1SearchBasedSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Step 1 Search Commander] 啟動第一階段：精確搜索入庫任務...');

    try {
        for (let i = 1; i <= 1204; i++) {
            const lmapId = i.toString().padStart(4, '0');
            
            // 抓取 LMAP 原生百科 (使用 LMAP Referer)
            const lmapData = await fetchLMapDetail(lmapId);
            if (!lmapData || !lmapData.name_zh) continue;

            console.log(`📡 [Step 1 Mission] 正在處理: ${lmapData.name_zh} (${lmapId})...`);

            // 執行「動態地名搜索」以獲取辭典敘事
            let dicNarrative = await searchAndFetchLexicon(lmapData.name_zh);

            // 物理 Upsert 入庫
            await client.query(
                `INSERT INTO bible_locations (
                    lmap_id, name_zh, name_en, meaning, history, narrative, is_distilled
                ) VALUES ($1, $2, $3, $4, $5, $6, FALSE)
                ON CONFLICT (lmap_id) DO UPDATE SET
                    meaning = EXCLUDED.meaning,
                    history = EXCLUDED.history,
                    narrative = EXCLUDED.narrative || '\n\n【辭典原生敘事遺產】\n' || $7`,
                [
                    lmapId, lmapData.name_zh, lmapData.name_en, 
                    lmapData.meaning, lmapData.history, lmapData.narrative, 
                    dicNarrative
                ]
            );

            // 座標歸位
            if (lmapData.smap_id) await syncCoordinates(client, lmapId, lmapData.smap_id);

            // 每請求一次延遲 800ms
            await new Promise(r => setTimeout(r, 800));
        }
    } finally {
        await client.end();
        console.log('🏁 [Step 1 Search Commander] 第一階段任務結案。');
    }
}

async function fetchLMapDetail(id) {
    try {
        const url = `${BASE_LMAP_DETAIL}?${id}`;
        const res = await axios.get(url, { 
            responseType: 'arraybuffer', 
            headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://bible.fhl.net/LMAP/index.php' } 
        });
        const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
        const t = $('h1, h2, b').first().text().trim();
        const p = t.split(/\s+/);
        const data = {
            name_zh: p[0] || '', name_en: p[1] || '',
            meaning: '', history: '', narrative: '', smap_id: null
        };
        $('table tr').each((i, el) => {
            const label = $(el).find('td').first().text().trim();
            const content = $(el).find('td').last().text().trim();
            if (label.includes('意義')) data.meaning = content;
            else if (label.includes('聖經')) data.history = content;
            else if (label.includes('內容') || label.includes('說明')) data.narrative = content;
        });
        const smapLink = $('a[href*="smap.php?id="]').attr('href');
        if (smapLink) {
            const m = smapLink.match(/id=(\d+)/);
            if (m) data.smap_id = m[1];
        }
        return data;
    } catch (e) { return null; }
}

async function searchAndFetchLexicon(name) {
    try {
        // 先搜索獲取精確 Key
        const searchUrl = `${BASE_DIC_SEARCH}?key=${encodeURIComponent(name)}&sel=6`;
        const resSearch = await axios.get(searchUrl, { 
            responseType: 'arraybuffer', 
            headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://bible.fhl.net/Mar/dic_show.php' } 
        });
        const $ = cheerio.load(iconv.decode(resSearch.data, 'utf-8'));
        
        // 抓取詳解連結中的 key=6.X
        const detailLink = $('a[href*="sel=0&key=6."]').first().attr('href');
        if (detailLink) {
            const m = detailLink.match(/key=([\d\.]+)/);
            if (m) {
                const resDetail = await axios.get(`${BASE_DIC_DETAIL}?sel=0&key=${m[1]}`, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://bible.fhl.net/Mar/dic_show.php' }
                });
                return cheerio.load(iconv.decode(resDetail.data, 'utf-8'))('body').text().trim();
            }
        }
        return '';
    } catch (e) { return ''; }
}

async function syncCoordinates(client, lmapId, smapId) {
    try {
        const res = await axios.get(`${BASE_SMAP_URL}?id=${smapId}`, { responseType: 'arraybuffer', headers: { 'User-Agent': COMMON_UA } });
        const m = $('body').text().match(/\[(\d+\.\d+),\s*(\d+\.\d+)\]/);
        if (m) await client.query(`UPDATE bible_locations SET latitude = $1, longitude = $2 WHERE lmap_id = $3`, [parseFloat(m[1]), parseFloat(m[2]), lmapId]);
    } catch (e) {}
}

step1SearchBasedSync().catch(console.error);
