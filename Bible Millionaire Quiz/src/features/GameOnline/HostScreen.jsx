/**
 * 搶答連線模式 - 房主大螢幕
 * Host Screen for Multiplayer Buzzer Mode
 * 用於投影顯示題目、計分板、遊戲狀態
 */
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import {
    Users, Play, Settings, Copy, Check, X, Volume2, VolumeX,
    Trophy, ArrowLeft, RefreshCw, Loader2,
    Coins, Zap, Timer, Users as UsersIcon
} from 'lucide-react';
import { useCoinSystem } from '../../hooks/useCoinSystem';
import { soundManager } from '../../utils/SoundManager';
import { buildMultiplayerJoinUrl } from './multiplayerJoinLink';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const SOCKET_PORT = import.meta.env.VITE_SOCKET_PORT || '3011';
const ANSWER_OVERLAY_DURATION = {
    correct: 8000,
    wrong: 6000,
    allFailed: 8000
};
const LIFELINE_LABELS = {
    fiftyFifty: '50:50',
    expertCall: '專家求助',
    audiencePoll: '觀眾投票'
};

// Socket.io 連接到獨立的 WebSocket server (port 3001)
// Socket.io 連接到 API Server (共用 Port)
const getSocketUrl = () => {
    // 1. 如果有設定 VITE_SOCKET_URL
    if (import.meta.env.VITE_SOCKET_URL) {
        return import.meta.env.VITE_SOCKET_URL;
    }
    // 2. 開發環境：如果 API base 是絕對路徑
    if (API_BASE && API_BASE.startsWith('http')) {
        return API_BASE;
    }
    // 3. 預設：使用當前 origin
    return window.location.origin;
};

