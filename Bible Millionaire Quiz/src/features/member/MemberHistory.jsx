import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowLeft, X } from 'lucide-react';
import DevotionCard from '../devotion/components/DevotionCard';

import { useAuth } from '../../contexts/AuthContext';

/**
 * 靈修歷史組件
 */
export default function MemberHistory({ onBack }) {
    const { user, getToken } = useAuth();
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 10, totalPages: 1 });
    const [historySearch, setHistorySearch] = useState('');
    const [selectedDevotional, setSelectedDevotional] = useState(null);

    useEffect(() => {
        if (user) {
            loadHistory();
        }
    }, [user, historyPagination.page]);

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const token = getToken();
            const queryParams = new URLSearchParams({
                page: historyPagination.page,
                limit: historyPagination.limit,
                search: historySearch
            });
            const res = await fetch(`/api/content/devotional/history?${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setHistory(Array.isArray(data.history) ? data.history : []);
                if (data.pagination) {
                    setHistoryPagination(prev => ({ ...prev, totalPages: data.pagination.totalPages || 1 }));
                }
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp * 1000).toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-[#FDFBF7] text-stone-800">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500 hover:text-stone-800"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                            📖 靈修歷史
                        </h1>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                            type="text"
                            placeholder="搜尋經文或內容..."
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadHistory()}
                            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none shadow-sm"
                        />
                    </div>

                    {/* History List */}
                    {historyLoading ? (
                        <div className="text-center py-12 text-stone-400">載入中...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12 text-stone-400 bg-white rounded-2xl border border-stone-100 p-8">
                            <p>尚無靈修歷史</p>
                            <p className="text-sm mt-2">完成每日靈修後會自動記錄於此</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map((item, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => setSelectedDevotional(item)}
                                    className="bg-white p-4 rounded-xl border border-stone-100 cursor-pointer hover:border-amber-200 hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-center justify-between">
                                        <p className="font-bold text-stone-800 group-hover:text-amber-700 transition-colors">{item.date}</p>
                                        <span className="text-xs text-stone-400">{formatDate(item.generated_at)}</span>
                                    </div>
                                    <p className="text-amber-600 text-sm mt-1 font-medium">{item.scriptureReference || '經文'}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {historyPagination.totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 py-4">
                            <button
                                onClick={() => setHistoryPagination(p => ({ ...p, page: p.page - 1 }))}
                                disabled={historyPagination.page === 1}
                                className="p-2 border border-stone-200 rounded-lg disabled:opacity-50 hover:bg-white transition-colors"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-stone-600 font-medium">{historyPagination.page} / {historyPagination.totalPages}</span>
                            <button
                                onClick={() => setHistoryPagination(p => ({ ...p, page: p.page + 1 }))}
                                disabled={historyPagination.page >= historyPagination.totalPages}
                                className="p-2 border border-stone-200 rounded-lg disabled:opacity-50 hover:bg-white transition-colors"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Devotional Detail Modal */}
            {selectedDevotional && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDevotional(null)}>
                    <div className="bg-[#FDFBF7] w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-white">
                            <h3 className="text-xl font-bold text-stone-800">{selectedDevotional.date} 靈修短文</h3>
                            <button onClick={() => setSelectedDevotional(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                                <X size={20} className="text-stone-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <DevotionCard devotionalContent={selectedDevotional.content} isLoading={false} fontSize="medium" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
