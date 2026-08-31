import pkg from 'pg';
const { Client } = pkg;
const dbConfig = { connectionString: process.env.DATABASE_URL };

async function run() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('📡 [Map-Point] 正在從地點元數據(dec2)修復地點與地圖之物理關聯...');
    
    const locs = await client.query('SELECT id, metadata FROM locations');
    let count = 0;
    
    for (const row of locs.rows) {
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
        const rawDec2 = meta.raw_maps_dec2 || '';
        
        // 抓取格式如 "$016"
        const gidMatches = rawDec2.match(/\$(\d{3})/g);
        if (gidMatches) {
            for (const m of gidMatches) {
                const gid = m.substring(1);
                try {
                    await client.query(
                        'INSERT INTO location_maps (location_id, map_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [row.id, gid]
                    );
                    count++;
                } catch(e) {}
            }
        }
    }
    console.log(`✅ [Map-Point] 已成功縫合 ${count} 條地圖與地點關聯。`);
    await client.end();
}
run();
