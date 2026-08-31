/**
 * Reference Pipeline - 統一入口
 * 
 * 用法:
 *   node run.js status              # 查看狀態
 *   node run.js extract [category]  # 提取文字
 *   node run.js recognize [category] # 識別經文
 *   node run.js tags [category]     # 識別主題標籤
 */

import crypto from 'crypto';
import { getDb, saveDb, queryAll, queryOne } from './utils.js';
import { extractFile, supportedFormats } from './extractors/index.js';
import { extractRefs } from './recognize-scriptures.js';
import { recognizeTags, tagsFromCategory } from './recognizers/tags.js';

// ====== 狀態查詢 ======
async function showStatus() {
    await getDb();

    const resources = queryOne('SELECT COUNT(*) as c FROM resources');
    const extracted = queryOne('SELECT COUNT(*) as c FROM extracted_text');
    const verses = queryOne('SELECT COUNT(*) as c FROM resource_verses');
    const tags = queryOne('SELECT COUNT(*) as c FROM resource_tags') || { c: 0 };

    console.log('\n📊 Pipeline 狀態');
    console.log('='.repeat(40));
    console.log(`資源總數:     ${resources.c}`);
    console.log(`已提取:       ${extracted.c}`);
    console.log(`經文索引:     ${verses.c}`);
    console.log(`主題標籤:     ${tags.c}`);
    console.log(`支援格式:     ${supportedFormats().join(', ')}`);
    console.log('='.repeat(40));
}

// ====== 提取 ======
async function runExtract(categoryId, limit = 50) {
    const db = await getDb();
    const formats = supportedFormats();

    console.log(`\n📄 Step 1: 文字提取 [${categoryId}]`);
    console.log(`支援格式: ${formats.join(', ')}\n`);

    const formatList = formats.map(f => f.replace('.', '')).map(f => `'${f}'`).join(',');

    const resources = queryAll(`
        SELECT r.id, r.title, r.file_path, r.file_type
        FROM resources r
        LEFT JOIN extracted_text et ON r.id = et.resource_id
        WHERE r.category_id = ? 
          AND et.resource_id IS NULL
          AND r.file_type IN (${formatList})
        LIMIT ?
    `, [categoryId, limit]);

    console.log(`待處理: ${resources.length}\n`);

    let success = 0, failed = 0;

    for (const res of resources) {
        process.stdout.write(`  ${res.title.substring(0, 30)}...`);

        try {
            const content = await extractFile(res.file_path);

            if (content && content.trim().length > 0) {
                const paragraphs = content.split(/\n+/).map(l => l.trim()).filter(l => l);
                const wordCount = content.replace(/\s+/g, '').length;

                db.run(`
                    INSERT INTO extracted_text (id, resource_id, content, word_count)
                    VALUES (?, ?, ?, ?)
                `, [crypto.randomUUID(), res.id, JSON.stringify({ paragraphs }), wordCount]);

                console.log(` ✅ ${wordCount}字`);
                success++;

                // 每處理 5 筆就儲存一次，讓前端能即時看到進度
                if (success % 5 === 0) {
                    saveDb();
                }
            } else {
                console.log(' ❌ empty');
                failed++;
            }
        } catch (err) {
            console.log(` ❌ ${err.message.substring(0, 30)}`);
            failed++;
        }
    }

    saveDb();
    console.log(`\n✅ 成功: ${success}, 失敗: ${failed}`);
}

// ====== 經文識別 ======
async function runRecognize(categoryId, limit = 50) {
    const db = await getDb();

    console.log(`\n📖 Step 2: 經文識別 [${categoryId}]\n`);

    const resources = queryAll(`
        SELECT et.resource_id, et.content, r.title
        FROM extracted_text et
        JOIN resources r ON et.resource_id = r.id
        WHERE r.category_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM resource_verses rv WHERE rv.resource_id = et.resource_id
          )
        LIMIT ?
    `, [categoryId, limit]);

    console.log(`待識別: ${resources.length}\n`);

    let totalRefs = 0;

    for (const res of resources) {
        process.stdout.write(`  ${res.title.substring(0, 30)}...`);

        try {
            const data = JSON.parse(res.content);
            const text = data.paragraphs.join('\n');
            const refs = extractRefs(text);

            for (const ref of refs) {
                db.run(`
                    INSERT OR IGNORE INTO resource_verses 
                    (id, resource_id, book, chapter_start, verse_start, chapter_end, verse_end, confidence, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
                `, [crypto.randomUUID(), res.resource_id, ref.book, ref.chapter_start, ref.verse_start, ref.chapter_end, ref.verse_end, ref.confidence]);
            }

            console.log(` ✅ ${refs.length} refs`);
            totalRefs += refs.length;
        } catch (err) {
            console.log(` ❌ ${err.message}`);
        }
    }

    saveDb();
    console.log(`\n✅ 共識別 ${totalRefs} 個經文引用`);
}

