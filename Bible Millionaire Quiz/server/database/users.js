/**
 * 用戶資料庫操作 (Users & Economy)
 * User Database Operations (profile, coins, ai_credits)
 */
import crypto from 'crypto';
import { LogosBank } from './services/LogosBankService.js';

/**
 * 建立用戶操作模組
 * @param {DatabaseAdapter} usersDb - Async Database Adapter
 */
export function createUsersOps(usersDb) {
    return {
        /**
         * 取得用戶資料
         */
        async getUser(userId) {
            try {
                const user = await usersDb.get('SELECT * FROM users WHERE id = ?', [userId]);
                if (user) {
                    const balances = await LogosBank.getBalances(userId);
                    user.ai_credits = balances.aiCredits;
                }
                return user;
            } catch (error) {
                console.error('[UsersOps] getUser error:', error);
                return null;
            }
        },

        /**
         * @deprecated [SOVEREIGN v3.5] Use LogosBank.adjustAssets('AI_CREDIT') via dbOps.adjustAICredits instead.
         */
        async adjustAICredits(userId, pool, amount, reason, correlationId = null) {
            console.warn(`⚠️ [DEPRECATED] usersOps.adjustAICredits called for ${userId}. Use LogosBank instead.`);
            try {
                // 1. 取得目前餘額
                const wallet = await usersDb.get('SELECT bonus_ai_credits, exchange_ai_credits, paid_ai_credits FROM ai_gov.user_ai_credit_wallet WHERE user_id = ?', [userId]);
                if (!wallet) throw new Error('Wallet not found in ai_gov');

                const poolColumn = `${pool}_ai_credits`;
                const currentBalance = wallet[poolColumn] || 0;
                const newBalance = Math.max(0, currentBalance + amount);
                const actualChange = newBalance - currentBalance;

                // 2. 更新錢包
                await usersDb.run(`
                    UPDATE ai_gov.user_ai_credit_wallet 
                    SET ${poolColumn} = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE user_id = ?
                `, [newBalance, userId]);

                // 3. 寫入總帳 (Ledger)
                const totalBalanceAfter = (wallet.bonus_ai_credits + wallet.exchange_ai_credits + wallet.paid_ai_credits + actualChange);
                await usersDb.run(`
                    INSERT INTO ai_gov.ai_credit_ledger (user_id, amount, credit_pool, reason, balance_after, total_balance_after, correlation_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [userId, actualChange, pool, reason, newBalance, totalBalanceAfter, correlationId]);

                return newBalance;
            } catch (error) {
                console.error('[UsersOps] adjustAICredits error:', error);
                throw error;
            }
        },

        /**
         * 記錄 AI 使用日誌 (V2 with Model ID)
         */
        async logAIUsage(userId, moduleName, promptTokens, completionTokens, costTwd, modelId = null, correlationId = null) {
            try {
                // 'system' 不是真實使用者，FK 約束不允許，改存 NULL
                const safeUserId = (!userId || userId === 'system') ? null : userId;
                await usersDb.run(`
                    INSERT INTO ai_gov.ai_usage_logs (user_id, module_name, prompt_tokens, completion_tokens, total_cost_twd, model_id, correlation_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [safeUserId, moduleName, promptTokens, completionTokens, costTwd, modelId, correlationId]);
            } catch (error) {
                console.error('[UsersOps] logAIUsage error:', error);
            }
        },

        /**
         * [SOVEREIGN v3] 原子化金幣調整
         * @deprecated 請改用 LogosBank.adjustAssets(userId, 'COIN', delta, reason) 或 dbOps.adjustCoins()
         * 此函式仍可用，但已由 index.js 中的 dbOps.adjustCoins shim 接管，不應再直接呼叫本函式。
         */
        async adjustCoins(userId, delta, reason = 'adjustment') {
            const numericDelta = Number(delta);
            if (!Number.isFinite(numericDelta)) {
                throw new Error(`[adjustCoins] Invalid delta value: ${delta}`);
            }

            const result = await usersDb.get(
                'UPDATE users SET coins = GREATEST(0, coins + $1) WHERE id = $2 RETURNING coins',
                [numericDelta, userId]
            );

            if (!result) {
                throw new Error(`[adjustCoins] User not found: ${userId}`);
            }

            const newBalance = Number(result.coins); // 強制轉型，防禦 PG 驅動程式回傳字串

            // 非同步記帳，不阻塞主流程
            this.recordCoinChange(userId, numericDelta, reason, newBalance)
                .catch(e => console.error('[adjustCoins] Ledger write failed (non-critical):', e.message));

            console.log(`💰 [adjustCoins] ${userId}: ${numericDelta >= 0 ? '+' : ''}${numericDelta} → balance=${newBalance}`);
            return { newBalance };
        },

        /**
         * [SOVEREIGN v3] 強制設定金幣數值 (管理員專用)
         */
        async setCoins(userId, amount, reason = 'admin_set') {
            const numericAmount = Math.max(0, Number(amount));

            // 先取舊值以計算差額，讓帳本記錄正確的 delta（而非 0）
            const before = await usersDb.get('SELECT coins FROM users WHERE id = $1', [userId]);
            const oldBalance = Number(before?.coins || 0);

            const result = await usersDb.get(
                'UPDATE users SET coins = $1 WHERE id = $2 RETURNING coins',
                [numericAmount, userId]
            );

            if (!result) throw new Error(`[setCoins] User not found: ${userId}`);
            
            const newBalance = Number(result.coins);
            const delta = newBalance - oldBalance; // 正確差額，讓加總能還原真實餘額
            this.recordCoinChange(userId, delta, `${reason} (set to ${newBalance})`, newBalance)
                .catch(e => console.error('[setCoins] Ledger write failed:', e.message));

            return { newBalance };
        },

        /**
         * 記錄金幣變動
         */
        async recordCoinChange(userId, amount, reason, balanceAfter) {
            try {
                if (!userId || amount === undefined) {
                    console.warn('⚠️ [UsersOps] Missing params for recordCoinChange:', { userId, amount });
                    return;
                }

                const result = await usersDb.run(`
                    INSERT INTO coin_ledger (user_id, amount, reason, balance_after, created_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [userId, amount, reason || 'unknown', balanceAfter || 0]);

                if (result.changes > 0) {
                    console.log(`📝 [Ledger] Coin change recorded: ${userId} (${amount > 0 ? '+' : ''}${amount}) reason: ${reason}`);
                } else {
                    console.warn(`⚠️ [Ledger] Record attempt failed (no changes): ${userId}`);
                }
            } catch (error) {
                console.error('❌ [UsersOps] recordCoinChange critical error:', error.message);
                // We do not throw here to prevent game-breaking if ledger fails
            }
        },

        /**
         * 取得金幣帳單
         */
        async getCoinLedger(userId, limit = 50) {
            try {
                return await usersDb.query(`
                    SELECT * FROM coin_ledger 
                    WHERE user_id = ? 
                    ORDER BY created_at DESC 
                    LIMIT ?
                `, [userId, limit]);
            } catch (error) {
                console.error('[UsersOps] getCoinLedger error:', error);
                return [];
            }
        },

        /**
         * 取得 AI 額度變動歷史
         */
        async getAICreditLedger(userId, limit = 50) {
            try {
                return await usersDb.query(`
                    SELECT * FROM ai_gov.ai_credit_ledger 
                    WHERE user_id = ? 
                    ORDER BY created_at DESC 
                    LIMIT ?
                `, [userId, limit]);
            } catch (error) {
                console.error('[UsersOps] getAICreditLedger error:', error);
                return [];
            }
        },

        /**
         * 取得經濟系統總體統計
         */
        async getEconomyTotalStats() {
            try {
                const coinsRes = await usersDb.get('SELECT SUM(coins) as total FROM users');
                const totalCoins = coinsRes?.total ? parseInt(coinsRes.total) : 0;

                const creditsRes = await usersDb.get(`
                    SELECT 
                        SUM(bonus_ai_credits) as bonus, 
                        SUM(exchange_ai_credits) as exchange, 
                        SUM(paid_ai_credits) as paid 
                    FROM ai_gov.user_ai_credit_wallet
                `);

                return {
                    totalCoins,
                    totalAiCredits: Math.floor((creditsRes?.bonus || 0) + (creditsRes?.exchange || 0) + (creditsRes?.paid || 0)),
                    breakdown: {
                        bonus: Math.floor(creditsRes?.bonus || 0),
                        exchange: Math.floor(creditsRes?.exchange || 0),
                        paid: Math.floor(creditsRes?.paid || 0)
                    }
                };
            } catch (error) {
                console.error('[UsersOps] getEconomyTotalStats error:', error);
                return { totalCoins: 0, totalAiCredits: 0 };
            }
        },

        /**
         * 取得 AI 模型配置
         */
        async getAIModelConfigs() {
            try {
                return await usersDb.query('SELECT * FROM ai_gov.ai_model_config ORDER BY model_id ASC');
            } catch (error) {
                console.error('[UsersOps] getAIModelConfigs error:', error);
                return [];
            }
        },

        /**
         * 更新 AI 模型配置
         */
        async updateAIModelConfig(modelId, data) {
            try {
                const { friendly_name, input_price_per_1k_points, output_price_per_1k_points, is_active } = data;
                await usersDb.run(`
                    UPDATE ai_gov.ai_model_config 
                    SET friendly_name = ?, 
                        input_price_per_1k_points = ?, 
                        output_price_per_1k_points = ?, 
                        is_active = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE model_id = ?
                `, [friendly_name, input_price_per_1k_points, output_price_per_1k_points, is_active ? true : false, modelId]);
                return true;
            } catch (error) {
                console.error('[UsersOps] updateAIModelConfig error:', error);
                return false;
            }
        },

        /**
         * 取得 AI 使用量統計 (依模型)
         */
        async getAIUsageStats(days = 30) {
            try {
                return await usersDb.all(`
                    SELECT 
                        module_name as model_id, 
                        COUNT(*) as request_count,
                        SUM(prompt_tokens) as total_prompt_tokens,
                        SUM(completion_tokens) as total_completion_tokens,
                        SUM(total_cost_twd) as total_credits_spent
                    FROM ai_gov.ai_usage_logs
                    WHERE created_at >= NOW() - INTERVAL '${days} days'
                    GROUP BY module_name
                    ORDER BY total_credits_spent DESC
                `);
            } catch (error) {
                console.error('[UsersOps] getAIUsageStats error:', error);
                return [];
            }
        },

        /**
         * 補洞：確保現有用戶都有 AI 錢包
         */
        async backfillAICreditWallets() {
            try {
                const result = await usersDb.run(`
                    INSERT INTO ai_gov.user_ai_credit_wallet (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
                    SELECT id, 0, 0, 0 FROM users
                    WHERE id NOT IN (SELECT user_id FROM ai_gov.user_ai_credit_wallet)
                `);
                return result?.rowCount || 0;
            } catch (e) {
                console.error('[UsersOps] backfill error:', e.message);
                return 0;
            }
        },

        /**
         * [SOVEREIGN v3] 處理每日登入獎勵
         * 執行資料庫時區判定 (Asia/Taipei)，確保跨日判定準確。
         */
        async handleDailyBonus(userId) {
            // 1. 取得獎勵設定 (預設 5)
            let bonusAmount = 5;
            try {
                // 這裡暫時維持讀取 gamesDb 設定
                // 注意：usersOps 若需要讀取 gamesDb 需要全域 gamesDb 實例
                // 由於 usersOps 初始化時只拿了 usersDb，我們改用 usersDb 的 system_settings (若有) 或預設值
                bonusAmount = 5; 
            } catch (e) { console.warn('Daily bonus config load failed, using default: 5'); }

            // 2. 執行領取判定與金幣調整 (原子化)
            return await usersDb.transaction(async (tx) => {
                const bonusEligible = await tx.get(
                    `SELECT id FROM users WHERE id = $1
                     AND (last_login IS NULL
                          OR (last_login AT TIME ZONE 'Asia/Taipei')::date < (NOW() AT TIME ZONE 'Asia/Taipei')::date)`,
                    [userId]
                );

                if (!bonusEligible) return { awarded: 0 };

                // 領取獎勵
                const result = await tx.get(
                    'UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins',
                    [bonusAmount, userId]
                );

                const newBalance = Number(result.coins);

                // 異步記帳
                this.recordCoinChange(userId, bonusAmount, 'daily_login', newBalance)
                    .catch(e => console.error('[DailyBonus] Ledger failure:', e.message));

                return { awarded: bonusAmount, newBalance };
            });
        },

        /**
         * @deprecated [SOVEREIGN v3.5] Use LogosBank.exchange() via dbOps.exchangeCoinsToCredits instead.
         * [SOVEREIGN v3] 原子化：金幣兌換 AI 點數
         * 確保扣款與加點在同一個事務中完成，防止數值漂移。
         */
        async exchangeCoinsToCredits(userId, aiCreditsToBuy, exchangeRate = 50) {
            console.warn(`⚠️ [DEPRECATED] usersOps.exchangeCoinsToCredits called for ${userId}. Use LogosBank instead.`);
            const totalCost = aiCreditsToBuy * exchangeRate;
            
            return await usersDb.transaction(async (tx) => {
                // 1. 扣除金幣 (原子化檢核餘額)
                const coinResult = await tx.get(
                    'UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1 RETURNING coins',
                    [totalCost, userId]
                );

                if (!coinResult) {
                    throw new Error('金幣餘額不足或用戶不存在');
                }

                const newCoinBalance = Number(coinResult.coins);

                // 2. 增加 AI 點數 (匯入 exchange 資金池)
                // 嘗試更新，如果不存在則插入
                const walletResult = await tx.get(`
                    INSERT INTO ai_gov.user_ai_credit_wallet (user_id, exchange_ai_credits)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id) DO UPDATE SET 
                        exchange_ai_credits = user_ai_credit_wallet.exchange_ai_credits + EXCLUDED.exchange_ai_credits,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING exchange_ai_credits, bonus_ai_credits, paid_ai_credits
                `, [userId, aiCreditsToBuy]);

                const newExchangeBalance = Number(walletResult.exchange_ai_credits);
                const totalAfter = Number(walletResult.bonus_ai_credits || 0) + 
                                   newExchangeBalance + 
                                   Number(walletResult.paid_ai_credits || 0);

                // 3. 雙向記帳 (Ledgers)
                // 金幣總帳
                await tx.run(`
                    INSERT INTO coin_ledger (user_id, amount, reason, balance_after)
                    VALUES ($1, $2, $3, $4)
                `, [userId, -totalCost, 'exchange_to_ai_credits', newCoinBalance]);

                // AI 點數總帳
                await tx.run(`
                    INSERT INTO ai_gov.ai_credit_ledger 
                    (user_id, amount, credit_pool, reason, balance_after, total_balance_after) 
                    VALUES ($1, $2, 'exchange', 'coin_exchange', $3, $4)
                `, [userId, aiCreditsToBuy, newExchangeBalance, totalAfter]);

                console.log(`💱 [Exchange] User ${userId}: -${totalCost} coins → +${aiCreditsToBuy} credits`);
                
                return {
                    success: true,
                    addedCredits: aiCreditsToBuy,
                    costCoins: totalCost,
                    newCoinBalance,
                    newAiCreditsBalance: totalAfter
                };
            });
        }
    };
}
