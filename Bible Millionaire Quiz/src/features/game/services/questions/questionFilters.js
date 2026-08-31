/**
 * Question Filters Module
 * 
 * 職責：
 * - 根據條件過濾題目
 * - 合併題目列表
 * - 從靜態題庫補充
 */

import { questions as staticQuestions } from '../../data/questions';

/**
 * 根據書卷和章節過濾題目
 */
export function filterByBooks(questions, bookSelections, history = []) {
    return questions.filter(q => {
        // 排除歷史記錄
        if (history.includes(q.id)) return false;

        // 查找對應的書卷選擇
        const selection = bookSelections.find(s => s.book === q.book);
        if (!selection) return false;

        // 檢查章節範圍
        const qChapter = q.chapter || 1;
        return qChapter >= selection.startChapter && qChapter <= selection.endChapter;
    });
}

/**
 * 根據難度過濾題目
 */
export function filterByDifficulty(questions, difficulty) {
    return questions.filter(q => q.difficulty === difficulty);
}

/**
 * 合併題目列表，避免重複
 */
export function mergeQuestionLists(localList, newItems, history = []) {
    const combined = [...localList];

    newItems.forEach(item => {
        const isDuplicate = combined.some(l => l.question === item.question);
        const inHistory = history.includes(item.id);

        if (!isDuplicate && !inHistory) {
            combined.push(item);
        }
    });

    return combined;
}

/**
 * 從靜態題庫補充題目
 */
export function fillFromStaticQuestions(difficulty, currentList, neededCount, books, excludeList = [], history = []) {
    if (currentList.length >= neededCount) return currentList;

    const missing = neededCount - currentList.length;

    // 策略 1: 嚴格匹配 (書卷 + 難度)
    const staticMatches = staticQuestions.filter(q =>
        books.includes(q.book) &&
        q.difficulty === difficulty &&
        !history.includes(q.id || q.question) &&
        !excludeList.some(ex => ex.question === q.question)
    );

    // 隨機選擇
    const added = staticMatches
        .sort(() => Math.random() - 0.5)
        .slice(0, missing);

    return [...currentList, ...added];
}

/**
 * 隨機排序選項
 */
export function shuffleOptions(questions) {
    return questions.map(q => {
        // Safety check: Skip if options is missing
        if (!q || !Array.isArray(q.options)) {
            console.error('⚠️ [shuffleOptions] Invalid question format:', q);
            return q; // Return unchanged
        }

        return {
            ...q,
            options: [...q.options].sort(() => Math.random() - 0.5)
        };
    });
}
