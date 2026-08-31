import React, { useState, useEffect } from 'react';
import { BookHeart, Zap, BookOpen, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import { useAuth } from '../../../contexts/AuthContext';
import DevotionCard from '../../devotion/components/DevotionCard';
import { io } from 'socket.io-client';

const SOCKET_URL = (API_BASE_URL || window.location.origin).replace(/\/api$/, '');

/**
 * DevotionModule — 靈修短文管理
 * 從 DashboardModule 抽出，獨立成資料庫主權分區的一員。
 */
export default function DevotionModule() {
    return (
        <div className="space-y-8 pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-stone-800 tracking-tight flex items-center gap-2">
                        <BookHeart size={24} className="text-rose-400" />
                        靈修短文管理
                    </h1>
                    <p className="text-xs text-stone-400 mt-1 font-medium">每日靈修內容生成、補生成與歷史紀錄管理</p>
                </div>
            </div>
            <DevotionalSection />
            <DevotionalHistorySection />
        </div>
    );
}

function DevotionalSection() {
    const [devotionalStatus, setDevotionalStatus] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [message, setMessage] = useState('');
    const [manualDate, setManualDate] = useState('');
    const [schedulerStatus, setSchedulerStatus] = useState(null);
    const { getToken } = useAuth();

    useEffect(() => {
        checkDevotionalStatus();
        loadSchedulerStatus();
    }, []);

    async function loadSchedulerStatus() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/scheduler/status`);
            if (res.ok) setSchedulerStatus(await res.json());
        } catch (e) {}
    }

    // Socket Listener for Real-time Status
    useEffect(() => {
        const socket = io(SOCKET_URL, {
            transports: ['polling', 'websocket'],
            withCredentials: true
        });

        socket.on('devotional:status', (payload) => {
            if (payload.status === 'generating') {
                setMessage(`⏳ ${payload.message || '系統正在背景為您生成中...'}`);
                setGenerating(true);
            } else if (payload.status === 'saving') {
                setMessage(`💾 ${payload.message || '正在寫入資料庫...'}`);
            } else if (payload.status === 'completed') {
                setMessage('✅ 靈修內容已生成！');
                setGenerating(false);
                checkDevotionalStatus(); // Auto refresh UI state
            }
        });

        return () => socket.disconnect();
    }, []);

    async function checkDevotionalStatus() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/ai/devotional`);
            const data = await res.json();
            if (data.success) {
                setDevotionalStatus({ exists: true, date: data.date, generatedAt: data.generatedAt });
            } else {
                setDevotionalStatus({ exists: false, date: data.date });
            }
        } catch (error) {
            setDevotionalStatus({ exists: false, error: error.message });
        }
    }

    async function generateDevotional(forceRefresh = false) {
        const token = getToken() || localStorage.getItem('adminToken');
        if (!token) { setMessage('❌ 請先登入'); return; }
        setGenerating(true);
        setMessage('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/scheduler/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }),
                    forceRefresh
                })
            });
            const ct = res.headers.get('content-type');
            if (!ct?.includes('application/json')) throw new Error(`伺服器回傳非預期格式 (${res.status})`);
            const data = await res.json();
            if (!data.success) {
                setMessage(`❌ 生成失敗: ${data.error || '發生未知錯誤'}`);
            } else if (data.action === 'generating') {
                setMessage('⏳ 已送出生成請求，請稍候...');
            } else if (data.action === 'generated') {
                setMessage('✅ 靈修內容已生成！');
                setGenerating(false);
            } else {
                setMessage('📦 使用已存在的內容');
                setGenerating(false);
            }
            checkDevotionalStatus();
        } catch (error) {
            setMessage(`❌ 錯誤: ${error.message}`);
        } finally {
            setGenerating(false);
        }
    }

    async function generateForDate() {
        if (!manualDate) { setMessage('❌ 請選擇日期'); return; }
        setGenerating(true);
        setMessage('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/scheduler/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: manualDate, forceRefresh: true })
            });
            const data = await res.json();
            if (!data.success) {
                setMessage(`❌ 生成失敗: ${data.error || '發生未知錯誤'}`);
            } else if (data.action === 'generating') {
                setMessage('⏳ 已送出生成請求，排隊處理中...');
            } else if (data.action === 'generated') {
                setMessage(`✅ ${manualDate} 靈修已生成！`);
            } else {
                setMessage(`📦 ${manualDate} 靈修已存在 (或已略過)`);
            }
        } catch (error) {
            setMessage(`❌ 錯誤: ${error.message}`);
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-6 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <BookOpen size={20} className="text-amber-500" />
                今日靈修狀態
            </h3>

            {schedulerStatus && (
                <div className="text-xs text-stone-500 bg-white/50 px-3 py-2 rounded-lg">
                    <span className="font-medium">排程 {schedulerStatus.version}</span>
                    <span className="mx-2">|</span>
                    <span className={schedulerStatus.initialized ? 'text-emerald-600' : 'text-red-600'}>
                        {schedulerStatus.initialized ? '✓ 已啟用' : '✗ 未啟用'}
                    </span>
                    <span className="mx-2">|</span>
                    <span>台灣日期: {schedulerStatus.taiwanDate}</span>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="space-y-1">
                    {devotionalStatus?.exists ? (
                        <>
                            <div className="text-sm text-emerald-600 font-medium flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                今日靈修已生成
                            </div>
                            <div className="text-xs text-stone-500">日期: {devotionalStatus.date}</div>
                        </>
                    ) : (
                        <div className="text-sm text-amber-600 font-medium flex items-center gap-2">
                            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                            今日靈修尚未生成
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => generateDevotional(false)} disabled={generating} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl font-medium transition-colors shadow-sm flex items-center gap-2">
                        {generating ? <><span className="animate-spin">⏳</span>生成中...</> : <><BookOpen size={16} />生成今日靈修</>}
                    </button>
                    <button onClick={() => generateDevotional(true)} disabled={generating} className="px-4 py-2 bg-stone-500 hover:bg-stone-600 disabled:bg-stone-300 text-white rounded-xl font-medium transition-colors shadow-sm" title="強制清除舊資料並重新生成">
                        🔄 強制重新生成
                    </button>
                </div>
            </div>

            <div className="border-t border-amber-200 pt-4">
                <div className="text-sm font-medium text-stone-700 mb-2">📅 補生成指定日期</div>
                <div className="flex gap-2 items-center flex-wrap">
                    <input
                        type="date"
                        value={manualDate}
                        onChange={e => setManualDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        className="px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                        onClick={generateForDate}
                        disabled={generating || !manualDate}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white rounded-xl font-medium transition-colors shadow-sm"
                    >
                        生成此日期
                    </button>
                </div>
            </div>

            {message && (
                <div className={`p-3 rounded-xl text-sm ${message.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : message.startsWith('📦') ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                    {message}
                </div>
            )}
        </div>
    );
}

function DevotionalHistorySection() {
    const { getToken } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
    const [selectedDevotional, setSelectedDevotional] = useState(null);

    useEffect(() => { loadData(); }, [pagination.page]);

    // [V3] Socket Listener for Real-time List Refresh
    useEffect(() => {
        const socket = io(SOCKET_URL, { transports: ['polling', 'websocket'], withCredentials: true });
        
        socket.on('devotional:status', (payload) => {
            if (payload.status === 'completed') {
                loadData(); // Auto refresh list
            }
        });

        return () => socket.disconnect();
    }, [pagination.page]);

    async function loadData() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: pagination.page, limit: pagination.limit });
            const res = await fetch(`${API_BASE_URL}/api/admin/devotionals?${params}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const result = await res.json();
                setData(result.data || []);
                setPagination(result.pagination);
            }
        } catch (error) {
            console.error('Failed to load devotionals:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteDevotional(date) {
        if (!window.confirm(`確定要刪除 ${date} 的靈修內容嗎？此操作不可復原。`)) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/scheduler/${date}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const result = await res.json();
            if (result.success) { alert('已成功刪除'); loadData(); }
            else alert(`刪除失敗: ${result.error}`);
        } catch (error) {
            alert(`刪除發生錯誤: ${error.message}`);
        }
    }

    const formatDate = (ts) => {
        if (!ts) return '-';
        const date = new Date(ts);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
    };

    return (
        <>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-stone-50 border-b border-stone-200">
                    <h3 className="font-bold text-stone-700 flex items-center gap-2">
                        <BookOpen size={16} /> 靈修短文紀錄
                    </h3>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-600 text-left border-b border-stone-200">
                        <tr>
                            <th className="px-4 py-3 font-semibold w-40">日期</th>
                            <th className="px-4 py-3 font-semibold">主題/經文</th>
                            <th className="px-4 py-3 font-semibold w-32 text-right">生成時間</th>
                            <th className="px-4 py-3 font-semibold w-20 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {loading ? (
                            <tr><td colSpan="4" className="px-4 py-12 text-center text-stone-400">載入中...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan="4" className="px-4 py-12 text-center text-stone-400">找不到資料</td></tr>
                        ) : data.map((row, idx) => (
                            <tr key={idx} onClick={() => setSelectedDevotional(row)}
                                className="hover:bg-stone-50 transition-colors cursor-pointer group">
                                <td className="px-4 py-3 font-bold text-indigo-700">{row.dateKey || row.date}</td>
                                <td className="px-4 py-3 text-stone-600">
                                    <span className="font-medium text-stone-800">
                                        {row.metadata?.reference ||
                                         (typeof row.content === 'object' ? row.content?.scriptureReference : null) ||
                                         '今日經文'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right text-stone-400 text-xs font-mono">{formatDate(row.createdAt || row.generated_at)}</td>
                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => handleDeleteDevotional(row.dateKey || row.date)}
                                        className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="刪除"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 flex items-center justify-between text-sm">
                    <span className="text-stone-500">共 {pagination.total} 筆資料</span>
                    <div className="flex gap-2 items-center">
                        <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                            className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50"><ChevronLeft size={15} /></button>
                        <span className="text-stone-600 font-medium px-2">{pagination.page} / {pagination.totalPages || 1}</span>
                        <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                            className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50"><ChevronRight size={15} /></button>
                    </div>
                </div>
            </div>

            {selectedDevotional && (() => {
                let parsedContent = selectedDevotional.content;
                if (typeof parsedContent === 'string') {
                    try {
                        parsedContent = JSON.parse(parsedContent);
                        if (typeof parsedContent === 'string') parsedContent = JSON.parse(parsedContent);
                    } catch (e) { parsedContent = null; }
                }
                return (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDevotional(null)}>
                        <div className="bg-[#FDFBF7] w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-white">
                                <h3 className="text-xl font-bold text-stone-800">{selectedDevotional.date} 靈修短文</h3>
                                <button onClick={() => setSelectedDevotional(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                                    <X size={20} className="text-stone-500" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6">
                                {parsedContent
                                    ? <DevotionCard devotionalContent={parsedContent} isLoading={false} fontSize="medium" />
                                    : <div className="text-stone-500 text-center py-8">無法解析靈修內容</div>}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}
