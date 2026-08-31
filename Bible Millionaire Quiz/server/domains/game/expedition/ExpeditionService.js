import { dbOps } from '../../../database/index.js';

/**
 * Service for handling Expedition saves and team state management
 * Enforces "Captain-Centric" save logic.
 */
class ExpeditionService {

    /**
     * Get the save file for a specific user (Captain).
     * @param {string} userId
     * @returns {object|null} { stage, question, savedAt } or null
     */
    async getUserSave(userId) {
        try {
            const save = await dbOps.gamesDb.get('SELECT save_data, created_at FROM expedition_saves WHERE user_id = $1', [userId]);
            const rawSaveData = save?.saveData || save?.save_data;
            if (save && rawSaveData) {
                const data = (typeof rawSaveData === 'string') ? JSON.parse(rawSaveData) : rawSaveData;
                return {
                    ...data,
                    stage: data.stage || 1,
                    question: data.question || 0,
                    savedAt: save.createdAt || save.created_at
                };
            }
            return null;
        } catch (error) {
            console.error('[ExpeditionService] GetUserSave Error:', error);
            throw error;
        }
    }

    /**
     * Check if saving the current progress will overwrite a better save for the captain.
     * @param {string} teamId - The current team ID (to find owner)
     * @param {number} newStage - Current stage to save
     * @param {number} newQuestion - Current question to save
     * @returns {Promise<object>} { hasConflict: boolean, ownerName: string, message: string }
     */
    async checkSaveConflict(teamId, newStage, newQuestion) {
        try {
            const team = await dbOps.gamesDb.get('SELECT owner_id, owner_name FROM expedition_teams WHERE id = $1', [teamId]);
            if (!team) throw new Error('隊伍不存在');

            const ownerId = team.ownerId;
            const ownerName = team.ownerName;

            if (!ownerId) {
                return { hasConflict: false, ownerName };
            }

            const existingSave = await this.getUserSave(ownerId);
            if (existingSave) {
                const existingProgress = (existingSave.stage || 1) * 1000 + (existingSave.question || 0);
                const newProgress = (newStage || 1) * 1000 + (newQuestion || 0);

                if (newProgress < existingProgress) {
                    return {
                        hasConflict: true,
                        ownerName,
                        currentSave: existingSave,
                        message: `這將覆蓋隊長 ${ownerName} 的較佳存檔（關卡 ${existingSave.stage} - 第 ${existingSave.question} 題）`
                    };
                }
            }

            return { hasConflict: false, ownerName };

        } catch (error) {
            console.error('[ExpeditionService] CheckConflict Error:', error);
            throw error;
        }
    }

    /**
     * [SOVEREIGN] 資產清算協議 (Refund Protocol)
     * 將內存背包中的剩餘物資退還至資料庫倉庫
     * @param {string} userId
     * @param {object} backpack - { item_id: quantity }
     */
    async refundItems(userId, backpack) {
        if (!userId || !backpack) return;
        try {
            console.log(`♻️ [ExpeditionService] Refunding items to user ${userId}:`, backpack);
            for (const [itemId, quantity] of Object.entries(backpack)) {
                if (quantity <= 0) continue;

                // Using PostgreSQL UPSERT logic
                await dbOps.gamesDb.run(`
                    INSERT INTO expedition_inventory (user_id, item_id, quantity)
                    VALUES ($1, $2, $3)
                    ON CONFLICT(user_id, item_id)
                    DO UPDATE SET quantity = expedition_inventory.quantity + EXCLUDED.quantity
                `, [userId, itemId, quantity]);
            }
        } catch (error) {
            console.error('[ExpeditionService] RefundItems Error:', error);
            throw error;
        }
    }

