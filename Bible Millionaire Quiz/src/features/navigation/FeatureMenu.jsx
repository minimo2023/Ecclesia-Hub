import React, { useState } from 'react';
import { UserCircle, Trophy, BookOpen, Heart, LogIn, LogOut, Coins, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AuthModal from '../auth/AuthModal';

/**
 * 主功能選單組件 - v2 版本核心導航
 * 聖經智匯 Biblical Intelligence - 溫暖淺色風格
 */
export default function FeatureMenu({ onNavigate, isMobile = false }) {
    const { user, isLoggedIn, logout } = useAuth();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalView, setAuthModalView] = useState('login');
    const [showUserMenu, setShowUserMenu] = useState(false);

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

    const features = [
        {
            id: 'learning',
            icon: BookOpen,
            title: '學習中心',
            description: '深入研讀聖經，建立紮實根基',
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            items: [
                { label: '每日靈修', target: 'devotion' },
                { label: '經文探索', target: 'verse-explorer' },
                { label: '原文字典', target: 'verse-explorer' }, // 暫時導向經文探索
                { label: '學習統計', target: 'stats' }
            ],
            featured: true
        },
        {
            id: 'game',
            icon: Trophy,
            title: '互動測驗',
            description: '趣味問答挑戰，鞏固學習成果',
            iconBg: 'bg-rose-100',
            iconColor: 'text-rose-600',
            items: [
                { label: '練習模式', target: 'game' },
                { label: '經卷朗讀', target: 'reading' },
                { label: '研經工具', target: 'bibletool' },
                { label: '福音資源', target: 'gospel' },
            ]
        }
    ];

    const handleItemClick = (e, target) => {
        e.stopPropagation(); // 防止觸發外層卡片的點擊事件
        onNavigate(target);
    };

    return (
        <div className="min-h-screen bg-[#FDFBF7] text-stone-800 font-sans selection:bg-amber-200">
            {/* Top Auth Bar */}
            <div className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-b border-stone-100 z-40">
                <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">📖</span>
                        <span className="font-bold text-stone-700 hidden sm:inline">聖經智匯</span>
                    </div>

                    {isLoggedIn ? (
                        <div className="flex items-center gap-4">
                            {/* Coins Display */}
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-200">
                                <Coins className="w-4 h-4 text-amber-600" />
                                <span className="font-bold text-amber-700">{user?.coins || 0}</span>
                            </div>

                            {/* User Menu */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowUserMenu(!showUserMenu)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors"
                                >
                                    <UserCircle className="w-5 h-5 text-stone-600" />
                                    <span className="font-medium text-stone-700 hidden sm:inline">
                                        {user?.displayName || user?.username}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-stone-400" />
                                </button>

                                {showUserMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowUserMenu(false)}
                                        />
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-stone-100 py-2 z-50">
                                            <button
                                                onClick={() => { onNavigate('profile'); setShowUserMenu(false); }}
                                                className="w-full px-4 py-2 text-left hover:bg-stone-50 flex items-center gap-2 text-stone-700"
                                            >
                                                <UserCircle className="w-4 h-4" />
                                                我的檔案
                                            </button>
                                            <hr className="my-1 border-stone-100" />
                                            <button
                                                onClick={handleLogout}
                                                className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center gap-2 text-red-600"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                登出
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={openLogin}
                                className="px-4 py-1.5 text-stone-600 hover:text-stone-800 font-medium transition-colors"
                            >
                                登入
                            </button>
                            <button
                                onClick={openRegister}
                                className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium rounded-full hover:from-amber-600 hover:to-orange-700 transition-all"
                            >
                                註冊
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Header (with top padding for fixed auth bar) */}
            <div className="text-center pt-24 pb-12 px-4">
                <div className="inline-block p-3 rounded-full bg-amber-50 mb-4 shadow-sm">
                    <span className="text-4xl">📖</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold mb-3 text-stone-800 tracking-tight">
                    聖經智匯
                </h1>
                <p className="text-lg text-stone-500 font-medium tracking-wide mb-4 font-serif italic">Biblical Intelligence</p>
                <div className="w-16 h-1 bg-amber-400 mx-auto rounded-full mb-4 opacity-60"></div>
                <p className="text-stone-600">深入研讀 • 智慧成長 • 生命建造</p>
            </div>

            {/* Auth Modal */}
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                initialView={authModalView}
            />

            {/* Feature Cards */}
            <div className="max-w-7xl mx-auto px-6 pb-12">
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2'} gap-6 mb-8`}>
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <div
                                key={feature.id}
                                onClick={() => onNavigate(feature.id)}
                                className={`group relative bg-white rounded-3xl p-8 border border-stone-100 cursor-pointer
                  ${feature.featured ? 'md:col-span-2 md:p-10 shadow-lg shadow-stone-200/50' : 'shadow-md shadow-stone-200/30'} 
                  hover:-translate-y-1 hover:shadow-xl hover:shadow-stone-200/60 transition-all duration-300 text-left`}
                            >
                                <div className="flex flex-col md:flex-row md:items-start gap-6">
                                    {/* Icon */}
                                    <div className={`w-16 h-16 rounded-2xl ${feature.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                                        <Icon className={`w-8 h-8 ${feature.iconColor}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-2">
                                            <h2 className="text-2xl font-bold text-stone-800 group-hover:text-amber-700 transition-colors">
                                                {feature.title}
                                            </h2>
                                            <div className="text-stone-300 group-hover:text-amber-500 transition-colors">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>

                                        <p className="text-stone-500 mb-6 leading-relaxed">{feature.description}</p>

                                        <div className="flex flex-wrap gap-2">
                                            {feature.items.map((item, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={(e) => handleItemClick(e, item.target)}
                                                    className="inline-flex items-center px-3 py-1 rounded-full bg-stone-50 text-stone-600 text-sm border border-stone-100 hover:bg-amber-100 hover:text-amber-800 hover:border-amber-200 transition-colors active:scale-95"
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Profile Card */}
                <button
                    onClick={() => onNavigate('profile')}
                    className="w-full bg-white rounded-2xl p-6 border border-stone-100 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center group-hover:bg-purple-50 transition-colors">
                            <UserCircle className="w-6 h-6 text-stone-400 group-hover:text-purple-500 transition-colors" />
                        </div>
                        <div className="text-left">
                            <h3 className="text-lg font-bold text-stone-700 group-hover:text-purple-700 transition-colors">我的檔案</h3>
                            <p className="text-stone-400 text-sm">查看學習統計與成就</p>
                        </div>
                    </div>
                    <svg className="w-5 h-5 text-stone-300 group-hover:text-stone-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Admin Link */}
                <button
                    onClick={() => onNavigate('admin')}
                    className="w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 border border-slate-700 shadow-sm hover:shadow-lg transition-all duration-300 flex items-center justify-between group mt-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                            <span className="text-lg">🔒</span>
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">管理員入口</h3>
                            <p className="text-slate-500 text-xs">Encyclopedia & System Management</p>
                        </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Footer */}
            <div className="text-center py-8 text-stone-400 text-sm">
                <p className="font-serif italic">Biblical Intelligence v5.1.0</p>
            </div>
        </div>
    );
}
