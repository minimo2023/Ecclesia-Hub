export default function PlayerScreen(props) {
    return (
        <ToastProvider>
            <PlayerScreenInner {...props} />
        </ToastProvider>
    );
}

import { ToastProvider } from '../../shared/components/Toast';

/**
 * 搶答連線模式 - 玩家手機介面
 * Player Screen for Multiplayer Buzzer Mode
 * 用於手機搶答、選擇答案、使用求助
 */
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
    ArrowLeft, Loader2, Check, X, AlertTriangle,
    Zap, HelpCircle, Users, BarChart2,
    Coins, Trophy as TrophyIcon
} from 'lucide-react';
import { EXPERT_DB } from '../../data/constants';
import { useCoinSystem } from '../../hooks/useCoinSystem';
import { soundManager } from '../../utils/SoundManager';
import { useToast } from '../../shared/components/Toast';
import LifelineModal from '../game/components/LifelineModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const SOCKET_PORT = import.meta.env.VITE_SOCKET_PORT || '3011';
const createInitialGameState = () => ({
    questionIndex: 0,
    totalQuestions: 0,
    canBuzz: true,
    isBuzzing: false,
    showOptions: false,
    options: [],
    removedOptions: [],
    timeLeft: 0,
    answered: false,
    result: null,
    score: 0,
    disabledThisRound: false,
    lastScoreAdded: 0,
    buzzSuccess: false,
    waitingMessage: null
});
const createInitialLifelines = () => ({
    fiftyFifty: true,
    phoneFriend: true,
    askAudience: true
});

// Socket.io 連接到獨立的 WebSocket server (port 3001)
// Socket.io 連接到 API Server (共用 Port)
const getSocketUrl = () => {
    // 1. 如果有設定 VITE_SOCKET_URL (生產環境通常是空或跟 API 一樣)
    if (import.meta.env.VITE_SOCKET_URL) {
        return import.meta.env.VITE_SOCKET_URL;
    }

    // 2. 開發環境：如果是 localhost:3000 (直接訪問後端)，改用 3001
    const origin = window.location.origin;
    if (origin.includes('localhost:3000')) {
        return 'http://localhost:3001';
    }

    // 3. 如果是透過 Vite dev server (5173)，讓代理處理
    // 4. 預設：使用當前 origin (適用於生產環境同源部署或 proxy)
    return origin;
};

