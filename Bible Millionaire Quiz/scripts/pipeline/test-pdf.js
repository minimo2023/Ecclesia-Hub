/**
 * 測試 PDF 提取
 */
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'fs';
import { extractFile } from './extractors/index.js';

const db = new (await initSqlJs()).Database(readFileSync('data/content.db'));

const result = db.exec(`SELECT title, file_path FROM resources WHERE file_type = 'pdf' LIMIT 1`);
const [title, path] = result[0].values[0];

console.log('=== PDF TEST ===');
console.log('Title:', title);
console.log('Path OK:', existsSync(path));

try {
    const content = await extractFile(path);
    console.log('Length:', content.length);

    const hasChinese = /[\u4e00-\u9fff]/.test(content);
    console.log('Has Chinese:', hasChinese);
    console.log('Sample:', content.substring(0, 100).replace(/\r?\n/g, ' '));
} catch (err) {
    console.log('Error:', err.message);
}
