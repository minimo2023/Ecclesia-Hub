import crypto from 'crypto';
/**
 * Room Manager - 房間記憶體管理
 * 管理所有活躍的遊戲房間狀態
 * V2: 支援個人搶答與組隊模式
 */

// 房間狀態儲存（記憶體）
const rooms = new Map();

// 玩家到房間的映射（快速查找）
const playerRoomMap = new Map();

// 預設隊伍顏色
const DEFAULT_TEAM_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

// 聖經地名（用於隊名產生器）
const BIBLE_LOCATIONS = [
    '伯利恆', '耶路撒冷', '拿撒勒', '迦百農', '撒馬利亞',
    '加利利', '伯大尼', '該撒利亞', '安提阿', '哥林多',
    '以弗所', '腓立比', '羅馬', '大馬士革', '迦南'
];

// 聖經人名（用於隊名產生器）
const BIBLE_NAMES = [
    '彼得', '約翰', '雅各', '馬太', '路加', '馬可',
    '保羅', '巴拿巴', '提摩太', '西拉', '亞波羅',
    '腓利門', '呂底亞', '百基拉', '亞居拉', '以斯帖',
    '路得', '拿俄米', '大衛', '所羅門', '摩西'
];

/**
 * 產生隨機聖經風格隊名
 */
function generateBibleTeamName() {
    const location = BIBLE_LOCATIONS[Math.floor(Math.random() * BIBLE_LOCATIONS.length)];
    const name = BIBLE_NAMES[Math.floor(Math.random() * BIBLE_NAMES.length)];
    return `${location}的${name}`;
}

/**
 * 產生唯一的 6 位數房間代碼
 */
function generateRoomCode() {
    let code;
    do {
        code = String(Math.floor(100000 + Math.random() * 900000));
    } while (rooms.has(code));
    return code;
}

/**
 * 背景預生成題目
 * @param {string} roomCode - 房間代碼
 * @param {object} settings - 遊戲設定
 */
async function preloadQuestions(roomCode, settings) {
    const room = rooms.get(roomCode);
    if (!room) return;

    console.log(`🔄 [Room ${roomCode}] Starting question preload...`);

    try {
        // 動態導入新版 QuizEngine
        const { QuizEngine } = await import('../domains/game/engine/QuizEngine.js');
        const quizEngine = new QuizEngine();

        const result = await quizEngine.getHand(
            settings.books.map(book => ({ book, startChapter: 1, endChapter: 150 })),
            'zh-TW',
            settings.totalQuestions,
            new Set(),
            { gameMode: 'multiplayer', version: 'CUV_TRAD' }
        );
        if (Object.keys(result.shortages || {}).length > 0) {
            const error = new Error('INSUFFICIENT_DIFFICULTY_INVENTORY');
            error.shortages = result.shortages;
            throw error;
        }

        room.game.questions = result.questions;

        room.game.preloadStatus = 'ready';
        console.log(`🎉 [Room ${roomCode}] Preload complete: ${room.game.questions.length} questions ready`);

    } catch (err) {
        console.error(`❌ [Room ${roomCode}] Preload error:`, err.message);
        room.game.preloadStatus = 'failed';
        room.game.preloadError = err.message;
        room.game.preloadShortages = err.shortages || null;
    }
}

/**
 * 建立新房間
 * @param {string} hostId - 房主的 socket ID
 * @param {object} settings - 遊戲設定
 * @returns {object} 房間資訊
 */
