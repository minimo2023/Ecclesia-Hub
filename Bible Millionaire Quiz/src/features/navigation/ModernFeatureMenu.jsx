import React, { useEffect, useMemo, useState } from 'react';
import {
    Bell,
    BookOpen,
    ChevronDown,
    ChevronRight,
    Compass,
    Flame,
    Gamepad2,
    Heart,
    Home,
    LogOut,
    NotebookPen,
    ScrollText,
    ShieldCheck,
    Sparkles,
    Trophy,
    User,
    UserCircle,
    Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCoinSystem } from '../../hooks/useCoinSystem';
import AuthModal from '../auth/AuthModal';
import SupportModal from '../../shared/components/SupportModal';
import AICreditWallet from '../../shared/components/AICreditWallet';

import {
    dayNames,
    getLocalDateString,
    getGreeting,
    buildWeek,
    calculateStreak,
    deriveDevotionalTitle,
    deriveDevotionalSummary
} from '../../utils/devotionProgress';

export default function ModernFeatureMenu({ onNavigate, isMobile = false }) {
    const { user, isLoggedIn, logout, getToken } = useAuth();
    const coinSystem = useCoinSystem();

    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalView, setAuthModalView] = useState('login');
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [showAiWallet, setShowAiWallet] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [hasAdminNotification, setHasAdminNotification] = useState(false);
    const [isBellRinging, setIsBellRinging] = useState(false);
    const [aiCredits, setAiCredits] = useState(0);
    const [todayProgress, setTodayProgress] = useState({ read: false, meditate: false, note: false });
    const [streak, setStreak] = useState(0);
    const [weekDays, setWeekDays] = useState(() => buildWeek());
    const [devotionData, setDevotionData] = useState({
        title: '今日同行的光',
        reference: '詩篇 119:105',
        summary: '你的話是我腳前的燈，是我路上的光。',
    });

    const displayName = user?.displayName || user?.username || '朋友';
    const today = new Date();
    const dateText = `${today.getMonth() + 1}/${today.getDate()}`;
    const weekdayText = `週${dayNames[today.getDay()]}`;

    const progressSteps = [
        { label: '讀經', complete: todayProgress.read, icon: BookOpen, path: 'reading-plans' },
        { label: '默想', complete: todayProgress.meditate, icon: Sparkles, path: 'devotion' },
        { label: '筆記', complete: todayProgress.note, icon: NotebookPen, path: 'member-center:diary' },
    ];
    const progressPercent = Math.round((progressSteps.filter((step) => step.complete).length / progressSteps.length) * 100);

    const features = useMemo(() => ([
        {
            id: 'game',
            title: '聖經智匯遊戲',
            subtitle: 'BIBLE GAMES',
            description: '問答挑戰、經文記憶與連線同樂，在不同玩法中認識聖經。',
            icon: Trophy,
            accent: 'text-amber-600',
            tile: 'bg-amber-50',
            ring: 'border-amber-100',
            button: '進入遊戲',
        },
        {
            id: 'devotion',
            title: '每日靈修',
            subtitle: 'DAILY DEVOTION',
            description: '讀經、默想、禱告與筆記整合成每日節奏。',
            icon: Heart,
            accent: 'text-rose-600',
            tile: 'bg-rose-50',
            ring: 'border-rose-100',
            button: todayProgress.meditate ? '查看今日靈修' : '開始靈修',
        },
        {
            id: 'verse-explorer',
            title: '經文探索',
            subtitle: 'SCRIPTURE EXPLORER',
            description: '用主題、書卷與資料庫快速進入聖經脈絡。',
            icon: ScrollText,
            accent: 'text-blue-600',
            tile: 'bg-blue-50',
            ring: 'border-blue-100',
            button: '開啟探索',
        },
    ]), [todayProgress]);

    useEffect(() => {
        if (!isLoggedIn) {
            setWeekDays(buildWeek());
            setTodayProgress({ read: false, meditate: false, note: false });
            setStreak(0);
            return;
        }

        const fetchUserProgress = async () => {
            try {
                const token = getToken();
                const [walletResponse, notesResponse] = await Promise.all([
                    fetch('/api/users/ai-wallet', {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch('/api/devotional-notes/list', {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ]);

                const wallet = await walletResponse.json();
                if (wallet.success) {
                    setAiCredits(wallet.data.totalCredits || 0);
                }

                const notes = await notesResponse.json();
                if (notes.success) {
                    const checkins = notes.checkins || [];
                    const todayString = getLocalDateString(new Date());
                    const todayCheckin = checkins.find(c => c.date === todayString);

                    setTodayProgress({
                        read: !!todayCheckin?.scripture_read_at,
                        meditate: !!todayCheckin?.read_at,
                        note: !!todayCheckin?.wrote_note_at
                    });
                    
                    setStreak(calculateStreak(checkins));
                    setWeekDays(buildWeek(checkins));
                }
            } catch (error) {
                console.error('Fetch user dashboard data error:', error);
            }
        };

        fetchUserProgress();
        const handleRefresh = () => fetchUserProgress();
        window.addEventListener('refresh-ai-wallet', handleRefresh);
        return () => window.removeEventListener('refresh-ai-wallet', handleRefresh);
    }, [isLoggedIn, getToken]);

    useEffect(() => {
        const fetchDevotion = async () => {
            try {
                const response = await fetch('/api/ai/devotional');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();

                if (!result.success || !result.data) return;

                const data = result.data;
                const reference = data.scriptureReference || data.verse_ref || data.reference || '今日經文';
                const summary = data.scripture
                    ? `${data.scripture} (${reference})`
                    : data.summary || data.topic || data.main_theme || '安靜讀一段經文，讓今天從神的話開始。';

                const title = deriveDevotionalTitle(data, reference);

                setDevotionData({
                    title,
                    reference,
                    summary,
                });
            } catch (error) {
                console.error('Fetch devotion error:', error);
            }
        };

        fetchDevotion();
    }, []);

    // Listen to admin notifications
    useEffect(() => {
        const handleAdminNotification = (e) => {
            if (e.detail?.type === 'new_member') {
                setHasAdminNotification(true);
                setIsBellRinging(true);
                // 搖晃動畫 3 秒後停止
                setTimeout(() => setIsBellRinging(false), 3000);
            }
        };

        window.addEventListener('admin:notification', handleAdminNotification);
        return () => window.removeEventListener('admin:notification', handleAdminNotification);
    }, []);

    const openLogin = () => {
        setAuthModalView('login');
        setShowAuthModal(true);
    };

    const openRegister = () => {
        setAuthModalView('register');
        setShowAuthModal(true);
    };

    const handleLogout = () => {
        logout();
        setShowUserMenu(false);
    };

    const handleBellClick = () => {
        setHasAdminNotification(false);
    };

    return (
        <div className="h-full w-full overflow-y-auto bg-[#F8FAFC] text-slate-900">
            <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                    <button
                        type="button"
                        onClick={() => onNavigate('feature-menu')}
                        className="flex min-h-11 min-w-0 items-center gap-2 text-left"
                        aria-label="回到首頁"
                    >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
                            <BookOpen className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-base font-black tracking-wide text-slate-900">聖經智匯</span>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-indigo-500">Biblical Intelligence - Web</span>
                        </span>
                    </button>

                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* 桌面版會員中心入口 */}
                        {isLoggedIn && (
                            <button
                                type="button"
                                onClick={() => onNavigate('member-center')}
                                className="hidden min-h-11 sm:flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:text-indigo-600 hover:bg-indigo-50 rounded-full"
                                title="會員中心"
                            >
                                <UserCircle className="h-4 w-4" />
                                <span className="hidden lg:inline">會員中心</span>
                            </button>
                        )}

                        {/* 資產膠囊：金幣 + 智匯點數（登入後顯示雙欄，未登入僅顯示金幣） */}
                        {isLoggedIn ? (
                            <button
                                type="button"
                                onClick={() => setShowAiWallet(true)}
                                className="flex min-h-11 items-center bg-slate-100 rounded-full px-3 py-1.5 gap-2 border border-slate-200"
                                title="資產錢包"
                            >
                                <span className="text-[13px]">💰</span>
                                <span className="text-[12px] font-black text-amber-700">{user?.coins || 0}</span>
                                <div className="w-px h-3 bg-slate-300"></div>
                                <Wallet className="h-3.5 w-3.5 text-indigo-500" />
                                <span className="text-[12px] font-black text-indigo-700">{aiCredits}</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowAiWallet(true)}
                                className="flex min-h-11 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-black text-amber-700"
                                title="AI 點數錢包"
                            >
                                <Wallet className="h-4 w-4" />
                                {coinSystem.coins.toLocaleString()}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowSupportModal(true)}
                            className="flex h-11 w-11 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm sm:font-bold"
                            aria-label="支持我們"
                            title="支持我們"
                        >
                            <Heart className="h-5 w-5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">支持我們</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleBellClick}
                            className={`relative flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 ${isBellRinging ? 'animate-bounce' : ''}`}
                            aria-label="查看通知"
                            title="通知"
                        >
                            <Bell className="h-5 w-5" />
                            {hasAdminNotification && (
                                <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-white bg-red-500" />
                            )}
                        </button>

                        {isLoggedIn ? (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowUserMenu((value) => !value)}
                                    className="flex min-h-11 items-center gap-2 rounded-full border border-slate-100 bg-white px-1.5 py-1 shadow-sm transition hover:bg-slate-50"
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
                                        {displayName.charAt(0)}
                                    </span>
                                    <span className="hidden max-w-28 truncate text-sm font-bold text-slate-700 md:block">{displayName}</span>
                                    <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
                                </button>

                                {showUserMenu && (
                                    <>
                                        <button
                                            type="button"
                                            className="fixed inset-0 z-40 cursor-default"
                                            aria-label="關閉會員選單"
                                            onClick={() => setShowUserMenu(false)}
                                        />
                                        <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-xl border border-slate-100 bg-white py-2 shadow-xl">
                                            {(user?.role === 'super_admin' || user?.isAdmin || (Array.isArray(user?.adminRoles) && user.adminRoles.length > 0)) && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onNavigate('admin-panel');
                                                        setShowUserMenu(false);
                                                    }}
                                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-amber-700 hover:bg-amber-50"
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                    管理後台
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={handleLogout}
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                                            >
                                                <LogOut className="h-4 w-4" />
                                                登出
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={openLogin}
                                    className="min-h-11 px-2.5 py-1.5 text-sm font-bold text-slate-600 transition hover:text-slate-900"
                                >
                                    登入
                                </button>
                                <button
                                    type="button"
                                    onClick={openRegister}
                                    className="min-h-11 rounded-full bg-indigo-600 px-3.5 py-1.5 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700"
                                >
                                    註冊
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-24 pt-4 sm:px-6 lg:pb-8">
                <section className="flex flex-col gap-1">
                    <p className="text-sm font-bold text-slate-500">{getGreeting()}，{displayName}</p>
                    <h1 className="text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">
                        今天從一段經文開始
                    </h1>
                </section>

                <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div
                        className="relative min-h-[320px] overflow-hidden rounded-[20px] bg-slate-900 text-white shadow-xl shadow-indigo-950/15"
                        style={{
                            backgroundImage: 'linear-gradient(120deg, rgba(49, 46, 129, 0.9), rgba(15, 23, 42, 0.88)), url("/images/平安平原.jpg")',
                            backgroundPosition: 'center',
                            backgroundSize: 'cover',
                        }}
                    >
                        <div className="flex h-full min-h-[320px] flex-col justify-between p-5 sm:p-7">
                            <div className="flex items-start justify-between gap-4">
                                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                                    <Sparkles className="h-4 w-4" />
                                    今日靈修
                                </span>
                                <span className="rounded-xl bg-white/15 px-3 py-2 text-center text-white backdrop-blur">
                                    <span className="block text-lg font-black leading-none">{dateText}</span>
                                    <span className="mt-1 block text-xs font-bold text-white/75">{weekdayText}</span>
                                </span>
                            </div>

                            <div className="max-w-2xl">
                                <p className="mb-3 text-sm font-bold text-white/75">{devotionData.reference}</p>
                                <h2 className="text-4xl font-black leading-tight tracking-normal sm:text-5xl">
                                    {devotionData.title}
                                </h2>
                                <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-white/82 sm:text-base">
                                    {devotionData.summary}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => onNavigate('devotion')}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-indigo-700 shadow-lg shadow-black/10 transition hover:bg-indigo-50"
                                >
                                    <BookOpen className="h-4 w-4" />
                                    {todayProgress.meditate ? '查看今日靈修' : '開始今日靈修'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!isLoggedIn) {
                                            openLogin();
                                        } else {
                                            onNavigate('member-center:diary');
                                        }
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/15 px-5 py-3 text-sm font-black text-white backdrop-blur transition hover:bg-white/25"
                                >
                                    <NotebookPen className="h-4 w-4" />
                                    靈修筆記
                                </button>
                            </div>
                        </div>
                    </div>

                    <aside className="rounded-[20px] border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">今日進度</h2>
                                <p className="text-xs font-bold text-slate-400">Daily Rhythm</p>
                            </div>
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-lg font-black text-indigo-700 ring-8 ring-indigo-100/70">
                                {progressPercent}%
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-2">
                            {progressSteps.map((step) => {
                                const Icon = step.icon;
                                return (
                                    <button
                                        type="button"
                                        key={step.label}
                                        onClick={() => {
                                            if (!isLoggedIn && step.path === 'member-center:diary') {
                                                openLogin();
                                            } else {
                                                onNavigate(step.path);
                                            }
                                        }}
                                        className={`rounded-xl border p-3 text-center transition ${step.complete
                                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'
                                            }`}
                                    >
                                        <Icon className="mx-auto h-5 w-5" />
                                        <span className="mt-2 block text-xs font-black">{step.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-black text-slate-700">連續靈修</span>
                                <span className="inline-flex items-center gap-1 text-sm font-black text-orange-600">
                                    <Flame className="h-4 w-4" />
                                    {streak} 天
                                </span>
                            </div>
                            <div className="mt-4 flex justify-between gap-1">
                                {weekDays.map((day) => (
                                    <div key={`${day.day}-${day.date}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-400">{day.day}</span>
                                        <span
                                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${day.active
                                                ? 'bg-indigo-100 text-indigo-700'
                                                : day.isToday
                                                    ? 'border-2 border-slate-300 bg-white text-slate-700'
                                                    : day.future
                                                        ? 'text-slate-300'
                                                        : 'text-slate-400'
                                                }`}
                                        >
                                            {day.date}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </section>

                <section className="hidden gap-3 lg:grid lg:grid-cols-3">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <button
                                type="button"
                                key={feature.id}
                                onClick={() => onNavigate(feature.id)}
                                className={`group flex min-h-[210px] flex-col rounded-[20px] border ${feature.ring} bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg`}
                            >
                                <div className="mb-5 flex items-start justify-between">
                                    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${feature.tile}`}>
                                        <Icon className={`h-7 w-7 ${feature.accent}`} />
                                    </span>
                                    <ChevronRight className={`h-5 w-5 ${feature.accent} opacity-60 transition group-hover:translate-x-1`} />
                                </div>
                                <div className="mt-auto">
                                    <h3 className="text-xl font-black text-slate-900">{feature.title}</h3>
                                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{feature.subtitle}</p>
                                    <p className="mt-3 min-h-[44px] text-sm font-medium leading-6 text-slate-500">{feature.description}</p>
                                    <span className={`mt-4 inline-flex items-center gap-1 text-sm font-black ${feature.accent}`}>
                                        {feature.button}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </section>
            </main>

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
                <div className="mx-auto grid max-w-md grid-cols-4">
                    {[
                        { label: '首頁', icon: Home, target: 'feature-menu' },
                        { label: '遊戲', icon: Gamepad2, target: 'game' },
                        { label: '聖經', icon: BookOpen, target: 'verse-explorer' },
                        { label: '會員', icon: User, target: 'member-center' },
                    ].map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                type="button"
                                key={item.label}
                                onClick={() => onNavigate(item.target)}
                                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-black ${item.target === 'feature-menu' ? 'text-indigo-600' : 'text-slate-400'
                                    }`}
                            >
                                <Icon className="h-5 w-5" />
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </nav>

            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                initialView={authModalView}
                onLoginSuccess={() => setShowAuthModal(false)}
            />
            <SupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
            <AICreditWallet
                isOpen={showAiWallet}
                onClose={() => {
                    setShowAiWallet(false);
                    window.dispatchEvent(new Event('refresh-ai-wallet'));
                }}
            />
        </div>
    );
}