function PlayerScreenInner({ onBack, initialRoomCode = '' }) {
    const [socket, setSocket] = useState(null);
    const [stage, setStage] = useState('join'); // join | waiting | playing | finished
    const [roomCode, setRoomCode] = useState(initialRoomCode);

    // 自動填入已登入的用戶名
    const [playerName, setPlayerName] = useState(() => {
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                const user = JSON.parse(storedUser);
                return user.name || user.username || '';
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
        return '';
    });

    const [error, setError] = useState('');
    const [connecting, setConnecting] = useState(false);

    // 房間資訊 (組隊模式用)
    const [roomInfo, setRoomInfo] = useState(null);
    const [myTeamId, setMyTeamId] = useState(null);
    const myTeamIdRef = React.useRef(null);
    const [isCaptain, setIsCaptain] = useState(false);

    useEffect(() => {
        myTeamIdRef.current = myTeamId;
    }, [myTeamId]);

    // 專家求助相關狀態
    const [showExpertSelect, setShowExpertSelect] = useState(false);
    const [dialingExpert, setDialingExpert] = useState(null);
    const [expertStatus, setExpertStatus] = useState(null);

    // 遊戲狀態
    const [gameState, setGameState] = useState(createInitialGameState);

    // 求助功能
    const [lifelines, setLifelines] = useState(createInitialLifelines);

    const [lifelineResult, setLifelineResult] = useState(null);
    const [rankings, setRankings] = useState([]);
    const [gameRewards, setGameRewards] = useState({ prizePool: 0, prizeShare: 0, isWinner: false });
    const [showWinnerAnimation, setShowWinnerAnimation] = useState(false);
    const answerUnlockTimeoutRef = React.useRef(null);
    const questionMessageTimeoutRef = React.useRef(null);
    const activeExpertRequestRef = React.useRef(null);
    const timerRef = React.useRef(null);

    const startTimer = (seconds) => {
        if (timerRef.current) clearInterval(timerRef.current);

        setGameState(prev => ({ ...prev, timeLeft: seconds }));

        const interval = setInterval(() => {
            setGameState(prev => {
                if (prev.timeLeft <= 1) {
                    clearInterval(interval);
                    timerRef.current = null;
                    return { ...prev, timeLeft: 0 };
                }
                return { ...prev, timeLeft: prev.timeLeft - 1 };
            });
        }, 1000);

        timerRef.current = interval;
    };

    const clearAnswerUnlockTimeout = () => {
        if (answerUnlockTimeoutRef.current) {
            clearTimeout(answerUnlockTimeoutRef.current);
            answerUnlockTimeoutRef.current = null;
        }
    };

    const clearQuestionMessageTimeout = () => {
        if (questionMessageTimeoutRef.current) {
            clearTimeout(questionMessageTimeoutRef.current);
            questionMessageTimeoutRef.current = null;
        }
    };

    // 我的真實用戶 ID (用於比對獲獎)
    const coinSystem = useCoinSystem();
    const { addToast } = useToast();
    const coinSystemRef = React.useRef(coinSystem);
    const addToastRef = React.useRef(addToast);
    useEffect(() => {
        coinSystemRef.current = coinSystem;
        addToastRef.current = addToast;
    }, [coinSystem, addToast]);

    // Multiplayer BGM follows the player connection stage.
    useEffect(() => {
        const shouldPlayBgm = ['waiting', 'team-select', 'playing'].includes(stage);

        if (shouldPlayBgm) {
            soundManager.playBGM('quizWhiz');
        } else {
            soundManager.stopBGM();
        }

        return () => {
            soundManager.stopBGM();
        };
    }, [stage]);

    const applyLifelineResult = (type, result = {}) => {
        const lifelineKey = {
            expertCall: 'phoneFriend',
            audiencePoll: 'askAudience'
        }[type] || type;

        setLifelines(prev => ({
            ...prev,
            [lifelineKey]: false
        }));

        setLifelineResult(result);

        if (Array.isArray(result.removedOptions)) {
            setGameState(prev => ({
                ...prev,
                removedOptions: result.removedOptions
            }));
        }

        if (lifelineKey === 'phoneFriend') {
            setDialingExpert(null);
            setExpertStatus(null);
            setShowExpertSelect(false);
        }
    };


    // 連接 Socket.io
    useEffect(() => {
        const socketUrl = getSocketUrl();
        console.log('🔌 Connecting to Socket.io at:', socketUrl);
        const newSocket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            randomizationFactor: 0.5,
            timeout: 20000,
            auth: { token: sessionStorage.getItem('authToken') }
        });

        newSocket.on('connect', () => {
            console.log('🔗 Connected to server');
            setConnecting(false);

            // 嘗試重新連線
            const savedRoomCode = sessionStorage.getItem('lastRoomCode');
            const token = sessionStorage.getItem('resumeToken_' + savedRoomCode);

            if (savedRoomCode && token) {
                console.log(`[Resume] Attempting to resume room ${savedRoomCode}...`);
                newSocket.emit('room:resume', { roomCode: savedRoomCode, resumeToken: token }, (res) => {
                    if (res.success) {
                        console.log('[Resume] Success');
                        setConnecting(false);
                        setError('');
                        setRoomCode(savedRoomCode);
                        setRoomInfo(res.room);
                        if (res.player) {
                            setPlayerName(res.player.name);
                            if (res.player.teamId) {
                                setMyTeamId(res.player.teamId);
                            }
                            if (res.player.isCaptain) {
                                setIsCaptain(true);
                            }
                        }
                        if (res.room.status === 'playing') {
                            setStage('playing');
                            if (res.gameState && res.gameState.currentQuestionIndex !== undefined) {
                                const isMyBuzz = res.gameState.currentBuzzer?.playerId === newSocket.id;
                                const resumedQuestionIndex = res.gameState.currentQuestionIndex + 1;

                                setGameState(prev => {
                                    if (prev.questionIndex > resumedQuestionIndex) {
                                        return prev;
                                    }

                                    let waitingMessage = null;
                                    if (res.gameState.questionResolved) {
                                        waitingMessage = '本題已結束，等待下一題...';
                                    } else if (res.gameState.currentBuzzer && !isMyBuzz) {
                                        waitingMessage = '其他玩家作答中...';
                                    } else if (!res.gameState.buzzEnabled) {
                                        waitingMessage = res.gameState.countdownStarted
                                            ? '倒數準備中...'
                                            : '等待主持人開始倒數...';
                                    }

                                    return {
                                        ...prev,
                                        questionIndex: resumedQuestionIndex,
                                        totalQuestions: res.gameState.totalQuestions,
                                        questionText: res.gameState.questionText,
                                        options: [...(res.gameState.options || [])],
                                        canBuzz: res.gameState.buzzEnabled && !res.gameState.currentBuzzer && !res.gameState.questionResolved,
                                        isBuzzing: !!res.gameState.currentBuzzer,
                                        showOptions: isMyBuzz && !res.gameState.questionResolved,
                                        buzzSuccess: false,
                                        timeLeft: res.gameState.timerEndTime ? Math.max(0, Math.ceil((res.gameState.timerEndTime - Date.now()) / 1000)) : 0,
                                        waitingMessage
                                    };
                                });

                                if (isMyBuzz && res.gameState.timerEndTime) {
                                    startTimer(Math.max(0, Math.ceil((res.gameState.timerEndTime - Date.now()) / 1000)));
                                }
                            }
                        } else if (res.room.settings.mode === 'team' && !res.player?.teamId) {
                            setStage('team-select');
                        } else {
                            setStage('waiting');
                        }
                    } else {
                        console.warn('[Resume] Failed:', res.error);
                        setConnecting(false);
                        sessionStorage.removeItem('resumeToken_' + savedRoomCode);
                        sessionStorage.removeItem('lastRoomCode');
                        setError('連線已逾時，請重新加入房間');
                        setStage('join');
                    }
                });
            }
        });

        newSocket.on('disconnect', (reason) => {
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
            setConnecting(true);
            console.log('❌ Disconnected:', reason);
        });

        newSocket.on('connect_error', (err) => {
            console.warn('[Socket] Reconnect pending:', err.message);
        });

        // 房間事件
        newSocket.on('room:closed', (data) => {
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }

            const savedRoomCode = sessionStorage.getItem('lastRoomCode');
            if (savedRoomCode) {
                sessionStorage.removeItem('resumeToken_' + savedRoomCode);
            }
            sessionStorage.removeItem('lastRoomCode');

            setGameState(createInitialGameState());
            setLifelines(createInitialLifelines());
            setLifelineResult(null);
            setRoomInfo(null);
            setMyTeamId(null);
            setIsCaptain(false);
            setRankings([]);
            setGameRewards({ prizePool: 0, prizeShare: 0, isWinner: false });
            setShowWinnerAnimation(false);
            setShowExpertSelect(false);
            setDialingExpert(null);
            setExpertStatus(null);
            setRoomCode('');
            setError(`房間已關閉：${data.reason}`);
            setStage('join');
        });

        // 房間更新 (組隊模式)
        newSocket.on('room:updated', (data) => {
            console.log('🔄 Room updated:', data);
            setRoomInfo(data.room);

            // 更新自己的隊伍和隊長狀態
            const myPlayer = data.room.players.find(p => p.id === newSocket.id);
            if (myPlayer) {
                setMyTeamId(myPlayer.teamId);
                setIsCaptain(myPlayer.isCaptain);
                // 更新禁止搶答狀態
                setGameState(prev => ({
                    ...prev,
                    disabledThisRound: myPlayer.disabledThisRound
                }));
            }
        });

        newSocket.on('game:restarted', (data) => {
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }

            const restartedRoom = data.room;
            const myPlayer = restartedRoom?.players?.find(player => player.id === newSocket.id);

            setRoomInfo(restartedRoom);
            setMyTeamId(myPlayer?.teamId || null);
            setIsCaptain(Boolean(myPlayer?.isCaptain));
            setGameState(createInitialGameState());
            setLifelines(createInitialLifelines());
            setLifelineResult(null);
            setRankings([]);
            setGameRewards({ prizePool: 0, prizeShare: 0, isWinner: false });
            setShowWinnerAnimation(false);
            setShowExpertSelect(false);
            setDialingExpert(null);
            setExpertStatus(null);
            setError('');

            if (restartedRoom?.settings?.mode === 'team' && !myPlayer?.teamId) {
                setStage('team-select');
            } else {
                setStage('waiting');
            }
        });

        // 遊戲開始
        newSocket.on('game:started', (data) => {
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }

            setStage('playing');
            setGameState({
                ...createInitialGameState(),
                totalQuestions: data.totalQuestions,
                canBuzz: false
            });
            setLifelines(createInitialLifelines());
            setLifelineResult(null);
            setDialingExpert(null);
            setExpertStatus(null);
            setShowExpertSelect(false);
        });

        // 新題目 - 使用伺服器提供的延遲值，客戶端本地計時
        newSocket.on('game:question', (data) => {
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
            activeExpertRequestRef.current = null;
            setGameState(prev => {
                if (Number(data.index) < prev.questionIndex) {
                    return prev;
                }

                return {
                    ...prev,
                    questionIndex: data.index,
                    totalQuestions: data.total,
                    questionText: data.question,
                    canBuzz: false,
                    isBuzzing: false,
                    showOptions: false,
                    options: [...(data.options || [])],
                    removedOptions: [],
                    answered: false,
                    result: null,
                    waitingMessage: data.readingTime > 0 ? '📖 大螢幕讀題中...' : '等待主持人開始倒數...'
                };
            });
            setLifelineResult(null);

            const readingTime = data.readingTime || 0;

            if (readingTime > 0) {
                questionMessageTimeoutRef.current = setTimeout(() => {
                    setGameState(prev => ({
                        ...prev,
                        waitingMessage: '等待主持人開始倒數...'
                    }));
                    questionMessageTimeoutRef.current = null;
                }, readingTime);
            }
        });

        newSocket.on('game:countdownStarted', (data) => {
            clearQuestionMessageTimeout();
            setGameState(prev => {
                if (Number(data.questionIndex) !== prev.questionIndex) return prev;
                return {
                    ...prev,
                    canBuzz: false,
                    waitingMessage: '倒數準備中...'
                };
            });
        });

        // 🔔 伺服器統一發送的搶答啟用事件（解決網路延遲不同步問題）
        newSocket.on('game:buzzEnabled', (data) => {
            setGameState(prev => {
                if (data.questionIndex && Number(data.questionIndex) !== prev.questionIndex) {
                    return prev;
                }
                return {
                    ...prev,
                    canBuzz: true,
                    waitingMessage: null
                };
            });
        });

        // 有人搶答
        newSocket.on('game:buzzed', (data) => {
            if (data.playerId === newSocket.id) {
                clearAnswerUnlockTimeout();
                setGameState(prev => ({
                    ...prev,
                    isBuzzing: true,
                    showOptions: false,
                    buzzSuccess: true,
                    timeLeft: data.timeLimit
                }));
                startTimer(data.timeLimit);
                answerUnlockTimeoutRef.current = setTimeout(() => {
                    setGameState(prev => ({
                        ...prev,
                        showOptions: true,
                        buzzSuccess: false
                    }));
                    answerUnlockTimeoutRef.current = null;
                }, 1000);
            } else {
                setGameState(prev => {
                    // We use an internal check or just set a generic waiting message
                    // We can check data.teamId
                    return {
                        ...prev,
                        canBuzz: false,
                        isBuzzing: false,
                        waitingMessage: (data.teamId && data.teamId === myTeamIdRef.current) ? `隊友 ${data.playerName || ''} 正在作答...` : null
                    };
                });
            }
        });

        // 顯示選項（給搶答成功的玩家）- 備用事件，計時器已在 buzzed 中啟動
        newSocket.on('game:showOptions', (data) => {
            setGameState(prev => {
                if (Number(data.questionIndex) !== prev.questionIndex) {
                    console.warn('[GameOnline] Ignored stale answer options', {
                        received: data.questionIndex,
                        current: prev.questionIndex
                    });
                    return prev;
                }

                return {
                    ...prev,
                    options: [...(data.options || [])],
                    timeLeft: data.timeLimit
                };
            });
            // 選項由 game:buzzed 的一秒防誤觸鎖解除後才顯示。
        });

        // 有人作答
        newSocket.on('game:timerPaused', (data) => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setGameState(prev => ({
                ...prev,
                timeLeft: data.remainingTime ?? prev.timeLeft
            }));
        });

        newSocket.on('game:timerResumed', (data) => {
            startTimer(data.remainingTime || 0);
        });

        newSocket.on('game:answered', (data) => {
            if (data.playerId === newSocket.id) {
                clearAnswerUnlockTimeout();
                // 自己的結果
                setGameState(prev => ({
                    ...prev,
                    answered: true,
                    result: data.isCorrect ? 'correct' : 'wrong',
                    score: data.isCorrect ? data.newScore : prev.score,
                    lastScoreAdded: data.isCorrect ? data.scoreAdded : 0
                }));
            } else if (!data.isCorrect) {
                // 別人答錯，可以繼續搶
                setGameState(prev => ({
                    ...prev,
                    canBuzz: true
                }));
            }
        });

        // 超時
        newSocket.on('game:timeout', (data) => {
            if (data.playerId === newSocket.id) {
                clearAnswerUnlockTimeout();
                setGameState(prev => ({
                    ...prev,
                    answered: true,
                    result: 'timeout'
                }));
            } else {
                setGameState(prev => ({
                    ...prev,
                    canBuzz: true
                }));
            }
        });

        // 全員答錯
        newSocket.on('game:allFailed', () => {
            setGameState(prev => ({
                ...prev,
                canBuzz: false
            }));
        });

        newSocket.on('game:lifelineStarted', (data) => {
            if (data.playerId !== newSocket.id || data.type !== 'expertCall') return;
            activeExpertRequestRef.current = data.requestId;
            setExpertStatus('connected');
        });

        // 求助結果
        newSocket.on('game:lifelineUsed', (data) => {
            if (data.playerId === newSocket.id) {
                if (data.type === 'expertCall'
                    && activeExpertRequestRef.current
                    && data.requestId !== activeExpertRequestRef.current) {
                    return;
                }
                applyLifelineResult(data.type, data.result || {});
                if (data.type === 'expertCall') {
                    activeExpertRequestRef.current = null;
                }
                return;
            }

            if (data.playerId !== newSocket.id && data.teamId && data.teamId === myTeamIdRef.current) {
                const typeName = data.type === 'expertCall' ? '專家' : data.type === 'audiencePoll' ? '投票' : '50:50';
                addToastRef.current(`隊友 ${data.playerName || ''} 使用了 ${typeName}`, 'info');
            }
        });

        // 專家連線狀態更新 (V1.2 里程碑廣播)
        newSocket.on('expert:status', (data) => {
            if (data.playerId !== newSocket.id) return;
            if (activeExpertRequestRef.current && data.requestId !== activeExpertRequestRef.current) return;
            setExpertStatus(data.status);
        });

        // 遊戲結束
        newSocket.on('game:ended', (data) => {
            clearAnswerUnlockTimeout();
            setStage('finished');
            setRankings(data.rankings);

            // ✅ 改用 userId 比對（後端以 userId 為準發放獎金）
            let currentUserId = null;
            try {
                const storedUser = localStorage.getItem('user');
                currentUserId = storedUser ? JSON.parse(storedUser).id : null;
            } catch {}

            const isWinnerBySocket = data.winnerSocketIds?.includes(newSocket.id);
            const isWinner = !!(data.prizeShare > 0 && (isWinnerBySocket || (currentUserId && data.winners?.includes(currentUserId))));

            setGameRewards({
                prizePool: data.prizePool || 0,
                prizeShare: data.prizeShare || 0,
                isWinner: isWinner
            });

            if (isWinner && data.prizeShare > 0) {
                if (!currentUserId) {
                    coinSystemRef.current.earnCoins(data.prizeShare, 'multiplayer_win', '連線挑戰賽獎金');
                }
                // 觸發全螢幕金幣雨動畫
                setShowWinnerAnimation(true);
                setTimeout(() => setShowWinnerAnimation(false), 3500);
            }
        });

        setSocket(newSocket);

        return () => {
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
            newSocket.disconnect();
        };
    }, []);

    // 倒數計時器 (Use ref to avoid stale closure issues in useEffect)
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            clearAnswerUnlockTimeout();
            clearQuestionMessageTimeout();
        };
    }, []);

    // 加入房間
    const joinRoom = () => {
        if (!roomCode.trim() || !playerName.trim()) {
            setError('請輸入房間代碼和暱稱');
            return;
        }

        setConnecting(true);
        setError('');

        socket.emit('room:join', {
            roomCode: roomCode.trim(),
            playerName: playerName.trim()
        }, (response) => {
            setConnecting(false);
            if (response.success) {
                clearAnswerUnlockTimeout();
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setGameState(createInitialGameState());
                setLifelines(createInitialLifelines());
                setLifelineResult(null);
                setRankings([]);
                setGameRewards({ prizePool: 0, prizeShare: 0, isWinner: false });
                setShowWinnerAnimation(false);

                if (response.resumeToken) {
                    sessionStorage.setItem('resumeToken_' + roomCode.trim(), response.resumeToken);
                    sessionStorage.setItem('lastRoomCode', roomCode.trim());
                }
                setRoomInfo(response.room);
                // 如果是組隊模式，進入隊伍選擇階段
                if (response.room.settings.mode === 'team') {
                    setStage('team-select');
                } else {
                    setStage('waiting');
                }
            } else {
                setError(response.error);
            }
        });
    };

    // 組隊模式：加入隊伍
    const joinTeam = (teamId) => {
        if (!socket) return;
        socket.emit('player:joinTeam', { teamId }, (response) => {
            if (response.success) {
                setMyTeamId(teamId);
                setStage('waiting');
            } else {
                setError(response.error);
            }
        });
    };

    // 組隊模式：設定隊長
    const toggleCaptain = () => {
        if (!socket) return;
        socket.emit('player:setCaptain', { isCaptain: !isCaptain }, (response) => {
            if (response.success) {
                setIsCaptain(!isCaptain);
            } else {
                setError(response.error);
            }
        });
    };

    // 組隊模式：設定隊名
    const updateTeamName = (newName) => {
        if (!socket) return;
        socket.emit('team:setName', { teamName: newName }, (response) => {
            if (!response.success) {
                setError(response.error);
            }
        });
    };

    // 組隊模式：產生隨機隊名
    const generateRandomTeamName = () => {
        if (!socket) return;
        socket.emit('team:generateName', (response) => {
            if (response.success) {
                updateTeamName(response.name);
            }
        });
    };

    // 搶答
    const buzz = () => {
        if (!gameState.canBuzz || gameState.disabledThisRound) return;

        socket.emit('game:buzz', (response) => {
            if (!response.success) {
                // 搶答失敗（被別人搶走了）
                setGameState(prev => ({ ...prev, canBuzz: false }));
            }
        });
    };

    // 提交答案
    const submitAnswer = (answer) => {
        socket.emit('game:answer', {
            answer,
            questionIndex: gameState.questionIndex
        }, (response) => {
            if (!response?.success) {
                setError(response?.error || '答案送出失敗，請再試一次');
            }
        });
    };

    // 處理專家點擊
    const handleExpertConfig = () => {
        if (!lifelines.phoneFriend) return;
        setShowExpertSelect(true);
    };

    const callExpert = (expertOrId) => {
        const expert = typeof expertOrId === 'string' ? EXPERT_DB.find(e => e.id === expertOrId) : expertOrId;
        setShowExpertSelect(false);
        setDialingExpert(expert);
        setExpertStatus(null);
        activeExpertRequestRef.current = null;
        socket?.emit('game:useLifeline', { type: 'phoneFriend', expert }, (res) => {
            if (!res.success) {
                setDialingExpert(null);
                setExpertStatus(null);
                activeExpertRequestRef.current = null;
                addToast('連線失敗', 'error');
                return;
            }

            applyLifelineResult('phoneFriend', res.result || {});
        });
    };

    // 使用求助
    const handleLifeline = (type, expertData = null) => {
        if (!socket) return;
        const socketType = {
            phoneFriend: 'phoneFriend',
            askAudience: 'askAudience'
        }[type] || type;

        socket.emit('game:useLifeline', { type: socketType, expert: expertData }, (response) => {
            if (!response.success) {
                setError(response.error);
                setDialingExpert(null); // Reset if error
                return;
            }

            applyLifelineResult(socketType, response.result || {});
        });
    };

    // 離開
    const goBack = () => {
        if (socket) socket.disconnect();
        if (onBack) onBack();
    };

    // ========== 渲染 ==========

    // 專家選擇介面 (Overlay)
    if (showExpertSelect) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col p-6 animate-fade-in">
                <h2 className="text-2xl font-bold text-white mb-6 text-center">📞 選擇連線專家</h2>
                <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-20">
                    {EXPERT_DB.map(expert => (
                        <button
                            key={expert.id}
                            onClick={() => callExpert(expert)}
                            className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-yellow-500 transition-all flex flex-col items-center gap-3"
                        >
                            <div className="w-20 h-20 bg-slate-700 rounded-full overflow-hidden border-2 border-slate-500">
                                {expert.avatar ? (
                                    <img src={`/experts/${encodeURIComponent(expert.avatar)}`} alt={expert.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>
                                )}
                            </div>
                            <div className="text-center">
                                <div className="text-yellow-400 font-bold">{expert.name}</div>
                                <div className="text-slate-400 text-xs">{expert.title}</div>
                            </div>
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setShowExpertSelect(false)}
                    className="absolute bottom-6 left-6 right-6 py-4 bg-slate-700 text-white rounded-xl font-bold"
                >
                    取消
                </button>
            </div>
        );
    }

    // 撥號中畫面 (優化：顯示即時進度)
    if (dialingExpert) {
        const getStatusMessage = () => {
            switch (expertStatus) {
                case 'connected': return '對方已接聽...';
                case 'pondering': return '專家正在查考經文...';
                case 'responding': return '專家正在回覆中...';
                default: return '正在撥號中...';
            }
        };

        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 animate-fade-in">
                <div className="relative mb-8">
                    <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl transition-all duration-500 shadow-xl ${
                        expertStatus ? 'bg-blue-600 animate-pulse' : 'bg-green-600 animate-bounce'
                    }`}>
                        {expertStatus === 'responding' ? '✍️' : expertStatus === 'pondering' ? '📖' : '📞'}
                    </div>
                    {/* 波紋動畫 */}
                    {!expertStatus && <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-75"></div>}
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{getStatusMessage()}</h2>
                <p className="text-xl text-yellow-400 font-medium">{dialingExpert.name}</p>

                {/* 小進度條縮影 */}
                <div className="w-48 h-1 bg-slate-800 rounded-full mt-6 overflow-hidden">
                    <div className={`h-full bg-yellow-500 transition-all duration-1000 ${
                        expertStatus === 'responding' ? 'w-full' : expertStatus === 'pondering' ? 'w-2/3' : expertStatus === 'connected' ? 'w-1/3' : 'w-0'
                    }`}></div>
                </div>
            </div>
        );
    }

    // 加入房間
    if (stage === 'join') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/20">
                    <button onClick={goBack} className="mb-6 flex items-center gap-2 text-white/70 hover:text-white">
                        <ArrowLeft size={20} />
                        返回
                    </button>

                    <h1 className="text-2xl font-bold text-white mb-2">🎮 加入搶答</h1>
                    <p className="text-white/70 mb-8">輸入大螢幕顯示的房間代碼</p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-white/80 text-sm mb-2">房間代碼</label>
                            <input
                                type="text"
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-center text-2xl font-mono tracking-widest placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                placeholder="000000"
                                maxLength={6}
                            />
                        </div>

                        <div>
                            <label className="block text-white/80 text-sm mb-2">您的暱稱</label>
                            <input
                                type="text"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value.slice(0, 10))}
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                placeholder="輸入暱稱（最多10字）"
                                maxLength={10}
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-2">
                                <AlertTriangle size={16} />
                                {error}
                            </div>
                        )}

                        <button
                            onClick={joinRoom}
                            disabled={connecting || roomCode.length < 6 || !playerName.trim()}
                            className={`w-full py-4 font-bold text-base rounded-xl transition-all flex items-center justify-center gap-2 ${roomCode.length === 6 && playerName.trim()
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                                : 'bg-white/10 text-white/30 cursor-not-allowed'
                                }`}
                        >
                            {connecting ? (
                                <><Loader2 size={20} className="animate-spin" /> 連接中...</>
                            ) : (
                                '加入房間'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 組隊模式：選擇隊伍
    if (stage === 'team-select' && roomInfo) {
        const teams = roomInfo.settings.teams || {};
        const teamColors = {
            '1': 'from-red-500 to-red-600',
            '2': 'from-blue-500 to-blue-600',
            '3': 'from-green-500 to-green-600',
            '4': 'from-yellow-500 to-yellow-600',
            '5': 'from-purple-500 to-purple-600',
            '6': 'from-orange-500 to-orange-600'
        };

        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/20">
                    <h1 className="text-2xl font-bold text-white mb-2 text-center">👥 選擇你的隊伍</h1>
                    <p className="text-white/70 mb-6 text-center">請選擇要加入的隊伍</p>

                    <div className="space-y-3">
                        {Object.entries(teams).map(([teamId, team]) => {
                            const teamPlayers = roomInfo.players.filter(p => p.teamId === teamId);
                            const isFull = teamPlayers.length >= roomInfo.settings.teamMaxPlayers;

                            return (
                                <button
                                    key={teamId}
                                    onClick={() => !isFull && joinTeam(teamId)}
                                    disabled={isFull}
                                    className={`w-full p-4 rounded-xl transition-all flex items-center justify-between ${isFull
                                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                        : `bg-gradient-to-r ${teamColors[teamId]} text-white hover:scale-105`
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">
                                            {teamId === '1' ? '🔴' : teamId === '2' ? '🔵' : teamId === '3' ? '🟢' : teamId === '4' ? '🟡' : teamId === '5' ? '🟣' : '🟠'}
                                        </span>
                                        <span className="font-bold text-lg">
                                            {team.name || `隊伍 ${teamId}`}
                                        </span>
                                    </div>
                                    <span className={`text-sm ${isFull ? 'text-red-300' : 'text-white/80'}`}>
                                        {teamPlayers.length}/{roomInfo.settings.teamMaxPlayers} {isFull && '(已滿)'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-2">
                            <AlertTriangle size={16} />
                            {error}
                        </div>
                    )}

                    <button
                        onClick={goBack}
                        className="mt-6 w-full py-3 bg-white/10 text-white rounded-xl hover:bg-white/20"
                    >
                        離開房間
                    </button>
                </div>
            </div>
        );
    }

    // 全螢幕獲獎動畫 (覆蓋在最頂層)
    if (showWinnerAnimation) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 overflow-hidden">
                {/* 金幣雨粒子 */}
                {Array.from({ length: 20 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute text-4xl animate-bounce"
                        style={{
                            left: `${(i * 47 + 13) % 90}%`,
                            top: `${(i * 31 + 7) % 80}%`,
                            animationDelay: `${(i % 8) * 0.1}s`,
                            animationDuration: `${0.4 + (i % 6) * 0.1}s`
                        }}
                    >
                        🪙
                    </div>
                ))}
                <div className="relative z-10 text-center px-8">
                    <div className="text-8xl mb-6 animate-bounce">🏆</div>
                    <h1 className="text-5xl font-black text-yellow-400 mb-3 drop-shadow-[0_0_30px_rgba(234,179,8,0.8)]">恭喜獲獎！</h1>
                    <div className="flex items-center justify-center gap-3 bg-yellow-500/20 border-2 border-yellow-400 rounded-2xl px-8 py-4 mt-4">
                        <Coins size={40} className="text-yellow-400" />
                        <span className="text-6xl font-black text-white">+{gameRewards.prizeShare}</span>
                        <span className="text-2xl text-yellow-300">智匯金幣</span>
                    </div>
                    <p className="text-white/60 mt-4 text-lg">已自動存入您的帳戶</p>
                </div>
            </div>
        );
    }

    // 等候室 (個人模式 & 組隊模式共用)
    if (stage === 'waiting') {
        const isTeamMode = roomInfo?.settings?.mode === 'team';
        const myTeam = isTeamMode && myTeamId && roomInfo?.settings?.teams?.[myTeamId];
        const hasPrizePool = roomInfo?.settings?.prizePool > 0;
        const prizePool = roomInfo?.settings?.prizePool || 0;

        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/20 text-center">
                    <Loader2 size={50} className="animate-spin text-purple-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">已加入房間</h1>

                    {/* 🏆 挑戰模式：獎金池預告 */}
                    {hasPrizePool && (
                        <div className="my-4 p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/40 rounded-2xl flex items-center justify-center gap-3">
                            <TrophyIcon size={28} className="text-yellow-400 flex-shrink-0" />
                            <div className="text-left">
                                <p className="text-yellow-300 font-bold text-sm">挑戰模式・獎金池</p>
                                <div className="flex items-center gap-1">
                                    <Coins size={18} className="text-yellow-400" />
                                    <span className="text-white text-2xl font-black">{prizePool}</span>
                                    <span className="text-yellow-200 text-sm">智匯金幣</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 組隊模式：顯示隊伍資訊 */}
                    {isTeamMode && myTeam && (
                        <div className="my-6 p-4 bg-white/10 rounded-xl">
                            <p className="text-white/60 mb-2">你的隊伍</p>
                            <p className="text-2xl font-bold text-white mb-4">
                                {myTeam.name || `隊伍 ${myTeamId}`}
                            </p>

                            {/* 隊長控制 */}
                            <div className="space-y-3">
                                <button
                                    onClick={toggleCaptain}
                                    className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isCaptain
                                        ? 'bg-yellow-500 text-black'
                                        : 'bg-white/10 text-white hover:bg-yellow-500/20'
                                        }`}
                                >
                                    👑 {isCaptain ? '你是隊長' : '成為隊長'}
                                </button>

                                {isCaptain && (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="輸入隊名..."
                                            defaultValue={myTeam.name}
                                            onBlur={(e) => updateTeamName(e.target.value)}
                                            className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                            maxLength={12}
                                        />
                                        <button
                                            onClick={generateRandomTeamName}
                                            className="px-3 py-2 bg-purple-500/30 text-purple-300 rounded-lg hover:bg-purple-500/50 text-sm"
                                            title="隨機產生"
                                        >
                                            🎲
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <p className="text-white/70 text-base">等待房主開始遊戲...</p>
                    <p className="text-purple-300 mt-2">房間代碼：{roomCode}</p>

                    {error && (
                        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={goBack}
                        className="mt-6 px-6 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20"
                    >
                        離開房間
                    </button>
                </div>
            </div>
        );
    }

    // 遊戲進行中
    if (stage === 'playing') {
        const { canBuzz, showOptions, options, removedOptions, timeLeft, answered, result, score, buzzSuccess } = gameState;

        // 已作答 - 顯示結果
        if (answered) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
                    <div className="text-center">
                        {result === 'correct' ? (
                            <>
                                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Check size={48} className="text-white" />
                                </div>
                                <h1 className="text-3xl font-bold text-green-400 mb-2">答對了！</h1>
                                <p className="text-3xl font-mono text-yellow-400">+{gameState.lastScoreAdded || 0} 分</p>
                                <p className="text-lg text-white/60 mt-2">累積：{score} 分</p>
                            </>
                        ) : result === 'wrong' ? (
                            <>
                                <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <X size={48} className="text-white" />
                                </div>
                                <h1 className="text-3xl font-bold text-red-400 mb-2">答錯了</h1>
                                <p className="text-white/70">等待下一題...</p>
                            </>
                        ) : (
                            <>
                                <div className="w-24 h-24 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <AlertTriangle size={48} className="text-white" />
                                </div>
                                <h1 className="text-3xl font-bold text-yellow-400 mb-2">超時！</h1>
                                <p className="text-white/70">等待下一題...</p>
                            </>
                        )}
                    </div>
                </div>
            );
        }

        // 🎉 搶答成功過渡畫面（防止誤觸）
        if (buzzSuccess) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex items-center justify-center p-6">
                    <div className="text-center animate-bounce">
                        <div className="w-32 h-32 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-yellow-500/50">
                            <span className="text-6xl">🔔</span>
                        </div>
                        <h1 className="text-5xl font-bold text-yellow-400 mb-4">你搶到了！</h1>
                        <p className="text-2xl text-white/70 animate-pulse">準備作答...</p>
                    </div>
                </div>
            );
        }

        // 正在作答 - 顯示選項
        if (showOptions) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6">
                    {lifelineResult?.expert && lifelineResult?.message && (
                        <LifelineModal
                            type="phone"
                            data={{
                                name: lifelineResult.expert.name,
                                avatar: lifelineResult.expert.avatar,
                                message: lifelineResult.message
                            }}
                            onClose={() => setLifelineResult(null)}
                        />
                    )}

                    {/* 倒數計時 */}
                    <div className="text-center mb-6">
                        <div className={`text-5xl font-bold font-mono ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {timeLeft}
                        </div>
                        <p className="text-white/50">剩餘秒數</p>
                    </div>

                    {/* 求助功能 */}
                    <div className="flex justify-center gap-3 mb-6">
                        <button
                            onClick={() => handleLifeline('fiftyFifty')}
                            disabled={!lifelines.fiftyFifty}
                            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${lifelines.fiftyFifty
                                ? 'bg-orange-500 text-white'
                                : 'bg-white/10 text-white/30'
                                }`}
                        >
                            <Zap size={18} /> 50:50
                        </button>
                        <button
                            onClick={handleExpertConfig} // 改為開啟選擇介面
                            disabled={!lifelines.phoneFriend}
                            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${lifelines.phoneFriend
                                ? 'bg-blue-500 text-white'
                                : 'bg-white/10 text-white/30'
                                }`}
                        >
                            <HelpCircle size={18} /> 求助專家
                        </button>
                        <button
                            onClick={() => handleLifeline('askAudience')}
                            disabled={!lifelines.askAudience}
                            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${lifelines.askAudience
                                ? 'bg-green-500 text-white'
                                : 'bg-white/10 text-white/30'
                                }`}
                        >
                            <BarChart2 size={18} /> 觀眾投票
                        </button>
                    </div>

                    {/* 觀眾投票結果 */}
                    {lifelineResult?.poll && (
                        <div className="bg-white/10 rounded-xl p-4 mb-6 text-center animate-fade-in">
                            <div className="flex justify-around">
                                {Object.entries(lifelineResult.poll).map(([opt, pct]) => (
                                    <div key={opt} className="text-center">
                                        <div className="text-2xl font-bold text-white">{pct}%</div>
                                        <div className="text-white/50">{opt}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 選項 */}
                    <div className="grid grid-cols-1 gap-4">
                        {options.map((option, idx) => {
                            const letter = ['A', 'B', 'C', 'D'][idx];
                            const isRemoved = removedOptions.includes(letter);

                            return (
                                <button
                                    key={idx}
                                    onClick={() => !isRemoved && submitAnswer(letter)}
                                    disabled={isRemoved}
                                    className={`p-5 rounded-2xl text-left font-bold text-base transition-all ${isRemoved
                                        ? 'bg-white/5 text-white/20'
                                        : 'bg-white/10 text-white active:bg-purple-500 active:scale-95'
                                        }`}
                                >
                                    <span className="text-purple-300 mr-3">{letter}.</span>
                                    {isRemoved ? '---' : option}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // 等待搶答
        const isDisabled = gameState.disabledThisRound;
        const isTeamMode = roomInfo?.settings?.mode === 'team';
        const myTeam = isTeamMode && myTeamId && roomInfo?.settings?.teams?.[myTeamId];

        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
                <div className="text-center w-full">
                    {/* 隊伍資訊 (組隊模式) */}
                    {isTeamMode && myTeam && (
                        <div className="mb-4">
                            <span className="px-4 py-1 bg-white/10 rounded-full text-white/80 text-sm">
                                {myTeam.name || `隊伍 ${myTeamId}`}
                                {isCaptain && ' 👑'}
                            </span>
                        </div>
                    )}

                    <p className="text-white/50 mb-4">
                        第 {gameState.questionIndex} / {gameState.totalQuestions} 題
                    </p>

                    {isDisabled ? (
                        /* 答錯禁止搶答 */
                        <div className="w-64 h-64 rounded-full bg-red-500/20 border-4 border-red-500/50 text-red-300 text-2xl font-bold mx-auto flex flex-col items-center justify-center">
                            <span className="text-5xl mb-2">🚫</span>
                            本題已答錯
                            <span className="text-sm text-red-400/70 mt-2">等待下一題</span>
                        </div>
                    ) : canBuzz ? (
                        <button
                            onPointerDown={(e) => {
                                e.preventDefault();
                                buzz();
                            }}
                            className="w-64 h-64 rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white text-3xl font-bold shadow-2xl active:scale-95 transition-transform mx-auto flex items-center justify-center select-none"
                            style={{ touchAction: 'none' }}
                        >
                            🔔<br />搶答！
                        </button>
                    ) : (
                        <div className="w-64 h-64 rounded-full bg-white/10 text-white/30 text-2xl font-bold mx-auto flex flex-col items-center justify-center animate-pulse">
                            <span className="text-4xl mb-2">
                                {gameState.waitingMessage?.includes('讀題') ? '📖' : '⏳'}
                            </span>
                            {gameState.waitingMessage || '等待中...'}
                        </div>
                    )}

                    <p className="text-white mt-8 text-xl">目前分數：{score}</p>
                </div>
            </div>
        );
    }

    // 遊戲結束
    if (stage === 'finished') {
        const isTeamMode = roomInfo?.settings?.mode === 'team';
        const { isWinner, prizeShare, prizePool } = gameRewards;

        // 個人模式：找自己的排名
        const myRank = !isTeamMode && rankings.find(r => r.playerId === socket?.id);

        // 組隊模式：找自己隊伍的排名
        const myTeamRank = isTeamMode && rankings.find(r => r.id === myTeamId);

        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/20 text-center">
                    <h1 className="text-3xl font-bold text-white mb-6">遊戲結束！</h1>

                    {isTeamMode ? (
                        /* 組隊模式排名 */
                        <>
                            {myTeamRank && (
                                <>
                                    <div className={`text-6xl font-bold mb-2 ${myTeamRank.rank === 1 ? 'text-yellow-400' :
                                        myTeamRank.rank === 2 ? 'text-gray-300' :
                                            myTeamRank.rank === 3 ? 'text-orange-400' : 'text-white'
                                        }`}>
                                        #{myTeamRank.rank}
                                    </div>
                                    <p className="text-xl text-white/80 mb-2">{myTeamRank.name || `隊伍 ${myTeamId}`}</p>
                                </>
                            )}
                            <p className="text-3xl font-mono text-white mb-4">{myTeamRank?.score || 0} 分</p>

                            {/* 🏆 獎金池相關顯示 */}
                            {prizePool > 0 && !isWinner && (
                                <div className="mb-4 text-white/40 text-sm">
                                    本局獎金池 {prizePool} 金幣已由冠軍隊伍獲得
                                </div>
                            )}
                            {isWinner && (
                                <div className="mb-6 bg-gradient-to-br from-yellow-400/30 to-orange-400/20 border-2 border-yellow-400/70 rounded-2xl p-5 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                                    <div className="flex items-center justify-center gap-2 text-yellow-300 font-bold text-lg mb-2">
                                        <TrophyIcon size={22} />
                                        <span>冠軍隊伍獎金分紅・已到帳</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 text-4xl font-black text-white">
                                        <Coins size={32} className="text-yellow-400" />
                                        +{prizeShare}
                                    </div>
                                    <p className="text-yellow-200/60 text-xs mt-2">智匯金幣已存入帳戶</p>
                                </div>
                            )}

                            {/* 所有隊伍排名 */}
                            <div className="bg-white/5 rounded-xl p-4 mb-6">
                                <h3 className="text-white/60 text-sm mb-3">隊伍排名</h3>
                                <div className="space-y-2">
                                    {rankings.map((team, idx) => (
                                        <div
                                            key={team.id}
                                            className={`flex items-center justify-between p-2 rounded-lg ${team.id === myTeamId ? 'bg-yellow-500/20' : 'bg-white/5'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-white/60'}`}>
                                                    #{team.rank}
                                                </span>
                                                <span className="text-white">{team.name || `隊伍 ${team.id}`}</span>
                                            </div>
                                            <span className="text-white font-mono">{team.score}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* 個人模式排名 */
                        <>
                            {myRank && (
                                <div className={`text-6xl font-bold mb-4 ${myRank.rank === 1 ? 'text-yellow-400' :
                                    myRank.rank === 2 ? 'text-gray-300' :
                                        myRank.rank === 3 ? 'text-orange-400' : 'text-white'
                                    }`}>
                                    #{myRank.rank}
                                </div>
                            )}
                            <p className="text-2xl font-mono text-white mb-4">{myRank?.score ?? gameState.score ?? 0} 分</p>

                            {/* 🏆 獎金池相關顯示 */}
                            {prizePool > 0 && !isWinner && (
                                <div className="mb-4 text-white/40 text-sm">
                                    本局獎金池 {prizePool} 金幣已由冠軍獲得
                                </div>
                            )}
                            {isWinner && (
                                <div className="mb-8 bg-gradient-to-br from-yellow-400/30 to-orange-400/20 border-2 border-yellow-400/70 rounded-2xl p-6 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                                    <div className="flex items-center justify-center gap-2 text-yellow-300 font-bold text-xl mb-2">
                                        <TrophyIcon size={26} />
                                        <span>🎉 本局冠軍獎金・已到帳</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 text-5xl font-black text-white">
                                        <Coins size={40} className="text-yellow-400" />
                                        +{prizeShare}
                                    </div>
                                    <p className="text-yellow-200/60 text-sm mt-2">智匯金幣已存入帳戶</p>
                                </div>
                            )}
                        </>
                    )}

                    <button
                        onClick={goBack}
                        className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-base rounded-xl"
                    >
                        返回主頁
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