    /**
     * [SOVEREIGN] 資產撥付協議 (Provisioning Protocol)
     * 開戰前從資料庫預扣背包物資
     * @param {string} userId
     * @param {object} backpack - { item_id: quantity }
     */
    async provisionItems(userId, backpack) {
        if (!userId || !backpack) return;
        try {
            console.log(`📦 [ExpeditionService] Provisioning items for user ${userId}:`, backpack);
            for (const [itemId, quantity] of Object.entries(backpack)) {
                if (quantity <= 0) continue;

                const row = await dbOps.gamesDb.get('SELECT quantity FROM expedition_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
                const currentQty = row ? row.quantity : 0;

                if (currentQty < quantity) {
                    throw new Error(`物資不足: ${itemId} (需要 ${quantity}, 現有 ${currentQty})`);
                }

                const newQty = currentQty - quantity;
                if (newQty <= 0) {
                    await dbOps.gamesDb.run('DELETE FROM expedition_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
                } else {
                    await dbOps.gamesDb.run('UPDATE expedition_inventory SET quantity = $1 WHERE user_id = $2 AND item_id = $3', [newQty, userId, itemId]);
                }
            }
        } catch (error) {
            console.error('[ExpeditionService] ProvisionItems Error:', error);
            throw error;
        }
    }

    /**
     * Save progress to the CAPTAIN'S save file.
     * @param {string} teamId
     * @param {number} stage
     * @param {number} question
     * @param {object} metadata - Extra data like { isEmergency: true, members: [...] }
     * @returns {object} Result
     */
    async saveProgress(teamId, stage, question, metadata = {}) {
        try {
            const team = await dbOps.gamesDb.get('SELECT owner_id FROM expedition_teams WHERE id = $1', [teamId]);
            if (!team) throw new Error('Team not found');

            const ownerId = team.ownerId;
            if (!ownerId) {
                return { success: false, reason: 'guest_owner' };
            }

            // [SOVEREIGN] Professional State Snapshot
            const saveData = JSON.stringify({
                stage: stage,
                question: question,
                savedAt: new Date().toISOString(),
                ...metadata  // This can include members' status, lives, etc.
            });

            await dbOps.gamesDb.run(`
                INSERT INTO expedition_saves (user_id, save_data) VALUES ($1, $2)
                ON CONFLICT(user_id) DO UPDATE SET save_data = EXCLUDED.save_data, created_at = CURRENT_TIMESTAMP
            `, [ownerId, saveData]);

            // [NEW] Update the team table status as well to 'saved'
            await dbOps.gamesDb.run('UPDATE expedition_teams SET status = $1, current_stage = $2, current_question = $3 WHERE id = $4',
                ['saved', stage, question, teamId]);

            console.log(`💾 [ExpeditionService] Saved Progress for Captain ${ownerId}: Stage ${stage}, Q ${question} (Snapshot: ${metadata.isEmergency ? 'Emergency' : 'Standard'})`);
            return { success: true };

        } catch (error) {
            console.error('[ExpeditionService] SaveProgress Error:', error);
            throw error;
        }
    }

    /**
     * [SOVEREIGN] 全隊資產批次歸還 (Refund Room Members)
     * 遍歷房間內所有在線/離線成員，將其內存背包資產結算回資料庫
     * @param {object} room - Socket Room Object
     */
    async refundRoomMembers(room) {
        if (!room || !room.members) return;
        console.log(`🧹 [ExpeditionService] Starting Batch Refund for Room: ${room.teamId}`);
        for (const member of room.members.values()) {
            if (member.userId && member.inventory) {
                try {
                    await this.refundItems(member.userId, member.inventory);
                    // 清空內存背包，防止重複清算
                    member.inventory = {};
                } catch (e) {
                    console.error(`[ExpeditionService] Refund failed for member ${member.displayName}:`, e);
                }
            }
        }
    }

    /**
     * Load save data for a user joining a team
     * @param {string} userId
     * @returns {object|null} { stage, question, lives }
     */
    async loadUserSave(userId) {
        try {
            const save = await dbOps.gamesDb.get('SELECT * FROM expedition_saves WHERE user_id = $1', [userId]);
            const rawData = save?.saveData || save?.save_data;
            if (save && rawData) {
                const data = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
                return {
                    ...data,
                    stage: data.stage || 1,
                    question: data.question || 0,
                    lives: 3
                };
            }
            return null;
        } catch (error) {
            console.error('[ExpeditionService] LoadUserSave Error:', error);
            return null;
        }
    }

    /**
     * Prepare initial room state based on team status
     * @param {string} teamId
     * @returns {object|null}
     */
    async getInitialRoomState(teamId) {
        try {
            const team = await dbOps.gamesDb.get('SELECT * FROM expedition_teams WHERE id = $1', [teamId]);
            if (!team) return null;

            return {
                stage: team.currentStage || 1,
                question: team.currentQuestion || 0,
                status: team.status
            };
        } catch (e) {
            console.error('[ExpeditionService] GetInitialRoomState Error:', e);
            return null;
        }
    }

    /**
     * Delete Captain's save on game start (Delayed Burn)
     * @param {string} userId
     */
    async burnSave(userId) {
        try {
            await dbOps.gamesDb.run('DELETE FROM expedition_saves WHERE user_id = $1', [userId]);
            console.log(`🔥 [ExpeditionService] Burned save for ${userId}`);
        } catch (e) {
            console.error('[ExpeditionService] BurnSave Error:', e);
        }
    }

    /**
     * Update team status in DB
     * @param {string} teamId
     * @param {string} status
     * @param {number} stage
     * @param {number} question
     */
    async updateTeamStatus(teamId, status, stage, question) {
        try {
            await dbOps.gamesDb.run("UPDATE expedition_teams SET status = $1, current_stage = $2, current_question = $3 WHERE id = $4",
                [status, stage, question, teamId]);
        } catch (e) {
            console.error('[ExpeditionService] UpdateTeamStatus Error:', e);
        }
    }

    /**
     * [SOVEREIGN] 獲取用戶擁有的遠征隊伍
     * 支援主權識別，確保返回結果符合規範以便前端處理
     * @param {string} userId
     */
    async getUserTeam(userId) {
        try {
            const team = await dbOps.gamesDb.get('SELECT * FROM expedition_teams WHERE owner_id = $1', [userId]);
            if (team) {
                return {
                    id: team.id,
                    name: team.name,
                    ownerId: team.ownerId,
                    ownerName: team.ownerName,
                    status: team.status,
                    currentStage: team.currentStage || 1,
                    currentQuestion: team.currentQuestion || 0
                };
            }
            return null;
        } catch (error) {
            console.error('[ExpeditionService] GetUserTeam Error:', error);
            return null;
        }
    }

    /**
     * 生成唯一的 6 位遠征隊伍碼 (排除易混淆字元)
     */
    async generateUniqueTeamCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let isUnique = false;
        let code = '';
        while (!isUnique) {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const existing = await dbOps.gamesDb.get('SELECT id FROM expedition_teams WHERE id = $1', [code]);
            if (!existing) isUnique = true;
        }
        return code;
    }

    /**
     * 確保用戶擁有遠征隊伍 (若無則自動建立)
     * [SOVEREIGN] 每位用戶的基本屬地保障
     */
    async ensureUserHasTeam(userId, username) {
        try {
            // 1. 檢查是否已有隊伍 (抓取所有欄位以支持主權識別)
            const existing = await dbOps.gamesDb.get('SELECT * FROM expedition_teams WHERE owner_id = $1', [userId]);
            if (existing) return existing;

            // 2. 生成新隊伍
            const teamId = await this.generateUniqueTeamCode();
            const teamName = `${username} 的遠征隊`;

            // 3. 寫入隊伍表
            await dbOps.gamesDb.run(`
                INSERT INTO expedition_teams (id, name, owner_id, owner_name, current_stage, status)
                VALUES ($1, $2, $3, $4, 1, 'waiting')
            `, [teamId, teamName, userId, username]);

            // 4. 寫入成員表 (房主即成員)
            await dbOps.gamesDb.run(`
                INSERT INTO expedition_team_members (team_id, user_id, display_name, is_owner)
                VALUES ($1, $2, $3, TRUE)
                ON CONFLICT(team_id, user_id) DO NOTHING
            `, [teamId, userId, username]);

            console.log(`🏕️  [ExpeditionService] Auto-assigned team ${teamId} to user ${username}`);
            return { id: teamId, name: teamName };
        } catch (error) {
            console.error('[ExpeditionService] EnsureUserHasTeam Error:', error);
            throw error;
        }
    }
}

const expeditionService = new ExpeditionService();
export { expeditionService };
export default expeditionService;
