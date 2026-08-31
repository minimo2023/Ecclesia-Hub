import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Shield, Save, Coins, Timer, Star } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDeviceDetection } from '../../../hooks/useDeviceDetection';

// Modular Components
import ExpeditionEntrance from './lobby/ExpeditionEntrance';
import MobileExpeditionEntrance from './mobile/MobileExpeditionEntrance';
import ExpeditionLobby from './ExpeditionLobby';
import MobileExpeditionLobby from './mobile/MobileExpeditionLobby';
import ExpeditionShop from './ExpeditionShop';
import ExpeditionInventory from './ExpeditionInventory';
import ExpeditionGameView from './ExpeditionGameView';
import LeaderboardScreen from './LeaderboardScreen';
import ExpeditionTacticalPanel from './ExpeditionTacticalPanel';
import TargetSelectorModal from './TargetSelectorModal';
import AuthModal from '../../auth/AuthModal';
import Avatar from '../../../components/common/Avatar';

import useExpeditionGame from '../hooks/useExpeditionGame';
import { useExpeditionAssets } from '../hooks/useExpeditionAssets';
import useExpeditionMusic from '../hooks/useExpeditionMusic';
import { ExpeditionProvider } from '../contexts/ExpeditionContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * [SOVEREIGN] ExpeditionScreen
 * 遠征模式的場景調度器，負責在高層級切換 Entrance, Lobby 與 Battle 視圖。
 */
