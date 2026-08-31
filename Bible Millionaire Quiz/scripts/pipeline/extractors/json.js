/**
 * JSON 提取器
 * 提取 JSON 檔案中的文字內容
 */

import { readFileSync } from 'fs';

export const name = 'json';
export const extensions = ['.json'];

/**
 * 遞迴提取 JSON 中的所有字串值
 */
function extractStrings(obj, strings = []) {
    if (typeof obj === 'string') {
        if (obj.trim().length > 0) {
            strings.push(obj.trim());
        }
    } else if (Array.isArray(obj)) {
        obj.forEach(item => extractStrings(item, strings));
    } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(value => extractStrings(value, strings));
    }
    return strings;
}

export async function extract(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    const strings = extractStrings(json);
    return strings.join('\n');
}
