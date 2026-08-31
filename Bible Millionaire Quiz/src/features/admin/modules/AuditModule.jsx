import React, { useState, useEffect } from 'react';
import { ClipboardList, Search, Eye, Clock, User, Shield, Terminal, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function AuditModule() {
    const { getToken } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [selectedLog, setSelectedLog] = useState(null);

    useEffect(() => {
        fetchLogs();
    }, [pagination.page]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/audit/logs?page=${pagination.page}&limit=${pagination.limit}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setLogs(data.data);
                setPagination(data.pagination);
            }
        } catch (error) {
            console.error('Fetch Audit Logs Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatAction = (action) => {
        const labels = {
            'DELETE_USER': '刪除用戶',
            'RESET_PASSWORD': '重設密碼',
            'UPDATE_USER_ROLE': '變更權限',
            'ADJUST_COINS': '調整智匯金幣',
            'ADJUST_AI_CREDITS': '調整智點',
            'UPDATE_AI_CONFIG': '修改模型費率',
            'LOGIN_ADMIN': '管理登入'
        };
        return labels[action] || action;
    };

    const getActionColor = (action) => {
        if (action.includes('DELETE')) return 'text-red-600 bg-red-50';
        if (action.includes('ADJUST')) return 'text-amber-600 bg-amber-50';
        if (action.includes('UPDATE')) return 'text-blue-600 bg-blue-50';
        return 'text-stone-600 bg-stone-50';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                        <ClipboardList className="text-indigo-500" />
                        系統審計日誌 (Audit Logs)
                    </h1>
                    <p className="text-xs text-stone-400 mt-1">追蹤所有管理員的操作行為與數據異動</p>
                </div>
                <button onClick={fetchLogs} className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors">
                    <Clock size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Logs Table */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-stone-50 text-stone-500 border-b border-stone-100">
                        <tr>
                            <th className="px-4 py-3 font-semibold">時間</th>
                            <th className="px-4 py-3 font-semibold">管理員</th>
                            <th className="px-4 py-3 font-semibold">操作行為</th>
                            <th className="px-4 py-3 font-semibold">目標 ID</th>
                            <th className="px-4 py-3 font-semibold">IP 位址</th>
                            <th className="px-4 py-3 font-semibold text-right">詳情</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                        {loading && logs.length === 0 ? (
                            <tr><td colSpan="6" className="py-20 text-center text-stone-400 animate-pulse">載入日誌數據中...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan="6" className="py-20 text-center text-stone-400 italic">尚無審計紀錄</td></tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-stone-50/50 transition-colors">
                                    <td className="px-4 py-3 text-stone-400 text-xs font-mono">
                                        {new Date(log.created_at).toLocaleString('zh-TW')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 bg-stone-100 rounded-full flex items-center justify-center text-[10px]">
                                                {log.admin_username?.[0]?.toUpperCase() || 'A'}
                                            </div>
                                            <span className="font-medium text-stone-700">{log.adminDisplayName || log.adminUsername}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getActionColor(log.action)}`}>
                                            {formatAction(log.action)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-stone-400 text-xs font-mono">{log.target_id || '-'}</td>
                                    <td className="px-4 py-3 text-stone-400 text-xs font-mono">{log.ip_address || 'unknown'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => setSelectedLog(log)} className="p-1.5 hover:bg-stone-100 text-stone-400 hover:text-indigo-600 rounded-lg transition-colors">
                                            <Eye size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="px-4 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-xs text-stone-400">顯示第 {(pagination.page-1)*pagination.limit + 1} 至 {Math.min(pagination.page*pagination.limit, pagination.total)} 筆，共 {pagination.total} 筆</span>
                    <div className="flex items-center gap-2">
                        <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} className="p-1 border border-stone-200 rounded hover:bg-white disabled:opacity-30"><ChevronLeft size={16}/></button>
                        <span className="text-xs font-bold text-stone-600">{pagination.page} / {pagination.totalPages || 1}</span>
                        <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} className="p-1 border border-stone-200 rounded hover:bg-white disabled:opacity-30"><ChevronRight size={16}/></button>
                    </div>
                </div>
            </div>

            {/* Log Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedLog(null)}>
                    <div className="bg-[#1e1e1e] text-stone-300 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#252525]">
                            <div className="flex items-center gap-3">
                                <Terminal size={18} className="text-emerald-400" />
                                <h3 className="font-bold text-white">日誌細節：{formatAction(selectedLog.action)}</h3>
                            </div>
                            <button onClick={() => setSelectedLog(null)} className="text-stone-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 font-mono text-xs leading-relaxed">
                            <div className="space-y-4">
                                <div>
                                    <span className="text-emerald-500 font-bold block mb-1"># 基本資訊 (Meta)</span>
                                    <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                        <p><span className="text-stone-500">操作路徑:</span> {selectedLog.target_table || 'N/A'}</p>
                                        <p><span className="text-stone-500">來源 IP:</span> {selectedLog.ip_address}</p>
                                        <p><span className="text-stone-500">操作時間:</span> {new Date(selectedLog.created_at).toISOString()}</p>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-emerald-500 font-bold block mb-1"># 異動快照 (Data Changes)</span>
                                    <pre className="bg-black/50 p-4 rounded-lg border border-white/5 overflow-x-auto text-emerald-300">
                                        {JSON.stringify(typeof selectedLog.changes === 'string' ? JSON.parse(selectedLog.changes) : selectedLog.changes, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-[#252525] border-t border-white/5 text-right">
                            <button onClick={() => setSelectedLog(null)} className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-white text-xs font-bold rounded-lg transition-colors">關閉視窗</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