// ====== 主題標籤識別 ======
async function runTagRecognize(categoryId, limit = 50) {
    const db = await getDb();

    console.log(`\n🏷️ Step 3: 主題標籤識別 [${categoryId}]\n`);

    const resources = queryAll(`
        SELECT r.id, r.title, r.category_id
        FROM resources r
        WHERE r.category_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM resource_tags rt WHERE rt.resource_id = r.id
          )
        LIMIT ?
    `, [categoryId, limit]);

    console.log(`待識別: ${resources.length}\n`);

    let totalTags = 0;

    for (const res of resources) {
        process.stdout.write(`  ${res.title.substring(0, 30)}...`);

        // 從檔名識別
        const titleTags = recognizeTags(res.title);
        // 從分類推斷
        const catTags = tagsFromCategory(res.category_id);

        const allTags = [...titleTags, ...catTags];

        for (const tag of allTags) {
            // 確保標籤存在
            db.run(`
                INSERT OR IGNORE INTO tags (id, name, type)
                VALUES (?, ?, ?)
            `, [tag.id, tag.name, tag.type]);

            // 建立關聯
            db.run(`
                INSERT OR IGNORE INTO resource_tags (resource_id, tag_id)
                VALUES (?, ?)
            `, [res.id, tag.id]);
        }

        console.log(` ✅ ${allTags.length} tags`);
        totalTags += allTags.length;
    }

    saveDb();
    console.log(`\n✅ 共識別 ${totalTags} 個主題標籤`);
}

// ====== 單一檔案提取 ======
async function runExtractFile(resourceId) {
    const db = await getDb();

    console.log(`\n📄 Single File Extract [${resourceId}]`);

    const res = queryOne(`SELECT * FROM resources WHERE id = ?`, [resourceId]);
    if (!res) {
        console.log('❌ Resource not found');
        return;
    }

    console.log(`  Target: ${res.title}`);
    console.log(`  Path: ${res.file_path}`);

    try {
        const content = await extractFile(res.file_path);

        if (content && content.trim().length > 0) {
            const paragraphs = content.split(/\n+/).map(l => l.trim()).filter(l => l);
            const wordCount = content.replace(/\s+/g, '').length;

            // 刪除舊的提取內容
            db.run('DELETE FROM extracted_text WHERE resource_id = ?', [resourceId]);

            // 插入新內容
            db.run(`
                INSERT INTO extracted_text (id, resource_id, content, word_count)
                VALUES (?, ?, ?, ?)
            `, [crypto.randomUUID(), res.id, JSON.stringify({ paragraphs }), wordCount]);

            console.log(` ✅ Success: ${wordCount} words`);
            saveDb();
        } else {
            console.log(' ❌ Empty content');
        }
    } catch (err) {
        console.log(` ❌ Error: ${err.message}`);
    }
}

// ====== CLI ======
const [, , command, arg, limitArg] = process.argv;
const limit = limitArg ? parseInt(limitArg, 10) : 100;

switch (command) {
    case 'extract':
        await runExtract(arg || '4D', limit);
        break;
    case 'extract-file':
        await runExtractFile(arg);
        break;
    case 'recognize':
        await runRecognize(arg || '4D', limit);
        break;
    case 'tags':
        await runTagRecognize(arg || '4D', limit);
        break;
    case 'status':
        await showStatus();
        break;
    default:
        console.log(`
Reference Pipeline

用法:
  node run.js status                    # 查看狀態
  node run.js extract [category] [N]    # 提取文字 (預設 100)
  node run.js extract-file [id]         # 提取單一檔案
  node run.js recognize [category] [N]  # 識別經文 (預設 100)
  node run.js tags [category] [N]       # 識別主題標籤 (預設 100)
`);
}