function createRoom(hostId, settings = {}) {
    const roomCode = generateRoomCode();
    const hostResumeToken = crypto.randomUUID();
    const mode = settings.mode || 'buzzer'; // 'buzzer' | 'team'
    const teamCount = settings.teamCount || 2;

    // 初始化隊伍（組隊模式）
    const teams = {};
    if (mode === 'team') {
        for (let i = 0; i < teamCount; i++) {
            const color = DEFAULT_TEAM_COLORS[i % DEFAULT_TEAM_COLORS.length];
            teams[color] = {
                id: color,
                name: generateBibleTeamName(),
                score: 0,
                captainId: null,
                color: color
            };
        }
    }

    const room = {
        code: roomCode,
        hostId: hostId,
        hostResumeToken,
        hostConnected: true,
        hostDisconnectTimeout: null,
        hostDisconnectDeadline: null,
        hostPreviousStatus: null,
        hostName: settings.hostName || '房主',
        status: 'waiting', // waiting | playing | finished
        players: new Map(), // socketId -> { name, score, teamId, ... }
        settings: {
            mode: mode,
            teamCount: teamCount,
            teamMaxPlayers: settings.teamMaxPlayers || 4,
            teams: teams,
            totalQuestions: settings.totalQuestions || 15,
            books: settings.books || [],
            difficulty: settings.difficulty || 'mixed',
            buzzerDelay: settings.buzzerDelay || 0,
            manualNext: settings.manualNext || false,
            autoNextDelay: settings.autoNextDelay || 10,
            prizePool: settings.prizePool || 0
        },
        game: {
            currentQuestion: null,
            currentQuestionIndex: 0,
            currentBuzzer: null, // { playerId, teamId, playerName }
            buzzOrder: [], // 本題搶答順序 [{ teamId, attempts }]
            questions: []
        },
        createdAt: Date.now()
    };

    rooms.set(roomCode, room);
    playerRoomMap.set(hostId, roomCode);

    // 註：房主不作為玩家加入，僅控制遊戲流程

    console.log(`🏠 [Room] Created room ${roomCode} by host ${hostId} (Mode: ${mode})`);

    // 🔄 背景預生成題目（不阻塞房間建立）
    if (settings.books && settings.books.length > 0) {
        room.game.preloadStatus = 'loading';
        preloadQuestions(roomCode, settings).catch(err => {
            console.error(`❌ [Room ${roomCode}] Preload failed:`, err.message);
            room.game.preloadStatus = 'failed';
        });
    }

    return {
        code: roomCode,
        hostId: hostId,
        status: room.status,
        settings: room.settings,
        preloadStatus: room.game.preloadStatus || 'pending',
        hostResumeToken
    };
}

/**
 * 玩家加入房間 (個人模式)
 * @param {string} roomCode - 房間代碼
 * @param {string} playerId - 玩家 socket ID
 * @param {string} playerName - 玩家暱稱
 * @param {string} userId - 真實使用者 ID (選填，用於獎勵發放)
 * @returns {object|null} 房間資訊或錯誤
 */
function joinRoom(roomCode, playerId, playerName, userId = null) {
    const room = rooms.get(roomCode);

    if (!room) {
        return { error: '房間不存在' };
    }

    if (room.status !== 'waiting') {
        return { error: '遊戲已經開始，無法加入' };
    }

    // 個人模式人數上限
    if (room.settings.mode === 'buzzer' && room.players.size >= 20) {
        return { error: '房間已滿（最多20人）' };
    }

    // 組隊模式人數上限檢查在 joinTeam 處理

    // 添加玩家
    const resumeToken = crypto.randomUUID();
    room.players.set(playerId, {
        id: playerId,
        userId: userId, // 儲存真實使用者 ID
        name: playerName,
        score: 0,
        teamId: null,
        isCaptain: false,
        disabledThisRound: false,
        lifelines: {
            fiftyFifty: true,
            expertCall: true,
            audiencePoll: true
        },
        connected: true,
        joinedAt: Date.now(),
        resumeToken: resumeToken,
        isDisconnected: false,
        disconnectTimeout: null
    });

    playerRoomMap.set(playerId, roomCode);

    console.log(`👤 [Room] Player ${playerName} (${playerId}) joined room ${roomCode}`);

    return {
        success: true,
        room: getRoomInfo(roomCode),
        resumeToken
    };
}

/**
 * 玩家加入隊伍
 */
function joinTeam(roomCode, playerId, teamId) {
    const room = rooms.get(roomCode);
    if (!room || room.settings.mode !== 'team') {
        return { error: '無效的操作' };
    }

    const team = room.settings.teams[teamId];
    if (!team) {
        return { error: '隊伍不存在' };
    }

    // 檢查隊伍人數上限
    const teamPlayers = getTeamPlayers(roomCode, teamId);
    if (teamPlayers.length >= room.settings.teamMaxPlayers) {
        return { error: `這個隊伍已滿（最多${room.settings.teamMaxPlayers}人）` };
    }

    const player = room.players.get(playerId);
    if (!player) {
        return { error: '玩家不存在' };
    }

    // 如果之前在其他隊伍，先離開
    if (player.teamId && player.isCaptain) {
        // 取消隊長身份
        const oldTeam = room.settings.teams[player.teamId];
        if (oldTeam && oldTeam.captainId === playerId) {
            oldTeam.captainId = null;
        }
        player.isCaptain = false;
    }

    player.teamId = teamId;

    console.log(`👥 [Room] Player ${player.name} joined team ${teamId} in room ${roomCode}`);

    return { success: true, player, team };
}

