/**
 * 驗證工具：檢查題目是否來自 bible_verses
 * 
 * 使用方法：
 * 1. 在遊戲中按 F12
 * 2. 在 Console 輸入：window.verifyQuestions()
 * 3. 會顯示每題的來源和驗證結果
 */

// 將驗證函數掛載到 window
window.verifyQuestions = async function () {
    console.log('=== 題目來源驗證工具 ===\n');

    // 從當前遊戲狀態獲取題目（這需要根據實際狀態管理調整）
    const currentQuestions = window.__CURRENT_GAME_QUESTIONS__ || [];

    if (currentQuestions.length === 0) {
        console.warn('⚠️ 找不到當前題目。請確保遊戲已開始。');
        return;
    }

    console.log(`📊 找到 ${currentQuestions.length} 道題目\n`);

    currentQuestions.forEach((q, i) => {
        console.log(`題目 ${i + 1}:`);
        console.log(`  問題：${q.question?.substring(0, 40)}...`);
        console.log(`  來源：${q.source || '未標記'}`);
        console.log(`  書卷：${q.book || '未知'}`);
        console.log(`  章節：${q.chapter || '未知'}`);

        // 驗證標準
        const isValid =
            q.source === 'verse' &&
            q.book &&
            q.chapter &&
            Array.isArray(q.options) &&
            q.options.length === 4;

        if (isValid) {
            console.log(`  ✅ 格式正確 - 來自 bible_verses`);
        } else {
            console.log(`  ❌ 格式異常`);
            console.log(`  詳細資訊：`, JSON.stringify(q, null, 2));
        }
        console.log('');
    });

    // 總結
    const validCount = currentQuestions.filter(q =>
        q.source === 'verse' && q.book && q.chapter && Array.isArray(q.options)
    ).length;

    console.log(`\n📈 驗證結果：${validCount}/${currentQuestions.length} 題目來自 bible_verses`);

    if (validCount === currentQuestions.length) {
        console.log('✅ 所有題目都符合預期！');
    } else {
        console.warn('⚠️ 有題目來源不明或格式錯誤');
    }
};

console.log('✅ 驗證工具已載入！執行 window.verifyQuestions() 來檢查題目來源');
