import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import pkg from 'pg';
const { Client } = pkg;

/**
 * [Phase 12.2] 第二階段：地理神經網路縫合 (Step 2: Relational Stitching)
 * 主旨：(1) 採集 GID 001-120 宏觀歷史導論 (2) 鏈結地點與地圖 (3) 解析經文索引
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BIBLE_BOOKS_MAP = {
    '創': 'Gen', '出': 'Exo', '利': 'Lev', '民': 'Num', '申': 'Deu', '約': 'Jos', '士': 'Jud', '得': 'Rut', '撒上': '1Sa', '撒下': '2Sa', '王上': '1Ki', '王下': '2Ki', '代上': '1Ch', '代下': '2Ch', '拉': 'Ezr', '尼': 'Neh', '斯': 'Est', '伯': 'Job', '詩': 'Psa', '箴': 'Pro', '傳': 'Ecc', '歌': 'Sng', '賽': 'Isa', '耶': 'Jer', '哀': 'Lam', '結': 'Ezk', '但': 'Dan', '何': 'Hos', '約': 'Joe', '摩': 'Amo', '俄': 'Oba', '拿': 'Jon', '彌': 'Mic', '鴻': 'Nam', '哈': 'Hab', '番': 'Zep', '該': 'Hag', '撒': 'Zec', '瑪': 'Mal', '太': 'Mat', '可': 'Mrk', '路': 'Luk', '約': 'Jhn', '徒': 'Act', '羅': 'Rom', '林前': '1Co', '林後': '2Co', '加': 'Gal', '弗': 'Eph', '腓': 'Phl', '西': 'Col', '帖前': '1Th', '帖後': '2Th', '提上': '1Ti', '提下': '2Ti', '多': 'Tit', '門': 'Phm', '來': 'Heb', '雅': 'Jas', '彼前': '1Pe', '彼後': '2Pe', '約一': '1Jn', '約二': '2Jn', '約三': '3Jn', '猶': 'Jud', '啟': 'Rev'
};

async function step2StitchingSync() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Step 2 Stitching Commander] 啟動地理神經網路縫合...');

    try {
        // --- Part A: 採集 120 張地圖的宏觀文本 (Map Narratives) ---
        for (let i = 1; i <= 120; i++) {
            const gid = i.toString().padStart(3, '0');
            const url = `https://bible.fhl.net/LMAP/index.php?gid=${gid}`;
            
            try {
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
                const $ = cheerio.load(iconv.decode(res.data, 'utf-8'));
                const title = $('title').text().replace('梁天樞聖經地圖', '').trim();
                
                // 抓取地圖下方的宏觀文本 (排除 Script 標籤)
                $('script').remove();
                const macroNarrative = $('body').text().split('切換')[1]?.trim() || '';

                console.log(`📡 [Map Macro-Secure] 採集 GID ${gid}: ${title} (敘事長度: ${macroNarrative.length})`);

                await client.query(
                    `INSERT INTO maps (gid, title, narrative, image_local)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (gid) DO UPDATE SET
                        title = EXCLUDED.title,
                        narrative = EXCLUDED.narrative,
                        image_local = EXCLUDED.image_local`,
                    [gid, title, macroNarrative, `/assets/maps/${gid}.GIF`]
                );
            } catch(e) {
                console.error(`⚠️ [GID Error] GID ${gid} 抓取導論失敗: ${e.message}`);
            }
        }

        // --- Part B: 解析地點 meta 並物理縫合 (Point-Map-Verse Linking) ---
        console.log('📡 [Neural Stitching] 正在物理縫合地點、地圖與經文生命線...');
        const locs = await client.query(`SELECT id, verse_refs, metadata FROM locations`);

        for (const row of locs.rows) {
            const locId = row.id;
            const meta = row.metadata || {};
            const verseRefs = row.verse_refs || "";

            // 1. 縫合地點與地圖 (location_maps)
            const rawDec2 = meta.raw_maps_dec2 || "";
            const gidMatches = rawDec2.match(/\$(\d{3})/g);
            if (gidMatches) {
                for (const m of gidMatches) {
                    const gid = m.substring(1);
                    await client.query(
                        `INSERT INTO location_maps (location_id, map_id)
                         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [locId, gid]
                    );
                }
            }

            // 2. 縫合地點與經文 (verse_locations)
            // 模式: #創37:17|
            const verseMatches = verseRefs.match(/#([^:|]+)(\d+):(\d+)(-\d+)?\|/g);
            if (verseMatches) {
                for (const vm of verseMatches) {
                    const cleanVm = vm.replace(/[#|]/g, '');
                    const [bookPart, rest] = cleanVm.split(/(?=\d)/);
                    const [chapter, versePart] = rest.split(':');
                    const verse = versePart.split('-')[0]; // 取起始節

                    const bookCode = BIBLE_BOOKS_MAP[bookPart];
                    if (bookCode) {
                        await client.query(
                            `INSERT INTO verse_locations (book, chapter, verse, location_id, source)
                             VALUES ($1, $2, $3, $4, 'LMAP_SYNC') ON CONFLICT DO NOTHING`,
                            [bookCode, parseInt(chapter), parseInt(verse), locId]
                        );
                    }
                }
            }
        }

    } finally {
        await client.end();
        console.log('🏁 [Step 2 Stitching Commander] 神經網路大縫合任務結案！');
    }
}

step2StitchingSync().catch(console.error);
