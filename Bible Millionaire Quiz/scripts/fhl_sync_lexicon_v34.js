import pkg from 'pg';
const { Client } = pkg;
import fetch from 'node-fetch';

// 資料庫配置
const dbConfig = {
    connectionString: process.env.DATABASE_URL
};

/**
 * 核心整理函數 (Core Cleanup): 物理去噪不失原味 (3.4.2 終極版)
 */
function cleanProse(text) {
    if (!text) return '';
    
    // 1. 全域物理去噪 (不分區塊)
    let c = text
        .replace(/<style[\s\S]*?<\/style>/gi, '') 
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<head[\s\S]*?<\/head>/gi, '') // 物理移除頭部殘留
        .replace(/<a[^>]*>.*?<\/a>/gi, '') 
        .replace(/<[^>]+>/g, '') 
        .replace(/[\(\[\（\【][^\)\}\）\ \n]*?\d+:\d+[^)\}\）\ \n]*?[\)\}\）\ \】]/g, '') // 物理對位移除經文坐標
        .replace(/&nbsp;/g, ' ')
        .replace(/　/g, '')
        .replace(/\r/g, '')
        .replace(/\n\s*\n/g, '\n');

    // 2. 物理剔除隱形 CSS (樣式殘留對位)
    c = c.replace(/[a-z0-9\-]+\s*\{[\s\S]*?\}/gi, ''); // 物理清除 body { ... } 類代碼
    c = c.replace(/[a-z0-0\-]+\s*:[^;]+;/gi, ''); // 物理清除 font-size: 24px; 類殘留

    return c.trim();
}

/**
 * 章節切段器 (Section Splitter): 利用 H3 物理分割
 */
function splitSections(html) {
    const sections = {
        description: '',
        discussion: '',
        symbolism: '',
        translation_notes: ''
    };

    // 物理全域清理第一遍
    const preCleaned = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
    
    // 物理切割
    const parts = preCleaned.split(/<h3>/gi);

    parts.forEach(part => {
        const p = part.trim();
        if (!p) return;
        
        // 物理章節識別規約
        const cleanedPart = cleanProse(p);
        
        if (p.startsWith('描述')) {
            sections.description = cleanedPart.replace(/^描述\s*/, '');
        } else if (p.startsWith('討論') || p.startsWith('用途') || p.startsWith('描述和用途')) {
            sections.discussion = (sections.discussion ? sections.discussion + '\n\n' : '') + 
                cleanedPart.replace(/^(討論|用途|描述和用途)\s*/, '');
        } else if (p.startsWith('特殊意義') || p.startsWith('特殊意義或象徵意義')) {
            sections.symbolism = cleanedPart.replace(/^(特殊意義或象徵意義|特殊意義)\s*/, '');
        } else if (p.startsWith('翻譯') || p.startsWith('註')) {
            sections.translation_notes += (sections.translation_notes ? '\n' : '') + cleanedPart.replace(/^(翻譯|註)\s*/, '');
        }
    });

    return sections;
}

/**
 * 單一條目同步 (Atomic Entry Sync)
 */
async function syncEntry(client, category, keyId, nameZh) {
    // 物理過濾：跳過非葉子節點 (目錄)
    if (!keyId.includes('.') || keyId.endsWith('.0')) {
        // console.log(`⏭️  跳過目錄節點: ${keyId}`);
        return;
    }

    const url = `https://bible.fhl.net/Mar/dic_detail.php?sel=${category}&key=${keyId}`;
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        const sections = splitSections(html);

        // 如果連基本的描述都沒抓到，嘗試從全文抓取
        if (!sections.description && html.includes('內容')) {
             sections.description = cleanProse(html.substring(html.indexOf('內容')).replace(/<[^>]+>/g, '').split('###')[0]);
        }

        await client.query(
            `INSERT INTO lexicons (category, key_id, name_zh, description, discussion, symbolism, translation_notes, content_raw) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (category, key_id) DO UPDATE 
             SET name_zh = EXCLUDED.name_zh, 
                 description = EXCLUDED.description, 
                 discussion = EXCLUDED.discussion, 
                 symbolism = EXCLUDED.symbolism,
                 translation_notes = EXCLUDED.translation_notes,
                 content_raw = EXCLUDED.content_raw`,
            [category, keyId, nameZh, sections.description, sections.discussion, sections.symbolism, sections.translation_notes, '3.4_CLEANED_SVR']
        );
        console.log(`✅ 已採集: [${category}] ${keyId} ${nameZh}`);
    } catch (e) {
        console.error(`❌ 同步失敗 ${keyId}:`, e.message);
    }
}

/**
 * 主執行程序 (Main Run): 三類別合流
 */
async function main() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('🚀 啟動聖經百科主權 3.4 全量純淨採集 (動物/植物/物件)');

    const categories = [0, 1, 2]; // 0:動物, 1:植物, 2:物件
    
    for (const cat of categories) {
        console.log(`\n📂 開始同步類別: ${cat === 0 ? '動物' : cat === 1 ? '植物' : '物件'}`);
        const listUrl = `https://bible.fhl.net/Mar/dic_show.php?sel=${cat}`;
        
        try {
            const res = await fetch(listUrl);
            const html = await res.text();
            
            // 物理掃描目錄頁
            const linkRegex = /dic_detail\.php\?sel=(\d+)&key=([\d\.]+)">([^<]+)<\/a>/g;
            let match;
            const entries = [];
            while ((match = linkRegex.exec(html)) !== null) {
                entries.push({ cat: parseInt(match[1]), key: match[2], name: match[3] });
            }

            console.log(`📊 找到實體候選筆數: ${entries.length}`);

            // 分批併發採集 (避免 FHL 封鎖)
            for (let i = 0; i < entries.length; i++) {
                await syncEntry(client, entries[i].cat, entries[i].key, entries[i].name);
                // 物理節流
                if (i % 10 === 0) await new Promise(r => setTimeout(r, 500));
            }
        } catch (e) {
            console.error(`❌ 類別 ${cat} 掃描失敗:`, e.message);
        }
    }

    console.log('\n🏁 聖經百科主權 3.4 採集任務完成。');
    await client.end();
}

main().catch(console.error);
