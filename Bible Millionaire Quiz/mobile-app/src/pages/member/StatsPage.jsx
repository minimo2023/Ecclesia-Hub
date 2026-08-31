import React, { useCallback, useEffect, useState } from 'react';
import { TrendingUp, Trophy, Target, Gamepad2, ChevronLeft, RefreshCw, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useAchievements } from '../../hooks/useAchievements';

export default function StatsPage({ isTab = false }) {
    const navigate = useNavigate();
    const { user, getToken } = useAuth();
    
    const { achievements, fetchAchievements, syncAchievements, isLoading } = useAchievements();
    const [stats, setStats] = useState({ total: 0, unlocked: 0, percentage: 0 });
    const [isSyncing, setIsSyncing] = useState(false);
    const [readingHistory, setReadingHistory] = useState([]);

    const loadReadingHistory = useCallback(async () => {
        try {
            const token = getToken();
            const res = await fetch('/api/bible/reading-plans/history', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setReadingHistory(data.history || []);
            }
        } catch (e) {
            console.error('Failed to load reading history:', e);
        }
    }, [getToken]);

    const loadAchievements = useCallback(async () => {
        const data = await fetchAchievements();
        if (data?.stats) {
            setStats(data.stats);
        }
    }, [fetchAchievements]);

    useEffect(() => {
        loadAchievements();
        loadReadingHistory();
    }, [loadAchievements, loadReadingHistory]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await syncAchievements();
            await loadAchievements();
            await loadReadingHistory();
        } catch (error) {}
        setIsSyncing(false);
    };

    const groupedAchievements = achievements.reduce((acc, a) => {
        if (!a.unlocked) return acc;
        const category = a.category || 'misc';
        if (!acc[category]) acc[category] = [];
        acc[category].push(a);
        return acc;
    }, {});

    const categoryLabels = {
        classic: '🎮 經典問答',
        speed: '⚡ 快問快答',
        bible: '📖 聖經探索',
        devotional: '🌅 靈修相關',
        misc: '✨ 特別成就'
    };

    return (
        <div className={`app-page flex flex-col ${isTab ? 'h-full' : 'flex-1 pb-safe animate-in slide-in-from-right-full duration-300'}`}>
            {!isTab && (
                <header className="app-topbar flex items-center px-4 z-10 sticky top-0">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 active:bg-slate-100 rounded-full transition">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="flex-1 text-base font-black text-slate-900 tracking-wider text-center mr-6">學習成就統計</h1>
                </header>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* Game Stats */}
                <section>
                    <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        遊戲數據
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="app-card flex flex-col items-center p-4">
                            <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                <Gamepad2 className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">總遊戲次數</span>
                            </div>
                            <p className="text-2xl font-black text-slate-800">{user?.totalGames || 0}</p>
                        </div>
                        <div className="app-card flex flex-col items-center p-4">
                            <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                <Target className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">答對題數</span>
                            </div>
                            <p className="text-2xl font-black text-slate-800">{user?.totalCorrect || 0}</p>
                        </div>
                        <div className="col-span-2 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-100 shadow-sm flex flex-row items-center justify-between">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5 mb-1 text-emerald-700/60">
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">總體答對率</span>
                                </div>
                                <p className="text-[10px] font-bold text-emerald-700/70 mt-0.5">依所有遊戲模式計算</p>
                            </div>
                            <p className="text-3xl font-black text-emerald-600">
                                {user?.totalGames > 0 || user?.totalAnswered > 0
                                    ? Math.min(100, Math.round((user.totalCorrect / Math.max(user.totalAnswered || 0, user.totalGames * 15, user.totalCorrect || 1)) * 100))
                                    : 0}%
                            </p>
                        </div>
                    </div>
                </section>

                {/* Reading History */}
                <section>
                    <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-500" />
                        閱讀紀錄
                    </h2>
                    <div className="space-y-3">
                        {readingHistory.length === 0 ? (
                            <div className="app-card flex flex-col items-center justify-center p-6 text-center">
                                <BookOpen className="w-8 h-8 text-slate-200 mb-2" />
                                <p className="text-sm font-bold text-slate-400">還沒有完成的讀經計畫</p>
                            </div>
                        ) : (
                            readingHistory.map((item, index) => (
                                <div key={item.userPlanId || `history-${index}`} className="app-card flex flex-col gap-2 p-4">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-black text-slate-800 text-base">{item.title?.replace(/\s*\(([^)]+)\)/g, '（$1）')}</h3>
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                                            {new Date(item.completedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-slate-500">閱讀天數</span>
                                            <span className="text-sm font-black text-indigo-600">{item.duration} 天</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-slate-500">完成經卷</span>
                                            <span className="text-sm font-black text-emerald-600">{item.books.length} 卷</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {item.books.map((b, i) => (
                                            <span key={`book-${b}-${i}`} className="text-[10px] font-bold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md">
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Achievement Header */}
                <section>
                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100 to-orange-100 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <Trophy className="w-8 h-8 text-amber-500 drop-shadow-sm" />
                                <div>
                                    <h3 className="text-base font-black text-amber-900">我的成就牆</h3>
                                    <p className="text-amber-700 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                                        已解鎖 {stats.unlocked} / {stats.total}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="p-2 bg-white/50 hover:bg-white rounded-full transition-colors disabled:opacity-50 shadow-sm"
                            >
                                <RefreshCw className={`w-4 h-4 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 bg-amber-200/50 rounded-full overflow-hidden border border-amber-200/50">
                            <div
                                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                                style={{ width: `${stats.percentage}%` }}
                            />
                        </div>
                    </div>
                </section>

                {/* Achievement List */}
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <RefreshCw className="animate-spin text-slate-300 w-6 h-6" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(groupedAchievements).map(([category, items]) => (
                            <div key={category} className="app-card overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <h4 className="font-black text-xs text-slate-700 tracking-wider">
                                        {categoryLabels[category] || category}
                                    </h4>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-3">
                                    {items.map(achievement => (
                                        <div
                                            key={achievement.id}
                                            className={`p-3 rounded-2xl flex flex-col items-center text-center transition-all ${achievement.unlocked
                                                ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400 shadow-sm shadow-amber-100'
                                                : 'bg-slate-50 border border-slate-100 opacity-70 grayscale-[50%]'
                                                }`}
                                        >
                                            <div className="text-3xl mb-2 drop-shadow-sm">{achievement.icon}</div>
                                            <p className={`text-[11px] font-black tracking-wide mb-1 ${achievement.unlocked ? 'text-amber-900' : 'text-slate-500'}`}>
                                                {achievement.name}
                                            </p>
                                            <p className="text-[9px] text-slate-400 font-bold leading-tight">
                                                {achievement.description}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
