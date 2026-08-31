/**
 * 測試各格式提取器
 */

import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import { extractFile, supportedFormats } from './extractors/index.js';

const db = new (await initSqlJs()).Database(readFileSync('data/content.db'));

console.log('📄 測試各格式提取器\n');
console.log('支援格式:', supportedFormats().join(', '), '\n');

// 各格式取一個檔案測試
const formats = ['docx', 'txt', 'pdf'];

for (const fmt of formats) {
    console.log(`\n=== ${fmt.toUpperCase()} ===`);

    const result = db.exec(`
        SELECT title, file_path FROM resources 
        WHERE file_type = '${fmt}' LIMIT 1
    `);

    if (result[0] && result[0].values[0]) {
        const [title, path] = result[0].values[0];
        console.log(`檔案: ${title}`);

        try {
            const content = await extractFile(path);
            const preview = content.substring(0, 200).replace(/\n/g, ' ');
            console.log(`字數: ${content.replace(/\s/g, '').length}`);
            console.log(`預覽: ${preview}...`);
        } catch (err) {
            console.log(`錯誤: ${err.message}`);
        }
    } else {
        console.log('無此格式檔案');
    }
}
