/**
 * HTML/HTM 提取器
 * 提取 HTML 檔案中的純文字內容
 */

import { readFileSync } from 'fs';

export const name = 'html';
export const extensions = ['.html', '.htm'];

/**
 * 簡易 HTML 標籤移除
 */
function stripHtml(html) {
    return html
        // 移除 script 和 style 標籤及其內容
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // 移除所有 HTML 標籤
        .replace(/<[^>]+>/g, ' ')
        // 解碼常見 HTML 實體
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // 清理多餘空白
        .replace(/\s+/g, ' ')
        .trim();
}

export async function extract(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    return stripHtml(content);
}
