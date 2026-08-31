import React, { useState, useEffect } from 'react';
import { database } from '../../services/database/DatabaseAdapter';
import { Loader2, RefreshCw, Database } from 'lucide-react';

export default function QuestionStats() {
    const [stats, setStats] = useState({
        total: 0,
        byDifficulty: { easy: 0, medium: 0, hard: 0, very_hard: 0 },
        byCategory: {}, // Map: category -> count
        byBook: [], // Array of { book, count, easy, medium, hard }
        recent: []
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const allQuestions = await database.query('questions');

            // Sort by createdAt descending
            const sortedQuestions = allQuestions.sort((a, b) =>
                (b.createdAt || 0) - (a.createdAt || 0)
            );

            const total = sortedQuestions.length;
            const byDifficulty = { easy: 0, medium: 0, hard: 0, very_hard: 0 };
            const byCategory = {};
            const bookStats = {}; // Map: bookName -> { count, easy, medium, hard }
            const recent = [];

            sortedQuestions.forEach((q, index) => {
                // Count difficulty
                if (byDifficulty[q.difficulty] !== undefined) {
                    byDifficulty[q.difficulty]++;
                }

                // Count by Category (New Phase 2 Reconnect)
                const cat = q.category || 'verse_fact';
                byCategory[cat] = (byCategory[cat] || 0) + 1;

                // Count by Book
                const book = q.book || 'Unknown';
                if (!bookStats[book]) {
                    bookStats[book] = { book, count: 0, easy: 0, medium: 0, hard: 0, very_hard: 0 };
                }
                bookStats[book].count++;
                if (q.difficulty && bookStats[book][q.difficulty] !== undefined) {
                    bookStats[book][q.difficulty]++;
                }

                // Get recent 5
                if (index < 5) {
                    recent.push(q);
                }
            });

            // Convert bookStats map to sorted array
            const byBook = Object.values(bookStats).sort((a, b) => b.count - a.count);

            setStats({ total, byDifficulty, byCategory, byBook, recent });
        } catch (error) {
            console.error("Error fetching stats:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>正在讀取資料庫數據...</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8">
            {/* Category Summary (Reconnect View) */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <Database size={16} /> 題型分佈 (按機制分類)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(stats.byCategory).map(([cat, count]) => (
                        <div key={cat} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">{cat.replace('_', ' ')}</div>
                            <div className="text-xl font-bold text-blue-400">{count}</div>
                        </div>
                    ))}
                    {Object.keys(stats.byCategory).length === 0 && (
                        <div className="col-span-5 text-center py-4 text-slate-600">無類別數據</div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-slate-400 text-sm mb-1">總題數</div>
                    <div className="text-3xl font-bold text-white">{stats.total}</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-slate-400 text-sm mb-1">Easy (簡單)</div>
                    <div className="text-3xl font-bold text-green-400">{stats.byDifficulty.easy}</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-slate-400 text-sm mb-1">Medium (中等)</div>
                    <div className="text-3xl font-bold text-yellow-400">{stats.byDifficulty.medium}</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-slate-400 text-sm mb-1">Hard+ (困難)</div>
                    <div className="text-3xl font-bold text-red-400">{stats.byDifficulty.hard + stats.byDifficulty.very_hard}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Book Statistics */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Database size={18} className="text-blue-400" />
                        各書卷題數統計
                    </h3>
                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">書卷</th>
                                    <th className="px-4 py-3 text-right">總數</th>
                                    <th className="px-4 py-3 text-right text-green-500">易</th>
                                    <th className="px-4 py-3 text-right text-yellow-500">中</th>
                                    <th className="px-4 py-3 text-right text-red-500">難</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {stats.byBook.map((book) => (
                                    <tr key={book.book} className="hover:bg-slate-700/30 transition">
                                        <td className="px-4 py-3 font-medium text-slate-200">{book.book}</td>
                                        <td className="px-4 py-3 text-right font-bold">{book.count}</td>
                                        <td className="px-4 py-3 text-right text-green-400/80">{book.easy}</td>
                                        <td className="px-4 py-3 text-right text-yellow-400/80">{book.medium}</td>
                                        <td className="px-4 py-3 text-right text-red-400/80">{book.hard}</td>
                                    </tr>
                                ))}
                                {stats.byBook.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                                            尚無數據
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Recent Questions */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <RefreshCw size={18} className="text-purple-400" />
                            最新加入的題目
                        </h3>
                        <button
                            onClick={fetchStats}
                            className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                        >
                            重新整理
                        </button>
                    </div>

                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                        {stats.recent.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                目前資料庫中沒有題目
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-700">
                                {stats.recent.map(q => (
                                    <div key={q.id} className="p-4 hover:bg-slate-700/50 transition">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full border ${q.difficulty === 'easy' ? 'bg-green-900/30 text-green-400 border-green-800' :
                                                q.difficulty === 'medium' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800' :
                                                    'bg-red-900/30 text-red-400 border-red-800'
                                                }`}>
                                                {q.difficulty?.toUpperCase()}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {q.book} {q.chapter}章
                                            </span>
                                        </div>
                                        <p className="text-slate-200 font-medium mb-2 text-sm">{q.question}</p>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            {q.options?.map((opt, i) => (
                                                <div key={i} className={`px-2 py-1 rounded ${opt === q.answer
                                                    ? 'bg-green-900/20 text-green-300'
                                                    : 'text-slate-500'
                                                    }`}>
                                                    {opt}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
