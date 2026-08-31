import { generateDevotional, initDevotionalService } from '../server/services/devotional.js';

async function test() {
    try {
        console.log('🚀 開始驗證 V6.1 雙階管線與作者欄位...');
        initDevotionalService();
        
        // 觸發生成
        const result = await generateDevotional({ targetDate: '2026-04-06' });
        
        console.log('\n--- 驗證結果 ---');
        console.log('日期:', result.dateKey);
        console.log('作者 (Author):', result.content.author);
        console.log('經文 (Scripture):', result.content.scriptureReference);
        console.log('默想長度:', result.content.meditation.length);
        
        if (result.content.author) {
            console.log('✅ 作者欄位已正確帶入');
        } else {
            console.error('❌ 作者欄位缺失');
        }
        
        process.exit(0);
    } catch (e) {
        console.error('❌ 驗證失敗:', e.message);
        process.exit(1);
    }
}

test();
