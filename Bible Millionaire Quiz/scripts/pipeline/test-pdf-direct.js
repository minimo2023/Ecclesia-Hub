import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');
// 嘗試不同的導出方式
const pdfParse = pdfModule.default || pdfModule;

console.log('PDF Module type:', typeof pdfModule);
console.log('PDF Parse type:', typeof pdfParse);

const db = new (await initSqlJs()).Database(readFileSync('data/content.db'));
const result = db.exec(`SELECT file_path FROM resources WHERE file_type = 'pdf' LIMIT 1`);
const path = result[0].values[0];

if (existsSync(path)) {
    console.log('File exists, trying parse...');
    try {
        const buffer = readFileSync(path);
        console.log('Buffer size:', buffer.length);

        if (typeof pdfParse === 'function') {
            const data = await pdfParse(buffer);
            console.log('SUCCESS! Text length:', data.text.length);
            console.log('Sample:', data.text.substring(0, 50));
        } else {
            console.log('pdfParse is not a function, available keys:', Object.keys(pdfModule));
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}
