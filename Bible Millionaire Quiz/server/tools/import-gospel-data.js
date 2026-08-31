import { ContentManager } from './services/ContentManager.js';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import iconv from 'iconv-lite';
import crypto from 'crypto';
import mammoth from 'mammoth';

// 配置
const DRY_RUN = process.argv.includes('--dry-run');
const BASE_PATH = process.argv[2] || '\\\\wei-nas\\home\\文件自廖\\福音資料';
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1]) || null;

console.log(`
╔═══════════════════════════════════════╗
║   福音資料導入工具 v2.0 (支援DOCX)  ║
║   Gospel Data Import Tool            ║
╚═══════════════════════════════════════╝

📂 掃描路徑: ${BASE_PATH}
${DRY_RUN ? '🔍 模式: DRY RUN (僅測試，不寫入資料庫)' : '⚠️  模式: 實際導入'}
${LIMIT ? `🔢 限制: 最多 ${LIMIT} 個文件` : ''}
`);

/**
 * 從路徑中解析分類
 * 例如: "(1A)福音書籍" -> { code: "1A", name: "福音書籍" }
 */
function parseCategory(pathSegment) {
    const match = pathSegment.match(/^\(([^)]+)\)(.+)$/);
    if (match) {
        return { code: match[1], name: match[2].trim() };
    }
    return { code: null, name: pathSegment };
}

/**
 * 從檔名中解析標題和作者
 * 例如: "人生何處去 (桑安柱).txt" -> { title: "人生何處去", author: "桑安柱" }
 */
function parseFilename(filename) {
    const nameWithoutExt = filename.replace(/\.(txt|docx|doc)$/i, '');
    const match = nameWithoutExt.match(/^(.+?)\s*\(([^)]+)\)$/);

    if (match) {
        return { title: match[1].trim(), author: match[2].trim() };
    }
    return { title: nameWithoutExt, author: null };
}

/**
 * 自動檢測並解碼文件內容 (Big5 / UTF-8)
 */
function readTextFile(filePath) {
    try {
        const buffer = readFileSync(filePath);

        // 嘗試 UTF-8
        const utf8Text = buffer.toString('utf8');
        if (!utf8Text.includes('�')) {
            return utf8Text;
        }

        // Fallback to Big5
        return iconv.decode(buffer, 'big5');
    } catch (error) {
        console.error(`   ❌ 讀取失敗: ${basename(filePath)} - ${error.message}`);
        return null;
    }
}

/**
 * 讀取 DOCX 文件內容
 */
async function readDocxFile(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error(`   ❌ DOCX 讀取失敗: ${basename(filePath)} - ${error.message}`);
        return null;
    }
}

/**
 * 遞歸掃描目錄
 */
function* scanDirectory(dirPath, depth = 0) {
    if (depth > 5) return; // 防止過深

    try {
        const entries = readdirSync(dirPath);

        for (const entry of entries) {
            const fullPath = join(dirPath, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                yield* scanDirectory(fullPath, depth + 1);
            } else if (stat.isFile() && /\.(txt|docx)$/i.test(entry)) {
                yield fullPath;
            }
        }
    } catch (error) {
        console.error(`⚠️  無法掃描: ${dirPath} - ${error.message}`);
    }
}

/**
 * 主程序
 */
async function main() {
    console.log('🔍 開始掃描文件...\n');

    const resources = [];
    const texts = [];
    let processedCount = 0;

    for (const filePath of scanDirectory(BASE_PATH)) {
        if (LIMIT && processedCount >= LIMIT) {
            console.log(`\n✋ 已達到限制 (${LIMIT} 個文件)，停止掃描。`);
            break;
        }

        // 判斷文件類型
        const isDocx = filePath.toLowerCase().endsWith('.docx');

        // 解析路徑結構
        const relativePath = filePath.replace(BASE_PATH, '').replace(/^[\\/]+/, '');
        const pathParts = relativePath.split(/[\\/]/);
        const filename = pathParts[pathParts.length - 1];
        const { title, author } = parseFilename(filename);

        // 解析分類
        let category = null;
        let subcategory = null;
        if (pathParts.length >= 2) {
            category = parseCategory(pathParts[0]).name;
        }
        if (pathParts.length >= 3) {
            subcategory = parseCategory(pathParts[1]).name;
        }

        // 讀取內容（根據文件類型）
        let content;
        if (isDocx) {
            content = await readDocxFile(filePath);
        } else {
            content = readTextFile(filePath);
        }
        if (!content) continue;

        // 建立資源對象
        const resourceId = crypto.randomUUID();
        const resource = {
            id: resourceId,
            title,
            filename,
            file_path: filePath,
            category: category,
            content_type: 'gospel_document',
            related_books: subcategory, // 簡化：將子分類作為關聯書卷
            author,
            source: 'gospel_data_import',
            language: 'zh-TW',
            is_indexed: 1
        };

        const text = {
            resource_id: resourceId,
            content,
            word_count: content.length
        };

        resources.push(resource);
        texts.push(text);
        processedCount++;

        console.log(`✅ [${processedCount}] ${category || '未分類'}/${title}${author ? ` (${author})` : ''}`);
    }

    console.log(`\n📊 掃描完成！共找到 ${processedCount} 個文件。\n`);

    if (DRY_RUN) {
        console.log('🔍 DRY RUN 模式 - 不寫入資料庫');
        console.log(`   資源樣本 (前3個):\n${JSON.stringify(resources.slice(0, 3), null, 2)}`);
    } else {
        console.log('💾 開始寫入資料庫...');

        try {
            const importedResources = ContentManager.importResources(resources);
            const importedTexts = ContentManager.importExtractedText(texts);

            console.log(`\n✅ 導入成功！`);
            console.log(`   📚 資源: ${importedResources} 筆`);
            console.log(`   📝 文本: ${importedTexts} 筆`);
        } catch (error) {
            console.error(`\n❌ 導入失敗: ${error.message}`);
            console.error(error.stack);
        }
    }
}

main().catch(console.error);
