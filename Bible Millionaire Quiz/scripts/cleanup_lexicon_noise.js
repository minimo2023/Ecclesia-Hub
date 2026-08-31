import pkg from 'pg';
const { Client } = pkg;

const dbConfig = {
    user: 'dev', host: 'localhost', database: 'bible_quiz_v3',
    password: 'dev123', port: 5432,
};

async function cleanup() {
    const client = new Client(dbConfig);
    await client.connect();
    
    console.log('🧹 啟動物理淨化：正在剷除辭典內的導航噪音...');
    
    // 鎖定所有 0 開頭 (目錄類)、12 部分 (參考書目類) 或含關鍵字的噪音
    const res = await client.query(`
        DELETE FROM lexicons 
        WHERE key_id LIKE '0%' 
           OR key_id = '12'
           OR name_zh LIKE '%目錄%' 
           OR name_zh LIKE '%介紹%'
           OR name_zh LIKE '%參考書目%'
    `);
    
    console.log(`✅ 清理完畢：共物理擦除 ${res.rowCount} 筆非百科條目。`);
    await client.end();
}

cleanup();
