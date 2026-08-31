/**
 * 遠征隊設定 API 路由 (Unified V3)
 * Expedition Configuration Routes
 *
 * 整合 V2 與 V3 功能，完全支援 PostgreSQL 異步操作
 */

import express from 'express';
import { dbOps } from '../../../database/index.js';
import { requireRole, authenticateToken } from '../../../middleware/auth.js';
import { generateQuestion, replenishStock } from '../engine/QuestionCore.js';
import { activeRooms } from '../../../socket/expedition/registry.js';
import { updateTeamStage } from '../../../socket/expedition/handlers/gameHandlers.js';
import expeditionService from './ExpeditionService.js';

const router = express.Router();

// 初始化設定預設值 (表格由 schemas_pg.js 建立)
// ============================================
const initExpeditionConfig = async (retryCount = 0) => {
    try {
        // [SOVEREIGN 1.1] 安全性檢查：確保資料庫已初始化
        if (!dbOps || !dbOps.gamesDb) {
            if (retryCount < 10) {
                console.log(`⏳ [Expedition] Waiting for gamesDb initialization (Attempt ${retryCount + 1})...`);
                setTimeout(() => initExpeditionConfig(retryCount + 1), 1000);
                return;
            }
            throw new Error('Database initialization timeout');
        }

        // 預設值 (表格已由 schemas_pg.js 建立)
        const defaults = [
            {
                key: 'stages',
                value: JSON.stringify([
                    { id: 'peaceful', name: '平安平原', milestone: 70, bgColor: '#a7f3d0', countdown: 7, protection: 'full', reward: 50, perQuestionReward: 1 },
                    { id: 'wilderness', name: '曠野行軍', milestone: 210, bgColor: '#fef08a', countdown: 7, protection: 'partial', reward: 100, perQuestionReward: 2 },
                    { id: 'valley', name: '死蔭幽谷', milestone: 500, bgColor: '#581c87', countdown: 7, protection: 'none', reward: 200, perQuestionReward: 3 },
                    { id: 'summit', name: '至聖之巔', milestone: 999999, bgColor: '#0a0a0a', countdown: 5, protection: 'none', reward: 500, perQuestionReward: 5 }
                ]),
                description: '遠征階段設定 (含里程碑、通關獎勵、單題獎勵)'
            },
            {
                key: 'shop_items',
                value: JSON.stringify([
                    { id: 'scroll', name: '聖靈卷軸', price: 50, effect: 'eliminate_2', description: '排除 2 個錯誤選項' },
                    { id: 'healthPotion', name: '恩典藥水', price: 30, effect: 'heal_1', description: '恢復 1 ❤️' },
                    { id: 'shield', name: '信德盾牌', price: 40, effect: 'passive_block', description: '抵擋一次傷害' },
                    { id: 'tent', name: '安息帳篷', price: 100, effect: 'save', description: '暫停並保存進度' },
                    { id: 'revive', name: '復活號角', price: 150, effect: 'revive', description: '復活已死亡的隊友', maxPurchase: 2 },
                    { id: 'shoes', name: '福音鞋', price: 150, effect: 'emergency_save', description: '隊長斷線後自動保存當前進度', icon: '👟' }
                ]),
                description: '商店道具設定（僅限集結區購買）'
            },
            {
                key: 'question_ratio',
                value: JSON.stringify({ bible: 0.8, geography: 0.2 }),
                description: '小組成員通關時獲得的獎勵倍率或額外獎勵'
            },
            {
                key: 'initial_lives',
                value: '3',
                description: '遠征隊初始生命值'
            },
            {
                key: 'lifeline_costs',
                value: JSON.stringify({
                    fiftyFifty: 10,
                    phoneFriend: 15,
                    askAudience: 15,
                    addTime: 10,
                    expert: 20
                }),
                description: '求救工具/延長時間消耗金幣數'
            },
            {
                key: 'classic_reward_config',
                value: JSON.stringify({
                    perQuestion: 1,
                    victoryBonus: 0.20,
                    categoryBonuses: [
                        { minBooks: 5, bonus: 0.10 },
                        { minBooks: 11, bonus: 0.15 }
                    ]
                }),
                description: '傳統模式金幣獎勵設定 (含勝場與題庫加成)'
            },
            {
                key: 'speed_reward_config',
                value: JSON.stringify({
                    perQuestion: 2,
                    streakBonuses: [
                        { streak: 5, bonus: 0.10 },
                        { streak: 10, bonus: 0.15 },
                        { streak: 15, bonus: 0.20 }
                    ]
                }),
                description: '極速模式金幣獎勵設定 (含連勝加成)'
            },
            {
                key: 'infinite_reward_config',
                value: JSON.stringify({
                    boostRatePer20Levels: 0.05,
                    maxBoostMultiplier: 1.0,
                    milestoneOddHundredCoinsMultiplier: 100,
                    milestoneEvenHundredPointsMultiplier: 5,
                    expertCallPointsCost: 1
                }),
                description: '無限挑戰模式獎勵與百關里程碑設定'
            },
            {
                key: 'registration_bonus',
                value: '30',
                description: '新用戶註冊贈送智匯金幣'
            },
            {
                key: 'registration_bonus_points',
                value: '30',
                description: '新用戶註冊贈送智匯點數'
            },
            {
                key: 'daily_login_bonus',
                value: '5',
                description: '每日登入贈送金幣'
            }
        ];

        const insertStmt = dbOps.gamesDb.prepare(`
            INSERT INTO expedition_config (key, value, description)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                description = excluded.description,
                updated_at = CURRENT_TIMESTAMP
        `);

        for (const item of defaults) {
            await insertStmt.run(item.key, item.value, item.description);
        }

        console.log('✅ Expedition config table initialized');

        // [CLEANUP] Remove rows with item_id='undefined' caused by camelCase transform bug
        try {
            await dbOps.gamesDb.prepare("DELETE FROM expedition_inventory WHERE item_id = 'undefined'").run();
        } catch {
            // Non-fatal: table may not exist yet
        }

        await dbOps.gamesDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_expedition_records_score
            ON expedition_records(score DESC, stage_reached DESC);
        `).run();
    } catch (error) {
        console.error('❌ Failed to initialize expedition config:', error);
    }
};

// 由 server/index.js 在 DB 就緒後呼叫
export { initExpeditionConfig };

// ============================================
// 公開 API (前端讀取設定)
// ============================================

/**
 * GET /api/expedition/config
 * 讀取所有設定 (公開)
 */
router.get('/config', async (req, res) => {
    try {
        const rows = await dbOps.gamesDb.prepare('SELECT key, value FROM expedition_config').all();

        const config = {};
        for (const row of rows) {
            try {
                config[row.key] = (row.value && typeof row.value === 'string' && row.value.trim().startsWith('{'))
                    ? JSON.parse(row.value)
                    : row.value;
            } catch {
                config[row.key] = row.value;
            }
        }

        res.json({ success: true, config });
    } catch (error) {
        console.error('Expedition Config Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 管理員 API
// ============================================

/**
 * GET /api/expedition/admin/config
 * 讀取完整設定 (含描述)
 */
router.get('/admin/config', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        console.log(`🔍 [AdminExpedition] Fetching config for user: ${req.user?.username || req.user?.userId}`);
        const rows = await dbOps.gamesDb.prepare(
            'SELECT key, value, description, updated_at FROM expedition_config ORDER BY key'
        ).all();

        if (!rows || rows.length === 0) {
            console.warn('⚠️ [AdminExpedition] No config rows returned from database.');
        }

        const config = rows.map(row => {
            // [UNIFIED ARCHITECTURE] Support both snake_case and camelCase
            const key = row.key;
            const valueRaw = row.value;
            const updatedAt = row.updatedAt || row.updated_at || row.updatedAt;

            return {
                key,
                value: (() => {
                    try {
                        if (valueRaw && typeof valueRaw === 'string' && (valueRaw.startsWith('{') || valueRaw.startsWith('['))) {
                            return JSON.parse(valueRaw);
                        }
                        return valueRaw;
                    }
                    catch {
                        return valueRaw;
                    }
                })(),
                description: row.description,
                updatedAt
            };
        });

        res.json({ success: true, config });
    } catch (error) {
        console.error('❌ Admin Expedition Config Error:', error);
        res.status(500).json({ success: false, error: `配置加載失敗: ${error.message}` });
    }
});

/**
 * PUT /api/expedition/admin/config/:key
 * 更新單一設定
 */
router.put('/admin/config/:key', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;

        if (value === undefined) {
            return res.status(400).json({ success: false, error: '缺少 value 參數' });
        }

        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

        const existing = await dbOps.gamesDb.prepare('SELECT key FROM expedition_config WHERE key = ?').get(key);

        if (existing) {
            const updateStmt = dbOps.gamesDb.prepare(`
                UPDATE expedition_config
                SET value = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP
                WHERE key = ?
            `);
            await updateStmt.run(valueStr, description, key);
        } else {
            const insertStmt = dbOps.gamesDb.prepare(`
                INSERT INTO expedition_config (key, value, description)
                VALUES (?, ?, ?)
            `);
            await insertStmt.run(key, valueStr, description || '');
        }

        console.log(`✏️ Expedition config updated: ${key}`);
        res.json({ success: true, message: `設定 ${key} 已更新` });
    } catch (error) {
        console.error('Update Expedition Config Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/expedition/admin/config
 * 批量更新設定
 */
router.put('/admin/config', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
            return res.status(400).json({ success: false, error: '缺少 config 參數' });
        }

        const updateStmt = dbOps.gamesDb.prepare(`
            UPDATE expedition_config
            SET value = ?, updated_at = CURRENT_TIMESTAMP
            WHERE key = ?
        `);

        let updated = 0;
        for (const [key, value] of Object.entries(config)) {
            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            const result = await updateStmt.run(valueStr, key);
            if (result && (result.changes > 0 || result.rowCount > 0)) updated++;
        }

        console.log(`✏️ Expedition config batch updated: ${updated} items`);
        res.json({ success: true, message: `已更新 ${updated} 項設定` });
    } catch (error) {
        console.error('Batch Update Expedition Config Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/expedition/admin/active-teams
 * 獲取所有活躍隊伍資訊 (管理員用)
 */
router.get('/admin/active-teams', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        const rooms = Array.from(activeRooms.values());
        const teamIds = rooms.map(r => r.teamId);

        let dbTeams = [];
        if (teamIds.length > 0) {
            const placeholders = teamIds.map(() => '?').join(',');
            dbTeams = await dbOps.gamesDb.prepare(`
                SELECT id, name, owner_name, current_stage, current_question, status
                FROM expedition_teams
                WHERE id IN (${placeholders})
            `).all(...teamIds);
        }

        const activeTeams = rooms.map(room => {
            const dbTeam = dbTeams.find(t => t.id === room.teamId);
            return {
                id: room.teamId,
                name: dbTeam?.name || '未知隊伍',
                ownerName: dbTeam?.owner_name || '未知房主',
                currentStage: room.stage,
                currentQuestion: room.currentQuestionCount,
                memberCount: room.members.size,
                phase: room.phase,
                status: dbTeam?.status || 'unknown'
            };
        });

        res.json({ success: true, teams: activeTeams });
    } catch (error) {
        console.error('Get Admin Active Teams Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/expedition/admin/team/:teamId/stage
 * 手動同步更新隊伍階段 (管理員用)
 */
router.put('/admin/team/:teamId/stage', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        const { teamId } = req.params;
        const { stage } = req.body;

        if (stage === undefined) {
            return res.status(400).json({ success: false, error: '缺少 stage 參數' });
        }

        const io = req.app.get('io');
        if (!io) {
            return res.status(500).json({ success: false, error: 'Socket server not available' });
        }

        const success = updateTeamStage(io, teamId, stage);

        if (success) {
            res.json({ success: true, message: `隊伍 ${teamId} 階段已手動更新為 ${stage}` });
        } else {
            // 如果不在內存中，至少更新資料庫
            await dbOps.gamesDb.prepare('UPDATE expedition_teams SET current_stage = ? WHERE id = ?').run(stage, teamId);
            res.json({ success: true, message: `隊伍 ${teamId} 資料庫階段已更新 (隊伍目前不活躍)` });
        }
    } catch (error) {
        console.error('Update Team Stage Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 庫存與購買 API
// ============================================

// 注意：expedition_inventory 和 expedition_saves 表由 schemas_pg.js 統一建立

// Check for existing save (For Captain Load Prompt) - V3 Port
router.get('/check-save', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const save = await dbOps.gamesDb.prepare('SELECT * FROM expedition_saves WHERE user_id = ?').get(userId);

        if (save) {
            return res.json({ hasSave: true, save });
        } else {
            return res.json({ hasSave: false });
        }
    } catch (error) {
        console.error('Check save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check Save Conflict
router.post('/check-save-conflict', authenticateToken, async (req, res) => {
    try {
        const { teamId, stage, question } = req.body;

        const team = await dbOps.gamesDb.prepare('SELECT owner_id FROM expedition_teams WHERE id = ?').get(teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });

        const captainId = team.ownerId || team.owner_id;
        const currentSave = await dbOps.gamesDb.prepare('SELECT save_data FROM expedition_saves WHERE user_id = ?').get(captainId);

        if (currentSave) {
            const rawSaveData = currentSave.saveData || currentSave.save_data;
            const savedData = JSON.parse(rawSaveData);
            const savedStage = savedData.stage || 1;
            const savedQuestion = savedData.question || 0;

            const isLower = (stage < savedStage) || (stage === savedStage && question < savedQuestion);

            if (isLower) {
                return res.json({
                    hasConflict: true,
                    message: `您的當前進度 (關卡 ${stage}-${question}) 落後於隊長存檔 (關卡 ${savedStage}-${savedQuestion})。存檔將被阻止。`
                });
            }
        }

        return res.json({ hasConflict: false });
    } catch (error) {
        console.error('Check save conflict error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/user-save', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const save = await dbOps.gamesDb.prepare('SELECT * FROM expedition_saves WHERE user_id = ?').get(userId);

        const rawSave = save?.saveData || save?.save_data;
        if (save && rawSave) {
            const saveData = typeof rawSave === 'string' ? JSON.parse(rawSave) : rawSave;
            res.json({
                success: true,
                hasSave: true,
                save: {
                    stage: saveData.stage || 1,
                    question: saveData.question || 0,
                    savedAt: save.createdAt
                }
            });
        } else {
            res.json({ success: true, hasSave: false, save: null });
        }
    } catch (error) {
        console.error('Get User Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/user-save', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const { stage, question, force } = req.body;

        const existingSave = await dbOps.gamesDb.prepare('SELECT save_data FROM expedition_saves WHERE user_id = ?').get(userId);

        const rawExisting = existingSave?.saveData || existingSave?.save_data;
        if (existingSave && rawExisting && !force) {
            const existing = typeof rawExisting === 'string' ? JSON.parse(rawExisting) : rawExisting;
            const existingProgress = (existing.stage || 1) * 1000 + (existing.question || 0);
            const newProgress = (stage || 1) * 1000 + (question || 0);

            if (newProgress < existingProgress) {
                return res.json({
                    success: false,
                    requireConfirm: true,
                    message: `即將覆蓋較高進度的存檔（階段 ${existing.stage} 第 ${existing.question} 題 → 階段 ${stage} 第 ${question} 題）`,
                    existingSave: existing
                });
            }
        }

        const saveData = JSON.stringify({ stage, question, savedAt: new Date().toISOString() });
        await dbOps.gamesDb.prepare(`
            INSERT INTO expedition_saves (user_id, save_data) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET save_data = excluded.save_data, created_at = CURRENT_TIMESTAMP
        `).run(userId, saveData);

        console.log(`💾 [UserSave] Saved for user ${userId}: Stage ${stage}, Question ${question}`);
        res.json({ success: true, message: '進度已儲存' });
    } catch (error) {
        console.error('Save User Progress Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/user-save', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        await dbOps.gamesDb.prepare('DELETE FROM expedition_saves WHERE user_id = ?').run(userId);
        console.log(`🗑️ [UserSave] Cleared save for user ${userId}`);
        res.json({ success: true, message: '存檔已清除' });
    } catch (error) {
        console.error('Delete User Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/inventory', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return res.json({ success: true, inventory: {} });

        const rows = await dbOps.gamesDb.prepare(
            'SELECT item_id, quantity FROM expedition_inventory WHERE user_id = ?'
        ).all(userId);

        const inventory = {};
        rows.forEach(row => {
            // PostgresAdapter transforms snake_case → camelCase: item_id → itemId
            const itemId = row.itemId || row.item_id;
            if (itemId) inventory[itemId] = row.quantity;
        });

        res.json({ success: true, inventory });
    } catch (error) {
        console.error('Get Inventory Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/inventory/sync', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: '需要登入' });

        const { inventory } = req.body;
        if (!inventory || typeof inventory !== 'object') {
            return res.status(400).json({ success: false, error: '缺少 inventory 資料' });
        }

        for (const [itemId, quantity] of Object.entries(inventory)) {
            const qty = Number(quantity);
            if (!Number.isFinite(qty) || qty < 0) continue;
            if (qty === 0) {
                await dbOps.gamesDb.prepare(
                    'DELETE FROM expedition_inventory WHERE user_id = ? AND item_id = ?'
                ).run(userId, itemId);
            } else {
                await dbOps.gamesDb.prepare(`
                    INSERT INTO expedition_inventory (user_id, item_id, quantity)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id, item_id) DO UPDATE SET
                        quantity = excluded.quantity
                `).run(userId, itemId, qty);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Inventory Sync Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/purchase', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: '需要登入' });

        const { itemId, quantity = 1 } = req.body;
        if (!itemId) return res.status(400).json({ success: false, error: '缺少商品 ID' });

        const DEFAULT_SHOP_ITEMS = [
            { id: 'scroll',        price: 50  },
            { id: 'healthPotion',  price: 30  },
            { id: 'shield',        price: 40  },
            { id: 'tent',          price: 100 },
            { id: 'revive',        price: 150 },
            { id: 'shoes',         price: 150 },
        ];

        const configRow = await dbOps.gamesDb.prepare("SELECT value FROM expedition_config WHERE key = 'shop_items'").get();
        let shopItems = DEFAULT_SHOP_ITEMS;
        try {
            if (configRow?.value) shopItems = JSON.parse(configRow.value);
        } catch {
            console.error('Failed to parse shop_items config, using defaults');
        }

        const targetItem = shopItems.find(i => i.id === itemId);
        if (!targetItem) {
            return res.status(400).json({ success: false, error: '商品不存在或是已下架' });
        }

        const realPrice = targetItem.price;
        const totalCost = realPrice * quantity;

        // [SOVEREIGN v3] 原子化支出：計算由 DB 執行
        // 1. 預檢餘額（雖然 adjustCoins 有安全墊底，但邏輯上應在不夠錢時擋下）
        const user = await dbOps.db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
        if (!user || Number(user.coins || 0) < totalCost) {
            return res.status(400).json({
                success: false,
                error: `金幣不足 (需 ${totalCost}, 持有 ${user?.coins || 0})`
            });
        }

        // 2. 執行原子化扣款與記帳
        const { newBalance } = await dbOps.adjustCoins(
            userId,
            -totalCost,
            `expedition_shop_buy_${itemId}_x${quantity}`
        );

        console.log(`🛍️ [Expedition Buy] User ${userId}: -${totalCost} (Item: ${itemId}) → newBalance=${newBalance}`);

        await dbOps.gamesDb.prepare(`
            INSERT INTO expedition_inventory (user_id, item_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, item_id) DO UPDATE SET
                quantity = expedition_inventory.quantity + excluded.quantity
        `).run(userId, itemId, quantity);

        res.json({ success: true, message: '購買成功' });
    } catch (error) {
        console.error('Purchase Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 出題 API
// ============================================

// [Legacy] Initialization moved to QuestionCore or handled JIT
// replenishStock(null, null, 20).catch(err => console.error('Initial pool check failed:', err));

router.get('/question', async (req, res) => {
    try {
        const stage = parseInt(req.query.stage) || 1;
        const answeredIds = req.query.answered
            ? req.query.answered.split(',').map(Number)
            : [];

        // [Sovereign Pipeline] Redirect to unified generator
        const question = await generateQuestion({
            mode: 'expedition',
            stage,
            contextData: { answeredIds }
        });

        if (!question) {
            return res.status(404).json({ success: false, error: '暫時無法生成題目，請稍後再試' });
        }

        res.json({ success: true, question });
    } catch (error) {
        console.error('Get Question Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/admin/pool-stats', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        // [Sovereign Pipeline] Direct DB count for pool stats
        const result = await dbOps.gamesDb.prepare('SELECT COUNT(*) as total FROM questions').get();
        res.json({ success: true, stats: { total: result?.total || 0, stage_stats: {} } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/admin/pool-refill', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        const { stage, count } = req.body;
        const targetStage = parseInt(stage) || 1;
        const targetCount = parseInt(count) || 5;

        // Fire and forget (or await if desired, but request usually returns fast)
        // Keep as promise chain for background execution
        // [Sovereign Pipeline] Use replenishStock instead of legacy pre-generation
        replenishStock(null, null, targetCount)
            .then(() => console.log(`🎯 Refilled questions for Stage ${targetStage}`))
            .catch(err => console.error('Refill error:', err));

        res.json({ success: true, message: `已開始為階段 ${targetStage} 背景生成 ${targetCount} 題` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/pre-generate', authenticateToken, requireRole(['admin_ops', 'admin_expedition']), async (req, res) => {
    try {
        const count = Number.parseInt(req.body.count, 10) || 5;
        if (count < 1 || count > 20) {
            return res.status(400).json({ success: false, error: 'INVALID_QUESTION_COUNT' });
        }

        // [Sovereign Pipeline] Use replenishStock instead of legacy pre-generation
        replenishStock(null, null, count)
            .then(() => console.log(`🎯 Background pre-generated questions`))
            .catch(err => console.error('Pre-generate error:', err));

        res.json({ success: true, message: `開始發起 ${count} 題背景生成任務` });
    } catch (error) {
        console.error('Pre-generate Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 隊伍系統 API
// ============================================

// 注意：expedition_teams 和 expedition_team_members 表由 schemas_pg.js 統一建立

router.get(['/my-team', '/team/my', '/user-team'], authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const username = req.user.username;

        // [SOVEREIGN] 確保用戶擁有遠征隊伍 (按需自動核發，覆蓋現有登入會話)
        const team = await expeditionService.ensureUserHasTeam(userId, username);

        if (team) {
            // 補充前端需要的狀態標記
            team.hasSavedProgress = (team.status === 'saved' && (team.currentQuestion || 0) > 0);
        }

        res.json({ success: true, team });
    } catch (error) {
        console.error('Check My Team Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/team/create', authenticateToken, async (req, res) => {
    try {
        const { teamName } = req.body;
        const ownerId = req.user.userId;
        const ownerName = req.user.username;

        // [SOVEREIGN] 使用 Service 確保隊伍存在且正確初始化
        const team = await expeditionService.ensureUserHasTeam(ownerId, ownerName);

        // 如果請求中有提供自定義隊名，則更新 (雖然自動核發已有預設名)
        if (teamName && teamName !== team.name) {
            await dbOps.gamesDb.run('UPDATE expedition_teams SET name = $1 WHERE id = $2', [teamName, team.id]);
            team.name = teamName;
        }

        console.log(`🏕️  Team identified/created: ${team.name} (${team.id}) by ${ownerName}`);

        res.json({
            success: true,
            team: {
                id: team.id,
                name: team.name,
                ownerName,
                status: 'waiting',
                stage: 1
            }
        });
    } catch (error) {
        console.error('Create Team Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/team/join', async (req, res) => {
    try {
        let { teamId, displayName, userId } = req.body;

        if (!teamId || !displayName) {
            return res.status(400).json({ success: false, error: '缺少隊伍碼或顯示名稱' });
        }

        // Sanitization
        teamId = teamId.trim().toUpperCase();
        displayName = displayName.trim();

        const team = await dbOps.gamesDb.prepare('SELECT * FROM expedition_teams WHERE id = ?').get(teamId);

        if (!team) {
            return res.status(404).json({ success: false, error: '找不到該隊伍' });
        }

        if (team.status === 'offline') {
            const teamOwnerId = team.ownerId || team.owner_id;
            const teamOwnerName = team.ownerName || team.owner_name;
            const isOwner = (userId && teamOwnerId == userId) || (!userId && teamOwnerName === displayName);
            if (isOwner) {
                const currentQ = team.currentQuestion ?? team.current_question ?? 0;
                const newStatus = (currentQ > 0) ? 'saved' : 'waiting';
                await dbOps.gamesDb.prepare("UPDATE expedition_teams SET status = ? WHERE id = ?").run(newStatus, teamId);
                console.log(`🔄 Owner ${displayName} reactivated team ${teamId} via API to status: ${newStatus}`);
                team.status = newStatus; // Update local obj for response
            } else {
                return res.status(400).json({ success: false, error: '隊長目前離線中，無法加入' });
            }
        } else if (team.status !== 'waiting' && team.status !== 'saved') {
            return res.status(400).json({ success: false, error: `隊伍已開始遊戲，無法加入 (Status: ${team.status})` });
        }

        await dbOps.gamesDb.prepare(`
            INSERT INTO expedition_team_members (team_id, user_id, display_name, is_owner)
            VALUES (?, ?, ?, FALSE)
            ON CONFLICT(team_id, display_name) DO NOTHING
        `).run(teamId, userId || null, displayName);

        const members = await dbOps.gamesDb.prepare(
            'SELECT user_id, display_name, is_owner FROM expedition_team_members WHERE team_id = ?'
        ).all(teamId);

        console.log(`👤 ${displayName} joined team ${teamId}`);

        res.json({
            success: true,
            team: {
                id: team.id,
                name: team.name,
                ownerName: team.ownerName,
                status: team.status,
                currentStage: team.currentStage || 1,
                currentQuestion: team.currentQuestion || 0,
                hasSavedProgress: team.status === 'saved' && team.currentQuestion > 0,
                members: members.map(m => ({
                    userId: m.userId,
                    displayName: m.displayName,
                    isOwner: !!m.isOwner,
                    online: false
                }))
            }
        });
    } catch (error) {
        console.error('Join Team Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check Team Status (Simple) - Copied from V2
router.get('/teams/:teamId/status', async (req, res) => {
    try {
        const { teamId } = req.params;
        const team = await dbOps.gamesDb.prepare('SELECT status, owner_id FROM expedition_teams WHERE id = ?').get(teamId);

        if (!team) {
            return res.status(404).json({ status: 'not_found' });
        }

        res.json({
            status: team.status,
            owner_id: team.ownerId || team.owner_id
        });
    } catch (error) {
        console.error('Check team status error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const { name, userId, displayName } = req.body;

        if (!name) return res.status(400).json({ success: false, error: '缺少隊伍名稱' });

        const team = await dbOps.gamesDb.prepare('SELECT owner_id, owner_name FROM expedition_teams WHERE id = ?').get(teamId);
        if (!team) return res.status(404).json({ success: false, error: '隊伍不存在' });

        const member = await dbOps.gamesDb.prepare(
            'SELECT is_owner FROM expedition_team_members WHERE team_id = ? AND display_name = ?'
        ).get(teamId, displayName);

        // Handle both boolean (PostgreSQL) and integer (SQLite) responses, and camelCase transform
        const isOwnerVal = member?.isOwner ?? member?.is_owner;
        const isOwner = member && (isOwnerVal === true || isOwnerVal === 1);

        if (!isOwner) {
            if (userId && (team.ownerId || team.owner_id) === userId) {
                // pass
            } else {
                return res.status(403).json({ success: false, error: '只有隊長可以更改隊名' });
            }
        }

        await dbOps.gamesDb.prepare('UPDATE expedition_teams SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, teamId);

        console.log(`✏️ Team ${teamId} renamed to ${name} by ${displayName}`);
        res.json({ success: true, name });
    } catch (error) {
        console.error('Update Team Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;

        const team = await dbOps.gamesDb.prepare('SELECT * FROM expedition_teams WHERE id = ?').get(teamId);

        if (!team) {
            return res.status(404).json({ success: false, error: '找不到該隊伍' });
        }

        const members = await dbOps.gamesDb.prepare(
            'SELECT display_name, is_owner FROM expedition_team_members WHERE team_id = ?'
        ).all(teamId);

        res.json({
            success: true,
            team: {
                id: team.id,
                name: team.name,
                ownerName: team.ownerName || team.owner_name,
                status: team.status,
                currentQuestion: team.currentQuestion ?? team.current_question,
                currentStage: team.currentStage ?? team.current_stage,
                lives: team.lives,
                score: team.score,
                members: members.map(m => ({
                    name: m.displayName || m.display_name,
                    isOwner: !!(m.isOwner ?? m.is_owner)
                }))
            }
        });
    } catch (error) {
        console.error('Get Team Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 排行榜系統 API
// ============================================
// 排行榜表初始化函數
router.post('/record', async (req, res) => {
    try {
        const { teamName, members, score, stageReached, duration } = req.body;

        if (!teamName) return res.status(400).json({ success: false, error: '缺少隊伍名稱' });

        const membersStr = JSON.stringify(members || []);

        await dbOps.gamesDb.prepare(`
            INSERT INTO expedition_records (team_name, members, score, stage_reached, duration_seconds)
            VALUES (?, ?, ?, ?, ?)
        `).run(teamName, membersStr, score || 0, stageReached || 1, duration || 0);

        console.log(`🏆 Record saved: ${teamName} - Stage ${stageReached} - Score ${score}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Save Record Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Leaderboard - V3 with PostgreSQL compatibility
router.get('/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const type = req.query.type || 'team'; // 'team' or 'individual'

        let leaderboard = [];

        // First, check if the expedition_teams table exists and has data
        let teams = [];
        try {
            teams = await dbOps.gamesDb.prepare(`
                SELECT
                    et.id as team_id,
                    et.name as team_name,
                    et.owner_name,
                    et.current_question,
                    et.current_stage,
                    et.created_at,
                    et.status
                FROM expedition_teams et
                WHERE et.status IN ('gameover', 'offline')
                ORDER BY et.current_stage DESC, et.current_question DESC, et.created_at DESC
                LIMIT ?
            `).all(limit);
        } catch (tableErr) {
            console.error('Leaderboard table query failed:', tableErr.message);
            // Table might not exist yet - return empty leaderboard
            return res.json({ success: true, leaderboard: [], type, message: 'No expedition data yet' });
        }

        if (type === 'individual') {
            // Individual Rankings: For now, just use team owner as individual
            leaderboard = teams.map((row, idx) => ({
                rank: idx + 1,
                teamId: row.teamId || row.team_id,
                displayName: row.ownerName || row.owner_name,
                maxQuestions: row.currentQuestion ?? row.current_question ?? 0,
                maxStage: row.currentStage ?? row.current_stage ?? 1,
                playedAt: row.createdAt || row.created_at
            }));
        } else {
            // Team Rankings
            leaderboard = teams.map((row, idx) => ({
                rank: idx + 1,
                teamId: row.teamId || row.team_id,
                teamName: row.teamName || row.team_name,
                maxQuestions: row.currentQuestion ?? row.current_question ?? 0,
                maxStage: row.currentStage ?? row.current_stage ?? 1,
                playedAt: row.createdAt || row.created_at
            }));
        }

        res.json({ success: true, leaderboard, type });
    } catch (error) {
        console.error('Get Leaderboard Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
