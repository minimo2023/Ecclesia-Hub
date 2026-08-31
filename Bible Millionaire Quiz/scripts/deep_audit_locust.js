import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

async function deepAudit() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    // 物理調閱「蝗蟲」完整內容
    const res = await client.query('SELECT name_zh, description, discussion, symbolism FROM lexicons WHERE name_zh LIKE $1 LIMIT 1', ['%蝗蟲%']);
    
    if (res.rows[0]) {
        const row = res.rows[0];
        const content = `
--- 🔍 [蝗蟲] 深度研究報告 ---
標目: ${row.name_zh}
描述: ${row.description}
討論: ${row.discussion}
象徵: ${row.symbolism}
---------------------------
`;
        fs.writeFileSync('lexicon_readability_sample.txt', content);
        console.log('✅ 已將樣本導出至 lexicon_readability_sample.txt');
    } else {
        console.log('❌ 查無條目');
    }
    
    await client.end();
}

deepAudit().catch(console.error);
