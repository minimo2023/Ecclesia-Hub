/**
 * Socket.io 初始化與事件處理
 * 處理即時搶答遊戲的 WebSocket 通訊
 */

import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import roomManager from './roomManager.js';
import { getGenAI, DEFAULT_MODEL } from '../infrastructure/ai/gemini-client.js';
import { dbOps } from '../database/index.js';
import { initExpeditionSocket } from './expeditionSocket.js';
import { initBoardGamesSocket } from './boardGamesSocket.js';
import { devotionalEvents } from '../domains/content/devotional/devotional.js';
import { verifyAnswerToken } from '../utils/tokenHandler.js';
import { resolveActiveUserFromToken } from '../middleware/auth.js';
import {
    refundMultiplayerPrizePool,
    reserveMultiplayerPrizePool,
    settleMultiplayerPrizePool
} from '../domains/economy/AssetLedgerService.js';

let io;

// 獨立的答案解密邏輯，讓其他功能 (如求助) 也可以復用
const getQuestionCorrectAnswer = (q) => {
    if (q && q.answerToken) {
        const decoded = verifyAnswerToken(q.answerToken);
        if (decoded) return { answer: decoded.answer, correctIndex: decoded.correctIndex };
    }
    return { answer: q?.answer, correctIndex: q?.correctIndex };
};

function clearScheduledAdvance(gameState) {
    if (gameState?.autoNextTimeoutId) {
        clearTimeout(gameState.autoNextTimeoutId);
        gameState.autoNextTimeoutId = null;
    }
}

const BUZZ_COUNTDOWN_SECONDS = 3;
const BUZZ_COUNTDOWN_GO_MS = 1000;

function startBuzzCountdown(roomCode) {
    const gameState = roomManager.getGameState(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!gameState || !room || room.status !== 'playing') {
        return { success: false, error: '遊戲尚未開始' };
    }
    if (gameState.questionResolved) {
        return { success: false, error: '本題已結束' };
    }
    if (gameState.currentBuzzer || gameState.buzzEnabled) {
        return { success: false, error: '搶答已經開始' };
    }
    if (gameState.countdownStarted) {
        return { success: false, error: '倒數已經開始' };
    }

    if (gameState.buzzEnableTimeoutId) {
        clearTimeout(gameState.buzzEnableTimeoutId);
    }

    const questionIndex = gameState.currentQuestionIndex;
    const countdownDurationMs = (BUZZ_COUNTDOWN_SECONDS * 1000) + BUZZ_COUNTDOWN_GO_MS;
    gameState.countdownStarted = true;
    gameState.buzzEnabled = false;
    gameState.buzzEnabledAt = Date.now() + countdownDurationMs;

    io.to(roomCode).emit('game:countdownStarted', {
        questionIndex: questionIndex + 1,
        countdownSeconds: BUZZ_COUNTDOWN_SECONDS,
        buzzEnabledAt: gameState.buzzEnabledAt
    });

    gameState.buzzEnableTimeoutId = setTimeout(() => {
        gameState.buzzEnableTimeoutId = null;

        const latestGameState = roomManager.getGameState(roomCode);
        if (!latestGameState
            || latestGameState.currentQuestionIndex !== questionIndex
            || latestGameState.questionResolved) {
            return;
        }

        latestGameState.countdownStarted = false;
        latestGameState.buzzEnabled = true;
        io.to(roomCode).emit('game:buzzEnabled', {
            questionIndex: questionIndex + 1,
            timestamp: Date.now()
        });
        console.log(`[Game ${roomCode}] Buzz enabled by host countdown`);
    }, countdownDurationMs);

    return {
        success: true,
        buzzEnabledAt: gameState.buzzEnabledAt
    };
}

function scheduleNextQuestion(roomCode, delaySeconds) {
    const gameState = roomManager.getGameState(roomCode);
    if (!gameState) return;

    clearScheduledAdvance(gameState);

    const delay = Math.max(10, Number(delaySeconds) || 10);
    gameState.autoNextTimeoutId = setTimeout(() => {
        gameState.autoNextTimeoutId = null;
        nextQuestion(roomCode);
    }, delay * 1000);
}

/**
 * 初始化 Socket.io
 * @param {http.Server} server - HTTP 伺服器實例
 */
