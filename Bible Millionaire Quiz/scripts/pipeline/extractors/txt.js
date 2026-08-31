/**
 * TXT 提取器
 * 直接讀取純文字檔
 */

import { readFileSync } from 'fs';

export const name = 'txt';
export const extensions = ['.txt'];

export async function extract(filePath) {
    return readFileSync(filePath, 'utf-8');
}
