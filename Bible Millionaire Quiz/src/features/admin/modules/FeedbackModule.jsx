import React, { useState, useEffect } from 'react';
import { MessageSquare, Bug, Lightbulb, HelpCircle, Trash2, CheckCircle, Clock, RefreshCw, Filter } from 'lucide-react';

/**
 * 意見回饋管理模組
 * 管理員查看和處理用戶提交的問題/建議
 */
export default function FeedbackModule() {
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, pending, resolved

    const typeConfig = {
        bug: { label: '問題回報', icon: Bug, color: 'text-red-500 bg-red-100' },
        suggestion: { label: '功能建議', icon: Lightbulb, color: 'text-amber-500 bg-amber-100' },
        question: { label: '使用疑問', icon: HelpCircle, color: 'text-blue-500 bg-blue-100' }
    };

    const statusConfig = {
        pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
        resolved: { label: '已處理', color: 'bg-green-100 text-green-700 border-green-300' }
    };

    const fetchFeedback = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/feedback');
            if (response.ok) {
                const data = await response.json();
                setFeedback(data.sort((a, b) => b.createdAt - a.createdAt));
            }
        } catch (error) {
            console.error('Error fetching feedback:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeedback();
    }, []);

    const updateStatus = async (id, newStatus) => {
        try {
            await fetch(`/api/feedback/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            setFeedback(prev => prev.map(f =>
                f.id === id ? { ...f, status: newStatus } : f
            ));
        } catch (error) {
            console.error('Error updating feedback:', error);
        }
    };

    const deleteFeedback = async (id) => {
        if (!confirm('確定要刪除此回饋？')) return;
        try {
            await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
            setFeedback(prev => prev.filter(f => f.id !== id));
        } catch (error) {
            console.error('Error deleting feedback:', error);
        }
    };

    const filteredFeedback = feedback.filter(f => {
        if (filter === 'all') return true;
        return f.status === filter;
    });

    const stats = {
        total: feedback.length,
        pending: feedback.filter(f => f.status === 'pending').length,
        resolved: feedback.filter(f => f.status === 'resolved').length
    };

    return (
        <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-xl md:text-2xl font-bold text-stone-800 flex items-center gap-2">
                    <MessageSquare className="text-purple-500" size={24} />
                    意見回饋
                </h1>
                <button
                    onClick={fetchFeedback}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
                >
                    <RefreshCw size={16} />
                    重新整理
                </button>
            </div>

            {/* Stats Cards - Mobile Optimized */}
            <div className="grid grid-cols-3 gap-2 md:gap-4">
                <div className="bg-white rounded-xl p-3 md:p-4 border border-stone-200 shadow-sm">
                    <div className="text-2xl md:text-3xl font-bold text-stone-800">{stats.total}</div>
                    <div className="text-xs md:text-sm text-stone-500">總回饋數</div>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 md:p-4 border border-yellow-200">
                    <div className="text-2xl md:text-3xl font-bold text-yellow-600">{stats.pending}</div>
                    <div className="text-xs md:text-sm text-yellow-600">待處理</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 md:p-4 border border-green-200">
                    <div className="text-2xl md:text-3xl font-bold text-green-600">{stats.resolved}</div>
                    <div className="text-xs md:text-sm text-green-600">已處理</div>
                </div>
            </div>

            {/* Filter - Mobile Friendly */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {[
                    { id: 'all', label: '全部' },
                    { id: 'pending', label: '待處理' },
                    { id: 'resolved', label: '已處理' }
                ].map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === f.id
                            ? 'bg-purple-600 text-white'
                            : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-50'
                            }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Feedback List */}
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-stone-500">載入中...</div>
                ) : filteredFeedback.length === 0 ? (
                    <div className="p-8 text-center text-stone-500">
                        {filter === 'all' ? '目前沒有回饋' : `沒有${filter === 'pending' ? '待處理' : '已處理'}的回饋`}
                    </div>
                ) : (
                    <div className="divide-y divide-stone-200">
                        {filteredFeedback.map(item => {
                            const typeInfo = typeConfig[item.type] || typeConfig.suggestion;
                            const TypeIcon = typeInfo.icon;
                            const statusInfo = statusConfig[item.status] || statusConfig.pending;

                            return (
                                <div key={item.id} className="p-4 hover:bg-stone-50 transition-colors">
                                    {/* Top Row - Type & Status */}
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                            <TypeIcon size={12} />
                                            {typeInfo.label}
                                        </span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                                            {statusInfo.label}
                                        </span>
                                        <span className="text-xs text-stone-400 ml-auto">
                                            {new Date(item.createdAt).toLocaleString()}
                                        </span>
                                    </div>

                                    {/* Message */}
                                    <p className="text-stone-700 text-sm md:text-base mb-3 whitespace-pre-wrap">
                                        {item.message}
                                    </p>

                                    {/* Contact Info */}
                                    {item.contact && (
                                        <div className="text-xs text-stone-500 mb-3">
                                            📧 聯絡方式：{item.contact}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex flex-wrap gap-2">
                                        {item.status === 'pending' ? (
                                            <button
                                                onClick={() => updateStatus(item.id, 'resolved')}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                                            >
                                                <CheckCircle size={14} />
                                                標記已處理
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => updateStatus(item.id, 'pending')}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                                            >
                                                <Clock size={14} />
                                                改為待處理
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteFeedback(item.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                            刪除
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
