import React, { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Trophy, Target, Gamepad2, BookOpen } from 'lucide-react';
import AchievementWall from './AchievementWall';
import { useAuth } from '../../contexts/AuthContext';
import AuthModal from '../auth/AuthModal';

/**
 * 會員統計組件
 * 整合遊戲數據統計與成就系統
 */
export default function MemberStats({ onBack, variant, onNavigate }) {
    const isNested = variant === 'nested';
    const { user, getToken } = useAuth();
    const [readingHistory, setReadingHistory] = useState([]);

    useEffect(() => {
        const loadReadingHistory = async () => {
            if (!user) return;
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
        };
        loadReadingHistory();
    }, [user, getToken]);

    if (!user) {
        return (
            <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6 text-center">
                <AuthModal 
                    isOpen={true} 
                    onClose={onBack} 
                    onLoginSuccess={() => {}} 
                />
            </div>
        );
    }

    return (
        <div className={`${isNested ? '' : 'min-h-screen'} bg-[#FDFBF7] text-stone-800 flex flex-col`}>
            {/* Header - Only show if not nested */}
            {!isNested && (
                <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-10">
                    <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500 hover:text-stone-800"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                                📊 學習統計
                            </h1>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className={`max-w-6xl mx-auto w-full px-6 ${isNested ? 'py-4' : 'py-8'} space-y-8 flex-1`}>

                {/* Game Stats Cards */}
                <section>
                    <h2 className="text-lg font-bold text-stone-700 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-amber-500" />
                        遊戲數據
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-2 text-stone-500">
                                <Gamepad2 className="w-5 h-5" />
                                <span className="text-sm">總遊戲次數</span>
                            </div>
                            <p className="text-3xl font-bold text-stone-800">{user.totalGames || 0}</p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-2 text-stone-500">
                                <Target className="w-5 h-5" />
                                <span className="text-sm">答對題數</span>
                            </div>
                            <p className="text-3xl font-bold text-stone-800">{user.totalCorrect || 0}</p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-2 text-stone-500">
                                <TrendingUp className="w-5 h-5" />
                                <span className="text-sm">答對率</span>
                            </div>
                            <p className="text-3xl font-bold text-amber-600">
                                {user.totalGames > 0 || user.totalAnswered > 0
                                    ? Math.min(100, Math.round((user.totalCorrect / Math.max(user.totalAnswered || 0, user.totalGames * 15, user.totalCorrect || 1)) * 100))
                                    : 0}%
                            </p>
                            <p className="text-xs text-stone-400 mt-1">基於所有遊戲模式計算</p>
                        </div>
                    </div>
                </section>

                {/* Wrong Answers Analysis */}
                <section>
                    <h2 className="text-lg font-bold text-stone-700 mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-red-500" />
                        學習分析
                    </h2>
                    <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-stone-800 font-bold mb-1">錯題回顧與解析</h3>
                            <p className="text-stone-500 text-sm">查看過去答錯的題目，了解正確答案與解析，幫助您更深入學習神的話語。</p>
                        </div>
                        {onNavigate && (
                            <button 
                                onClick={() => onNavigate('wrong-answers')}
                                className="w-full sm:w-auto px-6 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors shrink-0"
                            >
                                前往查看
                            </button>
                        )}
                    </div>
                </section>

                {/* Reading History */}
                <section>
                    <h2 className="text-lg font-bold text-stone-700 mb-4 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-500" />
                        閱讀紀錄
                    </h2>
                    <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="space-y-4">
                            {readingHistory.length === 0 ? (
                                <div className="text-center py-8 text-stone-400">
                                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>尚無已完成的讀經計畫</p>
                                </div>
                            ) : (
                                readingHistory.map((item, index) => (
                                    <div key={item.userPlanId || `desktop-history-${index}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#F8FAFC] rounded-xl border border-stone-100 gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-bold text-stone-800 text-lg">{item.title}</h3>
                                                <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                                                    {new Date(item.completedAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {item.books.map((b, i) => (
                                                    <span key={`desktop-book-${b}-${i}`} className="text-xs font-bold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md">
                                                        {b}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-4 shrink-0 sm:border-l sm:border-stone-200 sm:pl-4">
                                            <div className="text-center">
                                                <div className="text-xs text-stone-500 font-bold mb-1">時長</div>
                                                <div className="text-lg font-black text-indigo-600">{item.duration} <span className="text-sm font-bold text-indigo-400">天</span></div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xs text-stone-500 font-bold mb-1">完成</div>
                                                <div className="text-lg font-black text-emerald-600">{item.books.length} <span className="text-sm font-bold text-emerald-400">卷</span></div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                {/* Achievement Wall */}
                <section>
                    <h2 className="text-lg font-bold text-stone-700 mb-4 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-500" />
                        成就獎章
                    </h2>
                    <AchievementWall />
                </section>

            </div>
        </div>
    );
}