export function initializeSocket(server) {
    // Socket.IO CORS - 根據環境設定允許的來源
    const socketOrigins = process.env.NODE_ENV === 'production'
        ? [
            'https://xtc-biblestudy.idv.tw',
            'http://xtc-biblestudy.idv.tw'
        ]
        : [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://xtc-biblestudy.idv.tw',
            'http://xtc-biblestudy.idv.tw'
        ];

    io = new Server(server, {
        cors: {
            origin: socketOrigins,
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['polling', 'websocket'], // 先用 polling 再升級到 websocket
        allowEIO3: true, // 允許舊版本客戶端
        pingTimeout: 60000,
        pingInterval: 25000
    });

    console.log('🔌 [Socket] Socket.io initialized');
    roomManager.setHostExpiryHandler((roomCode) => {
        refundMultiplayerPrizePool(roomCode).catch((error) => {
            console.error('[Socket] Prize pool expiry refund failed:', error.message);
        });
        io.to(roomCode).emit('room:closed', { reason: '房主已離線超過 90 秒' });
    });

    // Guests may connect, but a supplied token must be valid and active. The
    // verified identity is stored on the socket and client-provided userId
    // fields are ignored everywhere below.
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next();
        try {
            socket.authUser = await resolveActiveUserFromToken(token);
            return next();
        } catch (error) {
            console.warn('[Socket] Rejected invalid member token:', error.code || error.name);
            return next(new Error('AUTHENTICATION_FAILED'));
        }
    });

    // 初始化遠征專用 Socket
    initExpeditionSocket(io);
    // 初始化棋類遊戲專用 Socket (/boardgames)
    initBoardGamesSocket(io);

    // Bind Devotional Status Events
    devotionalEvents.on('status', (payload) => {
        if (io) io.emit('devotional:status', payload);
    });

    io.on('connection', (socket) => {
        console.log(`🔗 [Socket] Client connected: ${socket.id}`);

        // ========== 用戶身份識別 ==========
        /**
         * 用戶登入後發送 user:identify 事件，加入個人專屬房間
         * 這使得伺服器可以針對特定用戶推送訊息（如金幣更新）
         */
        socket.on('user:identify', async () => {
            const userId = socket.authUser?.userId;
            if (userId) {
                // [IDLE MONITOR] 識別使用者角色
                try {
                    const user = await dbOps.getUser(userId);
                    if (user && ['admin', 'super_admin'].includes(user.role)) {
                        socket.isAdmin = true;
                        // console.log(`🛡️ [Socket] Admin ${userId} marked for Idle Bypass`);
                    }
                } catch (err) {
                    console.error('Failed to identify user role for idle bypass:', err);
                }

                const userRoom = `user:${userId}`;
                socket.join(userRoom);
                console.log(`👤 [Socket] User ${userId} joined personal room: ${userRoom}`);
            }
        });

        // ========== 房間管理 ==========

        /**
         * 創建房間（房主）
         */
        socket.on('room:create', async (data, callback) => {
            try {
                const { hostName, settings } = data;
                const prizePool = Number(settings?.prizePool || 0);
                if (![0, 20, 50, 100, 200, 500].includes(prizePool)) {
                    return callback({ success: false, error: 'INVALID_PRIZE_POOL' });
                }
                if (prizePool > 0 && !socket.authUser) {
                    return callback({ success: false, error: 'PRIZE_POOL_LOGIN_REQUIRED' });
                }

                const roomData = roomManager.createRoom(socket.id, {
                    ...settings,
                    prizePool,
                    hostName,
                    manualNext: settings?.manualNext || false
                });

                socket.join(roomData.code);
                const { hostResumeToken, ...safeRoom } = roomData;
                callback({ success: true, room: safeRoom, hostResumeToken });
            } catch (error) {
                console.error('[Socket] room:create error:', error);
                callback({ success: false, error: error.message });
            }
        });

        /**
         * 加入房間（玩家）
         */
        socket.on('room:join', async (data, callback) => {
            try {
                const { roomCode, playerName } = data;
                const userId = socket.authUser?.userId || null;

                const result = roomManager.joinRoom(roomCode, socket.id, playerName, userId);

                if (result.error) {
                    callback({ success: false, error: result.error });
                    return;
                }

                const room = result.room;
                socket.join(roomCode);

                // 廣播給房間其他人 (包含房主)
                socket.to(roomCode).emit('room:playerJoined', {
                    player: room.players?.find?.(p => p.id === socket.id)
                });

                // 同步廣播 room:updated 確保所有人收到最新狀態
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });

                callback({ success: true, room, resumeToken: result.resumeToken });
            } catch (error) {
                console.error('[Socket] room:join error:', error);
                callback({ success: false, error: error.message });
            }
        });



        /**
         * 離開房間
         */
        socket.on('room:leave', async (callback) => {
            const result = handlePlayerLeave(socket);
            if (result?.closed) {
                await refundMultiplayerPrizePool(result.roomCode).catch((error) => {
                    console.error('[Socket] Prize pool leave refund failed:', error.message);
                });
            }
            if (callback) callback(result);
        });

        /**
         * 取得房間資訊
         */
        socket.on('room:info', (roomCode, callback) => {
            const roomInfo = roomManager.getRoomInfo(roomCode);
            callback(roomInfo);
        });

        // ========== 組隊模式 ==========

        /**
         * 玩家選擇加入隊伍
         */
        socket.on('player:joinTeam', (data, callback) => {
            const { teamId } = data;
            const roomCode = roomManager.getPlayerRoom(socket.id);

            if (!roomCode) {
                callback({ success: false, error: '尚未加入房間' });
                return;
            }

            const result = roomManager.joinTeam(roomCode, socket.id, teamId);
            if (result.success) {
                // 通知房間所有人更新
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });
                callback({ success: true, team: result.team });
            } else {
                callback({ success: false, error: result.error });
            }
        });

        /**
         * 設定/取消隊長
         */
        socket.on('player:setCaptain', (data, callback) => {
            const { isCaptain } = data;
            const roomCode = roomManager.getPlayerRoom(socket.id);

            if (!roomCode) {
                callback({ success: false, error: '尚未加入房間' });
                return;
            }

            const result = roomManager.setCaptain(roomCode, socket.id, isCaptain);
            if (result.success) {
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });
                callback({ success: true, player: result.player, team: result.team });
            } else {
                callback({ success: false, error: result.error });
            }
        });

        /**
         * 設定隊伍名稱 (隊長專用)
         */
        socket.on('team:setName', (data, callback) => {
            const { teamName } = data;
            const roomCode = roomManager.getPlayerRoom(socket.id);

            if (!roomCode) {
                callback({ success: false, error: '尚未加入房間' });
                return;
            }

            // 先找到玩家的 teamId
            const room = roomManager.getRoom(roomCode);
            const player = room?.players.get(socket.id);

            if (!player || !player.teamId) {
                callback({ success: false, error: '您尚未加入任何隊伍' });
                return;
            }

            if (!player.isCaptain) {
                callback({ success: false, error: '只有隊長可以設定隊名' });
                return;
            }

            const result = roomManager.setTeamName(roomCode, player.teamId, teamName);
            if (result.success) {
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });
                callback({ success: true, team: result.team });
            } else {
                callback({ success: false, error: result.error });
            }
        });

        /**
         * 產生隨機隊名
         */
        socket.on('team:generateName', (callback) => {
            const name = roomManager.generateBibleTeamName();
            callback({ success: true, name });
        });

        /**
         * 分配隊伍（房主 - 舊版相容）
         */
        socket.on('room:assignTeam', (data, callback) => {
            const { playerId, teamId } = data;
            const roomCode = roomManager.getPlayerRoom(socket.id);
            const room = roomManager.getRoom(roomCode);

            // 驗證權限：只有房主可以分配
            if (!room || room.hostId !== socket.id) {
                callback({ success: false, error: '只有房主可以分配隊伍' });
                return;
            }

            const result = roomManager.joinTeam(roomCode, playerId, teamId);
            if (result.success) {
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });
                callback({ success: true });
            } else {
                callback({ success: false, error: result.error });
            }
        });

        // ========== 遊戲控制（房主） ==========

        /**
         * 開始遊戲
         */
        socket.on('game:start', async (data, callback) => {
            try {
                const roomCode = roomManager.getPlayerRoom(socket.id);
                const room = roomManager.getRoom(roomCode);

                if (!room || room.hostId !== socket.id) {
                    callback({ success: false, error: '只有房主可以開始遊戲' });
                    return;
                }

                if (room.players.size < 1) {
                    callback({ success: false, error: '至少需要 1 位玩家' });
                    return;
                }

                // 優先使用預生成的題目，其次使用前端傳入的
                const questions = room.game.questions?.length > 0
                    ? room.game.questions
                    : (data.questions || []);

                if (questions.length === 0) {
                    callback({ success: false, error: 'NO_QUESTIONS' });
                    return;
                }

                if (Number(room.settings.prizePool || 0) > 0) {
                    if (!socket.authUser?.userId) {
                        return callback({ success: false, error: 'PRIZE_POOL_LOGIN_REQUIRED' });
                    }
                    await reserveMultiplayerPrizePool(
                        socket.authUser.userId,
                        roomCode,
                        Number(room.settings.prizePool)
                    );
                }

                // 每一局都從乾淨的分數與求助狀態開始。
                roomManager.resetParticipantsForNewGame(roomCode);

                console.log(`[Game ${roomCode}] Starting with ${questions.length} questions (source: ${room.game.questions?.length > 0 ? 'preloaded' : 'frontend'})`);

                // 設定遊戲狀態
                roomManager.setRoomStatus(roomCode, 'playing');
                roomManager.setGameState(roomCode, {
                    currentQuestionIndex: 0,
                    questions: questions,
                    currentBuzzer: null, // 當前搶答成功的玩家
                    buzzedPlayers: new Set(), // 本題已搶答過的玩家
                    buzzOrder: [],
                    questionResolved: false,
                    buzzEnabled: false,
                    countdownStarted: false,
                    buzzEnabledAt: null,
                    timerEndTime: null
                });

                // 通知所有人遊戲開始
                io.to(roomCode).emit('game:started', {
                    totalQuestions: questions.length
                });
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });

                callback({ success: true });

                // 發送第一題
                setTimeout(() => {
                    sendQuestion(roomCode, 0);
                }, 1000);

            } catch (error) {
                console.error('[Socket] game:start error:', error);
                callback({ success: false, error: error.message });
            }
        });

        /**
         * 同房再玩一局：保留房號、玩家與隊伍，重置所有局內狀態。
         */
        socket.on('game:restart', async (callback) => {
            try {
                const roomCode = roomManager.getPlayerRoom(socket.id);
                const room = roomManager.getRoom(roomCode);

                if (!room || room.hostId !== socket.id) {
                    callback?.({ success: false, error: '只有房主可以重新開始' });
                    return;
                }

                if (room.status === 'playing') {
                    callback?.({ success: false, error: '遊戲進行中，無法重新開始' });
                    return;
                }

                const result = await roomManager.restartGame(roomCode);
                if (result.error) {
                    callback?.({ success: false, error: result.error });
                    return;
                }

                const roomInfo = roomManager.getRoomInfo(roomCode);
                io.to(roomCode).emit('game:restarted', { room: roomInfo });
                io.to(roomCode).emit('room:updated', { room: roomInfo });
                callback?.({ success: true, room: roomInfo });
            } catch (error) {
                console.error('[Socket] game:restart error:', error);
                callback?.({ success: false, error: error.message });
            }
        });

        /**
         * 進入下一題（手動控制）
         */
        socket.on('game:next', (callback) => {
            const roomCode = roomManager.getPlayerRoom(socket.id);
            const room = roomManager.getRoom(roomCode);

            if (!room || room.hostId !== socket.id) {
                if (callback) callback({ success: false, error: '只有房主可以控制' });
                return;
            }

            clearScheduledAdvance(room.game);
            nextQuestion(roomCode);
            if (callback) callback({ success: true });
        });

        socket.on('game:startCountdown', (callback) => {
            const roomCode = roomManager.getPlayerRoom(socket.id);
            const room = roomManager.getRoom(roomCode);

            if (!room || room.hostId !== socket.id) {
                callback?.({ success: false, error: '只有房主可以開始倒數' });
                return;
            }

            callback?.(startBuzzCountdown(roomCode));
        });

        // ========== 遊戲進行 ==========

        /**
         * 玩家搶答
         */
        socket.on('game:buzz', (callback) => {
            const roomCode = roomManager.getPlayerRoom(socket.id);
            const room = roomManager.getRoom(roomCode);
            const gameState = roomManager.getGameState(roomCode);

            if (!room || !gameState || room.status !== 'playing') {
                callback({ success: false, error: '遊戲未進行中' });
                return;
            }

            if (gameState.questionResolved) {
                callback({ success: false, error: '本題已結束' });
                return;
            }

            if (!gameState.buzzEnabled) {
                callback({ success: false, error: '搶答尚未開放' });
                return;
            }

            // 檢查搶答是否已開放 (使用時間戳 + 100ms 容錯)
            const tolerance = 100; // ms
            if (gameState.buzzEnabledAt && Date.now() < gameState.buzzEnabledAt - tolerance) {
                callback({ success: false, error: '搶答尚未開放' });
                return;
            }

            // 檢查是否已有人搶答
            if (gameState.currentBuzzer) {
                callback({ success: false, error: '已有其他玩家正在作答' });
                return;
            }

            // 檢查此玩家是否本題已搶答過
            if (gameState.buzzedPlayers.has(socket.id)) {
                callback({ success: false, error: '您本題已搶答過' });
                return;
            }

            const player = room.players.get(socket.id);

            // 搶答成功
            gameState.currentBuzzer = {
                playerId: socket.id,
                playerName: player?.name,
                teamId: player?.teamId
            };
            gameState.buzzedPlayers.add(socket.id);
            const duration = 30; // 30秒
            gameState.timerDuration = duration;
            gameState.timerEndTime = Date.now() + (duration * 1000);

            // 清除舊的 timeout
            if (gameState.timeoutId) clearTimeout(gameState.timeoutId);

            // 通知所有人誰搶答成功
            io.to(roomCode).emit('game:buzzed', {
                playerId: socket.id,
                playerName: player?.name,
                teamId: player?.teamId,
                questionIndex: gameState.currentQuestionIndex + 1,
                timeLimit: duration
            });

            // 給搶答者發送選項
            socket.emit('game:showOptions', {
                questionIndex: gameState.currentQuestionIndex + 1,
                options: [...(gameState.questions[gameState.currentQuestionIndex]?.options || [])],
                timeLimit: duration
            });

            callback({ success: true });

            // 設定超時處理
            gameState.timeoutId = setTimeout(() => {
                handleAnswerTimeout(roomCode);
            }, duration * 1000);
        });

        /**
         * 玩家提交答案 (傳入 answer: 'A' | 'B' | 'C' | 'D')
         */
        socket.on('game:answer', (data, callback) => {
            const { answer, questionIndex } = data; // 'A', 'B', 'C', 'D'
            const roomCode = roomManager.getPlayerRoom(socket.id);
            const room = roomManager.getRoom(roomCode);
            const gameState = roomManager.getGameState(roomCode);

            if (!room || !gameState || (!gameState.currentBuzzer || (gameState.currentBuzzer.playerId !== socket.id && gameState.currentBuzzer !== socket.id))) {
                callback({ success: false, error: '不是您的回答時間' });
                return;
            }

            if (Number(questionIndex) !== gameState.currentQuestionIndex + 1) {
                callback({ success: false, error: '題目已更新，請重新確認選項' });
                return;
            }

            // 清除計時器
            if (gameState.timeoutId) {
                clearTimeout(gameState.timeoutId);
                gameState.timeoutId = null;
            }

            const question = gameState.questions[gameState.currentQuestionIndex];

            // 轉換選項代號為實際內容進行比對
            const optionIndex = ['A', 'B', 'C', 'D'].indexOf(answer);
            const selectedOptionText = question.options[optionIndex];

            // 安全移除標點符號的比較法 (與出題時的 stripPunctuation 邏輯一致)
            const stripPunc = (s) => typeof s === 'string' ? s.trim().replace(/^[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+|[。，、；：！？「」『』【】《》〈〉…—～·.,;:!?'"()\[\]{}\s]+$/g, '').trim() : s;

            let isCorrect = false;

            const actualData = getQuestionCorrectAnswer(question);
            const actualCorrectAnswer = actualData.answer;

            if (actualData.correctIndex !== undefined && actualData.correctIndex >= 0) {
                isCorrect = (optionIndex === actualData.correctIndex);
            } else {
                isCorrect = stripPunc(selectedOptionText) === stripPunc(actualCorrectAnswer);
            }

            const player = room.players.get(socket.id);

            if (isCorrect) {
                // 答對 - 計算分數 (基於 30秒)
                const remainingTime = Math.max(0, (gameState.timerEndTime - Date.now()) / 1000);

                // 分數計算：基底 100 + 速度加成 (每剩1秒 +2分)
                const speedBonus = Math.floor(remainingTime * 2);
                const totalScore = 100 + speedBonus;

                gameState.questionResolved = true;

                // 使用 roomManager 統一更新分數 (含個人與隊伍)
                roomManager.handleAnswer(roomCode, socket.id, answer, true, { points: totalScore });

                // 獲取最新資料以便廣播
                const teamScore = player.teamId ? room.settings.teams[player.teamId]?.score : 0;

                // 通知所有人
                io.to(roomCode).emit('game:answered', {
                    playerId: socket.id,
                    playerName: player?.name,
                    teamId: player?.teamId,
                    isCorrect: true,
                    answer: answer,
                    correctAnswer: actualCorrectAnswer,
                    correctIndex: actualData.correctIndex,
                    scoreAdded: totalScore,
                    newScore: player.score,
                    teamScore: teamScore // 廣播最新的隊伍總分
                });

                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });

                callback({ success: true, isCorrect: true, scoreAdded: totalScore });

                // 下一題邏輯
                if (!room.settings.manualNext) {
                    const delay = Math.max(10, Number(room.settings.autoNextDelay) || 10);
                    console.log('AUTO_NEXT [Room ' + roomCode + '] Next question in ' + delay + ' seconds');
                    scheduleNextQuestion(roomCode, delay);
                }

            } else {
                // 答錯 - 不扣分但失去資格
                // 使用 roomManager 處理答錯邏輯
                roomManager.handleAnswer(roomCode, socket.id, answer, false);

                io.to(roomCode).emit('game:answered', {
                    playerId: socket.id,
                    playerName: player?.name,
                    isCorrect: false,
                    answer: answer,
                    correctIndex: actualData.correctIndex
                });

                callback({ success: true, isCorrect: false });

                const allFailed = roomManager.checkAllFailed(roomCode);
                if (allFailed) {
                    gameState.questionResolved = true;
                    io.to(roomCode).emit('game:allFailed', {
                        correctAnswer: actualCorrectAnswer,
                        correctIndex: actualData.correctIndex
                    });
                }
            }
        });

        // ========== 求助功能 ==========

        socket.on('game:useLifeline', async (data, callback) => {
            const requestedType = data.type;
            const typeAliases = {
                phoneFriend: 'expertCall',
                askAudience: 'audiencePoll'
            };
            const type = typeAliases[requestedType] || requestedType;
            const { expert } = data; // expert: optional, for expertCall
            const roomCode = roomManager.getPlayerRoom(socket.id);
            const room = roomManager.getRoom(roomCode);
            const gameState = roomManager.getGameState(roomCode);

            if (!room || !gameState) {
                callback?.({ success: false, error: '房間或遊戲狀態不存在' });
                return;
            }

            const allowedTypes = new Set(['fiftyFifty', 'expertCall', 'audiencePoll']);
            if (!allowedTypes.has(type)) {
                callback?.({ success: false, error: '不支援的求助類型' });
                return;
            }

            const currentBuzzerId = gameState.currentBuzzer?.playerId || gameState.currentBuzzer;
            if (!currentBuzzerId || currentBuzzerId !== socket.id || gameState.questionResolved) {
                callback?.({ success: false, error: '目前不是您的作答回合' });
                return;
            }

            if (type === 'expertCall' && (!expert?.name || String(expert.name).length > 40)) {
                callback?.({ success: false, error: '請選擇有效的專家' });
                return;
            }

            const question = gameState.questions[gameState.currentQuestionIndex];
            if (!question) {
                callback?.({ success: false, error: '找不到目前題目' });
                return;
            }

            // 標記已使用
            const result = roomManager.useLifeline(roomCode, socket.id, type);
            if (result.error) {
                callback({ success: false, error: result.error });
                return;
            }

            const lifelinePlayer = room.players.get(socket.id);
            const playerResumeToken = lifelinePlayer?.resumeToken;
            const requestId = randomUUID();
            const resolveActivePlayer = () => {
                for (const [playerId, player] of room.players.entries()) {
                    if (player.resumeToken === playerResumeToken) {
                        return { playerId, player };
                    }
                }
                return { playerId: socket.id, player: lifelinePlayer };
            };

            io.to(roomCode).emit('game:lifelineStarted', {
                requestId,
                playerId: socket.id,
                playerName: lifelinePlayer?.name,
                teamId: lifelinePlayer?.teamId,
                type,
                expert: expert || null
            });

            // --- 暫停計時器邏輯 ---
            let remainingTimeMs = 0;
            if (gameState.timeoutId) {
                clearTimeout(gameState.timeoutId);
                gameState.timeoutId = null;
                remainingTimeMs = Math.max(0, gameState.timerEndTime - Date.now());

                // 通知前端暫停計時
                io.to(roomCode).emit('game:timerPaused', {
                    remainingTime: Math.ceil(remainingTimeMs / 1000)
                });
            }

            let lifelineResult = {};

            switch (type) {
                case 'fiftyFifty':
                    // 隨機移除兩個錯誤選項
                    const actualData5050 = getQuestionCorrectAnswer(question);
                    const correctIndex = actualData5050.correctIndex !== undefined && actualData5050.correctIndex >= 0
                        ? actualData5050.correctIndex
                        : question.options.indexOf(actualData5050.answer);
                    const wrongIndices = [0, 1, 2, 3].filter(i => i !== correctIndex);
                    // 隨機選兩個要移除的錯誤選項索引
                    const shuffled = wrongIndices.sort(() => 0.5 - Math.random());
                    const removedIndices = shuffled.slice(0, 2);
                    const removedOptions = removedIndices.map(i => ['A', 'B', 'C', 'D'][i]);

                    lifelineResult = {
                        removedOptions // ['A', 'C']
                    };
                    break;

                case 'expertCall':
                    // [SOVEREIGN V1.2] 呼叫統一的專家服務，並對接進度里程碑
                    try {
                        const { ExpertService } = await import('../infrastructure/ExpertService.js');

                        const actualData = getQuestionCorrectAnswer(question);
                        const alphabet = ['A', 'B', 'C', 'D'];
                        const resolvedCorrectIndex = actualData.correctIndex >= 0
                            ? actualData.correctIndex
                            : (question.options || []).findIndex(option =>
                                String(option).trim() === String(actualData.answer).trim()
                            );
                        const correctLetter = alphabet[resolvedCorrectIndex] || '?';

                        // 專家求助開始
                        const responseText = await ExpertService.generateAdvice({
                            expert: expert,
                            question: {
                                ...question,
                                answer: actualData.answer,
                                correctIndex: resolvedCorrectIndex
                            },
                            playerName: room.players.get(socket.id)?.name || '朋友',
                            correctLetter: correctLetter,
                            onStatus: (status) => {
                                const activePlayer = resolveActivePlayer();
                                io.to(activePlayer.playerId).emit('expert:status', {
                                    requestId,
                                    playerId: activePlayer.playerId,
                                    status: status,
                                    expertId: expert?.id
                                });
                            }
                        });

                        if (responseText) {
                            lifelineResult = {
                                hint: responseText,
                                message: responseText,
                                expert: expert
                            };
                        } else {
                            throw new Error('Expert Service returned empty response');
                        }
                    } catch (e) {
                        console.error('❌ [Socket] Expert Service Error:', e);
                        lifelineResult = {
                            hint: '連線不穩，專家暫時無法接聽...',
                            message: '（雜訊聲）喂？喂？收訊不太好...你要不要試著在大螢幕看看題目？',
                            expert: expert
                        };
                    }
                    break;

                case 'audiencePoll':
                    // 產生不精準的投票結果
                    const actualDataPoll = getQuestionCorrectAnswer(question);
                    const correctIndexPoll = actualDataPoll.correctIndex !== undefined && actualDataPoll.correctIndex >= 0
                        ? actualDataPoll.correctIndex
                        : question.options.indexOf(actualDataPoll.answer);
                    const correctLetterPoll = ['A', 'B', 'C', 'D'][correctIndexPoll] || 'A';
                    lifelineResult = {
                        poll: generateFuzzyPoll(correctLetterPoll)
                    };
                    break;
            }

            const activePlayer = resolveActivePlayer();

            // 通知所有人有玩家使用求助
            io.to(roomCode).emit('game:lifelineUsed', {
                requestId,
                playerId: activePlayer.playerId,
                playerName: activePlayer.player?.name,
                teamId: activePlayer.player?.teamId,
                type,
                result: lifelineResult
            });

            // --- 恢復計時器邏輯 ---
            // 若之前有暫停，現在恢復
            if (remainingTimeMs > 0) {
                // 重新設定結束時間
                gameState.timerEndTime = Date.now() + remainingTimeMs;

                gameState.timeoutId = setTimeout(() => {
                    handleAnswerTimeout(roomCode, socket.id);
                }, remainingTimeMs);

                io.to(roomCode).emit('game:timerResumed', {
                    remainingTime: Math.ceil(remainingTimeMs / 1000)
                });
            }

            callback({ success: true, result: lifelineResult });
        });

        // ========== 斷線處理 ==========

        socket.on('disconnect', () => {
            console.log(`❌ [Socket] Client disconnected: ${socket.id}`);
            const result = roomManager.handlePlayerDisconnect(socket.id);
            if (result && result.roomCode) {
                if (result.hostGrace) {
                    io.to(result.roomCode).emit('room:paused', {
                        reason: '房主連線中斷，等待 90 秒內恢復',
                        expiresAt: result.expiresAt
                    });
                    io.to(result.roomCode).emit('room:updated', {
                        room: roomManager.getRoomInfo(result.roomCode)
                    });
                } else {
                    io.to(result.roomCode).emit('room:updated', {
                        room: roomManager.getRoomInfo(result.roomCode)
                    });
                }
            }
        });

        socket.on('room:resumeHost', (data, callback) => {
            const { roomCode, resumeToken } = data || {};
            const result = roomManager.resumeHost(roomCode, resumeToken, socket.id);
            if (!result.success) return callback?.({ success: false, error: result.error });
            socket.join(roomCode);
            io.to(roomCode).emit('room:resumed', { room: result.room });
            io.to(roomCode).emit('room:updated', { room: result.room });
            return callback?.({ success: true, room: result.room });
        });

        // 重新連線
        socket.on('room:resume', (data, callback) => {
            const { roomCode, resumeToken } = data;
            const result = roomManager.resumePlayer(roomCode, resumeToken, socket.id);
            if (result.success) {
                socket.join(roomCode);
                io.to(roomCode).emit('room:updated', {
                    room: roomManager.getRoomInfo(roomCode)
                });
                let safeGameState = null;
                const rawGameState = roomManager.getGameState(roomCode);
                if (rawGameState) {
                    safeGameState = {
                        currentQuestionIndex: rawGameState.currentQuestionIndex,
                        totalQuestions: rawGameState.questions?.length || 0,
                        buzzEnabled: rawGameState.buzzEnabled,
                        buzzEnabledAt: rawGameState.buzzEnabledAt,
                        countdownStarted: rawGameState.countdownStarted,
                        currentBuzzer: rawGameState.currentBuzzer ? {
                            playerId: rawGameState.currentBuzzer.playerId,
                            playerName: rawGameState.currentBuzzer.playerName,
                            teamId: rawGameState.currentBuzzer.teamId
                        } : null,
                        timerEndTime: rawGameState.timerEndTime,
                        questionResolved: rawGameState.questionResolved
                    };
                    const q = rawGameState.questions?.[rawGameState.currentQuestionIndex];
                    if (q) {
                        safeGameState.questionText = q.question;
                        safeGameState.options = q.options ? [...q.options] : [];
                    }
                }

                callback({
                    success: true,
                    room: roomManager.getRoomInfo(roomCode),
                    player: result.player,
                    gameState: safeGameState
                });
            } else {
                callback({ success: false, error: result.error });
            }
        });
    });

    return io;
}

