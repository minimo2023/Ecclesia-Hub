/**
 * 批次處理所有分類
 * 用法: node scripts/pipeline/batch-all.js
 */

import { getDb, saveDb, queryAll, queryOne } from './utils.js';
import { extractFile, supportedFormats } from './extractors/index.js';
import { extractRefs } from './recognize-scriptures.js';
import { recognizeTags, tagsFromCategory } from './recognizers/tags.js';
import crypto from 'crypto';

const BATCH_SIZE = 100;

async function main() {
    const db = await getDb();

    // 取得所有分類
    const categories = queryAll('SELECT id, name FROM categories ORDER BY id');
    console.log(`\n📚 批次處理 ${categories.length} 個分類\n`);

    const formats = supportedFormats();
    const formatList = formats.map(f => f.replace('.', '')).map(f => `'${f}'`).join(',');

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        console.log(`\n${'='.repeat(50)}`);
        console.log(`[${i + 1}/${categories.length}] 📁 ${cat.id}: ${cat.name}`);
        console.log('='.repeat(50));

        // Step 1: 提取
        const toExtract = queryAll(`
            SELECT r.id, r.title, r.file_path, r.file_type
            FROM resources r
            LEFT JOIN extracted_text et ON r.id = et.resource_id
            WHERE r.category_id = ? 
              AND et.resource_id IS NULL
              AND r.file_type IN (${formatList})
            LIMIT ?
        `, [cat.id, BATCH_SIZE]);

        if (toExtract.length > 0) {
            console.log(`  📄 提取: ${toExtract.length} 個`);
            let ok = 0, fail = 0;

            for (const res of toExtract) {
                try {
                    const content = await extractFile(res.file_path);
                    if (content && content.trim().length > 0) {
                        const paragraphs = content.split(/\n+/).map(l => l.trim()).filter(l => l);
                        const wordCount = content.replace(/\s+/g, '').length;
                        db.run(`INSERT INTO extracted_text (id, resource_id, content, word_count) VALUES (?, ?, ?, ?)`,
                            [crypto.randomUUID(), res.id, JSON.stringify({ paragraphs }), wordCount]);
                        ok++;
                    } else { fail++; }
                } catch { fail++; }
            }
            console.log(`     ✅ ${ok} 成功, ❌ ${fail} 失敗`);
            saveDb();
        }

        // Step 2: 經文識別
        const toRecognize = queryAll(`
            SELECT et.resource_id, et.content, r.title
            FROM extracted_text et
            JOIN resources r ON et.resource_id = r.id
            WHERE r.category_id = ?
              AND NOT EXISTS (SELECT 1 FROM resource_verses rv WHERE rv.resource_id = et.resource_id)
            LIMIT ?
        `, [cat.id, BATCH_SIZE]);

        if (toRecognize.length > 0) {
            console.log(`  📖 經文識別: ${toRecognize.length} 個`);
            let refs = 0;

            for (const res of toRecognize) {
                try {
                    const data = JSON.parse(res.content);
                    const text = data.paragraphs.join('\n');
                    const found = extractRefs(text);
                    for (const ref of found) {
                        db.run(`INSERT OR IGNORE INTO resource_verses (id, resource_id, book, chapter_start, verse_start, chapter_end, verse_end, confidence, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')`,
                            [crypto.randomUUID(), res.resource_id, ref.book, ref.chapter_start, ref.verse_start, ref.chapter_end, ref.verse_end, ref.confidence]);
                    }
                    refs += found.length;
                } catch { }
            }
            console.log(`     ✅ ${refs} 個經文引用`);
            saveDb();
        }

        // Step 3: 主題標籤
        const toTag = queryAll(`
            SELECT r.id, r.title, r.category_id
            FROM resources r
            WHERE r.category_id = ?
              AND NOT EXISTS (SELECT 1 FROM resource_tags rt WHERE rt.resource_id = r.id)
            LIMIT ?
        `, [cat.id, BATCH_SIZE]);

        if (toTag.length > 0) {
            console.log(`  🏷️ 主題標籤: ${toTag.length} 個`);
            let tags = 0;

            for (const res of toTag) {
                const allTags = [...recognizeTags(res.title), ...tagsFromCategory(res.category_id)];
                for (const tag of allTags) {
                    db.run(`INSERT OR IGNORE INTO tags (id, name, type) VALUES (?, ?, ?)`, [tag.id, tag.name, tag.type]);
                    db.run(`INSERT OR IGNORE INTO resource_tags (resource_id, tag_id) VALUES (?, ?)`, [res.id, tag.id]);
                }
                tags += allTags.length;
            }
            console.log(`     ✅ ${tags} 個標籤`);
            saveDb();
        }
    }

    // 最終統計
    console.log('\n' + '='.repeat(50));
    console.log('📊 最終統計');
    console.log('='.repeat(50));
    console.log(`資源: ${queryOne('SELECT COUNT(*) as c FROM resources').c}`);
    console.log(`已提取: ${queryOne('SELECT COUNT(*) as c FROM extracted_text').c}`);
    console.log(`經文索引: ${queryOne('SELECT COUNT(*) as c FROM resource_verses').c}`);
    console.log(`標籤關聯: ${queryOne('SELECT COUNT(*) as c FROM resource_tags').c}`);
}

main().catch(console.error);
