import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { ToastProvider } from './shared/components/Toast';
import { useDeviceDetection } from './hooks/useDeviceDetection';
import { soundManager } from './utils/SoundManager';
import { leaderboardService } from './features/game/services/LeaderboardService';
import MultiplayerModeModal from './features/GameOnline/MultiplayerModeModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useCoinSystem, CoinSystemProvider } from './hooks/useCoinSystem';
import GuestDataMergeDialog from './shared/components/GuestDataMergeDialog';
import PasswordMaturityModal from './components/profile/PasswordMaturityModal';
import OrientationGuard from './shared/components/OrientationGuard';
import AchievementToast from './shared/components/AchievementToast';
import { useGuestGameExitGuard } from './features/game/components/shared/useGuestGameExitGuard';
import {
    getMultiplayerRoomCodeFromLocation,
    isMultiplayerJoinPath
} from './features/GameOnline/multiplayerJoinLink';

const ModernFeatureMenu = lazy(() => import('./features/navigation/ModernFeatureMenu'));
const MemberCenter = lazy(() => import('./features/member/MemberCenter'));
const ScriptureReader = lazy(() => import('./features/member/ScriptureReader'));
const WrongAnswersReview = lazy(() => import('./features/member/WrongAnswersReview'));
const MemberStats = lazy(() => import('./features/member/MemberStats'));
const MapExplorer = lazy(() => import('./features/member/MapExplorer'));
const DevotionPage = lazy(() => import('./features/devotion/DevotionPage'));

function initialAppView() {
    if (isMultiplayerJoinPath(window.location.pathname)) {
        return 'game-online-player';
    }
    return new URLSearchParams(window.location.search).get('view') === 'verse-explorer'
        ? 'verse-explorer'
        : 'feature-menu';
}
const ReadingPlansIndex = lazy(() => import('./features/reading-plans/ReadingPlansIndex'));
const BibleReader = lazy(() => import('./features/reading-plans/BibleReader'));
const StartScreen = lazy(() => import('./features/game/components/StartScreen'));
const GameModeSelector = lazy(() => import('./features/game/components/GameModeSelector'));
const MobileStartScreen = lazy(() => import('./features/game/components/mobile/MobileStartScreen'));
const GameManager = lazy(() => import('./features/game/components/GameManager'));
const GameOverScreen = lazy(() => import('./features/game/components/GameOverScreen'));
const SpeedResultsScreen = lazy(() => import('./features/game/components/SpeedResultsScreen'));
const AdminLogin = lazy(() => import('./features/admin/AdminLogin'));
const AdminPanel = lazy(() => import('./features/admin/AdminPanel'));
const HostScreen = lazy(() => import('./features/GameOnline').then(module => ({ default: module.HostScreen })));
const PlayerScreen = lazy(() => import('./features/GameOnline').then(module => ({ default: module.PlayerScreen })));
const ExpeditionScreen = lazy(() => import('./features/expedition').then(module => ({ default: module.ExpeditionScreen })));
const ScriptureRainGame = lazy(() => import('./features/scripture-rain/ScriptureRainGame'));
const ScriptureOrderGame = lazy(() => import('./features/scripture-order/ScriptureOrderGame'));
const ScriptureMemoryGuide = lazy(() => import('./features/scripture-memory/ScriptureMemoryGuide'));
const VoiceBlessingSharePage = lazy(() => import('./features/scripture-recording/VoiceBlessingSharePage'));

function AppLoading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950" role="status" aria-live="polite">
            <span className="sr-only">頁面載入中</span>
            <span className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
    );
}

