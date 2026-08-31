import { dbOps } from '../../../database/index.js';
import { LogosBank } from '../../../database/services/LogosBankService.js';
import { replenishStock } from '../../../domains/game/engine/QuestionCore.js';
import { expeditionService as ExpeditionService } from '../../../domains/game/expedition/ExpeditionService.js';
import { activeRooms } from '../registry.js';
import { getPublicMemberData, syncMemberShield } from '../utils.js';
import { startLobbyPrefetch } from '../core/gameEngine.js';

export function registerRoomHandlers(io, socket) {
    const expeditionNamespace = io.of('/expedition');

    /**
     * 加入隊伍房間
     */
    socket.on('join-team', async ({ teamId, displayName: name, userId: uid, inventory, loadSave, reset, avatar: guestAvatar }) => {
        try {
            if (!teamId || typeof teamId !== 'string') return socket.emit('error', { message: '缺少有效的隊伍ID' });
            if (!name || typeof name !== 'string') return socket.emit('error', { message: '缺少有效的顯示名稱' });

            teamId = teamId.trim().toUpperCase();
            const displayName = name.trim();
            const userId = uid || null;
            socket.data.inventory = inventory || {};

            const team = await dbOps.gamesDb.get('SELECT * FROM expedition_teams WHERE id = $1', [teamId]);
            if (!team) return socket.emit('error', { message: '隊伍不存在' });

            // [SOVEREIGN] Identity Auto-Repair: Sync missing owner metadata for legacy records
            let currentOwnerName = team.ownerName;
            if (!currentOwnerName && team.ownerId) {
                console.log(`🔧 [AutoRepair] Attempting to fix ownerName for team ${teamId} (Owner: ${team.ownerId})`);
                const ownerRow = await dbOps.usersDb.get('SELECT username FROM users WHERE id = $1', [team.ownerId]);
                if (ownerRow?.username) {
                    currentOwnerName = ownerRow.username;
                    await dbOps.gamesDb.run('UPDATE expedition_teams SET owner_name = $1 WHERE id = $2', [currentOwnerName, teamId]);
                    console.log(`✅ [AutoRepair] Fixed team ${teamId} -> Owner: ${currentOwnerName}`);
                }
            }

            // [SOVEREIGN] Identity check: support both camelCase (PostgresAdapter) and snake_case (SQLite)
            const teamOwnerId = team.ownerId ?? team.owner_id;
            const isOwnerJoin = (userId && String(teamOwnerId) === String(userId)) ||
                               (!userId && currentOwnerName === name.trim());

            console.log(`📡 [Expedition] Join attempt - Room: ${teamId}, User: ${displayName}, ID: ${userId}, IsOwner: ${isOwnerJoin}`);
            if (userId && !isOwnerJoin) {
                console.log(`🔍 [AuthCheck] UID mismatch: TeamOwner=${teamOwnerId} vs Requester=${userId}`);
            }

            if (!activeRooms.has(teamId) && team.status === 'playing') {
                console.log(`⚠️ [AutoFix] Room ${teamId} is playing in DB but missing in memory. Resetting to saved.`);
                team.status = 'saved';
            }

            if (team.status === 'offline') {
                if (isOwnerJoin) {
                    const newStatus = (team.currentQuestion > 0) ? 'saved' : 'waiting';
                    await ExpeditionService.updateTeamStatus(teamId, newStatus, team.currentStage || 1, team.currentQuestion || 0);
                    team.status = newStatus;
                    console.log(`👑 [Sovereign] Owner ${displayName} reactivated territory ${teamId} to status: ${newStatus}`);
                } else {
                    return socket.emit('error', { message: '領主目前不在領地上 (離線中)，援軍暫時無法進入' });
                }
            }

            socket.join(teamId);
            socket.data.teamId = teamId;
            socket.data.displayName = displayName;
            socket.data.userId = userId;

            let loadedLives = 3;
            let userAvatar = guestAvatar || 'guest';

            if (userId) {
                try {
                    const userRow = await dbOps.usersDb.get('SELECT settings FROM users WHERE id = $1', [userId]);
                    if (userRow?.settings) {
                        const settings = typeof userRow.settings === 'string' ? JSON.parse(userRow.settings) : userRow.settings;
                        if (settings.avatar) userAvatar = settings.avatar;
                    }
                } catch (e) { console.error('Failed to fetch user avatar:', e); }
            }
            socket.data.avatar = userAvatar;

            const roomExists = activeRooms.has(teamId);
            if (!roomExists) {
                const initialState = await ExpeditionService.getInitialRoomState(teamId);
                let initialStage = initialState?.stage || 1;
                let initialQuestion = initialState?.question || 0;

                if (isOwnerJoin && loadSave) {
                    const save = await ExpeditionService.loadUserSave(userId);
                    if (save) {
                        initialStage = save.stage;
                        initialQuestion = save.question;
                        loadedLives = save.lives || 3;
                    }
                }

                // [SOVEREIGN] Initialize room with Shadow Owner
                activeRooms.set(teamId, {
                    teamId,
                    members: new Map(),
                    currentQuestion: null,
                    answers: new Map(),
                    phase: 'waiting',
                    timer: null,
                    stage: initialStage,
                    currentQuestionCount: initialQuestion,
                    ownerId: team.ownerId ?? team.owner_id,
                    ownerName: currentOwnerName,
                    status: team.status || 'waiting',
                    answeredIds: new Set()
                });

                // Pre-populate with Shadow Owner (Offline)
                const room = activeRooms.get(teamId);
                room.members.set(currentOwnerName, {
                    displayName: currentOwnerName,
                    userId: team.ownerId,
                    lives: 3,
                    coins: 0,
                    isOwner: true,
                    inventory: {},
                    isReady: true,
                    hasActiveShield: false,
                    hasShield: false,
                    online: false,
                    avatar: 'guest' // Will be updated when they actually join
                });

                replenishStock(null, null, 5).catch(console.error);
            } else if (isOwnerJoin) {
                const room = activeRooms.get(teamId);
                if (reset) {
                    room.stage = 1;
                    room.currentQuestionCount = 0;
                    room.phase = 'waiting';
                    room.answeredIds = new Set();
                    room.status = 'waiting';
                    await ExpeditionService.updateTeamStatus(teamId, 'waiting', 1, 0);
                    console.log(`🔄 [Reset] Force Reset Room for ${displayName}`);
                } else if (loadSave) {
                    const save = await ExpeditionService.loadUserSave(userId);
                    if (save) {
                        room.stage = save.stage;
                        room.currentQuestionCount = save.question;
                        loadedLives = save.lives || 3;
                        console.log(`📂 [Override] Loaded Save for ${displayName}`);
                    }
                }
            }

            const room = activeRooms.get(teamId);
            const isOwner = isOwnerJoin;

            // [LIMIT] 隊伍上限 8 人（含隊長），非隊長加入時檢查
            if (!isOwner) {
                const onlineCount = [...room.members.values()].filter(m => m.online).length;
                if (onlineCount >= 8) {
                    return socket.emit('error', { message: '隊伍已滿（上限 8 人）' });
                }
            }

            let userCoins = 0;
            let inventoryData = {};

            if (userId) {
                try {
                    const userRow = await dbOps.db.get('SELECT coins FROM users WHERE id = $1', [userId]);
                    if (userRow) userCoins = userRow.coins;
                    
                    const existingMember = roomExists ? room.members.get(displayName) : null;
                    if (existingMember && existingMember.inventory) {
                        inventoryData = existingMember.inventory;
                        console.log(`♻️ [Sovereign] Recovered inventory for reconnecting user ${displayName}`);
                    } else {
                        inventoryData = {}; 
                    }
                    
                    // Fetch real avatar for broadcast
                    const profileRow = await dbOps.usersDb.get('SELECT settings FROM users WHERE id = $1', [userId]);
                    if (profileRow?.settings) {
                        const settings = typeof profileRow.settings === 'string' ? JSON.parse(profileRow.settings) : profileRow.settings;
                        if (settings.avatar) userAvatar = settings.avatar;
                    }
                } catch (e) { console.error('Error fetching user data:', e); }
            } else {
                const existingMember = roomExists ? room.members.get(displayName) : null;
                inventoryData = existingMember?.inventory || inventory || socket.data.inventory || {};
            }

            // [FIX] 若 owner join 時大小寫不同於影子 owner key，清除舊的影子 entry 避免重複
            if (isOwner && currentOwnerName && currentOwnerName !== displayName) {
                room.members.delete(currentOwnerName);
                console.log(`🧹 [ShadowClean] Removed shadow entry "${currentOwnerName}", replacing with "${displayName}"`);
            }

            const existing = room.members.get(displayName);
            let finalLives = existing ? existing.lives : (isOwner ? loadedLives : 3);
            const finalActiveShield = existing ? existing.hasActiveShield : false;

            // Actual Socket Join
            room.members.set(displayName, {
                socketId: socket.id,
                displayName,
                userId,
                lives: finalLives,
                coins: userCoins,
                isOwner,
                inventory: inventoryData,
                isJoined: true, // 加入隊伍即視為正式成員
                isReady: isOwner,
                hasActiveShield: finalActiveShield,
                hasShield: false,
                online: true,
                avatar: userAvatar
            });

            syncMemberShield(room.members.get(displayName));

            // [SOVEREIGN] Response includes full member list
            socket.emit('room:joined', {
                id: teamId,
                name: team.name,
                ownerId: team.ownerId || team.owner_id,
                ownerName: currentOwnerName || team.ownerName || team.owner_name,
                members: Array.from(room.members.values()).map(getPublicMemberData),
                currentStage: room.stage,
                currentQuestion: room.currentQuestionCount,
                status: room.status
            });

            // 玩家身處大廳 → 清 buffer 重新預載題目
            if (room.status !== 'playing') {
                startLobbyPrefetch(room);
            }

            expeditionNamespace.to(teamId).emit('team:updated', {
                id: teamId,
                members: Array.from(room.members.values()).map(getPublicMemberData),
                currentStage: room.stage,
                currentQuestion: room.currentQuestionCount,
                ownerId: room.ownerId,
                status: room.status
            });

            // --- New Explicit Join Event ---
            socket.on('squad:join', () => {
                const member = room.members.get(displayName);
                if (member && !member.isJoined) {
                    member.isJoined = true;
                    console.log(`🗡️ [Sovereignty] ${displayName} has formally joined the expedition squad.`);
                    
                    expeditionNamespace.to(teamId).emit('team:updated', {
                        members: Array.from(room.members.values()).map(getPublicMemberData),
                        ownerId: room.ownerId
                    });
                }
            });

            if (room.phase !== 'waiting') {
                socket.emit('game:sync', {
                    phase: room.phase,
                    question: room.currentQuestion ? {
                        question: room.currentQuestion.question,
                        options: room.currentQuestion.options
                    } : null,
                    teamProgress: {
                        currentStage: room.stage,
                        currentQuestion: room.currentQuestionCount
                    }
                });
            }

        } catch (error) {
            console.error('Join team error:', error);
            socket.emit('error', { message: error.message });
        }
    });

    /**
     * [SOVEREIGN] 身分同步 (訪客註冊/登入後升級 Session)
     */
    socket.on('identity:sync', async ({ userId, displayName, token }) => {
        const { teamId } = socket.data;
        if (!teamId || !userId) return;

        console.log(`📡 [IdentitySync] Upgrading guest to member: ${displayName} (UID: ${userId})`);
        
        const room = activeRooms.get(teamId);
        if (!room) return;

        const oldName = socket.data.displayName;
        const member = room.members.get(oldName);
        
        if (member) {
            // 1. 更新內存狀態
            member.userId = userId;
            member.displayName = displayName;
            socket.data.userId = userId;
            socket.data.displayName = displayName;
            
            // 如果名稱變更，更換 Map Key
            if (oldName !== displayName) {
                room.members.delete(oldName);
                room.members.set(displayName, member);
            }

            // 2. 資產遷移 (僅限「真正的訪客升級」才執行，防止已登入用戶重複加幣)
            // [FIX] 只有當 member 原本沒有 userId (真訪客) 才執行遷移，否則只更新身份資料
            const wasGuest = !member.userId;
            try {
                if (wasGuest) {
                    // 訪客金幣遷移（member.coins 是訪客本局累積，非 DB 餘額）
                    if (member.coins > 0) {
                        await LogosBank.adjustAssets(userId, 'COIN', member.coins, 'expedition_guest_migration');
                    }
                    // 訪客道具遷移
                    for (const [itemId, qty] of Object.entries(member.inventory || {})) {
                        await dbOps.gamesDb.run(`
                            INSERT INTO expedition_inventory (user_id, item_id, quantity)
                            VALUES ($1, $2, $3)
                            ON CONFLICT(user_id, item_id) DO UPDATE SET
                                quantity = expedition_inventory.quantity + excluded.quantity
                        `, [userId, itemId, qty]);
                    }
                    console.log(`✅ [IdentitySync] Guest asset migration complete for ${displayName}`);
                } else {
                    console.log(`ℹ️ [IdentitySync] ${displayName} already identified, skipping asset migration`);
                }
            } catch (e) {
                console.error('[IdentitySync] Asset migration failed:', e);
            }

            // 2.5 領主主權遷移 (如果同步者是隊長)
            if (member.isOwner) {
                try {
                    room.ownerId = userId;
                    room.ownerName = displayName;
                    await dbOps.gamesDb.run('UPDATE expedition_teams SET owner_id = $1, owner_name = $2 WHERE id = $3', [userId, displayName, teamId]);
                    console.log(`👑 [IdentitySync] Sovereignty transferred for team ${teamId} to UID ${userId}`);
                } catch (e) {
                    console.error('[IdentitySync] Sovereignty transfer failed:', e);
                }
            }

            // 3. 通知全員
            expeditionNamespace.to(teamId).emit('team:updated', {
                members: Array.from(room.members.values()).map(getPublicMemberData),
                ownerId: room.ownerId
            });

            // 4. 私人成功通知
            socket.emit('identity:synced', { success: true, userId, displayName });
        }
    });

    /**
     * 準備就緒
     */
    socket.on('toggle-ready', ({ teamId, backpack }) => {
        const room = activeRooms.get(teamId);
        if (!room) return;
        const displayName = socket.data.displayName;
        const member = room.members.get(displayName);
        if (member) {
            member.isReady = !member.isReady;
            // 無論是準備或取消準備，都同步最新的背包意向
            member.inventory = backpack || {};
            
            expeditionNamespace.to(teamId).emit('team:updated', {
                members: Array.from(room.members.values()).map(getPublicMemberData),
                ownerId: room.ownerId
            });
        }
    });

    /**
     * 解散隊伍 (隊長專用)
     */
    socket.on('disband-team', async ({ teamId }) => {
        const room = activeRooms.get(teamId);
        const displayName = socket.data.displayName;
        if (!room) return;

        const isOwner = room.members.get(displayName)?.isOwner;
        if (!isOwner) return socket.emit('error', { message: '只有隊長可以解散隊伍' });

        // 通知所有成員隊伍已解散
        expeditionNamespace.to(teamId).emit('team:disbanded', { teamId });

        // 讓所有成員離開房間
        const sockets = await expeditionNamespace.in(teamId).fetchSockets();
        for (const s of sockets) {
            s.leave(teamId);
            s.data.teamId = null;
        }

        // 從記憶體移除
        activeRooms.delete(teamId);

        // 手動解散：若無帳篷存檔，清除福音鞋自動存的進度；有帳篷則保留
        try {
            if (room.tentCheckpoint) {
                // 帳篷用過 → 保留存檔，標記為 saved 供日後續關
                await dbOps.gamesDb.run(
                    'UPDATE expedition_teams SET status = $1 WHERE id = $2',
                    ['saved', teamId]
                );
            } else {
                // 沒用帳篷 → 清除進度（福音鞋的過關存檔無效）
                await dbOps.gamesDb.run(
                    'UPDATE expedition_teams SET status = $1, current_stage = 1, current_question = 0 WHERE id = $2',
                    ['waiting', teamId]
                );
            }
        } catch (e) { console.error('[disband-team] DB update error:', e); }

        console.log(`🔥 [Expedition] Team ${teamId} disbanded by ${displayName}`);
    });

    /**
     * 離開隊伍
     */
    socket.on('leave-team', async ({ teamId }) => {
        const room = activeRooms.get(teamId);
        const displayName = socket.data.displayName;
        if (room) {
            const isOwner = room.members.get(displayName)?.isOwner;
            room.members.delete(displayName);
            room.members.forEach(m => { if (!m.isOwner) m.isReady = false; });
            expeditionNamespace.to(teamId).emit('team:updated', {
                members: Array.from(room.members.values()).map(getPublicMemberData),
                ownerId: room.ownerId
            });
            // 隊長手動離隊且無帳篷 → 清除過關自動存檔
            if (isOwner && !room.tentCheckpoint) {
                try {
                    await dbOps.gamesDb.run(
                        'UPDATE expedition_teams SET status = $1, current_stage = 1, current_question = 0 WHERE id = $2',
                        ['waiting', teamId]
                    );
                } catch (e) { console.error('[leave-team] clear save error:', e); }
            }
        }
        socket.leave(teamId);
        socket.data.teamId = null;
    });

    /**
     * 撤退至集結區 (Camp/Lobby)
     */
    socket.on('return-to-camp', async () => {
        const { teamId, displayName, userId } = socket.data;
        if (!teamId) return;
        const room = activeRooms.get(teamId);
        if (!room) return;
        const isOwner = room.members.get(displayName)?.isOwner;
        if (!isOwner) return;

        try {
            // [SOVEREIGN] 手動撤退時啟動資產歸還協議
            await ExpeditionService.refundRoomMembers(room);

            await ExpeditionService.updateTeamStatus(teamId, 'waiting', room.stage, room.currentQuestionCount);
            room.phase = 'waiting';
            room.status = 'waiting';
            if (room.timer) clearTimeout(room.timer);
            
            expeditionNamespace.to(teamId).emit('game:returned:to:lobby', {
                currentStage: room.stage,
                currentQuestion: room.currentQuestionCount
            });

            // 回到大廳 → 清 buffer 重新預載題目
            startLobbyPrefetch(room);
        } catch (e) { console.error('Return to camp error:', e); }
    });

    /**
     * 從檢查點復活
     */
    socket.on('revive-from-checkpoint', async () => {
        const { teamId, displayName, userId } = socket.data;
        if (!teamId) return;
        const room = activeRooms.get(teamId);
        if (!room || !room.tentCheckpoint) return;
        const isOwner = room.members.get(displayName)?.isOwner;
        if (!isOwner) return;

        try {
            const cp = room.tentCheckpoint;
            room.stage = cp.stage || 1;
            room.currentQuestionCount = cp.question || 0;
            room.members.forEach(m => { if (m.lives <= 0) m.lives = 1; });
            room.phase = 'waiting';
            room.status = 'waiting';
            room.tentCheckpoint = null;
            
            await ExpeditionService.updateTeamStatus(teamId, 'waiting', room.stage, room.currentQuestionCount);
            
            expeditionNamespace.to(teamId).emit('revived:from:checkpoint', {
                stage: room.stage,
                question: room.currentQuestionCount
            });
            
            expeditionNamespace.to(teamId).emit('team:updated', {
                members: Array.from(room.members.values()).map(getPublicMemberData),
                ownerId: room.ownerId
            });
        } catch (e) { console.error('Revive error:', e); }
    });

    /**
     * 斷線處理
     */
    socket.on('disconnect', async () => {
        const { teamId, displayName, userId } = socket.data;
        if (!teamId) return;

        const room = activeRooms.get(teamId);
        if (!room) return;

        const member = room.members.get(displayName);
        if (!member) return;

        const isOwner = member.isOwner;
        const hasShoes = (member.backpack?.shoes > 0 || member.inventory?.shoes > 0);

        // [GOSPEL SHOES] 隊長斷線且攜帶福音鞋 → 歸還全隊背包道具至各自倉庫
        if (isOwner && room.status === 'playing' && hasShoes) {
            try {
                await ExpeditionService.refundRoomMembers(room);
                console.log(`👟 [Gospel Shoes] Backpack refunded for all members in team ${teamId}`);
            } catch (e) { console.error('[Gospel Shoes] Refund error:', e); }
        }

        // 強制離隊：從房間移除成員
        room.members.delete(displayName);
        room.members.forEach(m => { if (!m.isOwner) m.isReady = false; });
        socket.leave(teamId);
        socket.data.teamId = null;

        // 通知剩餘成員
        expeditionNamespace.to(teamId).emit('team:updated', {
            members: Array.from(room.members.values()).map(getPublicMemberData),
            ownerId: room.ownerId,
            status: room.status
        });

        // 房間空了 → 清除
        if (room.members.size === 0) {
            console.log(`🧹 Room ${teamId} is empty after disconnect. Cleaning up...`);
            if (room.timer) clearTimeout(room.timer);
            if (isOwner) {
                await ExpeditionService.updateTeamStatus(teamId, 'offline', room.stage, room.currentQuestionCount);
            }
            activeRooms.delete(teamId);
        }
    });

    /**
     * [V23] 戰術通訊功能
     */
    socket.on('room:message', ({ teamId, message, targetUserId }) => {
        if (!teamId || !message) return;
        const displayName = socket.data.displayName;
        const room = activeRooms.get(teamId);
        if (!room) return;

        console.log(`📡 [Comms] ${displayName}: ${message} (Target: ${targetUserId || 'ALL'})`);
        
        expeditionNamespace.to(teamId).emit('room:message', {
            from: displayName,
            content: message,
            targetUserId: targetUserId,
            timestamp: Date.now()
        });
    });

    /**
     * [V23] 批次物資軍援 (Warehouse to Warehouse)
     */
    socket.on('item:gift', async ({ teamId, targetDisplayName, items }) => {
        const { displayName, userId } = socket.data;
        if (!teamId || !targetDisplayName || !items?.length) return;

        const room = activeRooms.get(teamId);
        if (!room) return;

        const recipient = room.members.get(targetDisplayName);
        if (!recipient || !recipient.userId) {
            return socket.emit('error', { message: '無法定位受贈隊友或該隊友非正式領主會員' });
        }

        try {
            for (const item of items) {
                const { id, quantity } = item;
                // 原子化數據庫操作
                const row = await dbOps.gamesDb.get(
                    'SELECT quantity FROM expedition_inventory WHERE user_id = $1 AND item_id = $2',
                    [userId, id]
                );

                if (!row || row.quantity < quantity) {
                    throw new Error(`道具數量不足: ${id}`);
                }

                // 扣除發送者
                await dbOps.gamesDb.run(
                    'UPDATE expedition_inventory SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3',
                    [quantity, userId, id]
                );

                // 增加接收者
                await dbOps.gamesDb.run(`
                    INSERT INTO expedition_inventory (user_id, item_id, quantity)
                    VALUES ($1, $2, $3)
                    ON CONFLICT(user_id, item_id) DO UPDATE SET 
                        quantity = expedition_inventory.quantity + excluded.quantity,
                        updated_at = CURRENT_TIMESTAMP
                `, [recipient.userId, id, quantity]);
            }

            console.log(`🎁 [Gifting] ${displayName} sent ${items.length} types of items to ${targetDisplayName}`);

            // 廣播成功事件
            socket.emit('gift:transfer_success', { targetDisplayName });
            expeditionNamespace.to(recipient.socketId).emit('gift:received', {
                from: displayName,
                items
            });

            // 通知全員數據更新 (觸發庫存刷新)
            expeditionNamespace.to(teamId).emit('team:updated', {
                members: Array.from(room.members.values()).map(getPublicMemberData),
                ownerId: room.ownerId
            });

        } catch (e) {
            console.error('🎁 [Gifting Error]', e);
            socket.emit('error', { message: e.message });
        }
    });
}
