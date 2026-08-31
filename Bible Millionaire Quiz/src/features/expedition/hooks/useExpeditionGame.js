import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import io from 'socket.io-client';

// Dynamic API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
console.log('🔗 [Expedition] Dynamic API_BASE_URL:', API_BASE_URL);

export default function useExpeditionGame(user, _joinCodeProp, _guestAvatar) {
    const [socket, setSocket] = useState(null);
    const [team, setTeam] = useState(null);
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, gameover
    const [phase, setPhase] = useState('waiting'); // waiting, thinking, answering, judging
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [countdown, setCountdown] = useState(null); // Answer countdown
    const [judgement, setJudgement] = useState(null); // Results
    const [myAnswer, setMyAnswer] = useState(null);
    const [error, setError] = useState(null);
    const [ownerOffline, setOwnerOffline] = useState(null); // Track owner disconnect
    const [emergencyNotice, setEmergencyNotice] = useState(null); // { message, shoesLeft }
    const [messages, setMessages] = useState([]); // [V23] Tactical Comms Messages
    const [lastGiftRecipient, setLastGiftRecipient] = useState(null); // Tracking for modal closure
    const [disabledOptions, setDisabledOptions] = useState([]); // For Scroll effect
    const [achievementUnlock, setAchievementUnlock] = useState(null); // { name, key }
    const [checkpoint, setCheckpoint] = useState(null); // { stage, question } from Tent
    const [teammateAnswers, setTeammateAnswers] = useState({}); // Track teammate selections

    const refreshInventory = useCallback(() => {
        if (!socket || !team) return;
        socket.emit('item:purchased', { teamId: team.id });
    }, [socket, team]);
    const [tentPreparing, setTentPreparing] = useState(null); // { byPlayer, message, countdown }
    const [activeIntents, setActiveIntents] = useState({}); // { [displayName]: itemId }
    const [remindNotice, setRemindNotice] = useState(null); // { targetDisplayName, fromName, timestamp }
    const [itemUseSuccess, setItemUseSuccess] = useState(null);
    const [rewardAnims, setRewardAnims] = useState([]);
    const [stageClearedData, setStageClearedData] = useState(null);

    // Timer Sync Ref
    const syncState = useRef({ endTime: 0, offset: 0 });

    // Initial Socket Connection
    useEffect(() => {
        const newSocket = io(`${API_BASE_URL}/expedition`, {
            transports: ['polling', 'websocket'], // [ROBUST] 允許備援方案
            autoConnect: true,
            reconnectionAttempts: 5,
            timeout: 10000
        });

        newSocket.on('connect', () => {
            console.log('🔌 Expedition Socket Connected:', newSocket.id);
        });

        newSocket.on('error', (err) => {
            console.error('Socket Error:', err);
            let msg = 'Unknown socket error';
            if (typeof err === 'string') msg = err;
            else if (err?.message) msg = err.message;
            else if (typeof err === 'object') msg = JSON.stringify(err);

            // [SOVEREIGN] Graceful Handling: Don't show red error for transient "waiting for leader" sync messages
            const isWaitingMessage = msg.includes('目前不在此領地上') || msg.includes('請等候') || msg.includes('領袖加入');
            if (isWaitingMessage) {
                console.log('ℹ️ [Expedition] Waiting for sync:', msg);
                return;
            }

            setError(msg);
        });

        // [SOVEREIGN] Immediate Listener Registration to prevent Race Conditions
        newSocket.on('room:joined', (data) => {
            console.log('🏕️ [Expedition] Room joined successfully:', data.id);
            setTeam({
                id: data.id,
                name: data.name,
                ownerId: data.ownerId,
                ownerName: data.ownerName,
                members: data.members.map(m => ({ ...m, online: true })),
                currentStage: data.currentStage || 1,
                currentQuestion: data.currentQuestion || 0,
                status: data.status || 'waiting',
                lives: 3
            });
            localStorage.setItem('expedition_team_id', data.id);
            sessionStorage.setItem('expedition_session_active', 'true');

            // [SOVEREIGN] 同步個人資產 (特別是訪客在伺服器端暫存的物資)
            const myMember = data.members.find(m => m.displayName === (user?.displayName || localStorage.getItem('bible_quiz_guest_name')));
            if (myMember && myMember.inventory) {
                window.dispatchEvent(new CustomEvent('expedition:inventory:sync', { detail: { inventory: myMember.inventory } }));
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    // 斷線即強制離隊，清除 session
    useEffect(() => {
        if (!socket) return;
        const handleDisconnect = () => {
            localStorage.removeItem('expedition_team_id');
            sessionStorage.removeItem('expedition_session_active');
            setTeam(null);
            setGameState('lobby');
        };
        socket.on('disconnect', handleDisconnect);
        return () => socket.off('disconnect', handleDisconnect);
    }, [socket]);

    // State Sync: Force Lobby if team status is waiting/saved
    useEffect(() => {
        if (team?.status === 'waiting' || team?.status === 'saved') {
            if (gameState !== 'lobby') {
                console.log('🔄 [State Sync] Forcing Lobby view due to team status:', team.status);
                setGameState('lobby');
                setPhase('waiting');
                setMyAnswer(null);
                setDisabledOptions([]);
            }
        } else if (team?.status === 'playing') {
            if (gameState === 'lobby') {
                console.log('🔄 [State Sync] Forcing Game view due to team status: playing');
                setGameState('playing');
                // If we are late joining, we might need a sync, but 'waiting' is a safe default until next question
                setPhase('waiting');
            }
        }
    }, [team?.status, gameState]);

    // Game Event Listeners
    useEffect(() => {
        if (!socket) return;

        // Team Updates - Only update if we're already in a team
        socket.on('team:updated', (data) => {
            setTeam(prev => {
                // [SOVEREIGN] Robust Sync: reject updates from a different team (e.g. when in multiple rooms)
                const savedId = localStorage.getItem('expedition_team_id');
                if (data.id && prev?.id && data.id !== prev.id) {
                    console.log(`⚠️ [team:updated] Ignoring cross-team update: ${data.id} vs current ${prev.id}`);
                    return prev;
                }
                if (!prev && (!savedId || data.id !== savedId)) {
                    console.log('⚠️ [team:updated] Ignoring update - not in a confirmed team session');
                    return null;
                }

                const onlineMembers = data.members.map(m => ({ ...m, online: true }));
                
                // If prev is null, we are initializing from team:updated (backup for room:joined)
                if (!prev) {
                    return {
                        id: data.id,
                        members: onlineMembers,
                        currentStage: data.currentStage || 1,
                        currentQuestion: data.currentQuestion || 0,
                        ownerId: data.ownerId,
                        status: data.status || 'waiting',
                        lives: 3
                    };
                }

                return {
                    ...prev,
                    members: onlineMembers,
                    currentStage: data.currentStage !== undefined ? data.currentStage : prev.currentStage,
                    currentQuestion: data.currentQuestion !== undefined ? data.currentQuestion : prev.currentQuestion,
                    ownerId: data.ownerId !== undefined ? data.ownerId : prev.ownerId,
                    status: data.status !== undefined ? data.status : prev.status
                };
            });

            // [SOVEREIGN] Professional Sync: Restore active intents for joiners
            if (data.members) {
                setActiveIntents(prev => {
                    const newIntents = { ...prev };
                    data.members.forEach(m => {
                        if (m.intentItemId) newIntents[m.displayName] = m.intentItemId;
                        else delete newIntents[m.displayName];
                    });
                    return newIntents;
                });
            }
        });

        // Game Started
        socket.on('game:started', () => {
            setGameState('playing');
            setPhase('waiting'); // Wait for first question
            setJudgement(null);
            setDisabledOptions([]); // Reset
            // Update team status to prevent State Sync from forcing lobby
            setTeam(prev => prev ? { ...prev, status: 'playing' } : null);
        });

        // Game Resumed (from tent checkpoint)
        socket.on('game:resumed', (data) => {
            console.log('🔄 Game resumed from checkpoint:', data);
            setGameState('playing');
            setPhase('waiting'); // Wait for first question
            setJudgement(null);
            setDisabledOptions([]); // Reset
            // Update team progress and status to prevent State Sync from forcing lobby
            setTeam(prev => prev ? {
                ...prev,
                status: 'playing', // CRITICAL: Prevent State Sync from forcing lobby
                currentStage: data.currentStage,
                currentQuestion: data.currentQuestion
            } : null);
        });

        // New Question
        socket.on('question:new', (data) => {
            setGameState('playing'); // Ensure game state
            setPhase('thinking');
            setCurrentQuestion(data);
            setMyAnswer(null);
            setJudgement(null);
            setTeammateAnswers({});
            // Check for pre-calculated removed indices (from pending scroll)
            setDisabledOptions(data.removedIndices || []);

            // Sync Logic
            if (data.serverTime && data.endTime) {
                const offset = Date.now() - data.serverTime;
                syncState.current = { endTime: data.endTime, offset };
                // Calculate immediate remaining time
                const serverNow = Date.now() - offset;
                const remaining = Math.max(0, Math.ceil((data.endTime - serverNow) / 1000));
                setTimeLeft(remaining);
            } else {
                // Fallback for legacy/local
                setTimeLeft(data.waitTime);
                syncState.current = { endTime: Date.now() + data.waitTime * 1000, offset: 0 };
            }
        });

        // Answer Countdown Start
        socket.on('countdown:start', (data) => {
            setPhase('answering');

            // Sync Logic
            if (data.serverTime && data.endTime) {
                const offset = Date.now() - data.serverTime;
                syncState.current = { endTime: data.endTime, offset };
                const serverNow = Date.now() - offset;
                const remaining = Math.max(0, Math.ceil((data.endTime - serverNow) / 1000));
                setCountdown(remaining);
            } else {
                setCountdown(data.seconds);
                syncState.current = { endTime: Date.now() + data.seconds * 1000, offset: 0 };
            }
        });

        // Listen for item effects (like scroll removing options)
        socket.on('item:effect', (data) => {
            console.log('✨ [Item Effect] Received:', data);
            if (data.type === 'scroll' && data.removedIndices) {
                setDisabledOptions(prev => [...prev, ...data.removedIndices]);
                setEmergencyNotice({ message: `📜 ${data.byPlayer} 使用了卷軸！刪除了 ${data.removedIndices.length} 個錯誤選項`, style: 'info' });
                setTimeout(() => setEmergencyNotice(null), 3000);
            }
        });

        // Teammate Selected Answer
        socket.on('answer:selected', (data) => {
            console.log(`${data.displayName} selected answer`);
            setTeammateAnswers(prev => ({
                ...prev,
                [data.displayName]: data.optionIndex
            }));
        });

        // Judgement
        socket.on('question:judged', (data) => {
            setPhase('judging');
            setJudgement(data);

            // Update team members from judgement data to sync coins/lives immediately
            // Also sync progress if available
            setTeam(prev => prev ? {
                ...prev,
                members: data.members,
                currentStage: data.teamProgress?.currentStage || prev.currentStage,
                currentQuestion: data.teamProgress?.currentQuestion || prev.currentQuestion
            } : null);
        });

        // Stage Cleared
        socket.on('stage:cleared', (data) => {
            console.log('Stage Cleared!', data);
            setStageClearedData(data);
        });

        // Game Over
        socket.on('game:over', (data) => {
            setGameState('gameover');
            if (data.checkpoint) {
                setCheckpoint(data.checkpoint);
            }
        });

        // Sync (Reconnection)
        socket.on('game:sync', (data) => {
            if (data.phase !== 'waiting') {
                setGameState('playing');
                setPhase(data.phase);
                if (data.question) {
                    setCurrentQuestion(data.question);
                }
                // Sync progress on reconnect
                if (data.teamProgress) {
                    setTeam(prev => prev ? {
                        ...prev,
                        currentStage: data.teamProgress.currentStage,
                        currentQuestion: data.teamProgress.currentQuestion
                    } : null);
                }
            }
        });

        // Owner Offline
        socket.on('owner:offline', (data) => {
            setOwnerOffline(data);
        });

        // --- Gift Events ---
        socket.on('gift:transfer_success', (data) => {
            setLastGiftRecipient(data.targetDisplayName);
        });

        socket.on('gift:received', (data) => {
            setMessages(prev => [...prev.slice(-19), {
                from: 'SYSTEM',
                content: `收到來自 ${data.from} 的物資支援！`,
                type: 'system',
                timestamp: Date.now()
            }]);
            refreshInventory();
        });

        // [V23] Tactical Comms Listener
        socket.on('room:message', (data) => {
            setMessages(prev => [...prev.slice(-19), data]);
        });

        // --- Item Use Success Event ---
        socket.on('item:use:success', (data) => {
            console.log('✅ [Item Use Success]:', data);
            setItemUseSuccess(data.message);
        });

        // --- Intent Broadcast ---
        socket.on('item:intent:broadcast', (data) => {
            const { displayName, itemId, targeting } = data;
            setActiveIntents(prev => {
                const newIntents = { ...prev };
                if (targeting) {
                    newIntents[displayName] = itemId;
                } else {
                    delete newIntents[displayName];
                }
                return newIntents;
            });
        });

        socket.on('achievement:unlocked', (data) => {
            console.log('🏆 Achievement Unlocked:', data);
            setAchievementUnlock(data); // { name, key }
        });

        // Revived from Checkpoint
        socket.on('revived:from:checkpoint', (data) => {
            console.log('⛺ Revived from checkpoint:', data);
            setGameState('playing');
            setPhase('waiting');
            setCheckpoint(null); // Clear checkpoint after use
        });

        // Gospel Shoes Recovery
        socket.on('emergency:recovered', (data) => {
            console.log('👟 Gospel Shoes Recovery:', data);
            setEmergencyNotice(data);
            // Clear after 10 seconds
            setTimeout(() => setEmergencyNotice(null), 10000);
        });

        // Tent Preparing (Advance notice before return to lobby)
        socket.on('tent:preparing', (data) => {
            console.log('⛺ Tent preparing:', data);
            setTentPreparing(data);
            // Auto-clear after countdown
            setTimeout(() => setTentPreparing(null), (data.countdown || 3) * 1000);
        });

        // Tent Evacuation - Return to Team Lobby (NOT clear team)
        socket.on('game:returned:to:lobby', (data) => {
            console.log('🏕️ Return to team lobby:', data);
            // Return to lobby view, keep team state
            setGameState('lobby');
            setPhase('waiting');
            setCurrentQuestion(null);
            setJudgement(null);
            setMyAnswer(null);
            setTeammateAnswers({});
            setDisabledOptions([]);
            // Update team progress in local state with 'saved' status
            setTeam(prev => prev ? {
                ...prev,
                status: 'saved', // Mark as saved for resume button
                currentStage: data.currentStage,
                currentQuestion: data.currentQuestion
            } : null);
            // Show notification about save (handled by ExpeditionScreen)
        });

        // Team Remind (Pulse)
        socket.on('team:reminded', (data) => {
            setRemindNotice(data);
            // Toast logic is handled in the component, but we keep the state for the pulse effect
            // Automatically clear after 5 seconds to stop the pulse
            setTimeout(() => setRemindNotice(null), 5000);
        });

        // [SOVEREIGN] Identity Synced Confirmation
        socket.on('identity:synced', (data) => {
            console.log('✅ Identity synced successfully:', data);
        });

        return () => {
            socket.off('team:updated');
            socket.off('game:started');
            socket.off('question:new');
            socket.off('countdown:start');
            socket.off('answer:selected');
            socket.off('question:judged');
            socket.off('game:over');
            socket.off('game:sync');
            socket.off('owner:offline');
            socket.off('gift:sent_success');
            socket.off('gift:received');
            socket.off('item:effect');
            socket.off('stage:cleared');
            socket.off('achievement:unlocked');
            socket.off('revived:from:checkpoint');
            socket.off('game:resumed');
            socket.off('game:returned:to:lobby');
            socket.off('tent:preparing');
            socket.off('item:use:success');
        };
    }, [socket]);

    // Timer Logic (Synced)
    useEffect(() => {
        let interval;
        const tick = () => {
            const now = Date.now();
            // serverNow = clientNow - offset
            const serverNow = now - syncState.current.offset;
            const remaining = Math.max(0, Math.ceil((syncState.current.endTime - serverNow) / 1000));

            if (phase === 'thinking') {
                setTimeLeft(remaining);
            } else if (phase === 'answering') {
                setCountdown(remaining);
            }
        };

        if ((phase === 'thinking' && timeLeft > 0) || (phase === 'answering' && countdown > 0)) {
            interval = setInterval(tick, 200); // Check more frequently for smoothness
        }
        return () => clearInterval(interval);
    }, [phase, timeLeft, countdown]);


    // [SOVEREIGN] Auto-Sync Identity on Login
    const syncIdRef = useRef(null);
    useEffect(() => {
        if (socket && user && team && syncIdRef.current !== user.id) {
            // Check if we are actually a guest in the current team state
            const myMember = team.members?.find(m => m.displayName === user.displayName);
            if (myMember && !myMember.userId) {
                console.log('🔄 [AutoSync] Detected guest session for logged-in user, syncing identity...');
                socket.emit('identity:sync', { 
                    userId: user.id, 
                    displayName: user.displayName,
                    token: localStorage.getItem('authToken')
                });
                syncIdRef.current = user.id;
            }
        }
    }, [user, socket, team]);


    // Actions
    const joinTeam = useCallback((teamId, contextDisplayName, contextUserId, inventory = {}, loadSave = false, reset = false) => {
        if (!socket) return;

        // Clear errors on new attempt
        setError(null);

        socket.emit('join-team', {
            teamId,
            displayName: user?.displayName || contextDisplayName || 'Guest',
            userId: user?.id || contextUserId,
            inventory: inventory, // Align with backend 'inventory' key
            loadSave, // Flag to request loading save data
            reset, // Explicitly reset room state
            avatar: sessionStorage.getItem('guestAvatar') // Add guest avatar preference
        });
    }, [socket, user]);
    
    // Create Team Action
    const createTeam = useCallback(async (contextDisplayName, contextUserId, shouldLoadSave = false) => {
        if (!socket) return;
        
        // [SOVEREIGN] Exclude guests from team creation
        if (!user?.id) {
            setError('訪客無法建立隊伍，請先登錄');
            return;
        }

        setError(null);

        try {
            // [SOVEREIGN] Professional REST -> Socket Pipeline (Now Synchronized with Token Auth)
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/api/expedition/team/create`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    teamName: `${user?.displayName || contextDisplayName || 'Guest'} 的個人營地`,
                    ownerName: user?.displayName || contextDisplayName || 'Guest',
                    ownerId: user?.id || contextUserId || null
                })
            });

            const data = await response.json();
            if (data.success && data.team) {
                // Automatically join the newly created/retrieved team
                joinTeam(data.team.id, contextDisplayName, contextUserId, {}, shouldLoadSave, true);
            } else {
                setError(data.error || '建立隊伍失敗');
            }
        } catch (err) {
            console.error('Create Team Workflow Error:', err);
            setError('建立隊伍時發生連線錯誤');
        }
    }, [socket, user, joinTeam]);

    const renameTeam = useCallback(async (teamId, newName) => {
        if (!socket) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/expedition/team/${teamId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    userId: user?.id,
                    displayName: user?.displayName
                })
            });
            await response.json();
        } catch (err) {
            console.error('Rename Team Error:', err);
        }
    }, [socket, user]);

    const startGame = useCallback((options = {}) => {
        if (!socket) return;
        socket.emit('game:start', options);
    }, [socket]);

    const selectAnswer = useCallback((optionIndex) => {
        if (!socket) return;
        socket.emit('select-answer', { optionIndex });
        setMyAnswer(optionIndex);
    }, [socket]);

    const useItem = useCallback((itemId, targetNames = [], options = {}) => {
        if (!socket) return;
        socket.emit('use-item', { itemId, targetNames, ...options });
    }, [socket]);

    const toggleReady = useCallback((teamId, backpack = {}) => {
        if (!socket) return;
        socket.emit('toggle-ready', { teamId, backpack });
    }, [socket]);

    const remindMember = useCallback((targetDisplayName) => {
        if (!socket) return;
        socket.emit('team:remind', { targetDisplayName });
    }, [socket]);


    const disbandTeamAction = useCallback((teamId) => {
        if (!socket || !teamId) return;
        socket.emit('disband-team', { teamId });
        localStorage.removeItem('expedition_team_id');
        sessionStorage.removeItem('expedition_session_active');
        setTeam(null);
        setGameState('lobby');
    }, [socket]);

    const leaveTeamAction = useCallback((teamId) => {
        if (!socket) return;
        if (teamId) {
            socket.emit('leave-team', { teamId });
        }
        localStorage.removeItem('expedition_team_id');
        sessionStorage.removeItem('expedition_session_active');
        setTeam(null);
        setGameState('lobby');
    }, [socket]);

    // team:disbanded — 隊員端收到解散通知
    useEffect(() => {
        if (!socket) return;
        const handleDisbanded = () => {
            localStorage.removeItem('expedition_team_id');
            sessionStorage.removeItem('expedition_session_active');
            setTeam(null);
            setGameState('lobby');
        };
        socket.on('team:disbanded', handleDisbanded);
        return () => socket.off('team:disbanded', handleDisbanded);
    }, [socket]);

    // Game Reset Listener
    useEffect(() => {
        if (!socket) return;

        const handleReset = () => {
            setGameState('lobby');
            setPhase('waiting');
            setCurrentQuestion(null);
        };

        socket.on('game:reset', handleReset);
        return () => socket.off('game:reset', handleReset);
    }, [socket]);

    const returnToCamp = useCallback(() => {
        if (!socket || !team) return;
        socket.emit('return-to-camp', { teamId: team.id });
        // Optimistic update - reset both state and phase
        setGameState('lobby');
        setPhase('waiting');
    }, [socket, team]);

    const sendMessage = useCallback((message, targetUserId = null) => {
        if (!socket || !team || !message.trim()) return;
        socket.emit('room:message', { teamId: team.id, message, targetUserId });
    }, [socket, team]);

    const sendGift = useCallback((targetDisplayName, items) => {
        if (!socket || !team || !items?.length) return;
        socket.emit('item:gift', { teamId: team.id, targetDisplayName, items });
    }, [socket, team]);

    const joinSquad = useCallback(() => {
        if (!socket || !team) return;
        socket.emit('squad:join');
    }, [socket, team]);

    const broadcastItemIntent = useCallback((itemId, targeting) => {
        if (!socket || !team) return;
        socket.emit('item:intent', { itemId, targeting });
    }, [socket, team]);

    const reviveFromCheckpoint = useCallback((checkpointData) => {
        if (!socket || !team) return;
        socket.emit('revive-from-checkpoint', { teamId: team.id, checkpoint: checkpointData });
        // Reset checkpoint state after use
        setCheckpoint(null);
    }, [socket, team]);

    // Resume game from save (manual load system)
    const resumeGame = useCallback((loadedSave = null) => {
        if (!socket || !team) return;
        const saveData = loadedSave || {};
        console.log('🔄 Emitting game:resume for team:', team.id, 'with save:', saveData);
        socket.emit('game:resume', { stage: saveData.stage, question: saveData.question });
    }, [socket, team]);

    // Memoize actions object to prevent unnecessary effect re-runs
    const actions = useMemo(() => ({
        createTeam,
        joinTeam,
        renameTeam,
        leaveTeam: leaveTeamAction,
        disbandTeam: disbandTeamAction,
        startGame,
        resumeGame,
        selectAnswer,
        useItem,
        broadcastItemIntent,
        refreshInventory,
        reviveFromCheckpoint,
        returnToCamp,
        toggleReady,
        remindMember,
        sendMessage,
        sendGift,
        joinSquad,
        syncIdentity: (u) => {
            if (socket && u) {
                socket.emit('identity:sync', { userId: u.id, displayName: u.displayName, token: localStorage.getItem('authToken') });
            }
        },
        setItemUseSuccess
    }), [createTeam, joinTeam, renameTeam, leaveTeamAction, disbandTeamAction, startGame, resumeGame, selectAnswer, useItem, broadcastItemIntent, refreshInventory, reviveFromCheckpoint, returnToCamp, toggleReady, remindMember, sendMessage, sendGift, joinSquad, socket]);

    return {
        socket,
        team,
        setTeam, // Allow external API to set initial team
        gameState,
        phase,
        currentQuestion,
        timeLeft,
        countdown,
        judgement,
        myAnswer,
        error,
        ownerOffline, // Owner went offline notification
        setOwnerOffline, // Allow clearing the state
        actions,
        teammateAnswers,
        disabledOptions,
        achievementUnlock,
        setAchievementUnlock,
        checkpoint, 
        tentPreparing, 
        activeIntents,
        remindNotice,
        emergencyNotice,
        messages,
        lastGiftRecipient,
        setLastGiftRecipient,
        itemUseSuccess,
        setItemUseSuccess,
        rewardAnims,
        setRewardAnims,
        stageClearedData,
        setStageClearedData
    };
}
