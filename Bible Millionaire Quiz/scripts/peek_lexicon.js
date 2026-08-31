import pkg from 'pg';
const { Client } = pkg;

const dbConfig = {
    user: 'dev', host: 'localhost', database: 'bible_quiz_v3',
    password: 'dev123', port: 5432,
};

async function peek() {
    const client = new Client(dbConfig);
    await client.connect();
    
    console.log('--- 📋 聖經百科主權現狀抽檢 ---');
    
    // 抽檢 3 個分類的不同條目
    const res = await client.query(`
        (SELECT '🐘 動物' as type, name_zh, name_en, LEFT(content_raw, 300) as content, image_local 
         FROM lexicons WHERE category = 0 LIMIT 1)
        UNION ALL
        (SELECT '🏺 物件' as type, name_zh, name_en, LEFT(content_raw, 300) as content, image_local 
         FROM lexicons WHERE category = 2 AND name_zh = '軛' LIMIT 1)
        UNION ALL
        (SELECT '🌱 植物' as type, name_zh, name_en, LEFT(content_raw, 300) as content, image_local 
         FROM lexicons WHERE category = 1 LIMIT 1)
    `);

    for (const row of res.rows) {
        console.log(`\n【${row.type}】 ${row.name_zh} (${row.name_en || '無英文名'})`);
        console.log(`🖼️  影像路徑: ${row.image_local || '無影像'}`);
        console.log(`📄 原始採集內容 (前 300 字):`);
        console.log(`--------------------------------------------------`);
        console.log(row.content);
        console.log(`--------------------------------------------------`);
    }

    await client.end();
}

peek();
