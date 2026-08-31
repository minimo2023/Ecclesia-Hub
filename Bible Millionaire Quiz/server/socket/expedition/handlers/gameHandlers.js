import { dbOps } from '../../../database/index.js';
import { expeditionService as ExpeditionService } from '../../../domains/game/expedition/ExpeditionService.js';
import { activeRooms } from '../registry.js';
import { getPublicMemberData, syncMemberShield } from '../utils.js';
import { startNextQuestion, startAnswerCountdown } from '../core/gameEngine.js';
import { ANSWER_COUNTDOWN } from '../constants.js';

export function registerGameHandlers(io, socket) {
    const expeditionNamespace = io.of('/expedition');

    /**
     * 遊戲開始
     * @param {object} options - { reset: boolean, provisioning: { [displayName]: { itemId: quantity } } }
     */
    socket.on('game:start', async (options = {}) => {
        const { reset = false, provisioning = {} } = options;
        const { teamId, userId, displayName } = socket.data;
        if (!teamId) return;

        const room = activeRooms.get(teamId);
        if (!room) return;

        // [SOVEREIGN] 只有主權擁有者(隊長)能下令出發
        if (room.members.get(displayName)?.isOwner === false) {
            return socket.emit('error', { message: '只有隊長能開始遊戲' });
        }

        const unready = Array.from(room.members.values()).filter(m => !m.isOwner && !m.isReady);
        if (unready.length > 0) {
            return socket.emit('error', { message: `仍有成員未準備：${unready.map(m => m.displayName).join(', ')}` });
        }

        // --- 資產撥付協議 (Provisioning Protocol) ---
        try {
            console.log(`🗡️ [game:start] Starting Provisioning for room ${teamId}...`);
            for (const member of room.members.values()) {
                // [SOVEREIGN] 優先使用開戰同步的清單，若無則使用隊員準備時預存的背包
                const backpack = provisioning[member.displayName] || member.inventory || {};
                
                if (member.userId) {
                    // 從資料庫倉庫正式扣除物資
                    await ExpeditionService.provisionItems(member.userId, backpack);
                }
                
                // 正式加載至戰場內存
                member.inventory = { ...backpack };
                syncMemberShield(member);
            }
        } catch (e) {
            console.error('Provisioning failed:', e);
            return socket.emit('error', { message: `物資撥付失敗: ${e.message}` });
        }

        if (userId) {
            try { await ExpeditionService.burnSave(userId); } catch (e) { console.error('Burn save failed:', e); }
        }

        const isGameOver = room.gameState === 'gameover' || room.phase === 'gameover';
        let isResume = (room.stage > 1 || room.currentQuestionCount > 0) && !isGameOver;
        if (reset) isResume = false;

        if (!isResume) {
            room.currentQuestionCount = 0;
            room.stage = 1;
            room.answeredIds = new Set();
            for (const member of room.members.values()) { member.lives = 3; }
        }

        room.phase = 'waiting';
        room.status = 'playing';
        await ExpeditionService.updateTeamStatus(teamId, 'playing', room.stage, room.currentQuestionCount);

        for (const member of room.members.values()) {
            if (!isResume) {
                member.earnedCoins = 0;
                member.correctAnswers = 0;
                member.totalAnswers = 0;
                member.hasActiveShield = false;
            }
        }

        expeditionNamespace.to(teamId).emit('game:started');
        expeditionNamespace.to(teamId).emit('team:updated', {
            members: Array.from(room.members.values()).map(getPublicMemberData),
            currentStage: room.stage,
            currentQuestion: room.currentQuestionCount,
            ownerId: room.ownerId,
            status: room.status
        });

        setTimeout(() => { startNextQuestion(expeditionNamespace, room); }, 1000);
    });

    /**
     * 遊戲恢復 (Gospel Shoes 處理點)
     * @param {object} data - { stage, question, provisioning: { [displayName]: backpack } }
     */
    socket.on('game:resume', async (data = {}) => {
        const { teamId, userId, displayName } = socket.data;
        if (!teamId) return;

        const room = activeRooms.get(teamId);
        if (!room) return;

        const teamData = await dbOps.gamesDb.get('SELECT current_stage, current_question, status FROM expedition_teams WHERE id = $1', [teamId]);
        if (!teamData) return socket.emit('error', { message: '找不到隊伍資料' });

        const provisioning = data.provisioning || {};

        // --- 恢復時同樣需要撥付協議 (因為存檔時資產已退還倉庫) ---
        try {
            for (const member of room.members.values()) {
                const backpack = provisioning[member.displayName] || member.inventory || {};
                if (member.userId) {
                    await ExpeditionService.provisionItems(member.userId, backpack);
                }
                member.inventory = { ...backpack };
                syncMemberShield(member);
            }
        } catch (e) {
            return socket.emit('error', { message: `物資恢復撥付失敗: ${e.message}` });
        }

        room.stage = data.stage ?? teamData.currentStage ?? teamData.current_stage ?? 1;
        room.currentQuestionCount = data.question ?? teamData.currentQuestion ?? teamData.current_question ?? 0;
        room.answeredIds = new Set();
        room.phase = 'waiting';
        room.status = 'playing';
        await dbOps.gamesDb.run("UPDATE expedition_teams SET status = 'playing' WHERE id = $1", [teamId]);

        for (const member of room.members.values()) {
            member.hasActiveShield = false;
            member.earnedCoins = 0;
            member.correctAnswers = 0;
            member.totalAnswers = 0;
        }

        expeditionNamespace.to(teamId).emit('game:resumed', {
            currentStage: room.stage,
            currentQuestion: room.currentQuestionCount
        });

        // [GOSPEL SHOES] Consumption logic
        try {
            const save = await ExpeditionService.getUserSave(userId);
            if (save && save.isEmergency) {
                const ownerMember = room.members.get(displayName);
                // 福音鞋現在應存在於剛剛撥付的 backpack 中
                if (ownerMember && ownerMember.inventory?.['shoes'] > 0) {
                    ownerMember.inventory['shoes']--;
                    // DB 端的扣除已在 provisionItems 中處理，此處僅需處理緊急狀態標記清除
                    if (ownerMember.inventory['shoes'] <= 0) delete ownerMember.inventory['shoes'];

                    expeditionNamespace.to(teamId).emit('emergency:recovered', {
                        message: '🚨 偵測到意外斷線，已透過福音鞋恢復進度！道具已扣除。',
                        shoesLeft: ownerMember.inventory['shoes'] || 0
                    });

                    await ExpeditionService.saveProgress(teamId, room.stage, room.currentQuestionCount, true, { isEmergency: false });
                }
            }
        } catch (e) { console.error('Gospel Shoes consumption failed:', e); }

        expeditionNamespace.to(teamId).emit('team:updated', {
            members: Array.from(room.members.values()).map(getPublicMemberData),
            ownerId: room.ownerId,
            status: room.status
        });

        setTimeout(() => { startNextQuestion(expeditionNamespace, room); }, 1000);
    });

    /**
     * 選擇答案
     */
    socket.on('select-answer', ({ optionIndex }) => {
        const { teamId, displayName } = socket.data;
        if (!teamId) return;
        const room = activeRooms.get(teamId);
        if (!room || (room.phase !== 'thinking' && room.phase !== 'answering')) return;

        room.answers.set(socket.id, { displayName, optionIndex, timestamp: Date.now() });

        expeditionNamespace.to(teamId).emit('answer:selected', {
            displayName,
            optionIndex,
            isFirstAnswer: room.answers.size === 1
        });

        if (room.phase === 'thinking' && room.answers.size === 1) {
            if (room.timer) clearTimeout(room.timer);
            startAnswerCountdown(expeditionNamespace, room);
        }
    });
}

/**
 * 手動更新隊伍階段 (管理員用)
 */
export function updateTeamStage(io, teamId, stage) {
    const room = activeRooms.get(teamId);
    if (!room) return false;
    room.stage = stage;
    const expeditionNamespace = io.of('/expedition');
    expeditionNamespace.to(teamId).emit('team:updated', {
        currentStage: room.stage,
        currentQuestion: room.currentQuestionCount,
        ownerId: room.ownerId,
        status: room.status
    });
    return true;
}