export default function ExpeditionScreen({ onBack, config }) {
    const { user, isLoggedIn, refreshUser, guestAvatar, getToken, updateActivity } = useAuth();

    // [Keep-Alive] 遠征模式中，每 5 分鐘自動更新活動狀態，防止因為長時間等待或手機休眠導致自動登出
    useEffect(() => {
        if (!isLoggedIn || !updateActivity) return;
        const keepAliveInterval = setInterval(() => {
            updateActivity();
            console.log('💓 [Expedition] Sent keep-alive heartbeat to prevent auto-logout');
        }, 5 * 60 * 1000); // 5 mins
        return () => clearInterval(keepAliveInterval);
    }, [isLoggedIn, updateActivity]);
    const { useMobileInterface } = useDeviceDetection();

    // Config State
    const [localConfig, setLocalConfig] = useState(config || null);
    useEffect(() => {
        if (!config && !localConfig) {
            fetch(`${API_BASE_URL}/api/expedition/config`)
                .then(res => res.json())
                .then(data => { if (data.success) setLocalConfig(data.config); })
                .catch(err => console.error('Failed to load config:', err));
        }
    }, [config]);

    // [SOVEREIGN] Asset Management Hook
    const assets = useExpeditionAssets(user, isLoggedIn, API_BASE_URL, localConfig || config);
    const {
        userCoins, inventory, shopItems,
        refundBackpackToWarehouse
    } = assets;

    // UI State
    const [displayName, setDisplayName] = useState(user?.displayName || localStorage.getItem('guest_name') || '訪客');
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showExitGuard, setShowExitGuard] = useState(false);
    const [showTentConfirm, setShowTentConfirm] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [toast, setToast] = useState(null);

    // User Save State
    const [userSave, setUserSave] = useState(null);
    const [activeTab, setActiveTab] = useState('lobby');

    const {
        socket, team, gameState, phase, currentQuestion,
        timeLeft, countdown, judgement, myAnswer, actions,
        ownerOffline, teammateAnswers, disabledOptions,
        checkpoint, tentPreparing, activeIntents, emergencyNotice,
        messages, lastGiftRecipient, error, itemUseSuccess, setItemUseSuccess,
        stageClearedData, setStageClearedData
    } = useExpeditionGame(user, null, guestAvatar);

    // [SOVEREIGN] 只在「從 playing 摂退到 lobby」時才重新同步庫存（避免初次進入遠征也被觸發）
    const prevGameState = useRef(null);
    useEffect(() => {
        const prev = prevGameState.current;
        prevGameState.current = gameState;
        const isRetreating = (prev === 'playing' || prev === 'gameover') && gameState === 'lobby';
        const isOwnerLeft = ownerOffline && !team;
        if (isRetreating || isOwnerLeft || !team) {
            refundBackpackToWarehouse();
        }
    }, [gameState, ownerOffline, team]);

    // Handle incoming socket errors as toasts
    useEffect(() => {
        if (error) {
            setToast(error);
            const t = setTimeout(() => setToast(null), 3500);
            return () => clearTimeout(t);
        }
    }, [error]);

    // Handle incoming item success as toasts
    useEffect(() => {
        if (itemUseSuccess) {
            setToast(`✨ ${itemUseSuccess}`);
            const t = setTimeout(() => {
                setToast(null);
                setItemUseSuccess(null);
            }, 3500);
            return () => clearTimeout(t);
        }
    }, [itemUseSuccess]);

    // Show toast if shield was consumed
    useEffect(() => {
        if (judgement && judgement.results) {
            const shieldUsers = judgement.results.filter(r => r.shieldUsed);
            if (shieldUsers.length > 0) {
                const names = shieldUsers.map(r => r.displayName === displayName ? '您' : r.displayName).join('、');
                setToast(`🛡️ ${names} 的信德盾牌發揮效用，抵擋了一次傷害！`);
                setTimeout(() => setToast(null), 4000);
            }
        }
    }, [judgement, displayName]);

    // Show toast on stage clear
    useEffect(() => {
        if (stageClearedData) {
            if (stageClearedData.rewardType === 'points') {
                setToast(`+${stageClearedData.reward} 點數`);
            } else {
                setToast(`+${stageClearedData.reward} 金幣`);
            }
            const t = setTimeout(() => {
                setToast(null);
                setStageClearedData(null);
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [stageClearedData, setStageClearedData]);

    const [targetingItem, setTargetingItem] = useState(null);

    // [SOVEREIGN] Auto-fetch user's active team or last save on login
    useEffect(() => {
        if (isLoggedIn && user?.id) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.warn('🕒 [Expedition] Team sync timeout, falling back to entrance.');
                setUserSave({ id: 'fallback', isNew: true }); // Allow entrance to show if stuck
            }, 5000);

            fetch(`${API_BASE_URL}/api/expedition/user-team`, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
                signal: controller.signal
            })
                .then(res => res.json())
                .then(data => {
                    clearTimeout(timeoutId);
                    if (data.success && data.team) {
                        console.log('🏰 [Expedition] Found active/saved team for user:', data.team.id);
                        setUserSave(data.team);
                    } else {
                        setUserSave({ id: 'new', isNew: true }); // No team yet → show entrance
                    }
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    if (err.name !== 'AbortError') {
                        console.error('Failed to fetch user team:', err);
                        setUserSave({ id: 'error', isNew: true });
                    }
                });

            return () => controller.abort();
        } else {
            setUserSave(null);
        }
    }, [isLoggedIn, user?.id, team === null]);

    // Sync displayName
    useEffect(() => {
        if (user?.displayName && user.displayName !== displayName) {
            setDisplayName(user.displayName);
        }
    }, [user?.displayName]);

    const stage = team?.currentStage || 1;
    useExpeditionMusic(gameState, stage);

    const assemblyBg = '/images/集結營地(日).jpg';

    // Actions for Entrance
    const entranceActions = {
        onCreateTeam: (name, id, shouldLoad) => actions.createTeam(name, id, shouldLoad),
        onJoinTeam: (teamId) => {
            const guestName = localStorage.getItem('bible_quiz_guest_name') || `GUEST_${Math.floor(Math.random() * 1000)}`;
            if (!isLoggedIn && !localStorage.getItem('bible_quiz_guest_name')) {
                localStorage.setItem('bible_quiz_guest_name', guestName);
            }
            actions.joinTeam(teamId, user?.displayName || guestName, user?.id || null, inventory, false);
        },
        onResumeTeam: (teamId) => {
            // 修正：joinTeam 的第 5 個參數為 loadSave(boolean)，而非 avatar
            actions.joinTeam(teamId, user?.displayName, user?.id, inventory, true);
        },
        onRenameTeam: actions.renameTeam,
        onLoadSave: actions.loadSave
    };

    const handleUseItem = (itemId) => {
        if (itemId === 'tent') { setShowTentConfirm(true); return; }
        if ((itemId === 'revive' || itemId === 'healthPotion' || itemId === 'shield') && actions.useItem) { setTargetingItem(itemId); return; }
        if (actions.useItem) actions.useItem(itemId, [], { action: 'use' });
    };

    const handleConfirmItemUse = (targetDisplayNames) => {
        if (targetingItem && actions.useItem) {
            actions.useItem(targetingItem, targetDisplayNames);
            setTargetingItem(null);
        }
    };

    // --- Render Logic ---

    if (showLeaderboard) return <LeaderboardScreen onBack={() => setShowLeaderboard(false)} />;

    const gameStates = {
        gameState, phase, currentQuestion, timeLeft, countdown, judgement, myAnswer,
        ownerOffline, teammateAnswers, disabledOptions, checkpoint, tentPreparing,
        activeIntents, emergencyNotice, messages, lastGiftRecipient
    };

    const isPlaying = gameState === 'playing' || gameState === 'gameover';
    const stageBackgrounds = {
        1: '/images/平安平原.jpg',
        2: '/images/曠野行軍.jpg',
        3: '/images/死蔭幽谷.jpg',
        4: '/images/至聖之巔.jpg'
    };
    const journeyBg = stageBackgrounds[stage] || stageBackgrounds[1];
    const bgImage = (team && isPlaying) ? journeyBg : assemblyBg;

    return (
        <ExpeditionProvider
            user={user} isLoggedIn={isLoggedIn} guestAvatar={guestAvatar}
            socket={socket} team={team} actions={actions} gameStates={gameStates}
            assets={assets} displayName={displayName} setDisplayName={setDisplayName}
            handleUseItem={handleUseItem}
        >
            <div className="h-[100dvh] text-white bg-cover bg-center bg-fixed relative overflow-hidden"
                style={{ backgroundImage: `url('${bgImage}')` }}>
                <div className="absolute inset-0 bg-black/60" />

                {/* [SOVEREIGN] Entrance only for guests, Lords auto-jump */}
                {!team ? (
                    <div className="relative z-20 h-full">
                        {isLoggedIn && !userSave ? (
                            /* 已登入：等待 /user-team API 回應 → 顯示載入畫面 */
                            <div className="flex flex-col items-center justify-center h-full gap-4 animate-pulse">
                                <div className="text-4xl font-black text-amber-500 tracking-tighter">領地對接中...</div>
                                <div className="text-sm text-slate-500 uppercase tracking-widest font-bold">正在接入屬地指揮部</div>
                            </div>
                        ) : useMobileInterface ? (
                            <MobileExpeditionEntrance
                                {...entranceActions}
                                onOpenLogin={() => setShowAuthModal(true)}
                                isLoggedIn={isLoggedIn}
                                ownedTeam={userSave}
                                onBack={onBack}
                            />
                        ) : (
                            <ExpeditionEntrance
                                {...entranceActions}
                                onOpenLogin={() => setShowAuthModal(true)}
                                isLoggedIn={isLoggedIn}
                                ownedTeam={userSave}
                                userSave={userSave}
                                onBack={onBack}
                            />
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col relative z-20">
                        {/* [SOVEREIGN] Guest Exit Guard Modal */}
                        {showExitGuard && (
                            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md">
                                <div className="bg-slate-900 border-2 border-red-500/50 rounded-[2.5rem] p-8 max-w-md w-[90%] shadow-2xl text-center">
                                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Save className="w-10 h-10 text-red-500" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">警告：進度即將消滅</h3>
                                    <p className="text-slate-400 mb-8 leading-relaxed">訪客身分的資產無法保存。離開本頁面後將徹底遺失。</p>
                                    <div className="flex flex-col gap-4">
                                        <button onClick={() => { setShowExitGuard(false); setShowAuthModal(true); }} className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-2xl">註冊會員並保存</button>
                                        <button onClick={() => { setShowExitGuard(false); setActiveTab('lobby'); }} className="w-full py-4 bg-slate-800 hover:bg-white/10 text-white font-bold rounded-2xl border border-slate-700">贈送物資給戰友</button>
                                        <button onClick={() => { setShowExitGuard(false); onBack(); }} className="w-full py-3 text-slate-500 hover:text-red-400 text-sm">拋棄資產並仍要離開</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <header className="flex-none flex items-center justify-end px-4 py-3 bg-gradient-to-b from-black/80 to-transparent gap-3">
                            <div className="flex items-center gap-3 shrink-0">
                                {team && (
                                    <>
                                        <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/30 backdrop-blur-md">
                                            <Coins className="w-4 h-4 text-amber-500" />
                                            <span className="text-amber-400 font-black text-sm">
                                                {((team?.members?.find(m => m.displayName === displayName)?.coins) ?? userCoins).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-md">
                                            <Star className="w-4 h-4 text-blue-400" />
                                            <span className="text-blue-300 font-black text-sm">
                                                {((team?.members?.find(m => m.displayName === displayName)?.points) ?? (user?.points || 0)).toLocaleString()}
                                            </span>
                                        </div>
                                    </>
                                )}
                                <button onClick={() => setShowLeaderboard(true)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors border border-amber-500/50 backdrop-blur-md">
                                    <Shield className="w-4 h-4" /> <span className="hidden md:inline">英雄榜</span>
                                </button>
                            </div>
                        </header>

                        <main className="flex-1 flex min-h-0 relative">
                            {isPlaying ? (
                                !useMobileInterface ? (
                                    /* PC Desktop: side-by-side 70/30 */
                                    <div className="flex-1 flex overflow-hidden">
                                        <div className="flex-[0.7] h-full relative overflow-hidden">
                                            <ExpeditionGameView
                                                phase={phase} question={currentQuestion} timeLeft={timeLeft}
                                                countdown={countdown} myAnswer={myAnswer} judgement={judgement}
                                                onSelectAnswer={actions.selectAnswer} team={team} inventory={inventory}
                                                onUseItem={handleUseItem} shopItems={shopItems}
                                                teammateAnswers={teammateAnswers} disabledOptions={disabledOptions}
                                                isMobile={false}
                                            />
                                        </div>
                                        <div className="flex-[0.3] h-full">
                                            <ExpeditionTacticalPanel onUseItem={handleUseItem} />
                                        </div>
                                    </div>
                                ) : (
                                    /* Mobile: stacked vertically */
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        <div className="flex-1 min-h-0 relative overflow-hidden">
                                            <ExpeditionGameView
                                                phase={phase} question={currentQuestion} timeLeft={timeLeft}
                                                countdown={countdown} myAnswer={myAnswer} judgement={judgement}
                                                onSelectAnswer={actions.selectAnswer} team={team} inventory={inventory}
                                                onUseItem={handleUseItem} shopItems={shopItems}
                                                teammateAnswers={teammateAnswers} disabledOptions={disabledOptions}
                                                isMobile={true}
                                            />
                                        </div>
                                        <div className="shrink-0 flex-none border-t border-white/10 bg-black/30 backdrop-blur-sm">
                                            <ExpeditionTacticalPanel onUseItem={handleUseItem} />
                                        </div>
                                    </div>
                                )
                            ) : useMobileInterface ? (
                                <div className="flex-1 flex min-h-0 relative">
                                    <MobileExpeditionLobby />
                                </div>
                            ) : (
                                <div className="flex-1 flex min-h-0 relative">
                                    <div className="flex-1 h-full relative overflow-hidden">
                                        {activeTab === 'lobby' && <ExpeditionLobby />}
                                        {activeTab === 'shop' && <ExpeditionShop />}
                                        {activeTab === 'inventory' && <ExpeditionInventory />}
                                    </div>
                                </div>
                            )}
                        </main>
                    </div>
                )}

                {gameState === 'gameover' && (
                    <div className="absolute inset-0 z-[150] bg-black/95 flex flex-col items-center justify-center text-white p-4 overflow-y-auto">
                        <div className="mb-6 text-center">
                            <h1 className="text-4xl md:text-5xl font-bold text-red-500 mb-2">全軍覆沒</h1>
                        </div>
                        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-600 p-6 mb-6 w-full max-w-md shadow-2xl text-center">
                            <h2 className="text-lg font-bold text-amber-400 mb-4 border-b border-slate-700 pb-2">📊 遠征紀錄</h2>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-slate-700/50 rounded-xl p-3">
                                    <p className="text-4xl font-bold text-amber-400">{team?.currentQuestion || 0}</p>
                                    <p className="text-xs text-slate-400">通過關卡數</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 w-full max-w-md">
                            {checkpoint && (
                                <button onClick={() => actions.reviveFromCheckpoint && actions.reviveFromCheckpoint(checkpoint)} className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold">⛺ 從營地復活</button>
                            )}
                            <div className="flex gap-3">
                                <button onClick={actions.returnToCamp} className="flex-1 py-3 bg-red-600 rounded-xl font-bold">返回營地</button>
                                <button onClick={() => setShowLeaderboard(true)} className="flex-1 py-3 bg-slate-700 rounded-xl font-bold">英雄榜</button>
                            </div>
                        </div>
                    </div>
                )}

                {targetingItem && (
                    <TargetSelectorModal
                        isOpen={!!targetingItem}
                        onClose={() => setTargetingItem(null)}
                        onConfirm={handleConfirmItemUse}
                        members={team?.members || []}
                        itemId={targetingItem}
                        itemCount={
                            (gameState === 'playing' || gameState === 'gameover')
                                ? (team?.members?.find(m => m.displayName === displayName)?.inventory?.[targetingItem] || 0)
                                : (inventory[targetingItem] || 0)
                        }
                        currentUserDisplayName={displayName}
                    />
                )}
                {showTentConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                        <div className="bg-slate-800 border border-amber-500/30 rounded-2xl p-6 max-w-md w-[90%] shadow-2xl">
                            <h3 className="text-xl font-bold text-amber-400 mb-3 flex items-center gap-2">⛺ 搭建帳篷</h3>
                            <p className="text-slate-300 mb-6">使用帳篷可以保存目前的進度。請選擇：</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => { actions.useItem && actions.useItem('tent', [], { action: 'save_and_leave' }); setShowTentConfirm(false); }} className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl">🏕️ 存檔並離開</button>
                                <button onClick={() => { actions.useItem && actions.useItem('tent', [], { action: 'save_only' }); setShowTentConfirm(false); }} className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-xl">💾 存檔繼續</button>
                                <button onClick={() => setShowTentConfirm(false)} className="w-full py-2 text-slate-400 hover:text-white transition-colors text-sm">取消</button>
                            </div>
                        </div>
                    </div>
                )}
                {toast && (
                    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[250] bg-red-600/90 backdrop-blur-md text-white font-bold px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
                        <Shield className="w-5 h-5" />
                        {toast}
                    </div>
                )}
                {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLoginSuccess={() => { setShowAuthModal(false); refreshUser(); }} />}
            </div>
        </ExpeditionProvider>
    );
}