// Inner component that contains the main application logic
function AppContent() {
    const { useMobileInterface } = useDeviceDetection();
    const coinSystem = useCoinSystem(); // Context is now available
    const { isLoggedIn, user, loading } = useAuth(); // Context available
    const { requestGuestGameExit, guestGameExitDialog } = useGuestGameExitGuard();

    // 主導航狀態 - 永遠從首頁開始，history.state 只用於 popstate（上一頁/下一頁）
    const [currentView, setCurrentView] = useState(initialAppView);

    // 遊戲相關狀態
    const [selectedBooks, setSelectedBooks] = useState(() => {
        try {
            const saved = sessionStorage.getItem('bible_app_selected_books');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [gameOptions, setGameOptions] = useState(() => {
        try {
            const saved = sessionStorage.getItem('bible_app_game_options');
            const data = saved ? JSON.parse(saved) : {};
            
            // [Fix] Force 'unv' to 'CUV_TRAD' to prevent legacy cache from breaking the API
            if (data.bibleVersion === 'unv') {
                data.bibleVersion = 'CUV_TRAD';
            }
            
            return {
                bibleVersion: 'CUV_TRAD',
                includeGeography: true,
                includeEncyclopedia: true,
                ...data
            };
        } catch { 
            return {
                bibleVersion: 'CUV_TRAD',
                includeGeography: true,
                includeEncyclopedia: true
            }; 
        }
    });

    const [score, setScore] = useState(0);
    const [wrongAnswers, setWrongAnswers] = useState([]);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [highScores, setHighScores] = useState([]);
    const [readerScheduleId, setReaderScheduleId] = useState(null);
    const [memberCenterTab, setMemberCenterTab] = useState('hub');
    const [gameHubSection, setGameHubSection] = useState('quiz');

    // 連線模式選擇彈窗
    const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);


    // 待結算金幣狀態
    const [pendingSettlementCoins, setPendingSettlementCoins] = useState(0);
    const [pendingSettlementBonus, setPendingSettlementBonus] = useState(0);

    // 遊戲統計追蹤
    const [pendingCorrectAnswers, setPendingCorrectAnswers] = useState(0);
    const [pendingTotalQuestions, setPendingTotalQuestions] = useState(0);

    // Persistence: Sync state to detailed storage
    useEffect(() => {
        sessionStorage.setItem('bible_app_selected_books', JSON.stringify(selectedBooks));
    }, [selectedBooks]);

    useEffect(() => {
        sessionStorage.setItem('bible_app_game_options', JSON.stringify(gameOptions));
    }, [gameOptions]);

    // 載入排行榜
    useEffect(() => {
        // [Fixed] Removed aggressive legacy state clearing that caused data loss on refresh
        // localStorage.removeItem('bible_app_game_options'); 

        const loadScores = async () => {
            const firebaseScores = await leaderboardService.getTopScores(50);
            setHighScores(firebaseScores);
        };
        loadScores();
        soundManager.setupGlobalUnlock();

        // 初始化 history state
        if (!window.history.state?.view) {
            window.history.replaceState({ view: initialAppView() }, '', window.location.href);
        }
    }, []);

    // 瀏覽器上一頁/下一頁支援
    useEffect(() => {
        const handlePopState = (event) => {
            if (event.state?.view) {
                // 不使用 setCurrentView 以避免重複 pushState
                setCurrentView(event.state.view);
            } else {
                setCurrentView('feature-menu');
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // 管理員狀態 (Refined v3.0: Derive from AuthContext)
    const [isAdmin, setIsAdmin] = useState(false);

    // Sync isAdmin state with authenticated user
    useEffect(() => {
        // [V8.3 Auth Guard] Stop all redirects if still loading auth state
        if (loading) return;

        if (user) {
            // [Security Fix] Force redirect to profile if security setup is required
            if (user.must_reset_auth) {
                console.warn('⚠️ [Security] Security setup required for this account.');
                setCurrentView('profile');
            }

            const hasAdminPrivilege = Boolean(
                user.isAdmin || 
                user.role === 'super_admin' || 
                user.role === 'admin' ||
                (Array.isArray(user.adminRoles) && user.adminRoles.length > 0)
            );
            setIsAdmin(hasAdminPrivilege);
            // Auto-navigate to dashboard if URL hash suggests admin intent
            const hash = window.location.hash;
            if (hasAdminPrivilege && !user.must_reset_auth && (hash.includes('/users') || hash.includes('/knowledge') || hash.includes('/content') || hash.includes('/dashboard'))) {
                setCurrentView('admin-panel');
            }
        } else {
            setIsAdmin(false);
            // [V8.3 Auth Guard] Force redirect back to menu if user is not logged in but on a protected view
            const protectedViews = ['admin-panel', 'stats', 'wrong-answers'];
            if (protectedViews.includes(currentView)) {
                console.log('🛡️ [V8.3] Unauthenticated access to', currentView, '. Redirecting...');
                setCurrentView('feature-menu');
            }
        }
    }, [user, loading, currentView]);

    // 防止遊客誤關閉瀏覽器導致智匯金幣丟失
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            // 只有當用戶未登入且有智匯金幣時才警告
            if (!isLoggedIn && coinSystem.sessionCoins > 0) {
                // 觸發瀏覽器原生警告
                e.preventDefault();
                e.returnValue = ''; // Chrome 需要這個屬性
                return ''; // Legacy browsers
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isLoggedIn, coinSystem.sessionCoins]); // 當登入狀態改變時重新綁定

    // 輔助函數：執行智匯金幣結算和遊戲統計更新
    const normalizeAndSettleCoins = async () => {
        // 更新遊戲統計
        if (pendingTotalQuestions > 0) {
            console.log('Updating game stats:', pendingCorrectAnswers, '/', pendingTotalQuestions);
            await coinSystem.updateGameStats(pendingCorrectAnswers, 1); // 1 game played
            setPendingCorrectAnswers(0);
            setPendingTotalQuestions(0);
        }

        // 結算智匯金幣 (確保所有暫存獲利都已送出)
        if (coinSystem.pendingGain > 0) {
            console.log('Settling pending coins from App:', coinSystem.pendingGain);
            await coinSystem.settleSession('app_navigation_settle');
        }

        // [SOVEREIGN v3] 登入後的主權隔離與防禦性清理
        if (isLoggedIn) {
            try {
                // 如果是登入狀態，且沒有待合併的有效資產，則強制清理
                if (coinSystem.sessionCoins <= 0) {
                    // 清理邏輯已由 coinSystem 處理
                }
                localStorage.removeItem('bible_quiz_guest_streak');
            } catch (e) {
                console.warn('🛡️ [Sovereign Clean] 防禦性清理失敗:', e);
            }
        }
    };

    // 導航處理 - 同時推送 history state
    const navigateWithHistory = (view, skipHistory = false) => {
        if (!skipHistory) {
            window.history.pushState({ view }, '', window.location.pathname);
        }
        setCurrentView(view);
    };

    const returnToGameHub = (section = 'quiz') => {
        setGameHubSection(section);
        navigateWithHistory('game-mode-select');
    };

    const handleNavigate = (destination, extraData = {}) => {
        console.log('🧭 handleNavigate called with:', destination, 'current:', currentView, 'extraData:', extraData);
        soundManager.unlockAudio();

        let targetView = destination;
        if (typeof destination === 'string' && destination.includes(':')) {
            const parts = destination.split(':');
            targetView = parts[0];
            setMemberCenterTab(parts[1]);
        } else {
            setMemberCenterTab('hub');
        }

        if (targetView === 'bible-reader' && extraData.scheduleId) {
            setReaderScheduleId(extraData.scheduleId);
        }

        switch (targetView) {
            case 'game':
                returnToGameHub('quiz');
                break;
            case 'member-center':
            case 'profile':
                navigateWithHistory('member-center');
                break;
            case 'reading-plans':
                navigateWithHistory('reading-plans');
                break;
            case 'bible-reader':
                navigateWithHistory('bible-reader');
                break;
            case 'verse-explorer':
            case 'wrong-answers':
            case 'stats':
            case 'map':
            case 'devotion':
            case 'admin':
            case 'admin-panel':
            case 'game-online-host':
            case 'game-online-player':
                navigateWithHistory(targetView);
                break;
            case 'story-adventure':
                // 暫停故事模組入口，避免未完成內容曝光
                navigateWithHistory('feature-menu');
                break;
            default:
                navigateWithHistory('feature-menu');
        }
    };

    // 🛠️ Stable State Handlers for Game Options
    const handleVersionChange = useCallback((v) => {
        setGameOptions(prev => ({ ...prev, bibleVersion: v }));
    }, []);

    const handleToggleGeography = useCallback(() => {
        setGameOptions(prev => ({ ...prev, includeGeography: !prev.includeGeography }));
    }, []);

    const handleToggleEncyclopedia = useCallback(() => {
        setGameOptions(prev => ({ ...prev, includeEncyclopedia: !prev.includeEncyclopedia }));
    }, []);

    const handleBackToFeatureMenu = async () => {
        soundManager.stopAll();
        // 如果有待結算智匯金幣，則先結算 (例如從 Victory 畫面直接退出)
        await normalizeAndSettleCoins();
        navigateWithHistory('feature-menu');
        window.location.hash = '';
    };

    const handleLeaveGameModule = () => requestGuestGameExit(handleBackToFeatureMenu);

    const handleBackToMemberCenter = () => {
        navigateWithHistory('member-center');
    };

    // 遊戲處理函數
    const handleStartGame = async (books, options = {}, replayOptions = {}) => {
        // 先結算上一局 (如果是 Replay)
        await normalizeAndSettleCoins();

        soundManager.unlockAudio();
        // REMOVED: soundManager.stopAll(); - Allow theme music from ModeSelector to continue
        sessionStorage.setItem('bible_millionaire_total_score', '0');

        // 合併選項：保留 gameOptions 中已設定的模式選項（來自 GameModeSelector）
        // 但允許 StartScreen 傳入的 options 補充其他設定
        const mergedOptions = { ...gameOptions, ...options, ...replayOptions };

        // Fix: Ensure a default mode if none exists (e.g. after refresh on book selection)
        if (!mergedOptions.gameMode) {
            mergedOptions.gameMode = 'classic';
            mergedOptions.isCasualMode = false;
        }

        console.log('handleStartGame mergedOptions:', mergedOptions);

        const hasQuestionMusic = mergedOptions.gameMode === 'classic' || mergedOptions.gameMode === 'speed';
        if (hasQuestionMusic) {
            soundManager.playBGM('theme');
        } else {
            soundManager.stopBGM();
        }

        setSelectedBooks(books);
        setGameOptions(mergedOptions);
        setCurrentView('playing');
        setScore(0);
        setWrongAnswers([]);
        setTotalQuestions(mergedOptions.questionCount || 15);
    };

    const handleEndGame = (finalScore, reason, extraData = {}) => {
        console.log('[App] handleEndGame called:', { finalScore, reason, extraData });
        soundManager.stopAll();
        // 如果是經典模式，finalScore 已經是智匯金幣數
        setScore(finalScore);

        // 處理錯題
        if (extraData.wrongAnswers) {
            setWrongAnswers(extraData.wrongAnswers);
        } else if (Array.isArray(arguments[2])) {
            // 兼容舊簽名
            setWrongAnswers(arguments[2]);
        }

        // 檢查是否有待結算智匯金幣
        if (extraData.pendingSettlement) {
            setPendingSettlementCoins(extraData.coinsEarned);
            setPendingSettlementBonus(extraData.bonusCoins);
        } else {
            // 如果不是經典模式，待結算歸零
            setPendingSettlementCoins(0);
            setPendingSettlementBonus(0);
        }

        // 計算答對題數並設為待更新統計
        let correctCount = 0;
        if (extraData.correctCount !== undefined) {
            // Speed Mode provides this directly
            correctCount = extraData.correctCount;
        } else {
            // Classic/Casual mode: 答對數 = 總題數 - 錯題數
            const wrongCount = Array.isArray(extraData.wrongAnswers)
                ? extraData.wrongAnswers.length
                : (Array.isArray(arguments[2]) ? arguments[2].length : 0);
            correctCount = finalScore > 0 ? Math.max(0, totalQuestions - wrongCount) : 0;
        }

        setPendingCorrectAnswers(correctCount);
        setPendingTotalQuestions(1); // 1 game completed

        if (reason === 'victory') {
            setCurrentView('victory');
            soundManager.playWin();
        } else if (reason === 'speed-complete') {
            // Speed Mode completion - show speed results
            setCurrentView('speed-results');
        } else {
            setCurrentView('gameover');
            soundManager.playGameOver();
        }

    };

    const handleSaveScore = async (playerName) => {
        if (!playerName?.trim()) return;

        // 儲存排行榜也視為一種結算/離開動作，先結算智匯金幣
        await normalizeAndSettleCoins();

        await leaderboardService.saveScore({
            name: playerName.trim(),
            score: score,
            isVictory: currentView === 'victory',
            date: new Date().toISOString()
        });

        const updatedScores = await leaderboardService.getTopScores(50);
        setHighScores(updatedScores);
        returnToGameHub('quiz');
    };

    const handleReturnToMenu = async () => {
        soundManager.stopAll();
        // 結算智匯金幣
        await normalizeAndSettleCoins();

        returnToGameHub('quiz');
    };

    // 渲染當前視圖
    const renderView = () => {
        switch (currentView) {
            case 'feature-menu':
                return <ModernFeatureMenu onNavigate={handleNavigate} isMobile={useMobileInterface} />;

            case 'member-center':
            case 'profile':
                return <MemberCenter initialView={memberCenterTab} onNavigate={handleNavigate} onBack={handleBackToFeatureMenu} />;

            case 'devotion':
                return <DevotionPage onBack={handleBackToFeatureMenu} isAdmin={isAdmin} onRequestLogin={() => setCurrentView('member-center')} />;

            case 'reading-plans':
                return <ReadingPlansIndex onNavigate={handleNavigate} onBack={handleBackToFeatureMenu} />;
                
            case 'bible-reader':
                return import.meta.env.VITE_READING_PLAN_SCRIPTURE_INTEGRATION === 'false'
                    ? <BibleReader scheduleId={readerScheduleId} onNavigate={handleNavigate} onBack={() => handleNavigate('reading-plans')} />
                    : <ScriptureReader
                        readingPlanScheduleId={readerScheduleId}
                        onReadingPlanCompleted={() => handleNavigate('reading-plans')}
                        onBack={() => handleNavigate('reading-plans')}
                    />;

            case 'verse-explorer':
                return <ScriptureReader onBack={handleBackToFeatureMenu} />;

            case 'scripture-rain':
                return (
                    <ScriptureRainGame
                        onExit={() => returnToGameHub('memory')}
                        onBack={() => returnToGameHub('memory')}
                        onHome={() => navigateWithHistory('feature-menu')}
                    />
                );

            case 'scripture-order':
                return (
                    <ScriptureOrderGame
                        onExit={() => returnToGameHub('memory')}
                        onBack={() => returnToGameHub('memory')}
                        onHome={() => navigateWithHistory('feature-menu')}
                    />
                );

            case 'scripture-memory-guide':
                return (
                    <ScriptureMemoryGuide
                        onBack={() => returnToGameHub('memory')}
                        onStartOrder={() => {
                            setGameHubSection('memory');
                            soundManager.stopAll();
                            navigateWithHistory('scripture-order');
                        }}
                        onStartRain={() => {
                            setGameHubSection('memory');
                            soundManager.stopAll();
                            navigateWithHistory('scripture-rain');
                        }}
                    />
                );

            case 'wrong-answers':
                return <WrongAnswersReview onBack={handleBackToMemberCenter} />;

            case 'stats':
                return <MemberStats onBack={handleBackToMemberCenter} />;

            case 'map':
                return <MapExplorer onBack={handleBackToMemberCenter} />;

            // 連線搶答模式 - 經卷選擇
            case 'book-select-online':
                return (
                    <StartScreen
                        onStartGame={(books) => {
                            setSelectedBooks(books);
                            navigateWithHistory('game-online-host');
                        }}
                        onAdminLogin={() => { }}
                        highScores={[]}
                        skipIntro={true}
                        onBack={() => returnToGameHub('online')}
                        gameMode="multiplayer-buzzer"
                        customTitle="選擇題目範圍"
                        customSubtitle="房主選擇題目經卷後建立房間"
                        bibleVersion={gameOptions.bibleVersion || 'CUV_TRAD'}
                        includeGeography={gameOptions.includeGeography ?? true}
                        includeEncyclopedia={gameOptions.includeEncyclopedia ?? true}
                        onVersionChange={handleVersionChange}
                        onToggleGeography={handleToggleGeography}
                        onToggleEncyclopedia={handleToggleEncyclopedia}
                    />
                );

            // 連線搶答模式 - 房主
            case 'game-online-host':
                return <HostScreen
                    onBack={() => returnToGameHub('online')}
                    selectedBooks={selectedBooks}
                    mode={gameOptions.multiplayerMode || 'buzzer'}
                />;

            case 'game-online-player':
                return <PlayerScreen
                    onBack={() => returnToGameHub('online')}
                    initialRoomCode={getMultiplayerRoomCodeFromLocation(window.location)}
                />;

            // 管理員視圖
            case 'admin':
                return (
                    <AdminLogin
                        onLoginSuccess={() => {
                            setIsAdmin(true);
                            sessionStorage.setItem('bible_millionaire_is_admin', 'true');
                            setCurrentView('admin-panel');
                        }}
                        onCancel={handleBackToFeatureMenu}
                    />
                );

            case 'admin-panel':
                return (
                    <AdminPanel
                        onLogout={() => {
                            setIsAdmin(false);
                            setCurrentView('feature-menu');
                            window.location.hash = '';
                        }}
                    />
                );

            // 遊戲模式選擇
            case 'game-mode-select':
                return (
                    <GameModeSelector
                        initialSection={gameHubSection}
                        onSelectMode={(mode) => {
                            // 切換模式時清除舊的書卷選擇狀態，避免上一局設定汙染新局
                            try {
                                sessionStorage.removeItem('bible_book_selection_scope');
                                sessionStorage.removeItem('bible_book_selection_books');
                            } catch {}
                            if (mode === 'classic') {
                                setGameHubSection('quiz');
                                setGameOptions(prev => ({ ...prev, gameMode: 'classic', isCasualMode: false, isSpeedMode: false }));
                                navigateWithHistory('book-select');
                            } else if (mode === 'practice') {
                                setGameHubSection('quiz');
                                setGameOptions(prev => ({ ...prev, gameMode: 'casual', isCasualMode: true, isSpeedMode: false }));
                                navigateWithHistory('book-select');
                            } else if (mode === 'speed') {
                                setGameHubSection('quiz');
                                setGameOptions(prev => ({
                                    ...prev,
                                    gameMode: 'speed',
                                    isCasualMode: false,
                                    isSpeedMode: true,
                                    bibleVersion: 'CUV_TRAD',
                                    timeLimit: 7,
                                    questionCount: 15,
                                    coinsPerQuestion: 2,
                                    perfectBonus: 10
                                }));
                                navigateWithHistory('book-select');
                            } else if (mode === 'multiplayer') {
                                setGameHubSection('online');
                                // 手機版直接進入玩家加入房間頁面
                                if (useMobileInterface) {
                                    navigateWithHistory('game-online-player');
                                } else {
                                    // 電腦版進入選書頁面（作為主持人）
                                    setGameOptions(prev => ({ ...prev, gameMode: 'multiplayer' }));
                                    navigateWithHistory('book-select-online');
                                }
                            } else if (mode === 'multiplayer-buzzer') {
                                setGameHubSection('online');
                                if (useMobileInterface) {
                                    navigateWithHistory('game-online-player');
                                } else {
                                    setGameOptions(prev => ({ ...prev, gameMode: 'multiplayer-buzzer' }));
                                    navigateWithHistory('book-select-online');
                                }
                            } else if (mode === 'expedition') {
                                setGameHubSection('quiz');
                                navigateWithHistory('expedition-game');
                            } else if (mode === 'scripture-memory-guide') {
                                setGameHubSection('memory');
                                soundManager.stopAll();
                                navigateWithHistory('scripture-memory-guide');
                            } else if (mode === 'scripture-rain') {
                                setGameHubSection('memory');
                                soundManager.stopAll();
                                navigateWithHistory('scripture-rain');
                            } else if (mode === 'scripture-order') {
                                setGameHubSection('memory');
                                soundManager.stopAll();
                                navigateWithHistory('scripture-order');
                            }
                        }}
                        onBack={handleLeaveGameModule}
                    />
                );

            // 書卷選擇
            case 'book-select': {
                const BookSelectComponent = useMobileInterface ? MobileStartScreen : StartScreen;
                return (
                    <BookSelectComponent
                        onStartGame={handleStartGame}
                        onAdminLogin={() => { }}
                        highScores={highScores}
                        skipIntro={true}
                        onBack={() => returnToGameHub('quiz')}
                        gameMode={gameOptions.gameMode}
                        bibleVersion={gameOptions.bibleVersion || 'CUV_TRAD'}
                        includeGeography={gameOptions.includeGeography ?? true}
                        includeEncyclopedia={gameOptions.includeEncyclopedia ?? true}
                        onVersionChange={handleVersionChange}
                        onToggleGeography={handleToggleGeography}
                        onToggleEncyclopedia={handleToggleEncyclopedia}
                    />
                );
            }

            case 'game-select':
                // Removed per user request - intro animation bypassed
                return null;

            case 'playing':
                return (
                    <GameManager
                        selectedBooks={selectedBooks}
                        options={gameOptions}
                        onGameEnd={handleEndGame}
                        onExit={() => returnToGameHub('quiz')}
                        useMobileInterface={useMobileInterface}
                    />
                );

            case 'gameover':
            case 'victory':
                return (
                    <GameOverScreen
                        score={score}
                        wrongAnswers={wrongAnswers}
                        totalQuestions={totalQuestions}
                        onReplay={(replayOptions) => handleStartGame(selectedBooks, gameOptions, replayOptions)}
                        onExit={handleReturnToMenu}
                        onSaveScore={handleSaveScore}
                        isMobile={useMobileInterface}
                        gameMode={gameOptions.gameMode}
                        isVictory={currentView === 'victory'}
                        isLoggedIn={isLoggedIn}
                        user={user}
                        isInfiniteMode={gameOptions.isInfiniteMode}
                    />
                );

            case 'speed-results':
                return (
                    <SpeedResultsScreen
                        correctCount={pendingCorrectAnswers}
                        totalAnswered={totalQuestions}
                        coinsEarned={pendingSettlementCoins}
                        bonusCoins={pendingSettlementBonus}
                        onReplay={(replayOptions) => handleStartGame(selectedBooks, gameOptions, replayOptions)}
                        onBackToMenu={handleReturnToMenu}
                    />
                );

            case 'expedition-game':
                return (
                    <ExpeditionScreen
                        onBack={() => returnToGameHub('quiz')}
                    />
                );

            default:
                return <ModernFeatureMenu onNavigate={handleNavigate} isMobile={useMobileInterface} />;
        }
    };

    return (
        <OrientationGuard>
            <div className="app-shell-container bg-slate-50">
                {loading ? (
                    <div className="min-h-screen flex items-center justify-center bg-slate-950">
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-amber-500 font-mono text-[10px] uppercase tracking-widest font-bold">驗證中...</p>
                        </div>
                    </div>
                ) : (
                    <Suspense fallback={<AppLoading />}>
                        <div className="flex-1 overflow-hidden flex flex-col">
                            {renderView()}
                        </div>
                        <GuestDataMergeDialog 
                            isOpen={coinSystem.isMergeRequired}
                            coinCount={coinSystem.guestCoins} 
                            isLoading={coinSystem.isLoading}
                            onMerge={coinSystem.mergeGuestData}
                            onDiscard={coinSystem.discardGuestData}
                        />
                        <PasswordMaturityModal onForceChange={() => handleNavigate('profile')} />
                        <AchievementToast />
                        {guestGameExitDialog}
                    </Suspense>
                )}


                {/* 連線模式選擇彈窗 */}
                <MultiplayerModeModal
                    isOpen={showMultiplayerModal}
                    onClose={() => setShowMultiplayerModal(false)}
                    isMobile={useMobileInterface}
                    onSelectMode={(modeType) => {
                        setShowMultiplayerModal(false);
                        if (modeType === 'buzzer' || modeType === 'team') {
                            setGameOptions(prev => ({ ...prev, multiplayerMode: modeType }));

                            if (useMobileInterface) {
                                navigateWithHistory('game-online-player');
                            } else {
                                setGameOptions(prev => ({
                                    ...prev,
                                    gameMode: 'multiplayer-buzzer',
                                    multiplayerMode: modeType
                                }));
                                navigateWithHistory('book-select-online');
                            }
                        }
                    }}
                />
            </div>
        </OrientationGuard>
    );
}

/**
 * App v3 - 統一應用程式入口
 */
export default function App() {
    const blessingMatch = window.location.pathname.match(/^\/(?:b|blessing)\/([^/]+)\/?$/);
    const blessingToken = blessingMatch ? decodeURIComponent(blessingMatch[1]) : '';
    return (
        <AuthProvider>
            <CoinSystemProvider>
                <ToastProvider>
                    {blessingToken ? (
                        <Suspense fallback={<AppLoading />}>
                            <VoiceBlessingSharePage token={blessingToken} />
                        </Suspense>
                    ) : <AppContent />}
                </ToastProvider>
            </CoinSystemProvider>
        </AuthProvider>
    );
}
