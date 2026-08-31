import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const dbConfig = {
    user: 'dev', host: 'localhost', database: 'bible_quiz_v3',
    password: 'dev123', port: 5432,
};

async function exportReport() {
    const client = new Client(dbConfig);
    await client.connect();
    
    const res = await client.query(`
        SELECT category, key_id, name_zh, name_en, content_raw, image_local 
        FROM lexicons 
        ORDER BY category DESC, key_id ASC
        LIMIT 100
    `);

    let md = '# 聖經百科主權查驗報告 (Lexicon Snapshot)\n\n';
    md += `此文件為資料庫現況之物理對位，共記錄前 ${res.rowCount} 筆百科條目。\n\n`;
    md += '> [!TIP]\n';
    md += '> 建議在 VS Code 中開啟「Markdown Preview (Ctrl+Shift+V)」觀看。\n\n';

    for (const row of res.rows) {
        const catName = row.category === 0 ? '🐘 動物' : (row.category === 1 ? '🌱 植物' : '🏺 物件');
        md += `--- \n\n`;
        md += `## [${catName}] ${row.name_zh} (${row.name_en || 'N/A'})\n`;
        md += `**編號**: \`${row.key_id}\`  \n`;
        
        if (row.image_local) {
            // 注意: Markdown 圖片需要本地路徑引用
            md += `![${row.name_zh}](../public/assets/lexicon/${row.image_local})\n\n`;
        } else {
            md += `*(此條目目前無影像圖存)*\n\n`;
        }

        md += `### 📄 原始百科內容 (RAWS)\n`;
        md += `${row.content_raw.substring(0, 1000)}${row.content_raw.length > 1000 ? '...' : ''}\n\n`;
    }

    fs.writeFileSync('docs/lexicon_sovereignty_report.md', md);
    console.log('✅ 主權報告已物理生成至: docs/lexicon_sovereignty_report.md');
    
    await client.end();
}

exportReport();
