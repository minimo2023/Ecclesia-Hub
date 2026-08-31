import fetch from 'node-fetch';

async function poc() {
    const url = 'https://bible.fhl.net/Mar/dic_detail.php?sel=2&key=1.1.1';
    console.log(`🔍 試運行 3.0 結構化解析: ${url}`);
    
    const response = await fetch(url);
    const html = await response.text();
    
    // 物理脫水邏輯
    let clean = html
        .replace(/<a[^>]*>|<\/a>/gi, '') // 移除 a 標籤
        .replace(/\([^\)]*?\d+:\d+[^)]*?\)/g, '') // 移除 (創 1:1)
        .replace(/\[[^\]]*?\d+:\d+[^\]]*?\]/g, '') // 移除 [創 1:1]
        .replace(/<br\s*\/?>/gi, '\n') // 換行
        .replace(/###/g, '\n###'); // 標題分段

    const sections = {
        name: '1.1.1 軛 (Yoke)',
        description: 'N/A',
        usage: 'N/A',
        translation: 'N/A'
    };

    const parts = clean.split('###');
    parts.forEach(part => {
        let p = part.trim();
        if (p.startsWith('描述')) sections.description = p.replace('描述', '').trim().substring(0, 500);
        if (p.startsWith('用途')) sections.usage = p.replace('用途', '').trim().substring(0, 500);
        if (p.startsWith('翻譯')) sections.translation = p.replace('翻譯', '').trim().substring(0, 500);
    });

    console.log('--- ✨ [PoC 成果] 結構化百科數據 ---');
    console.log(JSON.stringify(sections, null, 2));
    console.log('------------------------------------');
}

poc();
