import axios from 'axios';
import * as cheerio from 'cheerio';
import pkg from 'pg';
const { Client } = pkg;
import iconv from 'iconv-lite';

// 資料庫與連結配置
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

const BASE_URL = 'https://bible.fhl.net/Mar/dic_detail.php';
const CATEGORY_ID = 6; // 地理、地圖、地名類

/**
 * 物理主權解析器 (3.4.3 地理修訂版)
 */
async function parseGeographyDetail(key) {
    try {
        const response = await axios.get(`${BASE_URL}?sel=${CATEGORY_ID}&key=${key}`, {
            responseType: 'arraybuffer'
        });
        const html = iconv.decode(response.data, 'utf-8');
        const $ = cheerio.load(html);

        // 物理清理：移除 CSS 與腳本污染
        $('style, script').remove();

        const result = {
            id: key,
            name_zh: '',
            description: '',
            discussion: '',
            symbolism: '',
            translation_notes: '',
            smap_id: null,
            latitude: null,
            longitude: null
        };

        // 1. 物理提取標目
        result.name_zh = $('b').first().text().trim();

        // 2. 物理提取 SMap ID (從相關地圖連結中)
        $('a[href*="mid="]').each((i, el) => {
            const href = $(el).attr('href');
            const match = href.match(/mid=(\d+)/);
            if (match && !result.smap_id) {
                result.smap_id = parseInt(match[1]);
            }
        });

        // 3. 物理分段 (Sovereignty Splitting - Dothan Standard)
        $('h3').each((index, element) => {
            const header = $(element).text().trim();
            let content = '';
            let next = $(element).next();

            while (next.length && next[0].name !== 'h3') {
                content += next.text().trim() + '\n';
                next = next.next();
            }

            if (header.includes('描述') || header.includes('簡介')) {
                result.description = content.trim();
            } else if (header.includes('說明') || header.includes('位置')) {
                result.discussion = content.trim();
            } else if (header.includes('象徵')) {
                result.symbolism = content.trim();
            } else if (header.includes('譯註') || header.includes('考證')) {
                result.translation_notes = content.trim();
            }
        });

        // 備援：若無 h3 標籤
        if (!result.discussion && !result.description) {
            result.description = $('body').text().split(result.name_zh)[1]?.trim() || '';
        }

        return result;
    } catch (e) {
        console.error(`❌ [Key ${key}] 解析物理失敗:`, e.message);
        return null;
    }
}

/**
 * 地理主權重啟引擎 (Re-Genesis Engine)
 */
async function syncGeography() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🌍 啟動地理主權重啟引擎 (Phase 9.7 Re-Genesis)');

    try {
        const totalEntries = 1045; 
        const CONCURRENCY = 10; 

        for (let i = 1; i <= totalEntries; i += CONCURRENCY) {
            const chunk = Array.from({ length: CONCURRENCY }, (_, j) => i + j).filter(id => id <= totalEntries);
            
            await Promise.all(chunk.map(async (id) => {
                const key = `6.${id}`;
                console.log(`📡 [Logos] 正在同步地理條目: [${key}]...`);
                
                const detail = await parseGeographyDetail(key);
                if (detail && detail.name_zh) {
                    // 物理入庫至隔離表 (bible_geographies)
                    await client.query(
                        `INSERT INTO bible_geographies (id, category_id, name_zh, description, discussion, symbolism, translation_notes, smap_id, latitude, longitude)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         ON CONFLICT (id) DO UPDATE SET
                         name_zh = EXCLUDED.name_zh,
                         description = EXCLUDED.description,
                         discussion = EXCLUDED.discussion,
                         symbolism = EXCLUDED.symbolism,
                         translation_notes = EXCLUDED.translation_notes,
                         smap_id = EXCLUDED.smap_id,
                         latitude = EXCLUDED.latitude,
                         longitude = EXCLUDED.longitude,
                         is_distilled = false`,
                        [detail.id, CATEGORY_ID, detail.name_zh, detail.description, detail.discussion, detail.symbolism, detail.translation_notes, detail.smap_id, detail.latitude, detail.longitude]
                    );
                    console.log(`✅ [${detail.id}] ${detail.name_zh} 重啟成功。 (SMap ID: ${detail.smap_id || '無'})`);
                }
            }));
            
            await new Promise(r => setTimeout(r, 1000));
        }
    } finally {
        await client.end();
        console.log('🏁 地理主權重啟任務結案。');
    }
}

syncGeography().catch(console.error);
