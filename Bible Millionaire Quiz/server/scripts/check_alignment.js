
import { ContentManager } from '../services/ContentManager.js';
import { bibleTranslator } from '../utils/bibleTranslator.js';
import { dbOps, initializeInfrastructure } from '../database/index.js';

async function testAlignment() {
    console.log('🚀 [Test] Starting Sovereign Alignment Verification v3...');
    
    try {
        // 0. 初始化基礎設施
        console.log('🔋 Initializing infrastructure...');
        await initializeInfrastructure();
        
        // 1. 設定 ContentManager
        console.log('🔗 Linking ContentManager to contentDb...');
        ContentManager.db = dbOps.contentDb; 
        ContentManager.initialized = true; 

        // 2. 測試書卷代碼轉換
        const book = '啟示錄';
        const code = bibleTranslator.toShortCode(book);
        console.log(`📍 Mapping: ${book} -> ${code} (ShortCode)`);

        // 3. 測試經文讀取
        console.log('📖 Testing getChapterVerses...');
        const verses = await ContentManager.getChapterVerses(book, 1, 'unv');
        console.log(`✅ verses.length: ${verses ? verses.length : 'NULL'}`);
        
        if (verses && verses.length > 0) {
            console.log(`📝 Text sample: ${verses[0].text.substring(0, 40)}...`);
        } else {
            console.warn('⚠️ No verses found for', book, 'Ch.1 (ShortCode:', code, ')');
        }

        // 4. 測試 QuestionContext
        console.log('🔍 Testing getQuestionContext Orchestration...');
        const context = await ContentManager.getQuestionContext(book, 1, 1);
        console.log(`✅ context.has_db_data: ${context.has_db_data}`);
        console.log(`🗺️ context.geography found: ${context.geography.length}`);
        
        console.log('🏁 Verification Complete!');
    } catch (error) {
        console.error('❌ CRITICAL ERROR in testAlignment:', error);
    } finally {
        process.exit(0);
    }
}

testAlignment();
