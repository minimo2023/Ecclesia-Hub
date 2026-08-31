/**
 * Question Validation Module
 * 
 * 職責：
 * - 重複檢測（Jaccard 相似度）
 * - 題目格式驗證
 */

import { COLLECTIONS } from '../../config/collections';

/**
 * 標準化文本用於比較
 */
function normalizeText(str) {
    // 安全檢查：處理 null/undefined
    if (!str || typeof str !== 'string') {
        console.warn('⚠️ normalizeText received invalid input:', str);
        return '';
    }
    return str.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
}

/**
 * 計算兩個文本的 Jaccard 相似度
 */
export function calculateSimilarity(text1, text2) {
    const setA = new Set(text1.split(''));
    const setB = new Set(text2.split(''));

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}

/**
 * 檢查題目是否與現有題目重複
 * @param {Object} newQuestion - 新題目
 * @param {Array} existingQuestions - 現有題目列表
 * @param {Object} options - 選項
 * @param {number} options.threshold - 相似度閾值（默認 0.6）
 * @param {boolean} options.singleChapterMode - 單卷單章模式（放寬限制）
 * @returns {boolean} 是否重複
 */
export function isDuplicate(newQuestion, existingQuestions, options = {}) {
    const { threshold = 0.6, singleChapterMode = false } = options;

    // 輸入驗證
    if (!newQuestion || !newQuestion.question) {
        console.warn('⚠️ isDuplicate received invalid newQuestion:', newQuestion);
        return false; // 無效題目不算重複，讓後續驗證處理
    }

    if (!existingQuestions || existingQuestions.length === 0) return false;

    const newText = normalizeText(newQuestion.question);

    // 單卷單章模式：只擋「幾乎完全相同」的題目 (95% 相似度)
    const effectiveThreshold = singleChapterMode ? 0.95 : threshold;

    return existingQuestions.some(existing => {
        // 跳過無效的現有題目
        if (!existing || !existing.question) {
            return false;
        }

        const existingText = normalizeText(existing.question);

        // 完全相同
        if (newText === existingText) return true;

        // 相似度檢測
        const similarity = calculateSimilarity(newText, existingText);

        if (similarity > effectiveThreshold) {
            console.warn(`⚠️ Duplicate detected (${(similarity * 100).toFixed(1)}%):`, {
                new: newQuestion.question,
                existing: existing.question,
                similarity,
                mode: singleChapterMode ? 'single-chapter' : 'normal'
            });
            return true;
        }

        return false;
    });
}

/**
 * 驗證題目格式是否正確
 */
export function validateQuestion(question) {
    const errors = [];

    // 必填字段
    if (!question.question) errors.push('缺少題目文本');
    if (!question.book) errors.push('缺少書卷');
    if (!question.difficulty) errors.push('缺少難度');
    if (!question.answer) errors.push('缺少正確答案');

    // 選項驗證
    if (!Array.isArray(question.options)) {
        errors.push('選項必須是陣列');
    } else {
        if (question.options.length !== 4) {
            errors.push('必須有4個選項');
        }

        // 答案必須在選項中
        if (!question.options.includes(question.answer)) {
            errors.push('正確答案必須在選項中');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}
