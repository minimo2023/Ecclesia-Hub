import { dbOps } from '../../../database/index.js';
import { expeditionService as ExpeditionService } from '../../../domains/game/expedition/ExpeditionService.js';
import { activeRooms } from '../registry.js';
import { getPublicMemberData, syncMemberShield } from '../utils.js';
import { startNextQuestion, startAnswerCountdown } from '../core/gameEngine.js';

export function registerItemHandlers(io, socket) {
    const expeditionNamespace = io.of('/expedition');

    /**
     * 使用道具
     */
    socket.on('use-item', async ({ itemId, targetNames, action }) => {
        const { teamId, displayName, userId } = socket.data;
        if (!teamId) return;
        const room = activeRooms.get(teamId);
        if (!room) return;

        // [SOVEREIGN] Phase 防護策略：
        // - scroll / tent 僅限 waiting / thinking 使用（影響題目流程）
        // - healthPotion / revive / shield 允許 judging 期間使用（戰鬥後立即援助）
        // - answering 期間禁止所有道具（避免干擾答題）
        const systemOnlyItems = ['scroll', 'tent'];
        const isSystemOnly = systemOnlyItems.includes(itemId);

        if (room.phase === 'answering') {
            return socket.emit('error', { message: '作答期間無法使用道具，請等待結算後再試' });
        }

        if (isSystemOnly && room.phase !== 'waiting' && room.phase !== 'thinking') {
            return socket.emit('error', { message: `${itemId === 'scroll' ? '卷軸' : '帳篷'}僅能在等待或思考期間使用` });
        }

        // 非 system 道具（藥水、盾牌、復活）允許在 waiting/thinking/judging 使用
        const allowedPhases = ['waiting', 'thinking', 'judging'];
        if (!isSystemOnly && !allowedPhases.includes(room.phase)) {
            return socket.emit('error', { message: '目前無法使用道具，請等待本回合結束' });
        }

        const sender = room.members.get(displayName);
        if (!sender || !sender.inventory || !sender.inventory[itemId] || sender.inventory[itemId] <= 0) {
            return socket.emit('error', { message: '庫存不足' });
        }

        let targets = [];
        const isSystemItem = ['scroll', 'tent'].includes(itemId);

        if (Array.isArray(targetNames) && targetNames.length > 0) {
            targets = targetNames.map(name => room.members.get(name)).filter(Boolean);
        } else if (!isSystemItem) {
            targets = [sender];
        }

        if (targets.length === 0 && !isSystemItem) {
            return socket.emit('error', { message: '請選擇有效的目標' });
        }

        const requiredCount = isSystemItem ? 1 : targets.length;
        if (sender.inventory[itemId] < requiredCount) {
            return socket.emit('error', { message: `庫存不足（需要 ${requiredCount}）` });
        }

        let successCount = 0;
        let shouldReturnToLobby = false;
        const appliedTargets = [];

        switch (itemId) {
            case 'healthPotion':
                targets.forEach(t => {
                    if (t.lives < 3 && t.lives > 0) {
                        t.lives += 1;
                        successCount++;
                        appliedTargets.push(t.displayName);
                    }
                });
                break;
            case 'revive':
                targets.forEach(t => {
                    if (t.lives <= 0) {
                        t.lives = 1;
                        successCount++;
                        appliedTargets.push(t.displayName);
                    }
                });
                break;
            case 'shield':
                for (const t of targets) {
                    t.inventory['shield'] = (t.inventory['shield'] || 0) + 1;
                    // [SOVEREIGN] 移除即時 DB 更新。
                    // 資產流轉遵循：大廳撥付 (Provision) -> 戰場內存使用 -> 撤退歸還 (Refund)
                    syncMemberShield(t);
                    successCount++;
                    appliedTargets.push(t.displayName);
                }
                break;
            case 'scroll':
                if (room.phase === 'thinking' && room.currentQuestion) {
                    if (!room.removedIndices) room.removedIndices = new Set();
                    if (room.removedIndices.size >= 2) return socket.emit('error', { message: '無法再使用卷軸' });
                    const correctIdx = room.currentQuestion.correctIndex;
                    const wrongIndices = room.currentQuestion.options.map((_, i) => i).filter(i => i !== correctIdx && !room.removedIndices.has(i));
                    const remainingQuota = 2 - room.removedIndices.size;
                    const countToRemove = Math.min(wrongIndices.length, remainingQuota);
                    const indicesToRemove = [];
                    for (let k = 0; k < countToRemove; k++) {
                        const r = Math.floor(Math.random() * wrongIndices.length);
                        const removed = wrongIndices.splice(r, 1)[0];
                        indicesToRemove.push(removed);
                        room.removedIndices.add(removed);
                    }
                    expeditionNamespace.to(teamId).emit('item:effect', { type: 'scroll', removedIndices: indicesToRemove, byPlayer: displayName });
                    successCount = 1;
                    appliedTargets.push('全隊 (立即生效)');
                } else {
                    room.pendingScroll = true;
                    successCount = 1;
                    appliedTargets.push('全隊 (下一題生效)');
                }
                break;
            case 'tent':
                try {
                    const isLeave = action === 'save_and_leave';
                    
                    // [SOVEREIGN] 存檔離開前執行資產歸還協議
                    if (isLeave) {
                        await ExpeditionService.refundRoomMembers(room);
                    }

                    // Snapshot all members' state for full recovery
                    const memberSnapshot = Array.from(room.members.values()).map(m => ({
                        displayName: m.displayName,
                        userId: m.userId,
                        lives: m.lives,
                        inventory: m.inventory,
                        hasShield: m.hasShield
                    }));

                    const res = await ExpeditionService.saveProgress(teamId, room.stage, room.currentQuestionCount, true, { 
                        members: memberSnapshot 
                    });
                    
                    if (!res.success) throw new Error(res.reason === 'guest_owner' ? '訪客無法存檔' : '存檔失敗');
                    
                    await ExpeditionService.updateTeamStatus(teamId, isLeave ? 'saved' : 'playing', room.stage, room.currentQuestionCount);
                    room.tentCheckpoint = { stage: room.stage, question: room.currentQuestionCount, members: memberSnapshot };
                    successCount = 1;
                    if (isLeave) { shouldReturnToLobby = true; appliedTargets.push('存檔並返回'); }
                    else { appliedTargets.push('存檔成功'); }
                } catch (e) { return socket.emit('error', { message: `存檔失敗: ${e.message}` }); }
                break;
        }

        if (successCount > 0) {
            sender.inventory[itemId] -= successCount;
            if (sender.inventory[itemId] <= 0) delete sender.inventory[itemId];
            // [SOVEREIGN] 移除即時 DB 更新邏輯，道具消耗僅更新內存，資料庫交由 Refund 統一處理
            syncMemberShield(sender);
            expeditionNamespace.to(teamId).emit('item:used', { itemId, byPlayer: displayName, targetPlayer: appliedTargets.join(', '), success: true });
            expeditionNamespace.to(teamId).emit('team:updated', { members: Array.from(room.members.values()).map(getPublicMemberData), currentStage: room.stage, currentQuestion: room.currentQuestionCount, ownerId: room.ownerId });

            if (shouldReturnToLobby) {
                expeditionNamespace.to(teamId).emit('tent:preparing', { byPlayer: displayName, message: `${displayName} 正在存檔，準備返回營地...`, countdown: 3 });
                setTimeout(async () => {
                    const r = activeRooms.get(teamId);
                    if (!r) return;
                    r.phase = 'waiting';
                    r.status = 'waiting';
                    r.currentQuestion = null;
                    r.members.forEach(m => { m.lives = 3; m.hasShield = false; });
                    await ExpeditionService.updateTeamStatus(teamId, 'waiting', r.stage, r.currentQuestionCount);
                    expeditionNamespace.to(teamId).emit('game:returned:to:lobby', { currentStage: r.stage, currentQuestion: r.currentQuestionCount });
                    expeditionNamespace.to(teamId).emit('team:updated', { members: Array.from(r.members.values()).map(getPublicMemberData), status: 'waiting' });
                    expeditionNamespace.to(teamId).emit('game:reset');
                }, 3000);
            }
        } else {
            // 給出更明確的失敗原因
            let reason = '目標狀態無法使用該道具';
            if (itemId === 'healthPotion') reason = '所選目標的生命值已滿（僅限殘血隊友）或已陣亡（需用復活號角）';
            else if (itemId === 'revive') reason = '所選目標尚未陣亡（復活號角僅限0血量）';
            return socket.emit('error', { message: reason });
        }
    });

    /**
     * 交易/贈送
     */
    socket.on('trade-items', async ({ teamId, items, targetNames }) => {
        try {
            const { displayName, userId } = socket.data;
            const room = activeRooms.get(teamId);
            if (!room) return;
            const sender = room.members.get(displayName);
            if (!sender || !Array.isArray(items) || items.length === 0 || !Array.isArray(targetNames) || targetNames.length === 0) return;
            const targets = targetNames.map(name => room.members.get(name)).filter(t => t && t.displayName !== displayName);
            if (targets.length === 0) return;

            const totalCost = {};
            items.forEach(it => { totalCost[it.id] = (totalCost[it.id] || 0) + (it.quantity * targets.length); });
            for (const [id, req] of Object.entries(totalCost)) {
                if (!sender.inventory[id] || sender.inventory[id] < req) return socket.emit('error', { message: '庫存不足' });
            }

            // [SOVEREIGN] 舊版 trade-items 已廢棄且不安全，改為純內存操作以防刷道具。實際軍援應使用 item:gift。
            const executeTrade = async () => {
                for (const [id, req] of Object.entries(totalCost)) {
                    sender.inventory[id] -= req;
                    if (sender.inventory[id] <= 0) delete sender.inventory[id];
                }
                for (const target of targets) {
                    for (const item of items) {
                        target.inventory[item.id] = (target.inventory[item.id] || 0) + item.quantity;
                    }
                    expeditionNamespace.to(target.socketId).emit('gift:received', { fromName: displayName, items });
                    syncMemberShield(target);
                }
                syncMemberShield(sender);
            };
            await executeTrade();
            expeditionNamespace.to(teamId).emit('team:updated', { members: Array.from(room.members.values()).map(getPublicMemberData) });
            socket.emit('trade:success', { message: `成功贈送給 ${targets.length} 位隊友` });
        } catch (e) { socket.emit('error', { message: e.message || '交易失敗' }); }
    });

    /**
     * 購買同步
     */
    socket.on('item:purchased', async ({ teamId, inventory: guestInventory }) => {
        const { displayName, userId } = socket.data;
        const room = activeRooms.get(teamId);
        if (!room) return;
        try {
            let inv = {};
            if (userId) {
                const rows = await dbOps.gamesDb.all('SELECT item_id, quantity FROM expedition_inventory WHERE user_id = $1', [userId]);
                rows.forEach(r => { inv[r.itemId || r.item_id] = r.quantity; });
                const u = await dbOps.db.get('SELECT coins FROM users WHERE id = $1', [userId]);
                const m = room.members.get(displayName);
                if (m) { m.coins = u?.coins || 0; }
            } else { inv = guestInventory || {}; }
            const m = room.members.get(displayName);
            if (m) { m.inventory = inv; syncMemberShield(m); }
            expeditionNamespace.to(teamId).emit('team:updated', { members: Array.from(room.members.values()).map(getPublicMemberData) });
        } catch (e) { console.error('Purchase sync error:', e); }
    });

    /**
     * 道具意向
     */
    socket.on('item:intent', ({ itemId, targeting }) => {
        const { teamId, displayName } = socket.data;
        if (!teamId) return;
        const room = activeRooms.get(teamId);
        if (room) {
            const m = room.members.get(displayName);
            if (m) m.intentItemId = targeting ? itemId : null;
            socket.to(teamId).emit('item:intent:broadcast', { displayName, itemId, targeting });
        }
    });

    /**
     * 贈送預告
     */
    socket.on('gift:intent', ({ targetDisplayName }) => {
        const { teamId, displayName } = socket.data;
        const room = activeRooms.get(teamId);
        if (room) {
            const t = room.members.get(targetDisplayName);
            if (t?.socketId) expeditionNamespace.to(t.socketId).emit('gift:notifying', { fromName: displayName });
        }
    });

    /**
     * 隊長提醒
     */
    socket.on('team:remind', ({ targetDisplayName }) => {
        const { teamId, displayName } = socket.data;
        const room = activeRooms.get(teamId);
        if (room && room.members.get(displayName)?.isOwner) {
            expeditionNamespace.to(teamId).emit('team:reminded', { targetDisplayName, fromName: displayName, timestamp: Date.now() });
        }
    });
}
