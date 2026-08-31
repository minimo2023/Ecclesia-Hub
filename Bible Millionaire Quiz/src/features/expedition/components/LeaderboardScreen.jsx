import React, { useState, useEffect } from 'react';
import { Trophy, Target, ArrowLeft, RefreshCw, Users, User } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function LeaderboardScreen({ onBack }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('team'); // 'team' or 'individual'

    const fetchLeaderboard = async (type = activeTab) => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`${API_BASE_URL}/api/expedition/leaderboard?limit=50&type=${type}`);
            const data = await res.json();

            if (data.success) {
                setRecords(data.leaderboard);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaderboard(activeTab);
    }, [activeTab]);

    const getRankBadge = (rank) => {
        if (rank === 1) return { bg: 'bg-yellow-500', text: 'text-black', shadow: 'shadow-yellow-500/30' };
        if (rank === 2) return { bg: 'bg-gray-300', text: 'text-black', shadow: 'shadow-gray-300/30' };
        if (rank === 3) return { bg: 'bg-amber-700', text: 'text-white', shadow: 'shadow-amber-700/30' };
        return { bg: 'bg-slate-700', text: 'text-slate-300', shadow: '' };
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 pt-8 md:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex items-center justify-between mb-6">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" /> 返回
                    </button>
                    <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                        <Trophy className="w-7 h-7 text-amber-400" />
                        英雄榜
                    </h1>
                    <button onClick={() => fetchLeaderboard(activeTab)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors" title="刷新">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </header>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
                    <button
                        onClick={() => setActiveTab('team')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold transition-all ${activeTab === 'team' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Users className="w-4 h-4" /> 團隊排行
                    </button>
                    <button
                        onClick={() => setActiveTab('individual')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold transition-all ${activeTab === 'individual' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'}`}
                    >
                        <User className="w-4 h-4" /> 個人排行
                    </button>
                </div>

                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl mb-6 text-center">
                        獲取排行榜失敗: {error}
                    </div>
                )}

                {loading && records.length === 0 && (
                    <div className="p-8 text-center text-slate-500">載入中...</div>
                )}
                {!loading && records.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                        {activeTab === 'team' ? '尚無記錄，快來成為第一支傳奇隊伍！' : '尚無記錄，開始你的第一次遠征吧！'}
                    </div>
                )}

                {/* Mobile: card list */}
                {records.length > 0 && (
                    <div className="md:hidden space-y-2">
                        {records.map((rec) => {
                            const badge = getRankBadge(rec.rank);
                            return (
                                <div key={rec.rank} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-3 flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 shadow-lg ${badge.bg} ${badge.text}`}>
                                        {rec.rank}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-white truncate">{activeTab === 'team' ? rec.teamName : rec.displayName}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{rec.maxQuestions} 題</div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800 text-xs font-bold">
                                        <Target className="w-3 h-3" /> S{rec.maxStage}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Desktop: table */}
                {records.length > 0 && (
                    <div className="hidden md:block bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800 text-slate-400 border-b border-slate-700 text-sm uppercase tracking-wider">
                                        <th className="p-4 w-16 text-center">排名</th>
                                        <th className="p-4">{activeTab === 'team' ? '隊伍' : '玩家'}</th>
                                        <th className="p-4 text-center">題數</th>
                                        <th className="p-4 text-center">階段</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    {records.map((rec) => {
                                        const badge = getRankBadge(rec.rank);
                                        return (
                                            <tr key={rec.rank} className="hover:bg-slate-700/30 transition-colors">
                                                <td className="p-4 text-center">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mx-auto shadow-lg ${badge.bg} ${badge.text} ${badge.shadow}`}>
                                                        {rec.rank}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="font-bold text-lg text-white">{activeTab === 'team' ? rec.teamName : rec.displayName}</div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="text-xl font-bold text-amber-400">{rec.maxQuestions}</div>
                                                    <div className="text-xs text-slate-500">題</div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800 text-sm font-bold">
                                                        <Target className="w-4 h-4" /> Stage {rec.maxStage}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