export default function HostScreen({ onBack, selectedBooks = [], mode = 'buzzer' }) {
    const [socket, setSocket] = useState(null);
    const [stats, setStats] = useState({ connected: false });
    const [stage, setStage] = useState('setup'); // setup | lobby | playing | finished
    const [roomCode, setRoomCode] = useState('');
    const [joinQrCode, setJoinQrCode] = useState('');
    const [joinQrError, setJoinQrError] = useState('');
    const [players, setPlayers] = useState([]);
    const [copied, setCopied] = useState(false);
    const [soundEnabled] = useState(true);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    const joinUrl = roomCode
        ? buildMultiplayerJoinUrl(window.location.origin, roomCode)
        : '';

    useEffect(() => {
        let cancelled = false;

        if (!joinUrl) {
            setJoinQrCode('');
            setJoinQrError('');
            return () => {
                cancelled = true;
            };
        }

        setJoinQrError('');
        QRCode.toDataURL(joinUrl, {
            errorCorrectionLevel: 'M',
            width: 320,
            margin: 2,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            }
        }).then((dataUrl) => {
            if (!cancelled) setJoinQrCode(dataUrl);
        }).catch((error) => {
            console.error('[Multiplayer] QR Code generation failed:', error);
            if (!cancelled) setJoinQrError('QR Code 產生失敗，請改用房間代碼加入');
        });

        return () => {
            cancelled = true;
        };
    }, [joinUrl]);

    // Manual Next Control
    const [canGoNext, setCanGoNext] = useState(false);
    const [isTransitioningQuestion, setIsTransitioningQuestion] = useState(false);

    // Game settings - 使用傳入的 selectedBooks
    // selectedBooks 可能是物件陣列 [{book, startChapter, endChapter}] 或字串陣列
    const getBookNames = (books) => {
        if (!books || books.length === 0) return [];
        if (typeof books[0] === 'string') return books;
        return books.map(b => b.book);
    };

    const coinSystem = useCoinSystem();

    const [settings, setSettings] = useState({
        mode: mode, // 'buzzer' | 'team'
        totalQuestions: 15,
        books: getBookNames(selectedBooks),
        difficulty: 'mixed',
        hostName: '房主',
        manualNext: true,
        autoNextDelay: 10, // Default 10s if auto
        // Prize Pool Settings
        enablePrizePool: false,
        prizePoolAmount: 0,
        // Team Settings
        teamCount: mode === 'team' ? 2 : 0,
        teamMaxPlayers: mode === 'team' ? 5 : 0
    });

    // ... (keep existing state)

    // Sparkle Animation Style
    const sparkleStyle = `
        @keyframes sparkle {
            0% { text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4); }
            50% { text-shadow: 0 0 20px rgba(255,255,255,1), 0 0 40px rgba(255,215,0,0.8), 0 0 60px rgba(255,215,0,0.6); }
            100% { text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4); }
        }
        .animate-sparkle {
            animation: sparkle 2s infinite;
        }
    `;

    // ... (keep existing effects)


    // Game state
    const [gameState, setGameState] = useState({
        currentQuestion: null,
        questionIndex: 0,
        totalQuestions: 0,
        currentBuzzer: null,
        timeLeft: 0,
        showAnswer: false,
        isCorrect: null
    });

    const [loadingQuestions, setLoadingQuestions] = useState(false);

    // 打字機效果顯示的題目
    const [displayedQuestion, setDisplayedQuestion] = useState('');
    // 已顯示的選項數量 (0-4)，用於逐一顯示
    const [revealedOptionCount, setRevealedOptionCount] = useState(0);
    const [error, setError] = useState('');

    // 玩家求助 Overlay 狀態
    const [lifelineOverlay, setLifelineOverlay] = useState(null);

    // 答對/答錯 Overlay 狀態 (大螢幕全屏提示)
    const [answerOverlay, setAnswerOverlay] = useState(null);
    const answerOverlayTimerRef = React.useRef(null);

    const dismissAnswerOverlay = () => {
        if (answerOverlayTimerRef.current) {
            clearTimeout(answerOverlayTimerRef.current);
            answerOverlayTimerRef.current = null;
        }
        setAnswerOverlay(null);
    };

    const showTimedAnswerOverlay = (overlay, duration) => {
        if (answerOverlayTimerRef.current) {
            clearTimeout(answerOverlayTimerRef.current);
        }
        setAnswerOverlay(overlay);
        answerOverlayTimerRef.current = setTimeout(() => {
            setAnswerOverlay(null);
            answerOverlayTimerRef.current = null;
        }, duration);
    };

    // 搶答倒數狀態 (3, 2, 1, GO!)
    const [countdown, setCountdown] = useState(null);
    const [questionReadyForCountdown, setQuestionReadyForCountdown] = useState(false);
    const countdownIntervalRef = React.useRef(null);

    const clearCountdownInterval = React.useCallback(() => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
    }, []);

    const runHostCountdown = React.useCallback((buzzEnabledAt) => {
        clearCountdownInterval();

        const updateCountdown = () => {
            const remainingMs = Number(buzzEnabledAt) - Date.now();
            if (remainingMs <= 0) {
                setCountdown(null);
                clearCountdownInterval();
                return;
            }

            setCountdown(
                remainingMs <= 1000
                    ? 'GO!'
                    : Math.max(1, Math.ceil((remainingMs - 1000) / 1000))
            );
        };

        updateCountdown();
        countdownIntervalRef.current = setInterval(updateCountdown, 100);
    }, [clearCountdownInterval]);

    // 動畫控制 Ref（用於取消之前的打字機動畫）
    const animationAbortRef = React.useRef(null);

    // BGM control
    useEffect(() => {
        const shouldPlayBgm = ['lobby', 'playing'].includes(stage);

        if (shouldPlayBgm && soundEnabled) {
            soundManager.playBGM('quizWhiz');
        } else {
            soundManager.stopBGM();
        }

        return () => {
            soundManager.stopBGM();
        };
    }, [stage, soundEnabled]);

    const soundEnabledRef = React.useRef(soundEnabled);
    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    const playSound = React.useCallback((type) => {
        if (!soundEnabledRef.current) return;
        console.log(`Sound: ${type}`);
    }, []);

    // 連接 Socket.io
    useEffect(() => {
        const socketUrl = getSocketUrl();
        console.log('🔌 Connecting to Socket.io at:', socketUrl);
        const newSocket = io(socketUrl, {
            // Remove explicit transports to allow auto-detection (Polling -> Websocket)
            // transports: ['websocket', 'polling']
            auth: { token: sessionStorage.getItem('authToken') }
        });

        newSocket.on('connect', () => {
            console.log('🔗 Connected to server');
            setStats(s => ({ ...s, connected: true }));
        });

        newSocket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            setStats(s => ({ ...s, connected: false }));
        });

        newSocket.on('connect_error', (err) => {
            console.error('Connection error:', err);
            setStats(s => ({ ...s, connected: false }));
            setError(`連線失敗: ${err.message}`);
        });

        // 房間事件
        newSocket.on('room:playerJoined', (data) => {
            console.log('👤 Player joined:', data);
            // 處理不同的資料結構
            if (data.room?.players) {
                setPlayers(data.room.players);
            } else if (data.player) {
                // 只收到單個玩家，加入列表
                setPlayers(prev => [...prev, data.player]);
            }
        });

        newSocket.on('room:playerLeft', (data) => {
            console.log('👤 Player left:', data);
            if (data.room?.players) {
                setPlayers(data.room.players);
            } else if (data.playerId) {
                // 只收到離開的 playerId，從列表移除
                setPlayers(prev => prev.filter(p => p.id !== data.playerId));
            }
        });

        // 玩家資料更新 (例如：隊伍分配)
        newSocket.on('room:playerUpdated', (data) => {
            console.log('🔄 Players updated (legacy):', data);
            if (data.players) {
                setPlayers(data.players);
            }
        });

        // 房間狀態更新 (新增：統一處理所有房間變更)
        newSocket.on('room:updated', (data) => {
            console.log('🔄 Room updated - full data:', JSON.stringify(data, null, 2));
            if (data.room?.players) {
                console.log('✅ Setting players:', data.room.players.length, 'players');
                setPlayers(data.room.players);
            } else {
                console.warn('⚠️ No players in room data. data.room:', data.room);
            }
            // 同步隊伍資訊（包含隊伍名稱變更）
            if (data.room?.settings?.teams) {
                console.log('✅ Syncing teams:', Object.keys(data.room.settings.teams).length, 'teams');
                setSettings(s => ({ ...s, teams: data.room.settings.teams }));
            }
        });

        // 遊戲事件
        newSocket.on('game:buzzed', (data) => {
            setGameState(prev => ({
                ...prev,
                currentBuzzer: { id: data.playerId, name: data.playerName, teamId: data.teamId },
                timeLeft: data.timeLimit
            }));
            playSound('buzz');
        });

        newSocket.on('game:answered', (data) => {
            setLifelineOverlay(null);

            if (data.isCorrect) {
                setGameState(prev => ({
                    ...prev,
                    showAnswer: true,
                    isCorrect: true,
                    correctIndex: data.correctIndex
                }));

                // 只有答對時才啟用下一題
                setCanGoNext(true);

                // 顯示全螢幕答題結果（含正解）
                showTimedAnswerOverlay({
                    isCorrect: true,
                    playerName: data.playerName,
                    scoreAdded: data.scoreAdded || 0,
                    totalScore: data.newScore,
                    correctAnswer: data.correctAnswer
                }, ANSWER_OVERLAY_DURATION.correct);
                playSound('correct');

                // 更新玩家分數
                setPlayers(prev => {
                    const nextScore = data.newScore ?? 0;
                    const exists = prev.some(p => p.id === data.playerId);
                    if (!exists) {
                        return [
                            ...prev,
                            {
                                id: data.playerId,
                                name: data.playerName,
                                score: nextScore,
                                teamId: data.teamId || null
                            }
                        ];
                    }
                    return prev.map(p =>
                        p.id === data.playerId
                            ? { ...p, score: nextScore }
                            : p
                    );
                });

                // 更新隊伍分數
                if (data.teamId && data.teamScore !== undefined) {
                    setSettings(prev => ({
                        ...prev,
                        teams: {
                            ...prev.teams,
                            [data.teamId]: {
                                ...prev.teams[data.teamId],
                                score: data.teamScore
                            }
                        }
                    }));
                }
            } else {
                // 中途答錯：只顯示短暫錯誤提示，不啟用下一題，不清空選項，但清除當前搶答者
                playSound('wrong');
                showTimedAnswerOverlay({
                    isCorrect: false,
                    playerName: data.playerName,
                    scoreAdded: 0,
                    totalScore: 0
                }, ANSWER_OVERLAY_DURATION.wrong);

                setGameState(prev => ({
                    ...prev,
                    currentBuzzer: null
                }));
            }
        });

        newSocket.on('game:timeout', () => {
            setLifelineOverlay(null);
            playSound('timeout');
            setGameState(prev => ({
                ...prev,
                currentBuzzer: null
            }));
        });

        newSocket.on('game:allFailed', (data) => {
            setLifelineOverlay(null);
            setGameState(prev => ({
                ...prev,
                showAnswer: true,
                correctAnswer: data.correctAnswer,
                correctIndex: data.correctIndex
            }));
            // 啟用下一題按鈕
            setCanGoNext(true);

            // 顯示答題結果（無人答對 / 全員答錯）
            showTimedAnswerOverlay({
                isCorrect: false,
                playerName: '無人答對',
                scoreAdded: 0,
                totalScore: 0,
                correctAnswer: data.correctAnswer
            }, ANSWER_OVERLAY_DURATION.allFailed);
        });

        newSocket.on('game:question', async (data) => {
            const questionText = data.question;
            setIsTransitioningQuestion(true);
            setLifelineOverlay(null);
            setQuestionReadyForCountdown(false);
            clearCountdownInterval();
            setCountdown(null);
            setAnswerOverlay(null);
            if (answerOverlayTimerRef.current) {
                clearTimeout(answerOverlayTimerRef.current);
                answerOverlayTimerRef.current = null;
            }

            // 取消之前的動畫
            if (animationAbortRef.current) {
                animationAbortRef.current.abort();
            }
            const abortController = new AbortController();
            animationAbortRef.current = abortController;

            setGameState({
                currentQuestion: {
                    question: data.question,
                    options: data.options,
                    book: data.book,
                    chapter: data.chapter
                },
                questionIndex: data.index,
                totalQuestions: data.total,
                currentBuzzer: null,
                timeLeft: 0,
                showAnswer: false,
                isCorrect: null,
                correctAnswer: null,
                correctIndex: null,
                buzzEnabled: false // 先禁用
            });
            setCanGoNext(false); // 重置下一題狀態
            playSound('newQuestion');

            // 重置動畫狀態
            setDisplayedQuestion('');
            setRevealedOptionCount(0);
            setCountdown(null);

            // 確保新題與動畫初始狀態至少完成一次繪製，再解除切題遮罩。
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setIsTransitioningQuestion(false));
            });

            const sleep = (ms) => new Promise((resolve, reject) => {
                const timeoutId = setTimeout(resolve, ms);
                abortController.signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('aborted'));
                });
            });

            try {
                // 1. 打字機效果：逐字顯示題目 (含標點暫停)
                for (let i = 0; i < questionText.length; i++) {
                    if (abortController.signal.aborted) return;
                    setDisplayedQuestion(questionText.substring(0, i + 1));
                    const char = questionText[i];
                    // 標點符號暫停較久 (、 。 ， ？)
                    const isPunctuation = /[、。,，？?]/g.test(char);
                    await sleep(isPunctuation ? 300 : 40);
                }

                // 2. 選項逐一顯示 (每秒一個)
                for (let i = 1; i <= 4; i++) {
                    if (abortController.signal.aborted) return;
                    setRevealedOptionCount(i);
                    await sleep(1000);
                }

                if (abortController.signal.aborted) return;
                setQuestionReadyForCountdown(true);
            } catch (e) {
                // 動畫被取消，忽略錯誤
                if (e.message !== 'aborted') {
                    console.error('Animation error:', e);
                }
            }
        });

        newSocket.on('game:countdownStarted', (data) => {
            setQuestionReadyForCountdown(false);
            setGameState(prev => ({
                ...prev,
                buzzEnabled: false
            }));
            runHostCountdown(data.buzzEnabledAt);
        });

        newSocket.on('game:buzzEnabled', () => {
            clearCountdownInterval();
            setCountdown(null);
            setGameState(prev => ({
                ...prev,
                buzzEnabled: true
            }));
        });

        newSocket.on('game:lifelineStarted', (data) => {
            setLifelineOverlay({
                requestId: data.requestId,
                playerId: data.playerId,
                player: data.playerName,
                type: data.type,
                expert: data.expert,
                completed: false
            });
        });

        newSocket.on('game:lifelineUsed', (data) => {
            setLifelineOverlay(prev => {
                if (!prev || (prev.requestId && prev.requestId !== data.requestId)) return prev;
                return {
                    ...prev,
                    expert: data.result?.expert || prev.expert,
                    completed: true
                };
            });
        });

        newSocket.on('game:restarted', (data) => {
            if (answerOverlayTimerRef.current) {
                clearTimeout(answerOverlayTimerRef.current);
                answerOverlayTimerRef.current = null;
            }

            setPlayers(data.room?.players || []);
            if (data.room?.settings?.teams) {
                setSettings(prev => ({
                    ...prev,
                    teams: data.room.settings.teams
                }));
            }
            setGameState({
                currentQuestion: null,
                questionIndex: 0,
                totalQuestions: 0,
                currentBuzzer: null,
                timeLeft: 0,
                showAnswer: false,
                isCorrect: null,
                buzzEnabled: false
            });
            setDisplayedQuestion('');
            setRevealedOptionCount(0);
            setQuestionReadyForCountdown(false);
            clearCountdownInterval();
            setCountdown(null);
            setCanGoNext(false);
            setIsTransitioningQuestion(false);
            setLifelineOverlay(null);
            setAnswerOverlay(null);
            setError('');
            setLoadingQuestions(false);
            setStage('lobby');
        });

        newSocket.on('game:ended', (data) => {
            setIsTransitioningQuestion(false);
            setQuestionReadyForCountdown(false);
            clearCountdownInterval();
            setCountdown(null);
            setLifelineOverlay(null);
            setAnswerOverlay(null);
            setStage('finished');
            setPlayers(data.rankings);
            playSound('gameEnd');
        });

        setSocket(newSocket);

        return () => {
            if (answerOverlayTimerRef.current) {
                clearTimeout(answerOverlayTimerRef.current);
                answerOverlayTimerRef.current = null;
            }
            clearCountdownInterval();
            newSocket.disconnect();
        };
    }, [clearCountdownInterval, playSound, runHostCountdown]);

    // 播放音效
    // 複製房間代碼
    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // 創建房間
    const createRoom = () => {
        if (!socket || !stats.connected) {
            setError('尚未連線到伺服器，請稍候或是重整頁面');
            return;
        }

        socket.emit('room:create', {
            hostName: settings.hostName,
            settings: {
                mode: settings.mode, // Send mode
                teams: settings.teams, // Send team data
                totalQuestions: settings.totalQuestions,
                books: settings.books,
                difficulty: settings.difficulty,
                manualNext: settings.manualNext,
                autoNextDelay: settings.autoNextDelay,
                prizePool: settings.enablePrizePool ? settings.prizePoolAmount : 0
            }
        }, (response) => {
            if (response.success) {
                setRoomCode(response.room.code);
                setStage('lobby');
                // Sync manualNext state from confirmed room settings
                // 同步伺服器生成的隊伍資訊（含隊伍名稱）
                if (response.room.settings.teams) {
                    setSettings(s => ({ ...s, teams: response.room.settings.teams }));
                }
            } else {
                setError(response.error);
            }
        });
    };

    // 載入題目 - 使用統一的 QuizEngine V2 端點
    const loadQuestions = React.useCallback(async (isPreload = false) => {
        if (settings.books.length === 0) return null;
        if (!isPreload) setLoadingQuestions(true);
        setError('');

        // 取得 API URL
        const getApiUrl = () => {
            if (API_BASE) return API_BASE;
            // 生產環境/其他：使用相同 Origin (透過 Nginx/Proxy)
            return window.location.origin;
        };
        const apiUrl = getApiUrl();

        try {
            // 為每本書建立請求（QuizEngine V2 需要 book + chapter 範圍）
            const allQuestions = [];
            const questionsPerBook = Math.ceil(settings.totalQuestions / Math.max(1, settings.books.length));

            for (const book of settings.books) {
                if (allQuestions.length >= settings.totalQuestions) break;

                const params = new URLSearchParams({
                    book: book,
                    startChapter: 1,
                    endChapter: 150, // 涵蓋大部分章節
                    count: questionsPerBook,
                    gameMode: 'multiplayer', // 使用搶答模式專屬配置
                    locale: 'zh-TW',
                    version: 'CUV_TRAD', // 補齊 V2 API 必填參數
                    includeGeo: 'true',
                    includeLex: 'true'
                });

                console.log(`📖 [QuizEngine V2] 載入 ${book} 題目...`);
                const res = await fetch(`${apiUrl}/api/quiz/questions?${params}`);
                const data = await res.json();

                if (data.success && data.questions && data.questions.length > 0) {
                    console.log(`✅ ${book}: 取得 ${data.questions.length} 題`);
                    allQuestions.push(...data.questions);
                } else if (data.error) {
                    console.warn(`⚠️ ${book}: ${data.error}`);
                }
            }

            if (allQuestions.length === 0) {
                throw new Error('無法取得任何題目，請確認經文資料庫已載入');
            }

            // 打亂並截取需要的數量
            const shuffled = allQuestions.sort(() => Math.random() - 0.5);
            const finalQuestions = shuffled.slice(0, settings.totalQuestions);

            console.log(`📚 [QuizEngine V2] 最終選取 ${finalQuestions.length} 題`);
            if (!isPreload) setLoadingQuestions(false);
            return finalQuestions;

        } catch (err) {
            console.error('載入題目失敗:', err);
            if (!isPreload) setError(err.message || '載入題目失敗');
            return null;
        } finally {
            if (!isPreload) setLoadingQuestions(false);
        }
    }, [settings.books, settings.totalQuestions]);

    // 初始化時自動預載題目
    useEffect(() => {
        loadQuestions(true);
    }, [loadQuestions]);

    // 手動下一題
    const handleStartCountdown = () => {
        if (!socket || !questionReadyForCountdown) return;

        setQuestionReadyForCountdown(false);
        socket.emit('game:startCountdown', (response) => {
            if (!response?.success) {
                setQuestionReadyForCountdown(true);
                setError(response?.error || '無法開始倒數');
            }
        });
    };

    const handleNextQuestion = () => {
        if (socket) {
            setIsTransitioningQuestion(true);
            dismissAnswerOverlay();
            setLifelineOverlay(null);
            setCanGoNext(false);
            setDisplayedQuestion('');
            setRevealedOptionCount(0);
            setQuestionReadyForCountdown(false);
            clearCountdownInterval();
            setCountdown(null);
            setGameState(prev => ({
                ...prev,
                currentBuzzer: null,
                showAnswer: false,
                isCorrect: null,
                correctAnswer: null,
                correctIndex: null,
                buzzEnabled: false
            }));

            if (animationAbortRef.current) {
                animationAbortRef.current.abort();
            }

            socket.emit('game:next', (response) => {
                if (!response.success) {
                    setIsTransitioningQuestion(false);
                    setError(response.error || '切換下一題失敗');
                }
            });
        }
    };

    // 開始遊戲；獎金池由伺服器在 game:start 內原子預扣。
    const startGame = async () => {
        if (settings.mode === 'team') {
            const activeTeams = new Set(players.filter(p => p.teamId).map(p => p.teamId)).size;
            if (activeTeams < 2) {
                setError('至少需要 2 支隊伍才能開始遊戲');
                return;
            }
        } else {
            if (players.length < 2) {
                setError('至少需要 2 位玩家才能開始遊戲');
                return;
            }
        }

        // 前端只做即時提示，實際餘額檢查與預扣由伺服器處理。
        if (settings.enablePrizePool && settings.prizePoolAmount > 0) {
            if (coinSystem.coins < settings.prizePoolAmount) {
                setError('您的智匯金幣餘額不足以支付獎金池');
                return;
            }
        }

        setLoadingQuestions(true);

        // 直接發送 game:start，伺服器會使用預生成的題目
        socket.emit('game:start', {}, (response) => {
            setLoadingQuestions(false);
            if (response.success) {
                setStage('playing');
            } else {
                // 如果預生成失敗，回退到前端載入
                if (response.error === 'NO_QUESTIONS') {
                    loadQuestions().then(loadedQuestions => {
                        if (loadedQuestions) {
                            socket.emit('game:start', { questions: loadedQuestions }, (res) => {
                                if (res.success) {
                                    setStage('playing');
                                } else {
                                    setError(res.error);
                                }
                            });
                        }
                    });
                } else {
                    setError(response.error);
                }
            }
        });
    };

    // 分配玩家到隊伍 (Team Mode)
    // 返回模式選擇
    const handleBack = () => {
        // 如果已建立房間，顯示確認對話框
        if (roomCode && stage !== 'setup') {
            setShowLeaveConfirm(true);
        } else {
            confirmLeave();
        }
    };

    const confirmLeave = () => {
        if (socket) socket.disconnect();
        if (onBack) onBack();
    };

    // 保留房號與玩家，重置後回到同一房間等候室
    const restartGame = () => {
        if (!socket) return;

        setLoadingQuestions(true);
        setError('');
        socket.emit('game:restart', (response) => {
            setLoadingQuestions(false);
            if (!response?.success) {
                setError(response?.error || '重新開始失敗');
                return;
            }

            // 主要畫面重置由 game:restarted 廣播統一處理。
            setRoomCode(response.room.code);
        });
    };

    // ========== 渲染 ==========

    if (stage === 'setup') {
        return (
            <div className="min-h-screen max-h-screen overflow-y-auto bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col p-4 md:p-8">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 md:p-10 w-full max-w-7xl border border-white/20 shadow-2xl m-auto">
                    <button onClick={handleBack} className="mb-4 flex items-center gap-3 text-white/70 hover:text-white text-3xl">
                        <ArrowLeft size={36} />
                        返回模式選擇
                    </button>

                    <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-6">
                        {settings.mode === 'team' ? '👥 組隊搶答' : '🎮 個人搶答'}
                        {stats.connected ? (
                            <span className="text-lg bg-green-500/20 text-green-300 px-4 py-2 rounded-full border border-green-500/30">已連線</span>
                        ) : (
                            <span className="text-lg bg-red-500/20 text-red-300 px-4 py-2 rounded-full border border-red-500/30 animate-pulse">連線中...</span>
                        )}
                        <div className="ml-auto flex items-center gap-3 bg-white/5 border border-white/20 px-6 py-3 rounded-2xl">
                            <Coins className="text-yellow-400" size={32} />
                            <span className="text-white/60 text-2xl">我的智匯金幣:</span>
                            <span className="text-white text-3xl font-bold">{coinSystem.coins}</span>
                        </div>
                    </h1>
                    <p className="text-white/70 mb-4 text-xl">設定房間資訊，準備開始精彩的聖經知識競賽</p>

                                        <div className="flex flex-col gap-5 w-full">
                        {/* Row 1: 遊戲模式、房主名稱、題目數量 */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1.5fr_2fr] gap-6">
                            {/* 遊戲模式 */}
                            <div>
                                <label className="block text-white/80 text-xl mb-2 font-bold">🎮 遊戲模式</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setSettings(s => ({
                                            ...s,
                                            mode: 'buzzer',
                                            teamCount: 0,
                                            teamMaxPlayers: 0,
                                            teams: null
                                        }))}
                                        className={`py-3 rounded-2xl font-bold text-xl transition-all ${settings.mode === 'buzzer'
                                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)] border border-pink-400/50 scale-105'
                                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                                            }`}
                                    >
                                        ⚡ 搶答模式
                                    </button>
                                    <button
                                        onClick={() => setSettings(s => ({
                                            ...s,
                                            mode: 'team',
                                            teamCount: 2,
                                            teamMaxPlayers: 5
                                        }))}
                                        className={`py-3 rounded-2xl font-bold text-xl transition-all ${settings.mode === 'team'
                                            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-indigo-400/50 scale-105'
                                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                                            }`}
                                    >
                                        👥 團隊合作
                                    </button>
                                </div>
                            </div>

                            {/* 房主名稱 */}
                            <div>
                                <label className="block text-white/80 text-xl mb-2 font-bold">👤 房主名稱</label>
                                <input
                                    type="text"
                                    value={settings.hostName}
                                    onChange={(e) => setSettings(s => ({ ...s, hostName: e.target.value }))}
                                    className="w-full px-5 py-3 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-4 focus:ring-purple-400 text-xl"
                                    placeholder="輸入顯示名稱"
                                />
                            </div>

                            {/* 題目數量 */}
                            <div>
                                <label className="block text-white/80 text-xl mb-2 font-bold">📄 題目數量</label>
                                <div className="grid grid-cols-4 gap-4">
                                    {[15, 20, 25, 30].map(num => (
                                        <button
                                            key={num}
                                            onClick={() => setSettings(s => ({ ...s, totalQuestions: num }))}
                                            className={`py-3 rounded-2xl font-bold text-2xl transition-all ${settings.totalQuestions === num
                                                ? 'bg-purple-500 text-white shadow-lg scale-105'
                                                : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Row 2: 難度設定、遊戲控制 */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1.5fr_2fr] gap-6">
                            {/* 難度設定 */}
                            <div>
                                <label className="block text-white/80 text-xl mb-2 font-bold">📊 難度設定</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { value: 'mixed', label: '混合' },
                                        { value: 'easy', label: '簡單' },
                                        { value: 'medium', label: '中等' }
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setSettings(s => ({ ...s, difficulty: opt.value }))}
                                            className={`py-3 rounded-2xl font-bold text-xl transition-all ${settings.difficulty === opt.value
                                                ? 'bg-purple-500 text-white shadow-lg scale-105'
                                                : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 遊戲控制 */}
                            <div>
                                <label className="block text-white/80 text-xl mb-2 font-bold">🎮 遊戲控制</label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSettings(s => ({ ...s, manualNext: true }))}
                                        className={`flex-1 py-3 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap ${settings.manualNext
                                            ? 'bg-indigo-500/30 text-indigo-200 ring-2 ring-indigo-400/50'
                                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                                            }`}
                                    >
                                        手動下一題
                                    </button>
                                    <button
                                        onClick={() => setSettings(s => ({ ...s, manualNext: false }))}
                                        className={`flex-1 py-3 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap ${!settings.manualNext
                                            ? 'bg-orange-500 text-white shadow-lg ring-2 ring-orange-300'
                                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                                            }`}
                                    >
                                        {!settings.manualNext && <Check size={20} />} 自動下一題
                                    </button>
                                </div>
                            </div>

                            {/* 自動下一題秒數 */}
                            <div>
                                {!settings.manualNext ? (
                                    <div className="flex flex-col h-full justify-end pb-1 animate-fade-in">
                                        <label className="block text-white/80 text-lg mb-2 font-bold">自動下一題秒數:</label>
                                        <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10">
                                            <input
                                                type="range"
                                                min="10"
                                                max="60"
                                                step="5"
                                                value={settings.autoNextDelay}
                                                onChange={(e) => setSettings(s => ({ ...s, autoNextDelay: parseInt(e.target.value) }))}
                                                className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                            />
                                            <span className="text-white text-2xl font-mono w-16">{settings.autoNextDelay}s</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full"></div>
                                )}
                            </div>
                        </div>

                        {/* Row 3: Team Mode Settings (only show in team mode) */}
                        {settings.mode === 'team' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-blue-500/10 rounded-2xl border border-blue-500/30">
                                <div>
                                    <label className="block text-blue-300 text-xl mb-3 font-bold">👥 隊伍數量</label>
                                    <div className="grid grid-cols-5 gap-3">
                                        {[2, 3, 4, 5, 6].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setSettings(s => ({ ...s, teamCount: num }))}
                                                className={`py-2 rounded-xl font-bold text-2xl transition-all ${settings.teamCount === num
                                                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                                                    : 'bg-white/10 text-blue-200/70 hover:bg-white/20'
                                                    }`}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-blue-300 text-xl mb-3 font-bold">👤 每隊上限人數</label>
                                    <div className="grid grid-cols-5 gap-3">
                                        {[2, 3, 4, 5, 6].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setSettings(s => ({ ...s, teamMaxPlayers: num }))}
                                                className={`py-2 rounded-xl font-bold text-2xl transition-all ${settings.teamMaxPlayers === num
                                                    ? 'bg-purple-500 text-white shadow-lg scale-105'
                                                    : 'bg-white/10 text-blue-200/70 hover:bg-white/20'
                                                    }`}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Row 4: Prize Pool Settings */}
                        <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-2xl border border-yellow-500/30">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-yellow-500/20 rounded-xl">
                                        <Trophy size={24} className="text-yellow-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-yellow-300">獎金池設定 (挑戰模式)</h3>
                                        <p className="text-yellow-200/70 text-sm">開啟後，您可以投入智匯金幣作為本場優勝者的獎項</p>
                                    </div>
                                </div>
                                {/* Toggle Switch */}
                                <button
                                    onClick={() => setSettings(s => {
                                        const availableAmts = [20, 50, 100, 200, 500].filter(a => coinSystem.coins >= a);
                                        const defaultAmt = availableAmts.length > 0 ? availableAmts[0] : 0;
                                        return { ...s, enablePrizePool: !s.enablePrizePool, prizePoolAmount: !s.enablePrizePool ? defaultAmt : 0 };
                                    })}
                                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${settings.enablePrizePool ? 'bg-yellow-500' : 'bg-gray-600'}`}
                                >
                                    <span
                                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.enablePrizePool ? 'translate-x-7' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>

                            {settings.enablePrizePool && (
                                <div className="flex flex-col md:flex-row items-center gap-6 mt-3 p-3 bg-black/20 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <label className="text-yellow-200 font-bold whitespace-nowrap text-base">投入獎金金額</label>
                                        <div className="flex items-center gap-2 bg-yellow-900/50 px-3 py-1.5 rounded-xl border border-yellow-500/30">
                                            <Coins size={20} className="text-yellow-400" />
                                            <span className="text-yellow-400 font-bold text-xl">{settings.prizePoolAmount}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[20, 50, 100, 200, 500].map(amt => {
                                            const isInsufficient = coinSystem.coins < amt;
                                            return (
                                            <button
                                                key={amt}
                                                disabled={isInsufficient}
                                                onClick={() => setSettings(s => ({ ...s, prizePoolAmount: amt }))}
                                                className={`px-3 py-1.5 rounded-xl font-bold text-base transition-all ${
                                                    isInsufficient
                                                        ? 'bg-gray-500/30 text-gray-500 cursor-not-allowed opacity-50'
                                                        : settings.prizePoolAmount === amt
                                                            ? 'bg-yellow-500 text-white shadow-lg'
                                                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                }`}
                                            >
                                                {amt} 金幣
                                            </button>
                                        )})}
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-xl">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={createRoom}
                            disabled={!stats.connected}
                            className={`w-full py-5 text-white font-bold text-4xl rounded-2xl transition-all shadow-lg ${stats.connected
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                                : 'bg-white/10 text-white/30 cursor-not-allowed'
                                }`}
                        >
                            {stats.connected ? '建立房間' : '連線中...'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 等候室
    if (stage === 'lobby') {
        // 組隊模式：依隊伍分組玩家
        // Debug: Log players state
        console.log('🎮 [Lobby] Current players:', players.length, players.map(p => ({ name: p.name, teamId: p.teamId, type: typeof p.teamId })));

        const getTeamPlayers = (teamId) => players.filter(p => String(p.teamId) === String(teamId));
        const getUnassignedPlayers = () => players.filter(p => !p.teamId);

        // 取得隊伍顏色
        // 使用顏色作為 teamId（與伺服器同步）
        const teamColors = {
            'red': { bg: 'red', border: 'border-red-500', bgLight: 'bg-red-500/20', text: 'text-red-300' },
            'blue': { bg: 'blue', border: 'border-blue-500', bgLight: 'bg-blue-500/20', text: 'text-blue-300' },
            'green': { bg: 'green', border: 'border-green-500', bgLight: 'bg-green-500/20', text: 'text-green-300' },
            'yellow': { bg: 'yellow', border: 'border-yellow-500', bgLight: 'bg-yellow-500/20', text: 'text-yellow-300' },
            'purple': { bg: 'purple', border: 'border-purple-500', bgLight: 'bg-purple-500/20', text: 'text-purple-300' },
            'orange': { bg: 'orange', border: 'border-orange-500', bgLight: 'bg-orange-500/20', text: 'text-orange-300' }
        };

        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center p-8">
                {/* 房間代碼 */}
                <div className="text-center mb-8">
                    <p className="text-white/70 text-2xl mb-4">
                        {settings.mode === 'team' ? '👥 組隊模式－掃描加入並選擇隊伍' : '使用手機相機掃描，或輸入房間代碼加入'}
                    </p>
                    <div className="flex flex-col lg:flex-row items-center justify-center gap-6">
                        <div className="rounded-3xl bg-white p-4 shadow-2xl">
                            {joinQrCode ? (
                                <img
                                    src={joinQrCode}
                                    alt={`加入房間 ${roomCode} 的 QR Code`}
                                    className="h-52 w-52 xl:h-60 xl:w-60"
                                />
                            ) : (
                                <div className="flex h-52 w-52 xl:h-60 xl:w-60 items-center justify-center text-slate-500">
                                    {joinQrError || 'QR Code 產生中…'}
                                </div>
                            )}
                            <p className="mt-2 text-sm font-bold text-slate-700">掃描後確認暱稱即可加入</p>
                        </div>
                        <div
                            onClick={copyRoomCode}
                            className="inline-flex items-center gap-8 px-12 py-6 bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 cursor-pointer hover:bg-white/20 transition-all shadow-2xl hover:scale-105 transform duration-300"
                            role="button"
                            tabIndex={0}
                            aria-label={`複製房間代碼 ${roomCode}`}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') copyRoomCode();
                            }}
                        >
                            <span className="text-7xl xl:text-8xl font-mono font-bold text-white tracking-widest drop-shadow-lg">
                                {roomCode}
                            </span>
                            {copied ? (
                                <Check size={40} className="text-green-400" />
                            ) : (
                                <Copy size={40} className="text-white/50" />
                            )}
                        </div>
                    </div>
                </div>

                {/* 組隊模式：顯示團隊格子 */}
                {settings.mode === 'team' ? (
                    <div className="w-full max-w-6xl">
                        <div className={`grid gap-4 ${settings.teamCount <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-3'}`}>
                            {/* 使用伺服器返回的隊伍資訊，顯示正確的隊伍名稱 */}
                            {settings.teams ? Object.entries(settings.teams).map(([teamId, team]) => {
                                const teamPlayers = getTeamPlayers(teamId);
                                const colors = teamColors[teamId] || teamColors['red'];
                                const captain = teamPlayers.find(p => p.isCaptain);

                                return (
                                    <div
                                        key={teamId}
                                        className={`${colors.bgLight} ${colors.border} border-2 rounded-2xl p-6`}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className={`text-2xl font-bold ${colors.text}`}>
                                                {team.name || `隊伍 ${teamId}`}
                                            </h3>
                                            <span className="text-white/60 text-lg">
                                                {teamPlayers.length}/{settings.teamMaxPlayers}
                                            </span>
                                        </div>

                                        {/* 隊長狀態 */}
                                        <div className="mb-4 text-lg">
                                            {captain ? (
                                                <span className="text-yellow-400">👑 隊長: {captain.name}</span>
                                            ) : (
                                                <span className="text-white/40">❓ 尚未選出隊長</span>
                                            )}
                                        </div>

                                        {/* 隊員列表 */}
                                        <div className="space-y-2 min-h-[100px]">
                                            {teamPlayers.length === 0 ? (
                                                <div className="text-white/30 text-center py-4">等待玩家加入...</div>
                                            ) : (
                                                teamPlayers.map(player => (
                                                    <div key={player.id} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                                                        <span>{player.isCaptain ? '👑' : '👤'}</span>
                                                        <span className="text-white font-medium">{player.name}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : null}
                        </div>

                        {/* 未分配玩家 */}
                        {getUnassignedPlayers().length > 0 && (
                            <div className="mt-6 bg-white/5 rounded-2xl p-4 border border-white/10">
                                <h4 className="text-white/60 mb-3">尚未選擇隊伍的玩家:</h4>
                                <div className="flex flex-wrap gap-2">
                                    {getUnassignedPlayers().map(player => (
                                        <span key={player.id} className="bg-white/10 rounded-full px-4 py-2 text-white">
                                            {player.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* 個人模式：原有玩家列表 */
                    <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-2xl border border-white/20">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-3xl font-bold text-white flex items-center gap-4">
                                <Users size={36} />
                                參加者 ({players.length}/8)
                            </h2>
                            {/* Volume Control Removed */}
                        </div>

                        {players.length === 0 ? (
                            <div className="text-center py-12 text-white/50">
                                <Loader2 size={40} className="animate-spin mx-auto mb-4" />
                                等待玩家加入...
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {players.map((player) => (
                                    <div
                                        key={player.id}
                                        className="bg-white/10 rounded-xl p-4 text-center"
                                    >
                                        <div className="text-3xl mb-2">👤</div>
                                        <p className="text-white font-bold">{player.name}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 控制按鈕 */}
                <div className="mt-8 flex gap-4 w-full max-w-2xl">
                    <button
                        onClick={handleBack}
                        className="flex-1 py-4 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all text-xl"
                    >
                        離開房間
                    </button>
                    <button
                        onClick={startGame}
                        disabled={(settings.mode === 'team' ? new Set(players.filter(p => p.teamId).map(p => p.teamId)).size < 2 : players.length < 2) || loadingQuestions}
                        className={`flex-1 py-4 font-bold text-xl rounded-xl flex items-center justify-center gap-2 transition-all ${(settings.mode === 'team' ? new Set(players.filter(p => p.teamId).map(p => p.teamId)).size >= 2 : players.length >= 2)
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                            : 'bg-white/10 text-white/30 cursor-not-allowed'
                            }`}
                    >
                        {loadingQuestions ? (
                            <><Loader2 size={20} className="animate-spin" /> 載入中...</>
                        ) : (
                            <><Play size={20} /> 開始遊戲</>
                        )}
                    </button>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm max-w-2xl w-full">
                        {error}
                    </div>
                )}

                {/* 離開確認對話框 */}
                {showLeaveConfirm && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
                        <div className="bg-slate-800 border border-white/20 rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
                            <div className="text-6xl mb-6">⚠️</div>
                            <h2 className="text-2xl font-bold text-white mb-4">確定要離開嗎？</h2>
                            <p className="text-white/70 mb-8">離開將關閉房間，所有玩家將被踢出。</p>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowLeaveConfirm(false)}
                                    className="flex-1 py-4 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={confirmLeave}
                                    className="flex-1 py-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600"
                                >
                                    確定離開
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 遊戲進行中
    if (stage === 'playing') {
        const { currentQuestion, questionIndex, totalQuestions, currentBuzzer, showAnswer, isCorrect, removedOptions } = gameState;
        const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col relative">
                <style>{sparkleStyle}</style>

                {isTransitioningQuestion && (
                    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950">
                        <div className="flex flex-col items-center gap-6 text-white/70">
                            <Loader2 size={72} className="animate-spin text-purple-300" />
                            <p className="text-3xl font-bold tracking-widest">正在準備下一題...</p>
                        </div>
                    </div>
                )}

                {/* 玩家求助 Overlay：從點選求助開始，持續到該玩家完成答題 */}
                {lifelineOverlay && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                        <div className="bg-slate-800 border border-white/20 rounded-3xl p-8 max-w-2xl w-full mx-4 relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>

                            <div className="flex flex-col items-center text-center relative z-10">
                                <div className="text-white/60 mb-2 font-bold tracking-wider uppercase">求助連線</div>
                                <h2 className="text-3xl font-bold text-white mb-8">
                                    <span className="text-yellow-400">{lifelineOverlay.player}</span> 正在使用求助功能！
                                </h2>

                                <div className="text-white/50 text-xl mb-4">
                                    {lifelineOverlay.type === 'expertCall'
                                        ? `${lifelineOverlay.completed ? '已取得' : '正在等待'} ${lifelineOverlay.expert?.name || '專家'} 的建議`
                                        : `${LIFELINE_LABELS[lifelineOverlay.type] || '求助'}${lifelineOverlay.completed ? '已完成，玩家正在作答...' : '處理中...'}`}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 答題結果 Overlay - 大螢幕顯眼提示 */}
                {answerOverlay && (
                    <div
                        onClick={dismissAnswerOverlay}
                        className={`absolute inset-0 z-40 flex cursor-pointer items-center justify-center p-8 animate-fade-in backdrop-blur-md ${
                        answerOverlay.isCorrect
                            ? 'bg-gradient-to-br from-emerald-950/95 via-green-900/95 to-slate-950/95'
                            : 'bg-gradient-to-br from-red-950/95 via-rose-900/95 to-slate-950/95'
                        }`}
                    >
                        <div className={`relative w-full max-w-4xl overflow-hidden rounded-[2.5rem] border px-12 py-10 text-center shadow-2xl ${
                            answerOverlay.isCorrect
                                ? 'border-emerald-300/30 bg-emerald-950/55 shadow-emerald-950/70'
                                : 'border-rose-300/30 bg-rose-950/55 shadow-rose-950/70'
                        }`}>
                            <div className={`absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl ${
                                answerOverlay.isCorrect ? 'bg-emerald-400/20' : 'bg-rose-400/20'
                            }`}></div>
                            <div className={`absolute -bottom-32 -right-20 h-80 w-80 rounded-full blur-3xl ${
                                answerOverlay.isCorrect ? 'bg-yellow-300/10' : 'bg-orange-300/10'
                            }`}></div>

                            <div className="relative z-10 flex flex-col items-center">
                                <div className={`mb-5 flex h-32 w-32 items-center justify-center rounded-full border-4 shadow-2xl ${
                                    answerOverlay.isCorrect
                                        ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-300 to-green-500 text-emerald-950 shadow-emerald-400/30'
                                        : 'border-rose-200/80 bg-gradient-to-br from-rose-300 to-red-500 text-rose-950 shadow-rose-400/30'
                                }`}>
                                    {answerOverlay.isCorrect
                                        ? <Check size={82} strokeWidth={3.5} />
                                        : <X size={82} strokeWidth={3.5} />}
                                </div>

                                <h2 className="mb-4 text-7xl font-black tracking-wide text-white drop-shadow-lg">
                                    {answerOverlay.isCorrect ? '答對了！' : '答錯了'}
                                </h2>

                                <div className="mb-7 flex flex-wrap items-center justify-center gap-4">
                                    <span className="text-4xl font-bold text-white/90">
                                        {answerOverlay.playerName}
                                    </span>
                                    {answerOverlay.isCorrect && answerOverlay.scoreAdded > 0 && (
                                        <span className="rounded-full border border-yellow-300/40 bg-yellow-400/15 px-6 py-2 text-3xl font-black text-yellow-300">
                                            本題 +{answerOverlay.scoreAdded} 分
                                        </span>
                                    )}
                                </div>

                                {answerOverlay.correctAnswer && (
                                    <div className="w-full max-w-3xl rounded-3xl border border-white/15 bg-black/25 px-8 py-5 shadow-inner">
                                        <p className="mb-2 text-xl font-bold tracking-[0.3em] text-white/55">正確答案</p>
                                        <p className="text-5xl font-black leading-tight text-yellow-300">
                                            {answerOverlay.correctAnswer}
                                        </p>
                                    </div>
                                )}

                                {answerOverlay.isCorrect && answerOverlay.totalScore !== undefined && (
                                    <div className="mt-6 flex items-baseline gap-4 text-white/65">
                                        <span className="text-2xl font-bold">目前總分</span>
                                        <span className="font-mono text-5xl font-black text-white">
                                            {answerOverlay.totalScore || 0}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="absolute bottom-6 text-lg font-bold tracking-widest text-white/45">
                            點擊畫面可跳過
                        </div>
                    </div>
                )}

                {/* 倒數 Overlay - 3, 2, 1, GO! */}
                {countdown !== null && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
                        <div className={`text-[300px] font-bold ${countdown === 'GO!'
                            ? 'text-green-400 animate-bounce'
                            : 'text-yellow-400 animate-pulse'
                            }`}>
                            {countdown}
                        </div>
                    </div>
                )}

                {/* 頂部資訊 */}
                <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-8 py-4">
                    <div />
                    <div className="text-white/70 text-2xl">
                        第 {questionIndex} / {totalQuestions} 題
                    </div>
                    <div className="justify-self-end">
                        {questionReadyForCountdown && (
                            <button
                                onClick={handleStartCountdown}
                                className="flex items-center gap-3 rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-xl font-bold text-white shadow-lg shadow-emerald-950/40 transition-all hover:scale-105 hover:from-emerald-600 hover:to-cyan-600"
                            >
                                <Play size={24} />
                                開始倒數
                            </button>
                        )}
                    </div>
                </div>

                {/* 題目區 */}
                <div className="flex-1 flex flex-col items-center justify-center px-8">
                    {currentQuestion ? (
                        <>
                            {/* 經文出處 */}
                            <p className="text-purple-300 text-2xl md:text-3xl mb-8 font-bold tracking-widest bg-black/20 px-6 py-2 rounded-full backdrop-blur-sm">
                                📖 {currentQuestion.book} {currentQuestion.chapter}章
                            </p>

                            {/* 題目 (打字機效果，響應式字體) */}
                            <h1
                                className="font-bold text-white text-center mb-16 max-w-[90vw] leading-tight drop-shadow-2xl"
                                style={{
                                    textShadow: '0 4px 10px rgba(0,0,0,0.5)',
                                    fontSize: 'clamp(1.5rem, 3vw + 0.5rem, 3.5rem)'
                                }}
                            >
                                {displayedQuestion}
                                <span className="animate-pulse ml-1 opacity-50">|</span>
                            </h1>

                            {/* 選項 */}
                            <div className="grid grid-cols-2 gap-8 w-full max-w-[95vw]">
                                {currentQuestion.options.map((option, idx) => {
                                    const letter = ['A', 'B', 'C', 'D'][idx];
                                    const isRevealed = idx < revealedOptionCount;
                                    const isRemoved = removedOptions?.includes(letter);

                                    return (
                                        <div
                                            key={idx}
                                            className={`p-10 rounded-3xl text-5xl md:text-6xl font-bold transition-all shadow-xl duration-500 ease-out transform ${!isRevealed
                                                ? 'opacity-0 translate-y-4 scale-95 pointer-events-none'
                                                : isRemoved
                                                    ? 'bg-white/5 text-white/20'
                                                    : showAnswer && idx === gameState.correctIndex
                                                        ? 'bg-green-500 text-white ring-8 ring-green-300 scale-105'
                                                        : 'bg-white/10 text-white border-4 border-white/20 hover:bg-white/20'
                                                }`}
                                        >
                                            <span className="text-yellow-400 mr-8 text-6xl drop-shadow-md">{letter}.</span>
                                            {isRemoved ? '---' : option}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 搶答狀態 / 下一題按鈕 */}
                            <div className="mt-16 text-center transform scale-125">
                                {questionReadyForCountdown ? (
                                    <div className="rounded-xl bg-black/20 px-5 py-2 text-2xl text-white/50">
                                        題目已讀取完畢，等待主持人開始倒數
                                    </div>
                                ) : canGoNext ? (
                                    <button
                                        onClick={handleNextQuestion}
                                        className="text-4xl text-white font-bold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 px-12 py-6 rounded-full border-4 border-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.5)] transition-all hover:scale-105"
                                    >
                                        ▶️ 下一題
                                    </button>
                                ) : currentBuzzer ? (
                                    <div className="text-4xl text-yellow-400 font-bold animate-pulse bg-black/40 px-8 py-4 rounded-2xl backdrop-blur-md border border-yellow-500/50">
                                        🔔 {currentBuzzer.name} 正在作答！
                                    </div>
                                ) : showAnswer ? (
                                    <div className={`text-4xl font-bold px-8 py-4 rounded-2xl backdrop-blur-md ${isCorrect ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'}`}>
                                        {isCorrect ? '✅ 答對了！' : '❌ 答錯了'}
                                    </div>
                                ) : gameState.buzzEnabled ? (
                                    <div className="text-4xl text-green-400 font-bold animate-pulse bg-green-900/40 px-12 py-6 rounded-full border-4 border-green-500 shadow-[0_0_30px_rgba(74,222,128,0.5)]">
                                        🟢 請搶答！
                                    </div>
                                ) : (
                                    <div className="text-3xl text-white/50 bg-black/20 px-6 py-3 rounded-xl">
                                        ⏳ 準備中...
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-white/50 text-4xl animate-pulse">載入題目中...</div>
                    )}
                </div>

                {/* 底部計分板 */}
                <div className="p-8 bg-black/40 backdrop-blur-md border-t border-white/10">
                    <div className="flex justify-center gap-8 flex-wrap">
                        {settings.mode === 'team' && settings.teams ? (
                            /* 組隊模式計分板 */
                            Object.entries(settings.teams).map(([teamId, team]) => {
                                const colors = {
                                    'red': 'bg-red-500 shadow-red-500/50',
                                    'blue': 'bg-blue-500 shadow-blue-500/50',
                                    'green': 'bg-green-500 shadow-green-500/50',
                                    'yellow': 'bg-yellow-500 shadow-yellow-500/50',
                                    'purple': 'bg-purple-500 shadow-purple-500/50',
                                    'orange': 'bg-orange-500 shadow-orange-500/50'
                                };
                                const isBuzzing = gameState.currentBuzzer?.teamId === teamId;

                                return (
                                    <div
                                        key={teamId}
                                        className={`px-10 py-5 rounded-3xl flex items-center gap-6 transition-all transform border-2 ${isBuzzing
                                            ? `${colors[teamId]} text-white scale-110 ring-4 ring-white animate-pulse`
                                            : 'bg-white/5 text-white/80 border-white/10'
                                            }`}
                                    >
                                        <div className={`w-6 h-6 rounded-full ${colors[teamId]} ${isBuzzing ? 'ring-2 ring-white' : ''}`}></div>
                                        <span className="font-bold text-3xl">{team.name}</span>
                                        <span className="text-5xl font-mono font-bold text-white tracking-widest leading-none">
                                            {team.score || 0}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            /* 個人模式計分板 */
                            sortedPlayers.map((player, idx) => (
                                <div
                                    key={player.id}
                                    className={`px-8 py-4 rounded-2xl flex items-center gap-4 transition-all transform ${gameState.currentBuzzer?.id === player.id
                                        ? 'bg-yellow-500 text-black scale-110 shadow-[0_0_20px_rgba(234,179,8,0.6)]'
                                        : 'bg-white/10 text-white'
                                        }`}
                                >
                                    {idx === 0 && players.length > 1 && <Trophy size={32} className={gameState.currentBuzzer?.id === player.id ? 'text-black' : 'text-yellow-400'} />}
                                    <span className="font-bold text-2xl">{player.name}</span>
                                    <span className="text-3xl font-mono font-bold">{player.score || 0}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // 遊戲結束
    if (stage === 'finished') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-8">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-2xl border border-white/20 text-center">
                    <Trophy size={80} className="mx-auto text-yellow-400 mb-6" />
                    <h1 className="text-4xl font-bold text-white mb-8">遊戲結束！</h1>

                    {/* 排名 */}
                    <div className="space-y-4 mb-8">
                        {players.map((player, idx) => (
                            <div
                                key={player.playerId || idx}
                                className={`flex items-center justify-between p-4 rounded-xl ${idx === 0 ? 'bg-yellow-500/20 border-2 border-yellow-500' : 'bg-white/10'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className={`text-3xl font-bold ${idx === 0 ? 'text-yellow-400' :
                                        idx === 1 ? 'text-gray-300' :
                                            idx === 2 ? 'text-orange-400' : 'text-white/50'
                                        }`}>
                                        #{player.rank || idx + 1}
                                    </span>
                                    <span className="text-xl text-white font-bold">{player.name}</span>
                                </div>
                                <span className="text-2xl font-mono text-white">{player.score} 分</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={confirmLeave}
                            className="flex-1 py-4 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20"
                        >
                            返回模式選擇
                        </button>
                        <button
                            onClick={restartGame}
                            disabled={loadingQuestions}
                            className="flex-1 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
                        >
                            {loadingQuestions ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
                            {loadingQuestions ? '準備新一局...' : '同房再玩'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
