/**
 * Reference Pipeline - Step 1: 文字提取
 * 模組化、輕便設計
 */

import mammoth from 'mammoth';
import { readFileSync } from 'fs';
import crypto from 'crypto';
import { getDb, saveDb, queryAll } from './utils.js';

/**
 * 從 DOC/DOCX 提取文字
 */
async function extractDoc(filePath) {
    const buffer = readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

/**
 * 從 TXT 提取文字
 */
function extractTxt(filePath) {
    return readFileSync(filePath, 'utf-8');
}

/**
 * 處理單一資源
 */
export async function processResource(resource) {
    const { id, file_path, file_type, title } = resource;

    try {
        let content = null;

        if (file_type === 'doc' || file_type === 'docx') {
            content = await extractDoc(file_path);
        } else if (file_type === 'txt') {
            content = extractTxt(file_path);
        }

        if (!content || content.trim().length === 0) {
            return { success: false, reason: 'empty' };
        }

        // 分段保留結構
        const paragraphs = content.split(/\n+/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        return {
            success: true,
            data: {
                id: crypto.randomUUID(),
                resource_id: id,
                content: JSON.stringify({ paragraphs }),
                word_count: content.replace(/\s+/g, '').length
            }
        };
    } catch (err) {
        return { success: false, reason: err.message };
    }
}

/**
 * 批次處理
 */
export async function extractBatch(categoryId, limit = 50) {
    const db = await getDb();

    // 只處理 docx 和 txt（mammoth 不支援舊版 .doc）
    const resources = queryAll(`
        SELECT r.id, r.title, r.file_path, r.file_type
        FROM resources r
        LEFT JOIN extracted_text et ON r.id = et.resource_id
        WHERE r.category_id = ? 
          AND et.resource_id IS NULL
          AND r.file_type IN ('docx', 'txt')
        LIMIT ?
    `, [categoryId, limit]);

    console.log(`📊 待處理: ${resources.length}`);

    let success = 0, failed = 0;

    for (const res of resources) {
        process.stdout.write(`  ${res.title.substring(0, 25)}...`);

        const result = await processResource(res);

        if (result.success) {
            db.run(`
                INSERT INTO extracted_text (id, resource_id, content, word_count)
                VALUES (?, ?, ?, ?)
            `, [result.data.id, result.data.resource_id, result.data.content, result.data.word_count]);
            console.log(` ✅ ${result.data.word_count}字`);
            success++;
        } else {
            console.log(` ❌ ${result.reason}`);
            failed++;
        }
    }

    saveDb();
    return { success, failed };
}

// CLI 入口
if (process.argv[1].includes('extract-text')) {
    const category = process.argv[2] || '4D';
    console.log(`\n📄 Step 1: 文字提取 [${category}]\n`);
    extractBatch(category, 100).then(r => {
        console.log(`\n✅ 成功: ${r.success}, 失敗: ${r.failed}`);
    });
}
