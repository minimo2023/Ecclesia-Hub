import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;

/**
 * [Phase 12.6] 第二階段：地理神經網路縫合 (精確 maptxt 版)
 * 主旨：(1) 直接鎖定 #maptxt 獲取宏觀文本 (2) 從 #maptxt 提取地圖地點關聯 (3) 物理縫合地點與經文
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BIBLE_BOOKS_MAP = {
    '創': 'Gen', '出': 'Exo', '利': 'Lev', '民': 'Num', '申': 'Deu', '約': 'Jos', '士': 'Jud', '得': 'Rut', '撒上': '1Sa', '撒下': '2Sa', '王上': '1Ki', '王下': '2Ki', '代上': '1Ch', '代下': '2Ch', '拉': 'Ezr', '尼': 'Neh', '斯': 'Est', '伯': 'Job', '詩': 'Psa', '箴': 'Pro', '傳': 'Ecc', '歌': 'Sng', '賽': 'Isa', '耶': 'Jer', '哀': 'Lam', '結': 'Ezk', '但': 'Dan', '何': 'Hos', '約': 'Joe', '摩': 'Amo', '俄': 'Oba', '拿': 'Jon', '彌': 'Mic', '鴻': 'Nam', '哈': 'Hab', '番': 'Zep', '該': 'Hag', '撒': 'Zec', '瑪': 'Mal', '太': 'Mat', '可': 'Mrk', '路': 'Luk', '約': 'Jhn', '徒': 'Act', '羅': 'Rom', '林前': '1Co', '林後': '2Co', '加': 'Gal', '弗': 'Eph', '腓': 'Phl', '西': 'Col', '帖前': '1Th', '帖後': '2Th', '提上': '1Ti', '提下': '2Ti', '多': 'Tit', '門': 'Phm', '來': 'Heb', '雅': 'Jas', '彼前': '1Pe', '彼後': '2Pe', '約一': '1Jn', '約二': '2Jn', '約三': '3Jn', '猶': 'Jud', '啟': 'Rev'
};

async function step2MaptxtSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Maptxt-Stitcher] 啟動地理神經網路「精確制導」縫合...');

    try {
        // --- Part A: GID 採集 (鎖定 #maptxt) ---
        for (let i = 1; i <= 120; i++) {
            const gid = i.toString().padStart(3, '0');
            const url = `https://bible.fhl.net/LMAP/index.php?gid=${gid}`;
            
            try {
                const res = await axios.get(url, { timeout: 8000 });
                const $ = cheerio.load(res.data);
                
                // 1. 抓取標題 (移除雜質)
                let title = $('title').text().replace('梁天樞聖經地圖', '').trim();
                
                // 2. [CORE] 鎖定 #maptxt 獲取宏觀文本 (Macro-Narrative)
                const narrativeHtml = $('#maptxt').html() || "";
                // 移除內容中的連結，但保留文字，以便後續存入導論欄位
                const macroNarrative = $('#maptxt').text().trim();

                console.log(`📡 [Map Macro-Secure] GID ${gid}: ${title} (原生導論長度: ${macroNarrative.length})`);

                await client.query(
                    `INSERT INTO maps (gid, title, narrative, image_local)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (gid) DO UPDATE SET
                        title = EXCLUDED.title,
                        narrative = EXCLUDED.narrative,
                        image_local = EXCLUDED.image_local`,
                    [gid, title, macroNarrative, `/assets/maps/${gid}.GIF`]
                );

                // 3. 從 #maptxt 中提取地點關聯 (Location Mapping)
                // 地圖內的連結模式通常是 show.html?0252
                $('#maptxt a[href*="show.html?"]').each(async (idx, el) => {
                    const href = $(el).attr('href');
                    const lid = href.split('?')[1]?.trim();
                    if (lid && lid.length <= 10) {
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
        }

        // --- Part B: 經文縫合 (Scripture Mapping) ---
        console.log('📡 [Neural Stitching] 正在解析 1,468 點的經文生命線...');
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
                             VALUES ($1, $2, $3, $4, 'LMAP_MAPTXT') ON CONFLICT DO NOTHING`,
                            [bookCode, parseInt(chapter), parseInt(verse), locId]
                        );
                    }
                }
            }
        }

    } finally {
        await client.end();
        console.log('🏁 [Maptxt-Stitcher] 全量聖經地理大一統縫合結案！');
    }
}

step2MaptxtSync().catch(console.error);