/**
 * 設定/取消隊長
 */
function setCaptain(roomCode, playerId, isCaptain) {
    const room = rooms.get(roomCode);
    if (!room || room.settings.mode !== 'team') {
        return { error: '無效的操作' };
    }

    const player = room.players.get(playerId);
    if (!player || !player.teamId) {
        return { error: '玩家未加入隊伍' };
    }

    const team = room.settings.teams[player.teamId];
    if (!team) {
        return { error: '隊伍不存在' };
    }

    if (isCaptain) {
        // 設為隊長
        if (team.captainId && team.captainId !== playerId) {
            // 移除舊隊長
            const oldCaptain = room.players.get(team.captainId);
            if (oldCaptain) oldCaptain.isCaptain = false;
        }
        team.captainId = playerId;
        player.isCaptain = true;
    } else {
        // 取消隊長
        if (team.captainId === playerId) {
            team.captainId = null;
        }
        player.isCaptain = false;
    }

    return { success: true, player, team };
}

/**
 * 設定隊名
 */
function setTeamName(roomCode, teamId, name) {
    const room = rooms.get(roomCode);
    if (!room || room.settings.mode !== 'team') {
        return { error: '無效的操作' };
    }

    const team = room.settings.teams[teamId];
    if (!team) {
        return { error: '隊伍不存在' };
    }

    team.name = name;
    return { success: true, team };
}

/**
 * 取得隊伍成員
 */
function getTeamPlayers(roomCode, teamId) {
    const room = rooms.get(roomCode);
    if (!room) return [];

    return Array.from(room.players.values()).filter(p => p.teamId === teamId);
}

/**
 * 取得隊長
 */
function getTeamCaptain(roomCode, teamId) {
    const room = rooms.get(roomCode);
    if (!room) return null;

    const team = room.settings.teams[teamId];
    if (!team || !team.captainId) return null;

    return room.players.get(team.captainId);
}

/**
 * 取得隊伍排名
 */
function getTeamRankings(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.settings.mode !== 'team') return [];

    return Object.values(room.settings.teams)
        .map(team => ({
            id: team.id,
            name: team.name,
            color: team.color,
            score: team.score,
            players: getTeamPlayers(roomCode, team.id).length
        }))
        .sort((a, b) => b.score - a.score);
}

/**
 * 玩家斷線處理 (給予 30 秒寬限期)
 */
function handlePlayerDisconnect(socketId) {
    const roomCode = playerRoomMap.get(socketId);
    if (!roomCode) return { error: '找不到所在房間' };

    const room = rooms.get(roomCode);
    if (!room) return { error: '房間不存在' };

    // 房主意外斷線時保留 90 秒並暫停房間。
    if (room.hostId === socketId) {
        console.log(`⏸️ [Room] Host ${socketId} disconnected, pausing room ${roomCode}`);
        playerRoomMap.delete(socketId);
        room.hostConnected = false;
        room.hostPreviousStatus = room.status === 'paused' ? room.hostPreviousStatus : room.status;
        room.status = 'paused';
        room.hostDisconnectDeadline = Date.now() + 90000;
        if (room.hostDisconnectTimeout) clearTimeout(room.hostDisconnectTimeout);
        room.hostDisconnectTimeout = setTimeout(() => {
            expireDisconnectedHost(roomCode);
        }, 90000);
        return { success: true, hostGrace: true, roomCode, expiresAt: room.hostDisconnectDeadline };
    }

    const player = room.players.get(socketId);
    if (!player) return { error: '玩家不存在' };

    player.isDisconnected = true;
    player.connected = false;
    if (player.disconnectTimeout) {
        clearTimeout(player.disconnectTimeout);
    }
    player.disconnectTimeout = setTimeout(() => {
        leaveRoom(socketId);
    }, 90000); // 行動網路切換或背景喚醒時保留 90 秒重連寬限

    return { success: true, roomCode };
}

let hostExpiryHandler = null;

function setHostExpiryHandler(handler) {
    hostExpiryHandler = typeof handler === 'function' ? handler : null;
}

