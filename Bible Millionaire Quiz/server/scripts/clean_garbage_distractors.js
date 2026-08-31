import { initializeInfrastructure, dbOps } from '../database/index.js';

async function main() {
    console.log('🧹 開始清理資料庫中的「靜態備用」錯項 (Garbage Distractors)...');

    try {
        await initializeInfrastructure();
        console.log('✅ 資料庫連線成功');

        const query = `
            UPDATE questions 
            SET distractors_pool = NULL 
            WHERE 
                distractors_pool::text LIKE '%以色列%' AND 
                distractors_pool::text LIKE '%大衛%' AND 
                distractors_pool::text LIKE '%摩西%' AND 
                distractors_pool::text LIKE '%迦南地%' AND 
                distractors_pool::text LIKE '%耶路撒冷%';
        `;
        const result = await dbOps.gamesDb.query(query);
        console.log(`✅ 成功清除 Default 備用錯項：${result.rowCount} 題`);

        const queryVerseFact = `
            UPDATE questions 
            SET distractors_pool = NULL 
            WHERE 
                distractors_pool::text LIKE '%舊約時代%' AND 
                distractors_pool::text LIKE '%新約時代%' AND 
                distractors_pool::text LIKE '%曠野中%';
        `;
        const resultVerseFact = await dbOps.gamesDb.query(queryVerseFact);
        console.log(`✅ 成功清除 Verse Fact 備用錯項：${resultVerseFact.rowCount} 題`);

        const queryVerseFill = `
            UPDATE questions 
            SET distractors_pool = NULL 
            WHERE 
                distractors_pool::text LIKE '%大衛的子孫%' AND 
                distractors_pool::text LIKE '%聖靈的恩賜%';
        `;
        const resultVerseFill = await dbOps.gamesDb.query(queryVerseFill);
        console.log(`✅ 成功清除 Verse Fill 備用錯項：${resultVerseFill.rowCount} 題`);

        const queryPerson = `
            UPDATE questions 
            SET distractors_pool = NULL 
            WHERE 
                distractors_pool::text LIKE '%亞伯拉罕%' AND 
                distractors_pool::text LIKE '%以利亞%';
        `;
        const resultPerson = await dbOps.gamesDb.query(queryPerson);
        console.log(`✅ 成功清除 Person 備用錯項：${resultPerson.rowCount} 題`);

        const queryGeography = `
            UPDATE questions 
            SET distractors_pool = NULL 
            WHERE 
                distractors_pool::text LIKE '%埃及%' AND 
                distractors_pool::text LIKE '%巴比倫%' AND 
                distractors_pool::text LIKE '%羅馬%';
        `;
        const resultGeo = await dbOps.gamesDb.query(queryGeography);
        console.log(`✅ 成功清除 Geography 備用錯項：${resultGeo.rowCount} 題`);

        console.log('🎉 所有靜態錯項已清除。下次遊戲遇到這些題目時將會觸發 AI 重新生成。');
    } catch (e) {
        console.error('❌ 執行失敗:', e);
    } finally {
        process.exit(0);
    }
}

main();
