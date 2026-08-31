/**
 * Achievement System API Routes
 */
import express from 'express';
import { dbOps } from '../../database/index.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();

// Legacy clients used to decide which achievements should unlock. These guards
// intentionally run before the retained compatibility code below; game
// achievements now come exclusively from settled, server-owned game sessions.
const retiredClientAchievementWrite = (_req, res) => res.status(410).json({
    success: false,
    error: 'SERVER_AUTHORITY_REQUIRED',
    message: '成就改由伺服器依已驗證事件判定'
});
router.post('/unlock', authenticateToken, retiredClientAchievementWrite);
router.post('/check', authenticateToken, retiredClientAchievementWrite);

// GET /achievements - Get all achievement definitions
router.get('/', async (req, res) => {
    try {
        const achievements = await dbOps.usersDb.query(`
            SELECT * FROM achievements ORDER BY sort_order
        `);

        res.json({ success: true, achievements });
    } catch (error) {
        console.error('Get achievements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /achievements/admin/seed - Seed initial achievements
router.post('/admin/seed', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        console.log('🏆 [API] Starting achievement seeding...');
        const achievements = [
            // Milestones
            { key: 'milestone_stage_2', name: '初出茅廬', description: '到達 Stage 2 (通過 70 題)', type: 'milestone', icon: '🌱', category: 'classic', sort_order: 10 },
            { key: 'milestone_stage_3', name: '荒野行者', description: '到達 Stage 3 (通過 210 題)', type: 'milestone', icon: '🌵', category: 'classic', sort_order: 20 },
            { key: 'milestone_stage_4', name: '幽谷之光', description: '到達 Stage 4 (通過 500 題)', type: 'milestone', icon: '🕯️', category: 'classic', sort_order: 30 },
            { key: 'milestone_1000q', name: '登峰造極', description: '單場遠征達到 1000 題', type: 'milestone', icon: '🏔️', category: 'classic', sort_order: 40 },
            { key: 'milestone_2000q', name: '聖經百科', description: '單場遠征達到 2000 題', type: 'milestone', icon: '📚', category: 'classic', sort_order: 50 },

            // Teamwork
            { key: 'team_shield_5', name: '守護天使', description: '單場使用護盾成功抵擋傷害 5 次', type: 'teamwork', icon: '🛡️', category: 'classic', sort_order: 100 },
            { key: 'team_heal_5', name: '神醫再世', description: '單場使用藥水治療隊友 5 次', type: 'teamwork', icon: '💊', category: 'classic', sort_order: 110 },
            { key: 'team_revive_1', name: '復活的奇蹟', description: '成功復活一名隊友', type: 'teamwork', icon: '✨', category: 'classic', sort_order: 120 },
            { key: 'team_scroll_assist_10', name: '神助攻', description: '使用聖靈卷軸後，隊伍在該題成功過關 (累計 10 次)', type: 'teamwork', icon: '📜', category: 'classic', sort_order: 130 },

            // Survival
            { key: 'survival_low_hp_10', name: '九死一生', description: '全隊僅剩 1 點生命的情況下，連續通過 10 題', type: 'survival', icon: '❤️‍🩹', category: 'classic', sort_order: 200 },
            { key: 'survival_perfect_stage1', name: '毫髮無傷', description: '在 Stage 1 (前 70 題) 全隊保持滿血過關', type: 'survival', icon: '💎', category: 'classic', sort_order: 210 },
            { key: 'survival_solo_10', name: '獨行俠', description: '當所有隊友死亡後，單人連續答對 10 題', type: 'survival', icon: '🤠', category: 'classic', sort_order: 220 },

            // Dark Achievements
            { key: 'dark_cold_blooded', name: '見死不救', description: '當隊友死亡時，擁有復活道具卻不使用，並持續過關 5 輪', type: 'dark', icon: '🧊', category: 'misc', sort_order: 900 },
            { key: 'dark_burden', name: '拖油瓶', description: '單場答錯超過 10 題，但依靠隊友 Cover 依然過關', type: 'dark', icon: '🪨', category: 'misc', sort_order: 910 },
            { key: 'dark_survivor_guilt', name: '倖存者罪惡', description: '全隊 4 人僅剩你 1 人存活，並獨自推進超過 20 題', type: 'dark', icon: '🥀', category: 'misc', sort_order: 920 },
            { key: 'dark_parasite', name: '吸血鬼', description: '到達 Stage 2 時，個人答對率低於 10%', type: 'dark', icon: '🦟', category: 'misc', sort_order: 930 },
            { key: 'dark_big_spender', name: '揮霍無度', description: '在商店將所有金幣花光，但一題未答即死亡', type: 'dark', icon: '💸', category: 'misc', sort_order: 940 }
        ];

        // Idempotent seed only. Schema creation is non-destructive and existing
        // user achievement records must never be dropped by an HTTP request.
            const { createUsersTables } = await import('../../database/schemas/users_core.js');
            await createUsersTables(dbOps.usersDb);

            for (const a of achievements) {
                await dbOps.usersDb.query(`
                    INSERT INTO achievements (id, name, description, type, icon, category, sort_order)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT(id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        type = EXCLUDED.type,
                        icon = EXCLUDED.icon,
                        category = EXCLUDED.category,
                        sort_order = EXCLUDED.sort_order
                `, [a.key, a.name, a.description, a.type, a.icon, a.category, a.sort_order]);
            }


        res.json({ success: true, message: `Seeded ${achievements.length} achievements` });
    } catch (error) {
        console.error('Seed achievements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /achievements/user - Get current user's unlocked achievements
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get all achievements with unlock status
        const achievements = await dbOps.usersDb.query(`
            SELECT
                a.*,
                ua.unlocked_at,
                CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as unlocked
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
            ORDER BY a.sort_order
        `, [userId]);

        // For hidden achievements that are not unlocked, hide the details
        const processed = achievements.map(a => {
            if (a.type === 'hidden' && !a.unlocked) {
                return {
                    id: a.id,
                    name: '❓ ???',
                    description: '完成特定條件解鎖',
                    icon: '❓',
                    type: 'hidden',
                    category: a.category,
                    unlocked: false,
                    sort_order: a.sort_order
                };
            }
            return a;
        });

        const unlockedCount = achievements.filter(a => a.unlocked).length;

        res.json({
            success: true,
            achievements: processed,
            stats: {
                total: achievements.length,
                unlocked: unlockedCount,
                percentage: Math.round((unlockedCount / achievements.length) * 100)
            }
        });
    } catch (error) {
        console.error('Get user achievements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /achievements/unlock - Unlock an achievement
router.post('/unlock', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { achievementId } = req.body;

        if (!achievementId) {
            return res.status(400).json({ success: false, error: 'Missing achievementId' });
        }

        // Check if achievement exists
        const achievement = (await dbOps.usersDb.query('SELECT * FROM achievements WHERE id = $1', [achievementId]))?.[0];
        if (!achievement) {
            return res.status(404).json({ success: false, error: 'Achievement not found' });
        }

        // Check if already unlocked
        const existing = (await dbOps.usersDb.query('SELECT * FROM user_achievements WHERE user_id = $1 AND achievement_id = $2', [userId, achievementId]))?.[0];

        if (existing) {
            return res.json({ success: true, alreadyUnlocked: true, achievement });
        }

        // Unlock the achievement
        await dbOps.usersDb.query(`
            INSERT INTO user_achievements (user_id, achievement_id)
            VALUES ($1, $2)
        `, [userId, achievementId]);

        console.log(`🏆 Achievement unlocked: ${achievement.name} for user ${userId}`);

        res.json({
            success: true,
            newlyUnlocked: true,
            achievement: {
                ...achievement,
                unlocked: true,
                unlocked_at: new Date()
            }
        });
    } catch (error) {
        console.error('Unlock achievement error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /achievements/check - Check and unlock achievements based on game data
router.post('/check', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const gameData = req.body;

        /*
        Expected gameData format:
        {
            gameMode: 'classic' | 'speed' | 'casual',
            isVictory: boolean,
            correctCount: number,
            totalQuestions: number,
            lifelinesUsed: { fiftyFifty: boolean, phoneFriend: boolean, askAudience: boolean },
            lifelinesBought: number,
            maxStreak: number,
            selectedBooks: string[],
            playTimeHour: number (0-23)
        }
        */

        const newlyUnlocked = [];

        // Get user's current stats
        const user = (await dbOps.usersDb.query('SELECT * FROM users WHERE id = $1', [userId]))?.[0];
        const existingUnlocksRaw = await dbOps.usersDb.query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId]);
        const existingUnlocks = existingUnlocksRaw.map(r => r.achievement_id);

        const tryUnlock = async (achievementId) => {
            if (existingUnlocks.includes(achievementId)) return;

            const achievement = (await dbOps.usersDb.query('SELECT * FROM achievements WHERE id = $1', [achievementId]))?.[0];
            if (!achievement) return;

            await dbOps.usersDb.query(`
                INSERT INTO user_achievements (user_id, achievement_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [userId, achievementId]);

            // [SOVEREIGN v3] 原子化獎勵：透過中央銀行發放
            const coinReward = achievement.coin_reward || 0;
            if (coinReward > 0) {
                const { newBalance } = await dbOps.adjustCoins(
                    userId,
                    coinReward,
                    `achievement_unlock_${achievementId}`
                );
                console.log(`🏆 [Achievement Reward] User ${userId}: +${coinReward} (${achievement.name}) → newBalance=${newBalance}`);
            }

            newlyUnlocked.push({ ...achievement, coinReward });
            existingUnlocks.push(achievementId);
            console.log(`🏆 Achievement unlocked: ${achievement.name} for user ${userId}`);
        };

        // === Check Classic Mode Achievements ===
        if (gameData.gameMode === 'classic') {
            // First game
            await tryUnlock('first_game');

            // Victory
            if (gameData.isVictory) {
                await tryUnlock('classic_win');

                // No lifeline victory
                const lifelines = gameData.lifelinesUsed || {};
                if (!lifelines.fiftyFifty && !lifelines.phoneFriend && !lifelines.askAudience) {
                    await tryUnlock('no_lifeline_win');
                }
            }

            // Used all lifelines
            const lifelines = gameData.lifelinesUsed || {};
            if (lifelines.fiftyFifty && lifelines.phoneFriend && lifelines.askAudience) {
                await tryUnlock('use_all_lifelines');
            }

            // Bought many lifelines
            
            // Big Spender (dark_big_spender)
            if ((gameData.lifelinesBought || 0) * 1000 >= 3000 && !gameData.lifelinesUsed && gameData.correctCount === 0 && gameData.totalQuestions >= 1) {
                await tryUnlock('dark_big_spender');
            }

            if (gameData.lifelinesBought >= 5) {

                await tryUnlock('buy_lifeline_5');
            }

            // First question wrong
            if (gameData.correctCount === 0 && gameData.totalQuestions >= 1) {
                await tryUnlock('unlucky');
            }
        }

        // === Check Speed Mode Achievements ===
        if (gameData.gameMode === 'speed') {
            await tryUnlock('speed_first');

            // Perfect game
            if (gameData.correctCount === gameData.totalQuestions && gameData.totalQuestions >= 10) {
                await tryUnlock('speed_perfect');
            }

            // Streak achievements
            if (gameData.maxStreak >= 10) {
                await tryUnlock('streak_10');
            }
            if (gameData.maxStreak >= 15) {
                await tryUnlock('streak_15');
            }
        }


        // === Check Reading Plan Achievements ===
        if (gameData.gameMode === 'reading_plan') {
            await tryUnlock('reading_first_plan');

            // Get all completed plans
            const plans = await dbOps.notesDb.query(`
                SELECT rp.target_ranges, urp.started_at,
                    (SELECT MAX(completed_at) FROM public.user_reading_schedule WHERE user_plan_id = urp.id) as completed_at
                FROM public.user_reading_plans urp
                JOIN public.reading_plans rp ON urp.plan_id = rp.id
                WHERE urp.user_id = $1
                AND EXISTS (SELECT 1 FROM public.user_reading_schedule WHERE user_plan_id = urp.id)
                AND NOT EXISTS (SELECT 1 FROM public.user_reading_schedule WHERE user_plan_id = urp.id AND completed_at IS NULL)
            `, [userId]);

            const completedBooksSet = new Set();
            const completedPlansStats = [];
            const bookCounts = {};

            for (const p of (plans || [])) {
                let targetBooks = [];
                try { targetBooks = typeof p.target_ranges === 'string' ? JSON.parse(p.target_ranges) : p.target_ranges; } catch(e){}
                
                const start = new Date(p.started_at);
                const end = new Date(p.completed_at);
                const durationDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
                
                targetBooks.forEach(b => {
                    completedBooksSet.add(b);
                    bookCounts[b] = (bookCounts[b] || 0) + 1;
                });

                completedPlansStats.push({ books: targetBooks, durationDays });
            }

            const categories = {
                pentateuch: ['創世記', '出埃及記', '利未記', '民數記', '申命記'],
                history: ['約書亞記', '士師記', '路得記', '撒母耳記上', '撒母耳記下', '列王紀上', '列王紀下', '歷代志上', '歷代志下', '以斯拉記', '尼希米記', '以斯帖記'],
                wisdom: ['約伯記', '詩篇', '箴言', '傳道書', '雅歌'],
                prophets: ['以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書'],
                gospels: ['馬太福音', '馬可福音', '路加福音', '約翰福音', '使徒行傳'],
                pauline: ['羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書', '提多書', '腓利門書'],
                general: ['希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', '約翰二書', '約翰三書', '猶大書', '啟示錄']
            };

            const ot = [...categories.pentateuch, ...categories.history, ...categories.wisdom, ...categories.prophets];
            const nt = [...categories.gospels, ...categories.pauline, ...categories.general];
            const bible = [...ot, ...nt];

            const hasAll = (reqBooks) => reqBooks.every(b => completedBooksSet.has(b));

            if (hasAll(categories.pentateuch)) await tryUnlock('reading_pentateuch');
            if (hasAll(categories.history)) await tryUnlock('reading_history');
            if (hasAll(categories.wisdom)) await tryUnlock('reading_wisdom');
            if (hasAll(categories.prophets)) await tryUnlock('reading_prophets');
            if (hasAll(ot)) await tryUnlock('reading_ot');
            
            if (hasAll(categories.gospels)) await tryUnlock('reading_gospels');
            if (hasAll(categories.pauline)) await tryUnlock('reading_pauline');
            if (hasAll(categories.general)) await tryUnlock('reading_general');
            if (hasAll(nt)) await tryUnlock('reading_nt');
            
            if (hasAll(bible)) await tryUnlock('reading_bible');

            for (const stats of completedPlansStats) {
                if (stats.durationDays <= 7 && stats.books.length > 0) {
                    await tryUnlock('reading_speed_7days');
                    break;
                }
            }

            for (const count of Object.values(bookCounts)) {
                if (count >= 7) {
                    await tryUnlock('reading_7_times');
                    break;
                }
            }
        }

        // === Check Coin Achievements ===
        const totalCoins = user?.coins || 0;
        if (totalCoins >= 100) await tryUnlock('coins_100');
        if (totalCoins >= 500) await tryUnlock('coins_500');

        // === Check Time-based Achievements ===
        const hour = gameData.playTimeHour ?? new Date().getHours();
        if (hour >= 0 && hour < 5) await tryUnlock('night_owl');
        if (hour >= 5 && hour < 7) await tryUnlock('early_bird');

        res.json({
            success: true,
            newlyUnlocked,
            count: newlyUnlocked.length
        });

    } catch (error) {
        console.error('Check achievements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /achievements/sync - Retroactively check and award achievements based on existing user stats
// Called on login to award achievements for old players
router.post('/sync', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const newlyUnlocked = [];

        // Get user's current stats
        const user = (await dbOps.usersDb.query('SELECT * FROM users WHERE id = $1', [userId]))?.[0];
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const existingUnlocksRaw = await dbOps.usersDb.query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId]);
        const existingUnlocks = existingUnlocksRaw.map(r => r.achievement_id);

        const tryUnlock = async (achievementId) => {
            if (existingUnlocks.includes(achievementId)) return false;

            const achievement = (await dbOps.usersDb.query('SELECT * FROM achievements WHERE id = $1', [achievementId]))?.[0];
            if (!achievement) return false;

            await dbOps.usersDb.query(`
                INSERT INTO user_achievements (user_id, achievement_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [userId, achievementId]);

            newlyUnlocked.push(achievement);
            existingUnlocks.push(achievementId);
            console.log(`🏆 [Sync] Achievement unlocked: ${achievement.name} for user ${userId}`);
            return true;
        };

        // === Check based on existing user stats ===

        // Coin-based achievements
        const totalCoins = user.coins || 0;
        if (totalCoins >= 100) await tryUnlock('coins_100');
        if (totalCoins >= 500) await tryUnlock('coins_500');

        // Game count achievements
        const totalGames = user.total_games || user.totalGames || 0;
        if (totalGames >= 1) await tryUnlock('first_game');

        // Time-based achievements (check current time)
        const hour = new Date().getHours();
        if (hour >= 0 && hour < 5) await tryUnlock('night_owl');
        if (hour >= 5 && hour < 7) await tryUnlock('early_bird');

        console.log(`📊 [Sync] User ${user.username}: ${newlyUnlocked.length} achievements awarded retroactively`);

        res.json({
            success: true,
            newlyUnlocked,
            count: newlyUnlocked.length,
            totalUnlocked: existingUnlocks.length
        });

    } catch (error) {
        console.error('Sync achievements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