function expireDisconnectedHost(roomCode, now = Date.now()) {
    const room = rooms.get(roomCode);
    if (!room || room.hostConnected || !room.hostDisconnectDeadline || now < room.hostDisconnectDeadline) return false;
    closeRoom(roomCode);
    if (typeof hostExpiryHandler === 'function') hostExpiryHandler(roomCode);
    return true;
}

function resumeHost(roomCode, resumeToken, newSocketId) {
    const room = rooms.get(roomCode);
    if (!room || room.hostResumeToken !== resumeToken) return { error: '無效的房主恢復憑證' };
    if (room.hostDisconnectDeadline && room.hostDisconnectDeadline <= Date.now()) {
        closeRoom(roomCode);
        return { error: '房主恢復期限已過' };
    }
    if (room.hostDisconnectTimeout) clearTimeout(room.hostDisconnectTimeout);
    playerRoomMap.delete(room.hostId);
    room.hostId = newSocketId;
    room.hostConnected = true;
    room.hostDisconnectTimeout = null;
    room.hostDisconnectDeadline = null;
    room.status = room.hostPreviousStatus || 'waiting';
    room.hostPreviousStatus = null;
    playerRoomMap.set(newSocketId, roomCode);
    return { success: true, room: getRoomInfo(roomCode) };
}

/**
 * 斷線恢復：用原本的 resumeToken 恢復身分並綁定新 socketId
 */
function resumePlayer(roomCode, resumeToken, newSocketId) {
    const room = rooms.get(roomCode);
    if (!room) return { error: '房間不存在' };

    let targetPlayer = null;
    let oldSocketId = null;

    for (const [id, player] of room.players.entries()) {
        if (player.resumeToken === resumeToken) {
            targetPlayer = player;
            oldSocketId = id;
            break;
        }
    }

    if (!targetPlayer) return { error: '無效的憑證或玩家不存在' };

    if (targetPlayer.disconnectTimeout) {
        clearTimeout(targetPlayer.disconnectTimeout);
        targetPlayer.disconnectTimeout = null;
    }

    targetPlayer.isDisconnected = false;
    targetPlayer.connected = true;

    // 如果 socketId 有變，更新房間與全域索引
    if (oldSocketId !== newSocketId) {
        targetPlayer.id = newSocketId;
        room.players.delete(oldSocketId);
        room.players.set(newSocketId, targetPlayer);

        playerRoomMap.delete(oldSocketId);
        playerRoomMap.set(newSocketId, roomCode);

        // 同步更新隊長身分
        if (targetPlayer.teamId && targetPlayer.isCaptain) {
            const team = room.settings.teams[targetPlayer.teamId];
            if (team && team.captainId === oldSocketId) {
                team.captainId = newSocketId;
            }
        }

        // 同步更新遊戲狀態中的 socketId
        if (room.game) {
            if (room.game.currentBuzzer && room.game.currentBuzzer.playerId === oldSocketId) {
                room.game.currentBuzzer.playerId = newSocketId;
            }
            if (room.game.buzzedPlayers && room.game.buzzedPlayers.has(oldSocketId)) {
                room.game.buzzedPlayers.delete(oldSocketId);
                room.game.buzzedPlayers.add(newSocketId);
            }
        }
    }

    return { success: true, room, player: targetPlayer };
}

/**
 * 玩家離開房間
 */
function leaveRoom(playerId) {
    const roomCode = playerRoomMap.get(playerId);
    if (!roomCode) return null;

    const room = rooms.get(roomCode);
    if (!room) return null;

    // 如果是房主離開，關閉房間
    if (room.hostId === playerId) {
        console.log(`🏠 [Room] Host left, closing room ${roomCode}`);
        closeRoom(roomCode);
        return { closed: true, roomCode };
    }

    // 普通玩家離開
    const player = room.players.get(playerId);

    // 如果是隊長，清除隊長
    if (player && player.teamId && player.isCaptain) {
        const team = room.settings.teams[player.teamId];
        if (team && team.captainId === playerId) {
            team.captainId = null;
        }
    }

    room.players.delete(playerId);
    playerRoomMap.delete(playerId);

    console.log(`👤 [Room] Player ${player?.name} left room ${roomCode}`);

    return {
        success: true,
        roomCode,
        playerName: player?.name
    };
}

/**
 * 關閉房間
 */
function closeRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.hostDisconnectTimeout) clearTimeout(room.hostDisconnectTimeout);

    // 清除所有玩家的映射
    for (const playerId of room.players.keys()) {
        playerRoomMap.delete(playerId);
    }
    playerRoomMap.delete(room.hostId);

    rooms.delete(roomCode);
    console.log(`🗑️ [Room] Room ${roomCode} closed`);
}

/**
 * 處理搶答
 */
function handleBuzz(roomCode, playerId) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') {
        return { error: '無效的搶答' };
    }

    // 檢查是否已有人搶答
    if (room.game.currentBuzzer) {
        return { error: '已有人搶答' };
    }

    const player = room.players.get(playerId);
    if (!player) {
        return { error: '玩家不存在' };
    }

    // 個人模式：檢查本題是否被禁止
    if (room.settings.mode === 'buzzer' && player.disabledThisRound) {
        return { error: '本題無法搶答' };
    }

    // 組隊模式：檢查隊伍是否已經搶答過
    if (room.settings.mode === 'team') {
        const teamAttempt = room.game.buzzOrder.find(b => b.teamId === player.teamId);
        if (teamAttempt) {
            return { error: '您的隊伍已經搶答過' };
        }
    }

    room.game.currentBuzzer = {
        playerId: playerId,
        teamId: player.teamId,
        playerName: player.name
    };

    console.log(`🔔 [Room] Player ${player.name} buzzed in room ${roomCode}`);

    return {
        success: true,
        buzzer: room.game.currentBuzzer
    };
}

/**
 * 處理答案
 */
function handleAnswer(roomCode, playerId, answer, isCorrect, options = {}) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') {
        return { error: '無效的回答' };
    }

    if (!room.game.currentBuzzer || room.game.currentBuzzer.playerId !== playerId) {
        return { error: '您尚未搶答成功' };
    }

    const player = room.players.get(playerId);
    if (!player) {
        return { error: '玩家不存在' };
    }

    const result = {
        playerId,
        playerName: player.name,
        teamId: player.teamId,
        answer,
        isCorrect
    };

    if (isCorrect) {
        // 答對：加分 (由外部傳入或在此計算)
        const points = options?.points || 10; 
        player.score += points;

        if (room.settings.mode === 'team' && player.teamId) {
            const team = room.settings.teams[player.teamId];
            if (team) {
                team.score = (team.score || 0) + points;
                console.log(`📊 [Room ${roomCode}] Team ${player.teamId} score updated: ${team.score}`);
            }
        }

        result.points = points;
        console.log(`✅ [Room] ${player.name} answered correctly in room ${roomCode}`);
    } else {
        // 答錯
        if (room.settings.mode === 'buzzer') {
            // 個人模式：禁止本題再搶
            player.disabledThisRound = true;
        } else if (room.settings.mode === 'team' && player.teamId) {
            // 組隊模式：記錄隊伍已嘗試
            room.game.buzzOrder.push({
                teamId: player.teamId,
                attempts: 1
            });
        }
        console.log(`❌ [Room] ${player.name} answered incorrectly in room ${roomCode}`);
    }

    const allFailed = !isCorrect && checkAllFailed(roomCode);

    // 清除當前搶答者
    room.game.currentBuzzer = null;

    return { success: true, result, allFailed };
}

/**
 * 重置回合狀態（新題目時呼叫）
 */
function resetRoundState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.game.currentBuzzer = null;
    room.game.buzzOrder = [];

    // 重置所有玩家的 disabledThisRound
    for (const player of room.players.values()) {
        player.disabledThisRound = false;
    }
}

/**
 * 重置新一局會使用的玩家、隊伍資料，保留房間與分隊關係。
 */
function resetParticipantsForNewGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return { error: '房間不存在' };

    for (const player of room.players.values()) {
        player.score = 0;
        player.disabledThisRound = false;
        player.lifelines = {
            fiftyFifty: true,
            expertCall: true,
            audiencePoll: true
        };
    }

    for (const team of Object.values(room.settings.teams || {})) {
        team.score = 0;
    }

    return { success: true };
}

/**
 * 同房重開：保留房號、玩家與隊伍，清除上一局所有狀態並準備新題目。
 */
