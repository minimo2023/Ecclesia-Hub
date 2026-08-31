import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import pkg from 'pg';
const { Client } = pkg;

/**
 * [Phase 12.5] 第二階段：地理神經網路縫合 (修正版：Big5 + Body Text)
 * 主旨：(1) 使用 Big5 解碼抓取宏觀文本 (2) 智能解析 Body 以獲取導論 (3) 物理縫合地點與經文
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BIBLE_BOOKS_MAP = {
    '創': 'Gen', '出': 'Exo', '利': 'Lev', '民': 'Num', '申': 'Deu', '約': 'Jos', '士': 'Jud', '得': 'Rut', '撒上': '1Sa', '撒下': '2Sa', '王上': '1Ki', '王下': '2Ki', '代上': '1Ch', '代下': '2Ch', '拉': 'Ezr', '尼': 'Neh', '斯': 'Est', '伯': 'Job', '詩': 'Psa', '箴': 'Pro', '傳': 'Ecc', '歌': 'Sng', '賽': 'Isa', '耶': 'Jer', '哀': 'Lam', '結': 'Ezk', '但': 'Dan', '何': 'Hos', '約': 'Joe', '摩': 'Amo', '俄': 'Oba', '拿': 'Jon', '彌': 'Mic', '鴻': 'Nam', '哈': 'Hab', '番': 'Zep', '該': 'Hag', '撒': 'Zec', '瑪': 'Mal', '太': 'Mat', '可': 'Mrk', '路': 'Luk', '約': 'Jhn', '徒': 'Act', '羅': 'Rom', '林前': '1Co', '林後': '2Co', '加': 'Gal', '弗': 'Eph', '腓': 'Phl', '西': 'Col', '帖前': '1Th', '帖後': '2Th', '提上': '1Ti', '提下': '2Ti', '多': 'Tit', '門': 'Phm', '來': 'Heb', '雅': 'Jas', '彼前': '1Pe', '彼後': '2Pe', '約一': '1Jn', '約二': '2Jn', '約三': '3Jn', '猶': 'Jud', '啟': 'Rev'
};

async function step2FixedSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Fixed-GID-Stitcher] 啟動地理神經網路物理修復...');

    try {
        // --- Part A: GID 採集 (Big5 解碼 + 智能 Body 提取) ---
        for (let i = 1; i <= 120; i++) {
            const gid = i.toString().padStart(3, '0');
            const url = `https://bible.fhl.net/LMAP/index.php?gid=${gid}`;
            
            try {
                // 強制使用 Big5 獲取資料
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
                const html = iconv.decode(res.data, 'big5');
                const $ = cheerio.load(html);
                
                // 1. 抓取標題
                let title = $('title').text().replace('梁天樞聖經地圖', '').trim();
                
                // 2. 獲取 Body 文本並進行智能清洗
                $('script, style, select, input, button').remove();
                const rawBody = $('body').text();
                
                // 尋找敘事起點 (通常在 〉 字符之後)
                let macroNarrative = "";
                const bracketIdx = rawBody.lastIndexOf('〉');
                if (bracketIdx !== -1) {
                    macroNarrative = rawBody.substring(bracketIdx + 1).trim();
                } else {
                    // 若無括號標題，則嘗試尋找第一個星號或數字節點
                    const startIdx = rawBody.search(/[一二三四五\*]/);
                    macroNarrative = startIdx !== -1 ? rawBody.substring(startIdx).trim() : rawBody.trim();
                }

                // 移除底部導航欄文字 (信望愛...等)
                macroNarrative = macroNarrative.split('信望愛')[0].split('快速查詢')[0].trim();

                console.log(`📡 [Map Macro-Secure] GID ${gid}: ${title} (敘事長度: ${macroNarrative.length})`);

                await client.query(
                    `INSERT INTO maps (gid, title, narrative, image_local)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (gid) DO UPDATE SET
                        title = EXCLUDED.title,
                        narrative = EXCLUDED.narrative,
                        image_local = EXCLUDED.image_local`,
                    [gid, title, macroNarrative, `/assets/maps/${gid}.GIF`]
                );

                // 3. 提取地點關聯
                $('a[href*="show.html?"]').each(async (idx, el) => {
                    const href = $(el).attr('href');
                    const lid = href.split('?')[1]?.trim();
                    if (lid && lid.length <= 10) { // 過濾雜質
                        await client.query(
                            `INSERT INTO location_maps (location_id, map_id)
                             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [`LOC_${lid}`, gid]
                        ).catch(e => {});
                    }
                });

            } catch(e) {
                console.error(`⚠️ [GID Error] GID ${gid}: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 100)); // 禮貌延遲
        }

        // --- Part B: 解析經文主權 (Point-to-Scripture) ---
        console.log('📡 [Neural Stitching] 正在物理縫合 1,468 點的經文生命線...');
        const locs = await client.query(`SELECT id, verse_refs FROM locations`);

        for (const row of locs.rows) {
            const locId = row.id;
            const verseRefs = row.verse_refs || "";
            const verseMatches = verseRefs.match(/#([^:|]+)(\d+):(\d+)(-\d+)?\|/g);
            if (verseMatches) {
                for (const vm of verseMatches) {
                    const cleanVm = vm.replace(/[#|]/g, '');
                    const [bookPart, rest] = cleanVm.split(/(?=\d)/);
                    if (!bookPart || !rest) continue;
                    const [chapter, versePart] = rest.split(':');
                    const verse = versePart.split('-')[0];
                    const bookCode = BIBLE_BOOKS_MAP[bookPart];
                    if (bookCode) {
                        await client.query(
                            `INSERT INTO verse_locations (book, chapter, verse, location_id, source)
                             VALUES ($1, $2, $3, $4, 'LMAP_FIXED') ON CONFLICT DO NOTHING`,
                            [bookCode, parseInt(chapter), parseInt(verse), locId]
                        );
                    }
                }
            }
        }

    } finally {
        await client.end();
        console.log('🏁 [Fixed-GID-Stitcher] 地理主權終極修復結案！');
    }
}

step2FixedSync().catch(console.error);
