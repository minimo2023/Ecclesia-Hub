import pkg from 'pg';
const { Client } = pkg;

async function audit() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    // 物理抽檢 3 筆樣本
    const res = await client.query('SELECT name_zh, description, discussion, symbolism FROM lexicons ORDER BY created_at DESC LIMIT 3');
    
    console.log('\n--- ✨ [百科主權 3.4: 首批採集品質鑑定報告] ---');
    res.rows.forEach(row => {
        console.log(`\n【標目】: ${row.name_zh}`);
        console.log(`[描述主體]: ${row.description?.substring(0, 200)}...`);
        if (row.discussion) console.log(`[考證討論]: ${row.discussion?.substring(0, 200)}...`);
        if (row.symbolism) console.log(`[神學象徵]: ${row.symbolism?.substring(0, 200)}...`);
        console.log('-------------------------------------------');
    });
    
    await client.end();
}

audit().catch(console.error);