/**
 * [IDLE MONITOR] 取得當前在線的「玩家」連線數 (排除超級管理員)
 */
export function getActivePlayerCount() {
    if (!io) return 0;
    let playerSlots = 0;

    // 遍歷預設命名空間下的所有連線
    const sockets = io.sockets.sockets;
    for (const [id, socket] of sockets) {
        // 只有「非管理員」的連線（包含訪客、一般用戶）才列入玩家計數
        if (!socket.isAdmin) {
            playerSlots++;
        }
    }
    return playerSlots;
}

// ========== Helper Functions ==========

function handlePlayerLeave(socket) {
    const result = roomManager.leaveRoom(socket.id);

    if (result?.closed) {
        // 房間已關閉，通知所有人
        io.to(result.roomCode).emit('room:closed', {
            reason: '房主已離開'
        });
    } else if (result?.success) {
        // 通知房間內其他人
        io.to(result.roomCode).emit('room:playerLeft', {
            playerId: socket.id,
            playerName: result.playerName,
            room: roomManager.getRoomInfo(result.roomCode)
        });
    }

    return result;
}

function sendQuestion(roomCode, index) {
    const gameState = roomManager.getGameState(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!gameState || !room) return;

    clearScheduledAdvance(gameState);
    if (gameState.timeoutId) {
        clearTimeout(gameState.timeoutId);
        gameState.timeoutId = null;
    }
    if (gameState.buzzEnableTimeoutId) {
        clearTimeout(gameState.buzzEnableTimeoutId);
        gameState.buzzEnableTimeoutId = null;
    }

    const question = gameState.questions[index];
    if (!question) {
        // 遊戲結束
        endGame(roomCode);
        return;
    }

    // 重置本題狀態（組隊模式：清除隊伍禁止搶答、個人模式：清除玩家禁止）
    roomManager.resetRoundState(roomCode);

    gameState.currentQuestionIndex = index;
    gameState.currentBuzzer = null;
    gameState.buzzedPlayers = new Set();
    gameState.buzzOrder = [];
    gameState.timerEndTime = null;
    gameState.questionResolved = false;
    gameState.countdownStarted = false;
    gameState.buzzEnabledAt = null;
    gameState.buzzEnabled = false;

    // 計算朗讀時間 (打字機效果)
    const baseCharRate = 40;
    const punctPause = 300;
    const questionText = question.question || "";
    const punctCount = (questionText.match(/[，。,、？?]/g) || []).length;
    const normalCharCount = Math.max(0, questionText.length - punctCount);
    let readingTime = (normalCharCount * baseCharRate) + (punctCount * (baseCharRate + punctPause));
    readingTime = Math.max(2000, readingTime);

    // 發送題目
    io.to(roomCode).emit('game:question', {
        index: index + 1,
        total: gameState.questions.length,
        question: question.question,
        options: question.options,
        book: question.book,
        chapter: question.chapter,
        readingTime: readingTime
    });
}

