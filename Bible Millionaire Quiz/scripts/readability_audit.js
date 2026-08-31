import pkg from 'pg';
const { Client } = pkg;

async function audit() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    // 物理調閱 3 個不同維度的樣本
    const samples = ['蝗蟲', '無花果', '馬槽'];
    
    for (const name of samples) {
        const res = await client.query('SELECT name_zh, description, discussion, symbolism FROM lexicons WHERE name_zh LIKE $1 LIMIT 1', [`%${name}%`]);
        if (res.rows[0]) {
            const r = res.rows[0];
            console.log(`\n--- 📘 [主權 3.4.3 質感樣測: ${r.name_zh}] ---`);
            console.log(`【描述】: \n${r.description || 'N/A'}`);
            console.log(`\n【討論/用途】: \n${r.discussion || 'N/A'}`);
            if (r.symbolism) console.log(`\n【象徵意義】: \n${r.symbolism}`);
            console.log('-------------------------------------------');
        } else {
            console.log(`❌ 查無條目: ${name}`);
        }
    }
    
    await client.end();
}

audit().catch(console.error);
