/**
 * Holylight 地理資料遷移腳本
 *
 * 來源: data/holylight-geography/locations-detailed.json (3,854筆 verse→location 關聯)
 * 目標: Postgres bible_quiz_v3
 *   - locations 表: 補充無對應的 Holylight 地點 (~194筆)
 *   - verse_locations 表: 匯入 3,854筆 verse 關聯 (1,326 → ~4,200+)
 *   - locations.metadata: 補充 Holylight 描述文字
 *
 * 執行: node scripts/migrate_holylight_geography.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── DB 連線 ──────────────────────────────────────────────────────────────────
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'dev',
    password: process.env.DB_PASSWORD || 'dev123',
    database: process.env.DB_NAME || 'bible_quiz_v3',
});

// ─── 書名對照 (Holylight 中文/英文縮寫 → USFM 3碼) ───────────────────────────
const BOOK_MAP = {
    // 中文全名
    '創世記':'Gen','出埃及記':'Exo','利未記':'Lev','民數記':'Num','申命記':'Deu',
    '約書亞記':'Jos','士師記':'Jdg','路得記':'Rut','撒母耳記上':'1Sa','撒母耳記下':'2Sa',
    '列王紀上':'1Ki','列王紀下':'2Ki','歷代志上':'1Ch','歷代志下':'2Ch','以斯拉記':'Ezr',
    '尼希米記':'Neh','以斯帖記':'Est','約伯記':'Job','詩篇':'Psa','箴言':'Pro',
    '傳道書':'Ecc','雅歌':'Sng','以賽亞書':'Isa','耶利米書':'Jer','耶利米哀歌':'Lam',
    '以西結書':'Eze','但以理書':'Dan','何西阿書':'Hos','約珥書':'Joe','阿摩司書':'Amo',
    '俄巴底亞書':'Oba','約拿書':'Jon','彌迦書':'Mic','那鴻書':'Nah','拿鴻書':'Nah',
    '哈巴谷書':'Hab','西番雅書':'Zep','哈該書':'Hag','撒迦利亞書':'Zec','瑪拉基書':'Mal',
    '馬太福音':'Mat','馬可福音':'Mrk','路加福音':'Luk','約翰福音':'Jhn','使徒行傳':'Act',
    '羅馬書':'Rom','羅馬人書':'Rom',
    '哥林多前書':'1Co','哥林多後書':'2Co','加拉太書':'Gal','以弗所書':'Eph',
    '腓立比書':'Php','歌羅西書':'Col','帖撒羅尼迦前書':'1Th','帖撒羅尼迦後書':'2Th',
    '提摩太前書':'1Ti','提摩太後書':'2Ti','提多書':'Tit','腓利門書':'Phm',
    '希伯來書':'Heb','雅各書':'Jas','彼得前書':'1Pe','彼得後書':'2Pe',
    '約翰一書':'1Jn','約翰二書':'2Jn','約翰三書':'3Jn','猶大書':'Jud','啟示錄':'Rev',
    // 英文縮寫變體 (Holylight 格式)
    'Gen':'Gen','Ex':'Exo','Exo':'Exo','Lev':'Lev','Num':'Num','Deut':'Deu','Deu':'Deu',
    'Josh':'Jos','Jos':'Jos','Judg':'Jdg','Jdg':'Jdg','Ruth':'Rut','Rut':'Rut',
    '1 Sam':'1Sa','2 Sam':'2Sa','1 Kgs':'1Ki','2 Kgs':'2Ki',
    '1 Chr':'1Ch','2 Chr':'2Ch','Ezra':'Ezr','Ezr':'Ezr','Neh':'Neh','Est':'Est',
    'Job':'Job','Ps':'Psa','Psa':'Psa','Pro':'Pro','Eccl':'Ecc','Ecc':'Ecc',
    'Sng':'Sng','Isa':'Isa','Jer':'Jer','Lam':'Lam','Ezek':'Eze','Eze':'Eze',
    'Dan':'Dan','Hos':'Hos','Joel':'Joe','Joe':'Joe','Amos':'Amo','Amo':'Amo',
    'Obad':'Oba','Oba':'Oba','Jonah':'Jon','Jon':'Jon','Mic':'Mic','Nahum':'Nah','Nah':'Nah',
    'Hab':'Hab','Zeph':'Zep','Zep':'Zep','Hag':'Hag','Zech':'Zec','Zec':'Zec','Mal':'Mal',
    'Matt':'Mat','Mat':'Mat','Mark':'Mrk','Mrk':'Mrk','Luke':'Luk','Luk':'Luk',
    'John':'Jhn','Jhn':'Jhn','Acts':'Act','Act':'Act','Rom':'Rom',
    '1 Cor':'1Co','1Co':'1Co','2 Cor':'2Co','2Co':'2Co','Gal':'Gal','Eph':'Eph',
    'Phil':'Php','Php':'Php','Col':'Col','1 Thes':'1Th','1Th':'1Th','2 Thes':'2Th','2Th':'2Th',
    '1 Tim':'1Ti','1Ti':'1Ti','2 Tim':'2Ti','2Ti':'2Ti','Titus':'Tit','Tit':'Tit',
    'Phm':'Phm','Heb':'Heb','Jas':'Jas',
    '1 Pet':'1Pe','1Pe':'1Pe','2 Pet':'2Pe','2Pe':'2Pe',
    '1Jn':'1Jn','2Jn':'2Jn','3Jn':'3Jn','Jude':'Jud','Jud':'Jud','Rev':'Rev',
};

function toUSFM(bookName) {
    return BOOK_MAP[bookName] || null;
}

// ─── 主程式 ───────────────────────────────────────────────────────────────────
async function main() {
    const client = await pool.connect();
    console.log('🚀 [Holylight Migration] 開始...\n');

    try {
        // 1. 讀取 Holylight JSON
        const jsonPath = path.join(ROOT, 'data/holylight-geography/locations-detailed.json');
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const items = raw.items;
        console.log(`📂 Holylight JSON: ${items.length} 筆 verse-location 關聯`);
        console.log(`   唯一地點代碼: ${new Set(items.map(i => i.code)).size} 個\n`);

        // 2. 載入 Postgres locations (name_zh → id 對照表)
        const pgLocs = await client.query('SELECT id, name_zh, name_en, description FROM locations');
        const pgNameMap = new Map(); // name_zh.trim() → { id, description }
        for (const row of pgLocs.rows) {
            if (row.name_zh) pgNameMap.set(row.name_zh.trim(), row);
        }
        console.log(`📍 Postgres locations: ${pgLocs.rows.length} 筆已載入`);

        // 3. 建立 Holylight code → Postgres id 對照表
        //    每個 Holylight code 取第一筆的 nameCh 做比對
        const hlCodeMap = new Map(); // hl_code → postgres_location_id
        const codeToItem = new Map(); // hl_code → first item (for description)
        for (const item of items) {
            if (!codeToItem.has(item.code)) {
                codeToItem.set(item.code, item);
            }
        }

        let matched = 0, newInserted = 0, unmatched = [];

        for (const [code, item] of codeToItem) {
            const nameCh = (item.nameCh || '').replace(/-\d+$/, '').trim(); // 去掉 "-1" 後綴
            const pgRow = pgNameMap.get(nameCh) || pgNameMap.get(item.nameCh?.trim());

            if (pgRow) {
                hlCodeMap.set(code, pgRow.id);
                matched++;

                // 若 Postgres description 較短且 Holylight 有豐富描述，補充到 metadata
                if (item.description && item.description.length > 100) {
                    const pgDescLen = pgRow.description ? pgRow.description.length : 0;
                    if (pgDescLen < 100) {
                        await client.query(`
                            UPDATE locations
                            SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{holylight_desc}', $1::jsonb)
                            WHERE id = $2
                        `, [JSON.stringify(item.description), pgRow.id]);
                    }
                }
            } else {
                // 無對應 → 新增到 locations (使用 HL_ 前綴)
                const newId = `HL_${code}`;
                try {
                    await client.query(`
                        INSERT INTO locations (id, name_zh, name_en, description, meaning, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        newId,
                        item.nameCh || '',
                        item.nameEn || '',
                        item.description || null,
                        item.meaning || null,
                        JSON.stringify({ holylight_code: code, images: item.images || [] })
                    ]);
                    hlCodeMap.set(code, newId);
                    newInserted++;
                } catch (e) {
                    unmatched.push({ code, nameCh: item.nameCh, reason: e.message });
                }
            }
        }

        console.log(`🔗 名稱比對結果:`);
        console.log(`   ✅ 匹配 Postgres locations: ${matched}`);
        console.log(`   ➕ 新增 HL_ locations: ${newInserted}`);
        if (unmatched.length) console.log(`   ❌ 失敗: ${unmatched.length}`);

        // 4. 遷移 verse_locations
        console.log(`\n📌 開始匯入 verse_locations...`);
        let vlInserted = 0, vlSkipped = 0, vlNoCode = 0, vlNoBook = 0;

        // 批次處理，每 500 筆一個 transaction
        const BATCH = 500;
        for (let i = 0; i < items.length; i += BATCH) {
            const batch = items.slice(i, i + BATCH);
            await client.query('BEGIN');
            try {
                for (const item of batch) {
                    const locationId = hlCodeMap.get(item.code);
                    if (!locationId) { vlNoCode++; continue; }

                    const book = toUSFM(item.book);
                    if (!book) { vlNoBook++; continue; }

                    await client.query(`
                        INSERT INTO verse_locations (book, chapter, verse, location_id, source)
                        VALUES ($1, $2, $3, $4, 'holylight')
                        ON CONFLICT DO NOTHING
                    `, [book, item.chapter, item.verse, locationId]);
                    vlInserted++;
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                console.error(`   ❌ Batch ${i}-${i+BATCH} failed:`, e.message);
                vlSkipped += batch.length;
            }
            process.stdout.write(`\r   處理中: ${Math.min(i + BATCH, items.length)}/${items.length}`);
        }

        console.log(`\n\n✅ verse_locations 匯入完成:`);
        console.log(`   ➕ 新增: ${vlInserted}`);
        console.log(`   ⚠️  無地點對應 (skip): ${vlNoCode}`);
        console.log(`   ⚠️  書名無法識別 (skip): ${vlNoBook}`);
        if (vlSkipped) console.log(`   ❌ Batch 失敗: ${vlSkipped}`);

        // 5. 最終統計
        const finalVL = await client.query('SELECT COUNT(*) FROM verse_locations');
        const finalLoc = await client.query('SELECT COUNT(*) FROM locations');
        const books = await client.query('SELECT COUNT(DISTINCT book) FROM verse_locations');
        console.log(`\n📊 遷移後統計:`);
        console.log(`   locations:      ${finalLoc.rows[0].count} 筆`);
        console.log(`   verse_locations: ${finalVL.rows[0].count} 筆`);
        console.log(`   涵蓋書卷:       ${books.rows[0].count} 本`);

    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(e => { console.error('❌ Migration failed:', e); process.exit(1); });
