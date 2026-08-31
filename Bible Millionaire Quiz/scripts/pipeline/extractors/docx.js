/**
 * DOCX 提取器
 * 使用 mammoth 提取 .docx 內容
 */

import mammoth from 'mammoth';
import { readFileSync } from 'fs';

export const name = 'docx';
export const extensions = ['.docx'];

export async function extract(filePath) {
    const buffer = readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}
