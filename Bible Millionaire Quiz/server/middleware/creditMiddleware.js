import { usersDb } from '../database/index.js';
import { LogosBank } from '../database/services/LogosBankService.js';

/**
 * Middleware to check if user has enough AI credits before hitting LLM.
 * Requires req.user from authMiddleware.
 */
export const requireAiCredits = (minCredits = 1) => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized. Need login to use AI features.' });
            }

            // Retrieve the wallet
            let wallet = await usersDb.get('SELECT * FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1', [userId]);
            
            if (!wallet) {
                console.log(`[Credit] Creating initial wallet for user ${userId}`);
                const initialBonus = 10;
                await usersDb.run(`
                    INSERT INTO ai_gov.user_ai_credit_wallet (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
                    VALUES ($1, $2, 0, 0)
                    ON CONFLICT (user_id) DO NOTHING
                `, [userId, initialBonus]);
                
                wallet = await usersDb.get('SELECT * FROM ai_gov.user_ai_credit_wallet WHERE user_id = $1', [userId]);

                if (wallet) {
                    // Log to ledger
                    await usersDb.run(`
                        INSERT INTO ai_gov.ai_credit_ledger 
                        (user_id, amount, credit_pool, reason, balance_after, total_balance_after) 
                        VALUES ($1, $2, 'bonus', 'INITIAL_MIGRATION_AUTO', $3, $4)
                    `, [userId, initialBonus, initialBonus, initialBonus]);
                }
            }

            if (!wallet) {
                return res.status(402).json({ error: 'AI Credit wallet not found and creation failed.' });
            }

            const totalCredits = (wallet.bonus_ai_credits || 0) + 
                                 (wallet.exchange_ai_credits || 0) + 
                                 (wallet.paid_ai_credits || 0);

            if (totalCredits < minCredits) {
                return res.status(402).json({ 
                    error: 'Insufficient AI Credits.', 
                    required: minCredits, 
                    available: totalCredits 
                });
            }

            // Attach current wallet to req
            req.aiWallet = wallet;
            req.aiCreditsAvailable = totalCredits;

            // Attach deductive helper for the route to call AFTER a successful LLM generation
            req.deductAiCredits = async (amountToDeduct, reasonCode = 'UNKNOWN', reasonLabel = '未知操作', correlationId = null) => {
                if (amountToDeduct <= 0) return true;
                
                try {
                    // [SOVEREIGN v3.5] Use LogosBank for atomic multi-pool deduction
                    await LogosBank.adjustAssets(userId, 'AI_CREDIT', -amountToDeduct, reasonCode, { 
                        mode: 'priority', 
                        correlationId 
                    });
                    return true;
                } catch (err) {
                    console.error(`[Credit Error] User ${userId} deduction failed:`, err.message);
                    throw new Error('Not enough credits to deduct entirely.');
                }
            };

            next();
        } catch (error) {
            console.error('[Credit Middleware] Error:', error);
            res.status(500).json({ error: 'Internal Server Error verifying AI credits.' });
        }
    };
};
