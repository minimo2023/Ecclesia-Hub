import pkg from 'pg';
const { Client } = pkg;

const dbConfig = {
    user: 'dev',
    host: 'localhost',
    database: 'bible_quiz_v3',
    password: 'dev123',
    port: 5432,
};

async function verify() {
    const client = new Client(dbConfig);
    await client.connect();
    
    console.log('🔍 正在檢取資料庫數據以驗證編碼...');
    const res = await client.query("SELECT key_id, name_zh FROM lexicons WHERE key_id IN ('1.1.1', '1.1.10', '1');");
    
    for (const row of res.rows) {
        const text = row.name_zh;
        console.log(`\n📌 Key: ${row.key_id}`);
        console.log(`   Internal UTF-16: ${text}`);
        
        // 輸出 16 進位以判定原始位元組
        const buf = Buffer.from(text, 'utf-8');
        console.log(`   UTF-8 Hex: ${buf.toString('hex').match(/.{1,2}/g).join(' ')}`);
        
        // 嘗試常見錯誤修復 (Big5 -> UTF8 誤轉)
        try {
            const recovery = Buffer.from(text, 'binary').toString('utf8');
            console.log(`   Recovery Try: ${recovery}`);
        } catch(e) {}
    }
    
    await client.end();
}

verify();
