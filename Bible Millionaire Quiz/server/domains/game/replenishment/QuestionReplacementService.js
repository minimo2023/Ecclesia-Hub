import { dbOps } from '../../../database/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * 題庫漸進換血服務 (Phase 6)
 * 負責在新增乾淨新題時，挑選並退役(RETIRED)對應的一題舊題，以保持題庫動態平衡。
 */
export const QuestionReplacementService = {
    /**
     * 替換一題舊題
     * @param {Object} newQuestion - 剛入庫的新題
     * @returns {Promise<Object|null>} 退役的舊題紀錄，若無則回傳 null
     */
    async replaceOneOldQuestionFor(newQuestion) {
        if (!newQuestion || newQuestion.status !== 'PASS' || newQuestion.final_difficulty_score == null) {
            logger.info(`[Replacement] Skipped. New question ${newQuestion.id} is not PASS or lacks final score.`);
            return null;
        }

        const replacementTargetId = newQuestion.replaces_question_id || newQuestion.replacesQuestionId;
        if (!replacementTargetId) {
            logger.info(`[Replacement] Skipped. New question ${newQuestion.id} has no explicit replacement target.`);
            return null;
        }

        try {
            const findSql = `
                SELECT id, question, category, final_difficulty_score, quality, book, chapter, version, difficulty_band
                FROM questions
                WHERE id = $1
                  AND status = 'PASS'
                  AND book = $2
                  AND chapter = $3
                  AND version = $4
                  AND category = $5
                  AND difficulty_band = $6
            `;

            // 直接呼叫底層 DB 執行查詢
            const { pool } = dbOps.gamesDb; // 取得 pg pool 或底層 db
            let rows;
            
            if (pool) {
                const res = await pool.query(findSql, [
                    replacementTargetId,
                    newQuestion.book,
                    newQuestion.chapter,
                    newQuestion.version,
                    newQuestion.category,
                    newQuestion.difficulty_band
                ]);
                rows = res.rows;
            } else {
                // 若 dbOps 沒暴露 pool，則嘗試透過 query 傳遞
                rows = await dbOps.gamesDb.query(findSql, [
                    replacementTargetId,
                    newQuestion.book,
                    newQuestion.chapter,
                    newQuestion.version,
                    newQuestion.category,
                    newQuestion.difficulty_band
                ]);
            }

            if (!rows || rows.length === 0) {
                logger.info(`[Replacement] Skipped. No eligible old questions found to retire.`);
                return null;
            }

            const oldQ = rows[0];

            // 執行退役操作，不硬刪，改 status = RETIRED
            const retireSql = `
                UPDATE questions 
                SET status = 'RETIRED', quality_state = 'RETIRED', updated_at = NOW() 
                WHERE id = $1
            `;
            
            if (pool) {
                await pool.query(retireSql, [oldQ.id]);
            } else {
                await dbOps.gamesDb.query(retireSql, [oldQ.id]);
            }

            logger.info(`[Replacement] Retired old question ${oldQ.id} ("${oldQ.question.substring(0,15)}...") in favor of new question ${newQuestion.id}.`);
            
            return {
                retired_id: oldQ.id,
                reason: 'Replaced by new generation'
            };

        } catch (error) {
            logger.error(`[Replacement] Failed to replace old question: ${error.message}`);
            return null; // 不報錯阻斷主流程
        }
    }
};
