/**
 * Question Storage Module
 * 
 * 職責：
 * - 保存題目到數據庫
 * - 查詢現有題目
 * - 批量操作
 * - 日誌記錄
 */

import { database } from '../database/DatabaseAdapter';
import { COLLECTIONS } from '../../config/collections';

/**
 * 保存生成的題目到數據庫
 * @returns {Object} {saved, duplicates, errors, localSaved}
 */
export async function saveQuestions(questions) {
    console.log(`[Storage] Starting save for ${questions.length} questions...`);

    const savePromises = questions.map(async (q) => {
        try {
            // 檢查重複
            const existing = await database.query(COLLECTIONS.QUESTIONS, {
                book: q.book,
                question: q.question
            });

            if (existing.length === 0) {
                await database.add(COLLECTIONS.QUESTIONS, {
                    ...q,
                    createdAt: Date.now(),
                    verified: false
                });
                console.log(`[Storage] Saved: ${q.question.substring(0, 30)}...`);
                return 'saved';
            } else {
                console.log(`[Storage] Duplicate: ${q.question.substring(0, 30)}...`);
                return 'duplicate';
            }
        } catch (e) {
            console.error(`[Storage Error] ${q.question.substring(0, 30)}...`, e);
            return 'error';
        }
    });

    const results = await Promise.all(savePromises);

    const savedCount = results.filter(r => r === 'saved').length;
    const duplicateCount = results.filter(r => r === 'duplicate').length;
    const errors = results.filter(r => r === 'error').length;

    console.log(`[Storage Complete] Saved: ${savedCount}, Duplicates: ${duplicateCount}, Errors: ${errors}`);

    return { saved: savedCount, duplicates: duplicateCount, errors };
}

/**
 * 從數據庫獲取現有題目（用於防止重複）
 */
export async function getExistingQuestions(books, difficulty) {
    try {
        // 查詢所有該難度的題目
        const allQuestions = await database.query(COLLECTIONS.QUESTIONS, { difficulty });

        // 客戶端過濾書卷
        return allQuestions.filter(q => books.includes(q.book));
    } catch (error) {
        console.error("Error fetching existing questions:", error);
        return [];
    }
}

/**
 * 提交題目回報
 */
export async function reportQuestion(reportData) {
    try {
        await database.add(COLLECTIONS.REPORTS, {
            ...reportData,
            createdAt: Date.now(),
            status: 'pending'
        });
        return true;
    } catch (e) {
        console.error("Error reporting question:", e);
        throw e;
    }
}

/**
 * 記錄 AI 事件（用於監控）
 */
export async function logAIEvent(type, details) {
    try {
        await database.add(COLLECTIONS.AI_LOGS, {
            type,
            details,
            timestamp: Date.now()
        });
    } catch (e) {
        console.warn("Failed to log AI event:", e);
    }
}