async function restartGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return { error: '房間不存在' };

    for (const timerKey of ['timeoutId', 'buzzEnableTimeoutId', 'autoNextTimeoutId']) {
        if (room.game?.[timerKey]) {
            clearTimeout(room.game[timerKey]);
        }
    }

    resetParticipantsForNewGame(roomCode);
    room.status = 'waiting';
    room.game = {
        currentQuestion: null,
        currentQuestionIndex: 0,
        currentBuzzer: null,
        buzzOrder: [],
        buzzedPlayers: new Set(),
        questions: [],
        questionResolved: false,
        buzzEnabled: false,
        countdownStarted: false,
        buzzEnabledAt: null,
        timerEndTime: null,
        timeoutId: null,
        buzzEnableTimeoutId: null,
        autoNextTimeoutId: null,
        preloadStatus: room.settings.books?.length > 0 ? 'loading' : 'pending'
    };

    if (room.settings.books?.length > 0) {
        await preloadQuestions(roomCode, room.settings);
    }

    return {
        success: true,
        room: getRoomInfo(roomCode)
    };
}

/**
 * 檢查是否所有隊伍/玩家都已失敗
 */
function checkAllFailed(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return false;

    if (room.settings.mode === 'team') {
        // 組隊模式：檢查所有隊伍是否都嘗試過
        const teamCount = Object.keys(room.settings.teams).length;
        return room.game.buzzOrder.length >= teamCount;
    } else {
        // 個人模式：檢查所有玩家是否都被禁止
        return Array.from(room.players.values()).every(p => p.disabledThisRound);
    }
}

/**
 * 取得房間資訊（安全版本，不包含敏感資料）
 */
function getRoomInfo(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return null;

    return {
        code: room.code,
        hostId: room.hostId,
        hostName: room.hostName,
        status: room.status,
        hostConnected: room.hostConnected !== false,
        hostResumeExpiresAt: room.hostDisconnectDeadline,
        settings: room.settings,
        players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            teamId: p.teamId,
            isCaptain: p.isCaptain,
            connected: p.connected
        })),
        playerCount: room.players.size,
        game: room.status === 'playing' ? {
            currentQuestionIndex: room.game.currentQuestionIndex,
            currentBuzzer: room.game.currentBuzzer
        } : null
    };
}

/**
 * 取得房間（內部使用）
 */
function getRoom(roomCode) {
    return rooms.get(roomCode);
}

/**
 * 取得玩家所在的房間代碼
 */
function getPlayerRoom(playerId) {
    return playerRoomMap.get(playerId);
}

/**
 * 更新玩家分數 (舊版相容)
 */
function updatePlayerScore(roomCode, playerId, scoreToAdd) {
    const room = rooms.get(roomCode);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.score += scoreToAdd;
    return player.score;
}

/**
 * 使用求助功能
 */
function useLifeline(roomCode, playerId, lifelineType) {
    const room = rooms.get(roomCode);
    if (!room) return { error: '房間不存在' };

    const player = room.players.get(playerId);
    if (!player) return { error: '玩家不存在' };

    if (!player.lifelines[lifelineType]) {
        return { error: '此求助功能已使用過' };
    }

    player.lifelines[lifelineType] = false;
    return { success: true };
}

/**
 * 設定房間狀態
 */
function setRoomStatus(roomCode, status) {
    const room = rooms.get(roomCode);
    if (room) {
        room.status = status;
    }
}

/**
 * 設定遊戲狀態
 */
function setGameState(roomCode, gameState) {
    const room = rooms.get(roomCode);
    if (room) {
        room.game = { ...room.game, ...gameState };
    }
}

/**
 * 取得遊戲狀態
 */
function getGameState(roomCode) {
    const room = rooms.get(roomCode);
    return room?.game;
}

export default {
    handlePlayerDisconnect,
    resumePlayer,
    resumeHost,
    setHostExpiryHandler,
    expireDisconnectedHost,
    // Room management
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    getRoomInfo,
    getRoom,
    getPlayerRoom,

    // Team mode
    joinTeam,
    setCaptain,
    setTeamName,
    getTeamPlayers,
    getTeamCaptain,
    getTeamRankings,
    generateBibleTeamName,

    // Game flow
    handleBuzz,
    handleAnswer,
    resetRoundState,
    resetParticipantsForNewGame,
    restartGame,
    checkAllFailed,

    // Scoring & Lifelines
    updatePlayerScore,
    useLifeline,

    // State management
    setRoomStatus,
    setGameState,
    getGameState
};