function nextQuestion(roomCode) {
    const gameState = roomManager.getGameState(roomCode);
    if (!gameState) return;

    clearScheduledAdvance(gameState);

    const nextIndex = gameState.currentQuestionIndex + 1;

    if (nextIndex >= gameState.questions.length) {
        endGame(roomCode);
    } else {
        sendQuestion(roomCode, nextIndex);
    }
}

function handleAnswerTimeout(roomCode) {
    const gameState = roomManager.getGameState(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!gameState || !gameState.currentBuzzer) return;

    const playerId = gameState.currentBuzzer.playerId || gameState.currentBuzzer;
    const player = room?.players.get(playerId);

    // 超時 - 視為答錯，使用 roomManager 處理
    const result = roomManager.handleAnswer(roomCode, playerId, false);

    io.to(roomCode).emit('game:timeout', {
        playerId: playerId,
        playerName: player?.name,
        teamId: player?.teamId
    });

    // 檢查是否所有人都失敗
    if (result.allFailed) {
        gameState.questionResolved = true;
        handleAllFailed(roomCode);
    }
}

function handleAllFailed(roomCode) {
    const gameState = roomManager.getGameState(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!room || !gameState) return;

    const question = gameState.questions[gameState.currentQuestionIndex];
    const actualData = getQuestionCorrectAnswer(question);

    gameState.questionResolved = true;

    io.to(roomCode).emit('game:allFailed', {
        correctAnswer: actualData.answer,
        correctIndex: actualData.correctIndex
    });

    if (!room.settings.manualNext) {
        const delay = Math.max(10, Number(room.settings.autoNextDelay) || 10);
        scheduleNextQuestion(roomCode, delay);
    }
}

