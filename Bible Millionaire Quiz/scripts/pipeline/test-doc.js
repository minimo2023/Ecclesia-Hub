/**
 * 測試 DOC 提取 - 驗證編碼
 */
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'fs';
import { extractFile } from './extractors/index.js';

const db = new (await initSqlJs()).Database(readFileSync('data/content.db'));

const result = db.exec(`SELECT file_path FROM resources WHERE file_type = 'doc' LIMIT 1`);
const path = result[0].values[0][0];

console.log('=== DOC TEST ===');
console.log('Path OK:', existsSync(path));

try {
    const content = await extractFile(path);
    console.log('Length:', content.length);

    // 檢查前 100 字元是否是有效中文
    const sample = content.substring(0, 100);
    const hasChinese = /[\u4e00-\u9fff]/.test(sample);
    console.log('Has Chinese:', hasChinese);
    console.log('Sample:', sample.replace(/\r?\n/g, ' ').substring(0, 60));
} catch (err) {
    console.log('Error:', err.message);
}
