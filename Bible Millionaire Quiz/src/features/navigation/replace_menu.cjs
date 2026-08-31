const fs = require('fs');

const code = `import React, { useState, useEffect } from 'react';
import { 
    Trophy, BookOpen, Heart, UserCircle, LogOut, ChevronDown, 
    ShieldCheck, ChevronRight, Bell, Flame, Check, Coins
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AuthModal from '../auth/AuthModal';
import SupportModal from '../../shared/components/SupportModal';
import AICreditWallet from '../../shared/components/AICreditWallet';
import { useCoinSystem } from '../../hooks/useCoinSystem';

export default function ModernFeatureMenu({ onNavigate, isMobile = false }) {
    const { user, isLoggedIn, logout, getToken } = useAuth();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalView, setAuthModalView] = useState('login');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const coinSystem = useCoinSystem();
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [showAiWallet, setShowAiWallet] = useState(false);
    const [aiCredits, setAiCredits] = useState(0);

    const coinBalance = coinSystem.coins;

    useEffect(() => {
        if (isLoggedIn) {
            const fetchCredits = async () => {
                try {
                    const token = getToken();
                    const res = await fetch('/api/users/ai-wallet', {
                        headers: { 'Authorization': \`Bearer \${token}\` }
                    });
                    const data = await res.json();
                    if (data.success) {
                        setAiCredits(data.data.totalCredits);
                    }
                } catch (error) {
                    console.error('Fetch AI credits error:', error);
                }
            };
            fetchCredits();
            
            const handleRefresh = () => fetchCredits();
            window.addEventListener('refresh-ai-wallet', handleRefresh);
            return () => window.removeEventListener('refresh-ai-wallet', handleRefresh);
        }
    }, [isLoggedIn, getToken]);

    const openLogin = () => { setAuthModalView('login'); setShowAuthModal(true); };
    const openRegister = () => { setAuthModalView('register'); setShowAuthModal(true); };
    const handleLogout = () => { logout(); setShowUserMenu(false); };
    const handleLoginSuccess = () => {};

    // 取得時間問候語
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return '早安';
        if (hour < 18) return '午安';
        return '晚安';
    };

    const displayName = user?.displayName || user?.username || '朋友';

    // 靜態模擬資料 (未來可替換為真實 API)
    const todayDevotion = {
        title: "起來，上伯特利去",
        reference: "創世記 35:1-3",
        summary: "回應呼召，除去偶像，重新出發",
        dateText: "5/30 星期五",
        completed: false,
        streak: 12
    };

    const weekDays = [
        { day: '日', date: 25, active: false, future: false },
        { day: '一', date: 26, active: true, future: false },
        { day: '二', date: 27, active: true, future: false },
        { day: '三', date: 28, active: true, future: false },
        { day: '四', date: 29, active: true, future: false },
        { day: '五', date: 30, active: false, future: false, isToday: true },
        { day: '六', date: 31, active: false, future: true }
    ];

    const features = [
        {
            id: 'game',
            icon: Trophy,
            title: '聖經智匯問答',
            subtitle: 'QUIZ GAME',
            description: '聖經知識挑戰，趣味問答闖關',
            buttonText: '立即挑戰',
            color: 'text-amber-500',
            bgIcon: 'bg-amber-100',
            comingSoon: false
        },
        {
            id: 'devotion',
            icon: Heart,
            title: '每日靈修',
            subtitle: 'DAILY DEVOTION',
            description: '每日經文默想，心靈滋養成長',
            buttonText: '開始靈修',
            color: 'text-rose-500',
            bgIcon: 'bg-rose-100',
            comingSoon: false
        },
        {
            id: 'verse-explorer',
            icon: BookOpen,
            title: '經文探索',
            subtitle: 'SCRIPTURE EXPLORER',
            description: '經文閱讀、AI輔助與全文搜尋',
            buttonText: '開始探索',
            color: 'text-blue-500',
            bgIcon: 'bg-blue-100',
            badge: 'NEW',
            comingSoon: false
        }
    ];

    return (
        <div className="h-full w-full bg-[#F5F5FA] text-slate-800 font-sans flex flex-col overflow-y-auto">
            {/* Top Bar */}
            <div className="bg-white px-4 md:px-8 h-16 flex items-center justify-between shrink-0 sticky top-0 z-40 border-b border-slate-100 shadow-sm">
                {/* Logo */}
                <div className="flex items-center gap-2 md:gap-3">
                    <BookOpen className="text-blue-600 w-6 h-6 md:w-8 md:h-8" />
                    <h1 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight flex items-baseline gap-2">
                        聖經智匯 <span className="text-xs text-slate-400 font-normal hidden md:inline">Biblical Intelligence</span>
                    </h1>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3 md:gap-6">
                    {isLoggedIn && (
                        <div className="hidden md:flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200/50">
                            <Coins className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-bold text-amber-600">智匯金幣 {coinBalance.toLocaleString()}</span>
                        </div>
                    )}

                    <button 
                        onClick={() => onNavigate('member-center')}
                        className="hidden md:flex items-center gap-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-1.5 rounded-full transition-colors font-medium border border-emerald-200/50"
                    >
                        <UserCircle className="w-4 h-4" />
                        <span className="text-sm">會員中心</span>
                    </button>

                    <button className="text-slate-400 hover:text-slate-600 transition-colors">
                        <Bell className="w-5 h-5" />
                    </button>

                    {isLoggedIn ? (
                        <div className="relative">
                            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm">
                                    {(user?.displayName || user?.username || '友')?.[0]}
                                </div>
                                <span className="hidden lg:block font-medium text-slate-700 text-sm">{displayName}</span>
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                            </button>
                            {showUserMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                                    <div className="absolute top-12 right-0 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
                                        {(user?.role === 'super_admin' || user?.isAdmin || (Array.isArray(user?.adminRoles) && user.adminRoles.length > 0)) && (
                                            <button 
                                                onClick={() => { onNavigate('admin-panel'); setShowUserMenu(false); }} 
                                                className="w-full px-4 py-2 text-left hover:bg-amber-50 flex items-center gap-2 text-amber-700 border-b border-slate-50"
                                            >
                                                <ShieldCheck className="w-4 h-4 text-amber-600" /> 
                                                <span className="font-semibold text-sm">管理員控制台</span>
                                            </button>
                                        )}
                                        <button onClick={handleLogout} className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center gap-2 text-red-600 text-sm">
                                            <LogOut className="w-4 h-4" /> 登出
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 shrink-0">
                            <button onClick={openLogin} className="px-3 py-1.5 text-slate-600 hover:text-slate-800 font-medium text-sm">登入</button>
                            <button onClick={openRegister} className="px-4 py-1.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 transition-colors shadow-sm text-sm">註冊</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6 md:gap-8">
                
                {/* Greeting */}
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-1">
                        {getGreeting()}，{displayName}！
                    </h2>
                    <p className="text-slate-500 text-sm md:text-base">今天也一起在神的話語中成長吧！</p>
                </div>

                {/* Top Section: Hero Banner + Progress */}
                <div className="flex flex-col xl:flex-row gap-6">
                    
                    {/* Hero Banner */}
                    <div className="flex-1 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-lg group">
                        {/* Background Decoration (Mock Image/Gradient) */}
                        <div className="absolute inset-0 bg-black/10 z-0"></div>
                        <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-black/40 to-transparent z-0"></div>
                        
                        <div className="relative z-10 flex flex-col h-full justify-between gap-6 md:gap-12">
                            {/* Top row of banner */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 text-white/90 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium">
                                    <Heart className="w-3.5 h-3.5" /> 今日靈修
                                </div>
                                <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-center">
                                    <div className="text-lg font-bold leading-tight">{todayDevotion.dateText.split(' ')[0]}</div>
                                    <div className="text-xs text-white/80">{todayDevotion.dateText.split(' ')[1]}</div>
                                </div>
                            </div>

                            {/* Main Content */}
                            <div>
                                <h1 className="text-3xl md:text-5xl font-bold mb-3 md:mb-4 tracking-wide group-hover:scale-[1.02] transition-transform origin-left">
                                    {todayDevotion.title}
                                </h1>
                                <p className="text-white/90 text-sm md:text-base font-medium mb-1">{todayDevotion.reference}</p>
                                <p className="text-white/70 text-sm">{todayDevotion.summary}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap items-center gap-3 md:gap-4 mt-auto">
                                <button 
                                    onClick={() => onNavigate('devotion')}
                                    className="bg-white text-indigo-600 font-bold px-6 py-3 rounded-full hover:bg-slate-50 transition-colors shadow-md text-sm md:text-base"
                                >
                                    開始今日靈修
                                </button>
                                <button 
                                    onClick={() => onNavigate('devotion')}
                                    className="bg-white/20 backdrop-blur-md text-white font-medium px-6 py-3 rounded-full hover:bg-white/30 transition-colors text-sm md:text-base"
                                >
                                    查看我的筆記
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Progress Card */}
                    <div className="w-full xl:w-[350px] bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 flex flex-col">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">今日靈修進度</h3>
                        
                        <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                            <p className="text-slate-600 font-medium text-sm text-center">
                                {todayDevotion.completed ? '✅ 已完成今日靈修' : '尚未完成今日靈修'}
                            </p>
                        </div>

                        <div className="mb-6">
                            <h4 className="text-sm font-bold text-slate-700 mb-2">每日靈修連續天數</h4>
                            <div className="flex items-center gap-2">
                                <Flame className="w-6 h-6 text-orange-500" />
                                <span className="text-2xl font-black text-slate-800">{todayDevotion.streak} 天</span>
                            </div>
                        </div>

                        {/* Calendar Tracker */}
                        <div className="flex justify-between items-center mt-auto">
                            {weekDays.map((d, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-medium">{d.day}</span>
                                    <div className={\`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                                        \${d.active ? 'bg-purple-100 text-purple-600 border border-purple-200' : ''}
                                        \${!d.active && !d.isToday ? 'text-slate-400' : ''}
                                        \${d.isToday && !d.active ? 'border-2 border-slate-200 text-slate-600' : ''}
                                    \`}>
                                        {d.date}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Feature Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-2">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <button
                                key={feature.id}
                                onClick={() => !feature.comingSoon ? onNavigate(feature.id) : alert('敬請期待！')}
                                className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col text-left relative group overflow-hidden"
                            >
                                {feature.comingSoon && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl">
                                        <div className="bg-slate-800 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg">
                                            敬請期待
                                        </div>
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-start mb-12">
                                    <div className={\`w-14 h-14 rounded-2xl \${feature.bgIcon} flex items-center justify-center\`}>
                                        <Icon className={\`w-7 h-7 \${feature.color}\`} />
                                    </div>
                                    {feature.badge && (
                                        <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                            {feature.badge}
                                        </span>
                                    )}
                                </div>

                                <div className="mt-auto relative z-10">
                                    <h3 className="text-xl font-bold text-slate-800 mb-1">{feature.title}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold tracking-widest mb-3 uppercase">{feature.subtitle}</p>
                                    <p className="text-xs text-slate-500 leading-relaxed mb-4 h-8">{feature.description}</p>
                                    
                                    <div className={\`flex items-center gap-1 text-sm font-bold \${feature.color} transition-transform group-hover:translate-x-1\`}>
                                        {feature.buttonText} <ChevronRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer Notes */}
                <div className="mt-auto py-6 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-xs text-slate-400 font-medium border-t border-slate-200/60">
                    <span className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" /> 累積成長 紀錄你的屬靈成長軌跡</span>
                    <span className="hidden md:inline text-slate-300">|</span>
                    <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> 靈修筆記 珍藏你的每一次感動與回應</span>
                    <span className="hidden md:inline text-slate-300">|</span>
                    <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> 隨時隨地 在任何時間地點親近神</span>
                </div>
            </div>

            {/* Modals */}
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialView={authModalView} onLoginSuccess={handleLoginSuccess} />
            <SupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
            <AICreditWallet isOpen={showAiWallet} onClose={() => { setShowAiWallet(false); window.dispatchEvent(new Event('refresh-ai-wallet')); }} />
        </div>
    );
}
`;

fs.writeFileSync('src/features/navigation/ModernFeatureMenu.jsx', code);
console.log('Script written');