// 檢查是否所有玩家都已經答過本題 (個人模式)
function checkAllFailed(roomCode) {
    const room = roomManager.getRoom(roomCode);
    const gameState = roomManager.getGameState(roomCode);

    if (!room || !gameState) return;

    // 獲取所有玩家數量和已搶答過的玩家數量
    const totalPlayers = room.players.size;
    const buzzedCount = gameState.buzzedPlayers?.size || 0;

    console.log(`[checkAllFailed] Room ${roomCode}: ${buzzedCount}/${totalPlayers} players have buzzed`);

    // 如果所有玩家都已經搶答過（答錯），則觸發 allFailed
    if (buzzedCount >= totalPlayers) {
        console.log(`[checkAllFailed] All ${totalPlayers} players have failed, triggering allFailed`);
        handleAllFailed(roomCode);
    }
}

async function endGame(roomCode) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const gameState = roomManager.getGameState(roomCode);
    clearScheduledAdvance(gameState);
    if (gameState?.buzzEnableTimeoutId) {
        clearTimeout(gameState.buzzEnableTimeoutId);
        gameState.buzzEnableTimeoutId = null;
    }
    if (gameState?.timeoutId) {
        clearTimeout(gameState.timeoutId);
        gameState.timeoutId = null;
    }

    roomManager.setRoomStatus(roomCode, 'finished');

    const mode = room.settings.mode;
    const prizePool = room.settings.prizePool || 0;
    let prizeShare = 0;
    const winners = [];

    // 根據模式計算排名
    let rankings;
    if (mode === 'team') {
        // 組隊模式：隊伍排名
        rankings = roomManager.getTeamRankings(roomCode);

        // 如果有獎金池，由第一名隊伍均分
        if (prizePool > 0 && rankings.length > 0) {
            const winningTeamId = rankings[0].id;
            const teamPlayers = roomManager.getTeamPlayers(roomCode, winningTeamId);
            if (teamPlayers.length > 0) {
                prizeShare = Math.floor(prizePool / teamPlayers.length);
                teamPlayers.forEach(p => {
                    // Collect actual user IDs of winners if available
                    if (p.userId) winners.push(p.userId);
                });
            }
        }
    } else {
        // 個人模式：玩家排名
        rankings = Array.from(room.players.values())
            .sort((a, b) => b.score - a.score)
            .map((player, index) => ({
                rank: index + 1,
                playerId: player.id,
                userId: player.userId,
                name: player.name,
                score: player.score
            }));

        // 如果有獎金池，由第一名獲得
        if (prizePool > 0 && rankings.length > 0) {
            prizeShare = prizePool;
            if (rankings[0].userId) {
                winners.push(rankings[0].userId);
            }
        }
    }

    // 🏆 以同一資料庫交易結清獎金池，重送不會重複發獎。
    let processedWinnerUserIds = [];
    if (prizePool > 0) {
        try {
            const settlement = await settleMultiplayerPrizePool(roomCode, winners);
            prizeShare = settlement.prizeShare;
            processedWinnerUserIds = settlement.winners;
        } catch (error) {
            prizeShare = 0;
            console.error(`[Room ${roomCode}] Prize settlement failed:`, error);
        }
    }

    console.log(`🏁 [Room ${roomCode}] Game ended. Prize Pool: ${prizePool}, Share: ${prizeShare}, Winners: ${winners.length}`);

    io.to(roomCode).emit('game:ended', {
        mode: mode,
        rankings,
        prizePool: prizePool,
        prizeShare: prizeShare,
        winners: processedWinnerUserIds // 真正獲得獎金的使用者 ID 列表
    });
}

function generateFuzzyPoll(correctAnswer) {
    const options = ['A', 'B', 'C', 'D'];
    const poll = {};
    const correctScore = 60 + Math.floor(Math.random() * 20); // 60~79
    let remaining = 100 - correctScore;

    poll[correctAnswer] = correctScore;

    const wrongOptions = options.filter(opt => opt !== correctAnswer);
    wrongOptions.forEach((opt, index) => {
        if (index === wrongOptions.length - 1) {
            poll[opt] = remaining;
        } else {
            const r = Math.floor(Math.random() * remaining * 0.6);
            poll[opt] = r;
            remaining -= r;
        }
    });

    return poll;
}

export function getIO() {
    return io;
}
