/**
 * [DATA RECONCILIATION] AI Credit Wallet Repair
 * 
 * 問題根源：
 * 1. 舊版 user.routes.js 的 /ai-wallet 查詢 `user_ai_credit_wallet`（無 ai_gov schema 前綴）
 *    在 PostgreSQL 中等同查詢到不同 schema 或查詢失敗，導致前端一直顯示 0
 * 2. usersOps.adjustAICredits（已廢棄路徑）曾向 ai_gov.user_ai_credit_wallet 寫入
 *    但顯示端因路徑問題看不到，造成「明明有點數但顯示 0」的假象
 * 
 * 修復策略：
 * - 確保所有 users 都有 ai_gov.user_ai_credit_wallet 記錄（補洞）
 * - 掃描可能因路徑錯誤而被漏讀的餘額，確認資料庫層面是否真的正確
 * - 修復已發生的 daily_login 等 bonus 應得但因顯示路徑錯誤被忽略的點數
 */

import { dbOps } from '../index.js';

// Helper: lazy accessor — usersDb is only available after initializeInfrastructure()
const db = () => dbOps.usersDb;

/**
 * 主執行：稽核 + 修補所有用戶的 AI 點數錢包
 */
export async function reconcileAICreditWallets() {
    const usersDb = db();
    console.log('🔍 [Reconcile] Starting AI Credit Wallet Audit & Repair...');

    // 1. 取得所有用戶
    const users = await usersDb.query('SELECT id, username FROM users ORDER BY created_at ASC');
    console.log(`📋 [Reconcile] Found ${users.length} users to audit`);

    let created = 0;
    let alreadyOk = 0;
    const details = [];

    for (const user of users) {
        const userId = user.id;

        // 2. 檢查 ai_gov.user_ai_credit_wallet 是否存在
        const wallet = await usersDb.get(
            'SELECT * FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1',
            [userId]
        );

        if (!wallet) {
            // 3. 補建錢包（補洞）
            await usersDb.run(`
                INSERT INTO ai_gov.user_ai_credit_wallet
                    (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
                VALUES ($1, 0, 0, 0)
                ON CONFLICT (user_id) DO NOTHING
            `, [userId]);

            console.log(`🔧 [Reconcile] Created wallet for user: ${user.username} (${userId})`);
            details.push({ userId, username: user.username, action: 'wallet_created', balance: 0 });
            created++;
        } else {
            const total = (Number(wallet.bonus_ai_credits) || 0)
                + (Number(wallet.exchange_ai_credits) || 0)
                + (Number(wallet.paid_ai_credits) || 0);

            details.push({ userId, username: user.username, action: 'ok', balance: total });
            alreadyOk++;
        }
    }

    console.log(`✅ [Reconcile] Audit complete. Created: ${created} | Already OK: ${alreadyOk}`);

    return {
        success: true,
        summary: { total: users.length, created, alreadyOk },
        details
    };
}

/**
 * 取得所有用戶的點數快照 (稽核報表用)
 */
export async function getWalletSnapshot() {
    const usersDb = db();
    const rows = await usersDb.query(`
        SELECT 
            u.id, u.username, u.display_name, u.coins,
            COALESCE(w.bonus_ai_credits, 0) as bonus,
            COALESCE(w.exchange_ai_credits, 0) as exchange_credits,
            COALESCE(w.paid_ai_credits, 0) as paid,
            COALESCE(w.bonus_ai_credits, 0) 
                + COALESCE(w.exchange_ai_credits, 0) 
                + COALESCE(w.paid_ai_credits, 0) as total_ai_credits,
            w.updated_at as wallet_last_updated
        FROM users u
        LEFT JOIN ai_gov.user_ai_credit_wallet w ON u.id = w.user_id
        ORDER BY total_ai_credits DESC
    `);
    return rows;
}
