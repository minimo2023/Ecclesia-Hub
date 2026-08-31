import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;

/**
 * [Phase 12.7] 第二階段：地理神經網路終極縫合 (物理修正版)
 * 主旨：(1) 使用序列化 for...of 確保異步寫入成功 (2) 優化經文正則與書卷映射
 */
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BIBLE_BOOKS_MAP = {
    '創': 'Gen', '出': 'Exo', '利': 'Lev', '民': 'Num', '申': 'Deu', '約': 'Jos', '書': 'Jos', '士': 'Jud', '得': 'Rut', '撒上': '1Sa', '撒下': '2Sa', '王上': '1Ki', '王下': '2Ki', '代上': '1Ch', '代下': '2Ch', '拉': 'Ezr', '尼': 'Neh', '斯': 'Est', '伯': 'Job', '詩': 'Psa', '箴': 'Pro', '傳': 'Ecc', '歌': 'Sng', '賽': 'Isa', '耶': 'Jer', '哀': 'Lam', '結': 'Ezk', '但': 'Dan', '何': 'Hos', '約': 'Joe', '摩': 'Amo', '俄': 'Oba', '拿': 'Jon', '彌': 'Mic', '鴻': 'Nam', '哈': 'Hab', '番': 'Zep', '該': 'Hag', '撒': 'Zec', '瑪': 'Mal', '太': 'Mat', '可': 'Mrk', '路': 'Luk', '約': 'Jhn', '徒': 'Act', '羅': 'Rom', '林前': '1Co', '林後': '2Co', '加': 'Gal', '弗': 'Eph', '腓': 'Phl', '西': 'Col', '帖前': '1Th', '帖後': '2Th', '提上': '1Ti', '提下': '2Ti', '多': 'Tit', '門': 'Phm', '來': 'Heb', '雅': 'Jas', '彼前': '1Pe', '彼後': '2Pe', '約一': '1Jn', '約二': '2Jn', '約三': '3Jn', '猶': 'Jud', '啟': 'Rev'
};

async function step2FinalNeuralStitch() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 [Neural-Welder] 啟動地理神經網路「物理焊接」縫合...');

    try {
        // --- Part A: GID 地圖與地點關聯 (重新掃描清單頁以確保關係入庫) ---
        console.log('📡 [Map-Point] 正在修復地點與地圖之物理關聯...');
        for (let i = 1; i <= 120; i++) {
            const gid = i.toString().padStart(3, '0');
            const url = `https://bible.fhl.net/LMAP/index.php?gid=${gid}`;
            
            try {
                const res = await axios.get(url, { timeout: 8000 });
                const $ = cheerio.load(res.data);
                
                // 使用 Array.from 配合 for...of 確保異步順序
                const links = Array.from($('#maptxt a[href*="show.html?"]'));
                for (const el of links) {
                    const href = $(el).attr('href');
                    const lid = href.split('?')[1]?.trim();
                    if (lid && lid.length <= 10) {
                        await client.query(
                            `INSERT INTO location_maps (location_id, map_id)
                             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [`LOC_${lid}`, gid]
                        );
                    }
                }
                process.stdout.write('.');
            } catch(e) {
                console.error(`\n⚠️ [GID Error] GID ${gid}: ${e.message}`);
            }
        }
        console.log('\n✅ [Map-Point] 地點與地圖關聯修復完成。');

        // --- Part B: 經文縫合 (重新解析 全量 1,468 點) ---
        console.log('📡 [Verse-Point] 正在物理焊接 31,098 節經文生命線...');
        const locs = await client.query(`SELECT id, verse_refs FROM locations`);

        let stitchedCount = 0;
        for (const row of locs.rows) {
            const locId = row.id;
            const verseRefs = row.verse_refs || "";
            // 改進正則，確保抓取所有符合 #書21:35| 格式的項目
            const verseMatches = verseRefs.match(/#([^:|0-9]+)(\d+):(\d+)(-\d+)?\|/g);
            
            if (verseMatches) {
                for (const vm of verseMatches) {
                    const cleanVm = vm.replace(/[#|]/g, '');
                    // 分離 書 (字母/中文) 與 21:35 (數字)
                    const m = cleanVm.match(/^([^\d]+)(\d+):(\d+)/);
                    if (!m) continue;

                    const bookPart = m[1];
                    const chapter = m[2];
                    const verse = m[3];

                    const bookCode = BIBLE_BOOKS_MAP[bookPart];
                    if (bookCode) {
                        await client.query(
                            `INSERT INTO verse_locations (book, chapter, verse, location_id, source)
                             VALUES ($1, $2, $3, $4, 'LMAP_NEURAL_STITCH') ON CONFLICT DO NOTHING`,
                            [bookCode, parseInt(chapter), parseInt(verse), locId]
                        );
                        stitchedCount++;
                    }
                }
            }
        }
        console.log(`✅ [Verse-Point] 經文縫合完成，共焊接 ${stitchedCount} 個座標點。`);

    } finally {
        await client.end();
        console.log('🏁 [Neural-Welder] 全量地理神經網路「物理焊接」任務結案！');
    }
}

step2FinalNeuralStitch().catch(console.error);
