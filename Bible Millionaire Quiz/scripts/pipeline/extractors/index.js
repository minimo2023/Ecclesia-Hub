/**
 * 提取器管理器
 * 根據檔案類型選擇適當的提取器
 */

import { extname } from 'path';

// 動態載入提取器
const extractors = new Map();

async function loadExtractors() {
    const modules = ['docx', 'txt', 'doc', 'pdf', 'json', 'html'];

    for (const mod of modules) {
        try {
            const extractor = await import(`./${mod}.js`);
            for (const ext of extractor.extensions) {
                extractors.set(ext, extractor);
            }
            console.log(`  ✓ ${mod} extractor loaded`);
        } catch (err) {
            console.log(`  ✗ ${mod} extractor failed: ${err.message}`);
        }
    }
}

/**
 * 取得檔案的提取器
 */
export function getExtractor(filePath) {
    const ext = extname(filePath).toLowerCase();
    return extractors.get(ext);
}

/**
 * 提取檔案內容
 */
export async function extractFile(filePath) {
    const extractor = getExtractor(filePath);

    if (!extractor) {
        throw new Error(`No extractor for ${extname(filePath)}`);
    }

    return await extractor.extract(filePath);
}

/**
 * 列出支援的格式
 */
export function supportedFormats() {
    return Array.from(extractors.keys());
}

// 初始化
await loadExtractors();
