import fetch from 'node-fetch';

async function recon() {
    const url = 'https://bible.fhl.net/Mar/dic_detail.php?sel=0&key=6.9';
    console.log(`🔍 啟動 3.4.2 深層偵察: ${url}`);
    
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // 物理展示前 2000 字符，鎖定 CSS 位置
        console.log('\n--- ✨ [RAW HTML 前 2000 字符] ---');
        console.log(html.substring(0, 2000));
        console.log('------------------------------------');
        
    } catch (e) {
        console.error('❌ 偵察失敗:', e.message);
    }
}

recon();
