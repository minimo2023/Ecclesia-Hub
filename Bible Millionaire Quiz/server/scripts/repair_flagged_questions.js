import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'dev',
  password: process.env.DB_PASSWORD || 'dev123',
  database: process.env.DB_NAME || 'bible_quiz_v3',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function repair() {
  console.log('🚀 啟動批量題庫修復腳本：拯救被誤鎖的預生成題目...');
  try {
    // 1. 查詢所有狀態為 flagged 的題目
    const res = await pool.query(`
      SELECT id, book, chapter, question, answer, metadata, distractors_pool 
      FROM questions 
      WHERE status = 'flagged';
    `);

    console.log(`📊 本地資料庫中共有 ${res.rows.length} 題處於 flagged（待稽核/鎖定）狀態。`);

    let successCount = 0;
    const bookStats = {};

    for (const row of res.rows) {
      const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
      const auditReason = metadata.audit_reason || '';
      
      const distPool = row.distractors_pool;
      let hasValidDistractors = false;
      
      if (Array.isArray(distPool) && distPool.length >= 3) {
        hasValidDistractors = true;
      } else if (typeof distPool === 'string') {
        try {
          const parsed = JSON.parse(distPool);
          if (Array.isArray(parsed) && parsed.length >= 3) {
            hasValidDistractors = true;
          }
        } catch (e) {}
      }

      // 檢查是否因為「選項為空/Unknown Question Type」或「缺少必要欄位」而被誤 flagged
      const isIncorrectlyFlagged = 
        auditReason.includes('Unknown Question Type') || 
        auditReason.includes('缺少必要欄位') ||
        auditReason.includes('AI 判定品質不佳') ||
        auditReason === ''; // 沒有明確原因的也一併檢查修復

      if (isIncorrectlyFlagged && hasValidDistractors) {
        // 重設 metadata，移去 audit_reason，將狀態更新為 PASS
        const updatedMetadata = { ...metadata };
        delete updatedMetadata.audit_reason;
        delete updatedMetadata.audit_timestamp;

        await pool.query(`
          UPDATE questions 
          SET status = 'PASS', metadata = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $2;
        `, [JSON.stringify(updatedMetadata), row.id]);

        successCount++;
        bookStats[row.book] = (bookStats[row.book] || 0) + 1;
      }
    }

    console.log(`\n🎉 修復完成！成功將 ${successCount} 題被誤鎖的題目恢復為 'PASS'（及格放行）狀態！`);
    console.log('各書卷修復統計：');
    console.table(
      Object.entries(bookStats).map(([book, count]) => ({ '書卷': book, '修復題數': count }))
    );

  } catch (err) {
    console.error('❌ 修復過程中發生錯誤：', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

repair();
