import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';
import { Search, ChevronLeft, ChevronRight, X, BookOpen, FileText, Database, Download, HardDrive, BarChart3, FolderOpen, RefreshCw, PenSquare, CheckCircle, AlertTriangle, HelpCircle, Loader2, Info, Zap } from 'lucide-react';

import { useAuth } from '../../../contexts/AuthContext';
import BookOverviewTab from '../components/BookOverviewTab';
import QuestionEditDrawer from '../components/QuestionEditDrawer';

// --- 組件：重複題目預覽 (Duplicate Preview) ---
const DuplicatePreview = ({ id, API_BASE_URL, token }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) return null;
        let isMounted = true;
        const fetchPreview = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/questions/${id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!isMounted) return;
                
                if (res.ok) {
                    const result = await res.json();
                    if (result.success) setData(result.question);
                } else {
                    setError('無法載入詳細內容');
                }
            } catch (e) {
                if (isMounted) setError('預覽讀取失敗');
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchPreview();
        return () => { isMounted = false; };
    }, [id, API_BASE_URL, token]);

    if (loading) return (
        <div className="mt-2 p-3 text-[10px] text-amber-500/80 bg-amber-50/30 rounded border border-dashed border-amber-200 flex items-center gap-2 shadow-inner">
            <Loader2 className="animate-spin text-amber-400" size={12} /> 
            正在安全檢索對照內容...
        </div>
    );

    // Regex to check if ID is a valid UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    if (!isUUID) return (
        <div className="mt-2 p-3 text-[10px] text-stone-500 bg-stone-100/50 rounded border border-stone-200 flex flex-col gap-1 italic">
            <div className="flex items-center gap-2">
                <AlertTriangle size={12} className="text-stone-400" />
                無法直接對照：ID ({id.substring(0, 8)}...) 為舊版格式需重新掃描。
            </div>
            <button 
                onClick={() => window.open(`/#/content?search=${id}`, '_blank')}
                className="text-[9px] text-amber-600 hover:text-amber-700 font-bold self-start mt-1"
            >
                🔍 或在題庫中搜尋此 ID
            </button>
        </div>
    );

    if (error || !data) return (
        <div className="mt-2 p-3 text-[10px] text-red-500 bg-red-50/50 rounded border border-red-200 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center gap-2 font-bold">
                <AlertTriangle size={12} /> 
                {error || '預覽載入失敗 (可能原題已被移除或格式不符)'}
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => window.open(`/#/content?id=${id}`, '_blank')}
                    className="text-[9px] bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors flex items-center gap-1"
                >
                    <Search size={10} /> 手動搜尋原題
                </button>
            </div>
        </div>
    );

    return (
        <div className="mt-3 pt-3 border-t-2 border-amber-200/30 bg-gradient-to-br from-amber-50/50 to-white rounded-xl p-4 transition-all shadow-md group hover:shadow-lg hover:border-amber-300/50 duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
            
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500 text-white rounded-full shadow-sm">
                        <Info size={10} />
                        <span className="text-[10px] font-black uppercase tracking-wider">原型題目 (MASTER)</span>
                    </div>
                    <span className="text-[10px] text-stone-300 font-mono tracking-tighter">REF: {id.substring(0, 16).toUpperCase()}</span>
                </div>
                <div className="flex gap-1.5">
                    <button 
                        title="開啟原題視窗"
                        onClick={() => window.open(`/#/content?id=${id}`, '_blank')}
                        className="p-1 text-stone-300 hover:text-amber-500 transition-colors bg-white rounded border border-stone-100 shadow-sm"
                    >
                        <Search size={12} />
                    </button>
                </div>
            </div>
            
            <div className="text-[14px] text-stone-800 font-bold mb-3 leading-relaxed bg-white/80 p-3 rounded-lg border border-amber-100/50 shadow-inner">
                {data.question}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-emerald-100/80 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm transition-transform group-hover:scale-[1.02]">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span className="text-[10px] font-black opacity-50 uppercase">Answer</span>
                    <span className="text-[12px] font-black tracking-tight">{data.answer}</span>
                </div>
                
                <div className="flex items-center gap-2 bg-stone-100/80 text-stone-600 px-3 py-1.5 rounded-lg border border-stone-200 shadow-sm">
                    <BookOpen size={14} className="text-stone-400" />
                    <span className="text-[11px] font-bold">{data.book} · 第 {data.chapter} 章</span>
                </div>
            </div>

            {data.evidence && (
                <div className="mt-3 p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-600 leading-relaxed italic flex gap-2 items-start">
                    <BookOpen size={14} className="text-stone-400 mt-0.5 shrink-0" />
                    <span>{data.evidence}</span>
                </div>
            )}

            {data.options && data.options.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                    {data.options.map((opt, idx) => (
                        <div key={idx} className={`px-2 py-1 rounded text-[10px] border shadow-sm ${opt === data.answer ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-white border-stone-100 text-stone-400'}`}>
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function KnowledgeModule() {
    const { getToken } = useAuth();
    const [activeTab, setActiveTab] = useState('overview'); // 'questions' | 'objects' | 'locations' | 'overview' | 'backup'
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 0 });

    // Question Stats
    const [stats, setStats] = useState({ total: 0, byCategory: {}, byBook: [] });
    const [statsLoading, setStatsLoading] = useState(false);

    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'all';

    // Question Filters - category now from tabs
    const [qFilters, setQFilters] = useState({ 
        search: '', 
        book: 'all', 
        category: initialTab,
        source: 'all'
    });
    // AI Audit Status (Red Dot)
    const [auditStatus, setAuditStatus] = useState({ flaggedCount: 0, hasAlert: false });

    // Sync Audit status every few minutes or on tab change
    const loadAuditStatus = async () => {
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/audit-status`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const result = await res.json();
                setAuditStatus({
                    flaggedCount: result.flaggedCount || 0,
                    hasAlert: result.hasAlert || false
                });
            }
        } catch (e) { console.error('Failed to load audit status:', e); }
    };

    useEffect(() => {
        loadAuditStatus();
        const timer = setInterval(loadAuditStatus, 60000); // 1 min sync
        return () => clearInterval(timer);
    }, []);
    // Book-specific stats (when book is selected)
    const [bookStats, setBookStats] = useState(null);

    // Batch Selection
    const [selectedIds, setSelectedIds] = useState([]);
    const [isDeletingBatch, setIsDeletingBatch] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditMessage, setAuditMessage] = useState(null);

    // Question Editing
    const [editingQuestion, setEditingQuestion] = useState(null);

    const books = ['all', '創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記', '撒母耳記上', '撒母耳記下', '列王紀上', '列王紀下', '歷代志上', '歷代志下', '以斯拉記', '尼希米記', '以斯帖記', '約伯記', '詩篇', '箴言', '傳道書', '雅歌', '以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書', '馬太福音', '馬可福音', '路加福音', '約翰福音', '使徒行傳', '羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書', '提多書', '腓利門書', '希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', '約翰二書', '約翰三書', '猶大書', '啟示錄'];

    const categoryTabs = [
        { id: 'all', label: '全部', color: 'bg-stone-100 text-stone-700', activeColor: 'bg-stone-600 text-white' },
        { id: 'verse_fill', label: '經文填空', color: 'bg-indigo-50 text-indigo-700', activeColor: 'bg-indigo-500 text-white' },
        { id: 'person', label: '人物相關', color: 'bg-blue-50 text-blue-700', activeColor: 'bg-blue-500 text-white' },
        { id: 'geography', label: '地理背景', color: 'bg-emerald-50 text-emerald-700', activeColor: 'bg-emerald-500 text-white' },
        { id: 'theology', label: '神學道理', color: 'bg-purple-50 text-purple-700', activeColor: 'bg-purple-500 text-white' },
        { id: 'verse_fact', label: '經文事實', color: 'bg-amber-50 text-amber-700', activeColor: 'bg-amber-500 text-white' },
        { id: 'pending', label: '🛑 待審題目', color: 'bg-rose-50 text-rose-700', activeColor: 'bg-rose-600 text-white underline underline-offset-4' }
    ];

    const TYPE_LABELS = {
        'verse_fill': '填空',
        'verse_fact': '事實',
        'geography': '地理',
        'theology': '神學',
        'person': '人物',
        'standard': '標準'
    };

    const parseJsonishArray = (value) => {
        if (Array.isArray(value)) return value;
        if (value == null || value === '') return [];
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    };

    const getDistractorPreview = (row) => {
        const pool = parseJsonishArray(row.distractors_pool ?? row.distractorsPool);
        const fromPool = Array.isArray(pool?.[0]) ? pool[0] : pool;
        const answer = String(row.answer ?? '').trim();
        const source = fromPool.length > 0
            ? fromPool
            : parseJsonishArray(row.options).filter(opt => String(opt ?? '').trim() !== answer);

        const seen = new Set();
        return source
            .map(opt => String(opt ?? '').trim())
            .filter(opt => {
                if (!opt || opt === answer || seen.has(opt)) return false;
                seen.add(opt);
                return true;
            });
    };

    // Load stats when questions tab is active
    useEffect(() => {
        if (activeTab === 'questions' || activeTab === 'overview') {
            loadStats();
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'backup' || activeTab === 'overview') return;
        setPagination(p => ({ ...p, page: 1 }));
        loadData();
    }, [activeTab, qFilters.book, qFilters.category, qFilters.source]);

    // Load book stats when book filter changes
    useEffect(() => {
        if (activeTab === 'questions') {
            loadBookStats(qFilters.book);
        }
    }, [qFilters.book]);

    useEffect(() => {
        if (activeTab === 'backup' || activeTab === 'overview') return;
        const timer = setTimeout(() => {
            if (pagination.page === 1) loadData();
            else setPagination(p => ({ ...p, page: 1 }));
        }, 500);
        return () => clearTimeout(timer);
    }, [qFilters.search]);

    useEffect(() => {
        if (activeTab === 'backup' || activeTab === 'overview') return;
        loadData();
    }, [pagination.page]);

    // Clear selection when data changes (e.g. page change)
    useEffect(() => {
        setSelectedIds([]);
    }, [data, activeTab]);

    // Handle Checkbox Toggle
    const toggleSelection = (id) => {
        setSelectedIds(prev => prev.includes(id)
            ? prev.filter(item => item !== id)
            : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedIds.length === data.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(data.map(d => d.id));
        }
    };

    // Handle Batch Delete
    const handleBatchDelete = async () => {
        if (!selectedIds.length) return;
        if (!confirm(`確定要刪除選取的 ${selectedIds.length} 筆題目嗎？此動作無法復原。`)) return;

        setIsDeletingBatch(true);
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/batch-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ ids: selectedIds })
            });

            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    alert(result.message);
                    setSelectedIds([]);
                    loadData(); // Reload data
                    loadStats(); // Reload stats
                } else {
                    alert('批次刪除失敗：' + result.error);
                }
            } else {
                alert('伺服器錯誤');
            }
        } catch (error) {
            console.error('Batch Delete Error:', error);
            alert('系統錯誤');
        } finally {
            setIsDeletingBatch(false);
        }
    };

    // Handle Batch Approve
    const handleBatchApprove = async () => {
        if (!selectedIds.length) return;
        if (!confirm(`確定要核准選取的 ${selectedIds.length} 筆題目嗎？`)) return;

        setLoading(true);
        try {
            const token = getToken();
            for (const id of selectedIds) {
                await fetch(`${API_BASE_URL}/api/admin/questions/${id}/approve`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: JSON.stringify({})
                });
            }
            alert('已成功核准所選題目');
            setSelectedIds([]);
            loadData();
            loadStats();
        } catch (error) {
            console.error('Batch Approve Error:', error);
            alert('部分或全部題目核准失敗');
        } finally {
            setLoading(false);
        }
    };

    async function loadStats() {
        setStatsLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/stats`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const result = await res.json();
                setStats(result);
            }
        } catch (error) { console.error('Failed to load stats:', error); }
        finally { setStatsLoading(false); }
    }

    async function loadBookStats(bookName) {
        if (bookName === 'all') {
            setBookStats(null);
            return;
        }
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/books/overview-stats`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (res.ok) {
                const result = await res.json();
                if (result.success && result.books) {
                    const found = result.books.find(b => b.book === bookName);
                    setBookStats(found || null);
                }
            }
        } catch (error) {
            console.error('[BookStats] Failed to load book stats:', error);
            setBookStats(null);
        }
    }

    async function loadData() {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pagination.page,
                limit: pagination.limit
            });

            let endpoint = '';
            if (activeTab === 'questions') {
                endpoint = '/api/admin/questions';
                params.append('search', qFilters.search);
                if (qFilters.book !== 'all') params.append('book', qFilters.book);
                if (qFilters.category !== 'all') params.append('category', qFilters.category);
                if (qFilters.source !== 'all') params.append('source', qFilters.source);
            } else if (activeTab === 'objects') {
                endpoint = '/api/admin/knowledge/objects';
                params.append('search', qFilters.search);
            } else if (activeTab === 'locations') {
                endpoint = '/api/admin/knowledge/locations';
                params.append('search', qFilters.search);
            } else {
                return;
            }

            const token = getToken();
            const baseUrl = API_BASE_URL || '';
            const fullUrl = `${baseUrl}${endpoint}?${params}`;
            const res = await fetch(fullUrl, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const result = await res.json();
                setData(result.data || []);
                setPagination(result.pagination);
            }
        } catch (error) { console.error('Failed to load data:', error); }
        finally { setLoading(false); }
    }

    const handleBackupDownload = () => {
        window.location.href = `${API_BASE_URL}/api/admin/backup`;
    };

    const formatDate = (ts) => {
        if (!ts) return '-';
        let date;
        if (typeof ts === 'number') {
            date = new Date(ts > 9999999999 ? ts : ts * 1000);
        } else if (typeof ts === 'string' && /^\d+$/.test(ts.trim())) {
            const numeric = Number(ts);
            date = new Date(numeric > 9999999999 ? numeric : numeric * 1000);
        } else {
            date = new Date(ts);
        }

        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
    };

    const getCategoryCount = (id) => {
        if (id === 'pending') return auditStatus.flaggedCount || 0;
        if (id === 'all') return stats.total;
        return stats.byCategory?.[id] || 0;
    };

    const handleBookSelect = (bookName) => {
        setQFilters(prev => ({ ...prev, book: bookName }));
        setActiveTab('questions');
    };

    const [fixingIds, setFixingIds] = useState(new Set());
    const handleAutoFix = async (id) => {
        setFixingIds(prev => new Set(prev).add(id));
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/${id}/autofix`, {
                method: 'POST',
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });
            const resData = await res.json();
            if (resData.success && resData.data) {
                // Update local state
                setData(prevData => prevData.map(item => item.id === id ? { ...item, ...resData.data } : item));
                setAuditMessage({ type: 'success', text: `✨ 題目修復成功！` });
                loadStats();
                loadAuditStatus();
            } else {
                setAuditMessage({ type: 'error', text: `修復失敗: ${resData.error}` });
            }
        } catch (e) {
            setAuditMessage({ type: 'error', text: `修復發生錯誤: ${e.message}` });
        } finally {
            setFixingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setTimeout(() => setAuditMessage(null), 3000);
        }
    };

    const handleAiAudit = async () => {
        const targetBook = qFilters.book !== 'all' ? qFilters.book : null;
        setIsAuditing(true);
        try {
            const token = getToken();
            const body = targetBook ? { book: targetBook } : {}; // 空 body = 觸發全庫小掃
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/audit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const label = targetBook ? targetBook : '全庫';
                setAuditMessage({ type: 'success', text: `✅ ${label} 題目審核已啟動，完成後請切換「待審」分頁查看結果` });
                // 立即更新狀態，避免顯示延遲
                setTimeout(loadAuditStatus, 2000); 
            } else {
                setAuditMessage({ type: 'error', text: '啟動失敗，請稍後再試' });
            }
        } catch (e) {
            setAuditMessage({ type: 'error', text: `錯誤: ${e.message}` });
        }
        setIsAuditing(false);
        setTimeout(() => setAuditMessage(null), 6000);
    };

    const handleEditSave = (id, newData) => {
        if (newData.deleted) {
            setData(prevData => prevData.filter(item => item.id !== id));
            loadStats();
            return;
        }

        setData(prevData => prevData.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    ...newData,
                    status: newData.status || 'flagged'
                };
            }
            return item;
        }));
    };

    return (
        <div className="space-y-4 relative">
            {/* Floating Batch Action Bar */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-stone-900/90 text-white px-6 py-3 rounded-full shadow-2xl z-40 flex items-center gap-4 backdrop-blur-sm border border-stone-700 transition-all">
                    <span className="font-semibold text-sm">已選取 {selectedIds.length} 筆</span>
                    <div className="h-4 w-px bg-stone-600"></div>
                    {qFilters.category === 'pending' && (
                        <button
                            onClick={handleBatchApprove}
                            className="text-emerald-400 hover:text-emerald-300 font-bold text-sm flex items-center gap-2 transition-colors"
                        >
                            <CheckCircle className="h-4 w-4" />
                            批次核准
                        </button>
                    )}
                    <button
                        onClick={handleBatchDelete}
                        disabled={isDeletingBatch}
                        className="text-red-400 hover:text-red-300 font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {isDeletingBatch ? <RefreshCw className="animate-spin h-4 w-4" /> : <X className="h-4 w-4" />}
                        批次刪除
                    </button>
                    <button onClick={() => setSelectedIds([])} className="ml-2 text-stone-400 hover:text-white">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Header with Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
                        <Database className="text-white" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-stone-800">知識治理中心</h1>
                        <p className="text-stone-500 text-xs">Governor 360 / Knowledge Base & Assets</p>
                    </div>
                </div>

                {!statsLoading && (
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-stone-600">
                            <HelpCircle size={14} />
                            <span className="font-medium">{stats.total}</span>
                            <span className="text-stone-400">題</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Tab Buttons + AI Audit button */}
            <div className="flex gap-2 overflow-x-auto pb-2 items-center">
                {[
                    { id: 'questions', label: '題庫管理', icon: HelpCircle },
                    { id: 'objects', label: '百科清單', icon: BookOpen },
                    { id: 'locations', label: '地理清單', icon: FolderOpen },
                    { id: 'overview', label: '書卷總覽', icon: BarChart3 },
                    { id: 'backup', label: '資料備份', icon: HardDrive }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                            : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
                {activeTab === 'questions' && (
                    <button
                        onClick={handleAiAudit}
                        disabled={isAuditing}
                        className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={qFilters.book !== 'all' ? `對「${qFilters.book}」進行語意去重掃描` : '對全庫進行語意去重掃描'}
                    >
                        {isAuditing ? <RefreshCw size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                        {isAuditing ? '掃描中...' : '手動自檢'}
                    </button>
                )}
            </div>

            {/* Audit Status Toast */}
            {auditMessage && (
                <div className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${
                    auditMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' :
                    auditMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
                    'bg-amber-50 text-amber-700 border border-amber-100'
                }`}>
                    {auditMessage.text}
                </div>
            )}

            {activeTab === 'overview' && (
                <BookOverviewTab onSwitchToBook={handleBookSelect} />
            )}

            {activeTab === 'questions' && (
                <div className="space-y-3">
                    {bookStats && (
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg p-3 flex flex-wrap items-center gap-4 text-sm">
                            <span className="font-bold text-indigo-800">{qFilters.book}</span>
                            <div className="flex items-center gap-3 text-stone-600">
                                <span>共 <b className="text-indigo-600">{bookStats.count}</b> 題</span>
                                <span>|</span>
                                <span className="text-indigo-600">填空 {bookStats.verse_fill || 0}</span>
                                <span className="text-blue-600">人物 {bookStats.person || 0}</span>
                                <span className="text-emerald-600">地理 {bookStats.geography || 0}</span>
                                <span className="text-purple-600">神學 {bookStats.theology || 0}</span>
                                {bookStats.suspected > 0 && (
                                    <span className="text-amber-600 flex items-center gap-1">
                                        <AlertTriangle size={12} />
                                        待審 {bookStats.suspected}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {categoryTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setQFilters(f => ({ ...f, category: tab.id }))}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${qFilters.category === tab.id ? tab.activeColor : tab.color
                                    }`}
                            >
                                {tab.label}
                                <span className="ml-1 opacity-70">({getCategoryCount(tab.id)})</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                            <input
                                type="text"
                                value={qFilters.search}
                                onChange={e => setQFilters(f => ({ ...f, search: e.target.value }))}
                                placeholder="搜尋題目..."
                                className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        <select
                            value={qFilters.book}
                            onChange={e => setQFilters(f => ({ ...f, book: e.target.value }))}
                            className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
                        >
                            {books.map(b => (
                                <option key={b} value={b}>{b === 'all' ? '全部書卷' : b}</option>
                            ))}
                        </select>
                        <select
                            value={qFilters.source}
                            onChange={e => setQFilters(f => ({ ...f, source: e.target.value }))}
                            className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
                        >
                            <option value="all">全部來源</option>
                            <option value="game">🎮 遊戲生成</option>
                            <option value="patrol">🌊 海巡補題</option>
                        </select>
                    </div>
                </div>
            )}

            {activeTab === 'backup' ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="bg-emerald-50 p-6 rounded-full">
                        <Database size={64} className="text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-stone-800">資料庫備份與下載</h2>
                        <p className="text-stone-500 mt-2 max-w-md mx-auto">
                            為了確保資料安全，您可以隨時將伺服器上的資料庫檔案下載到您的電腦中保存。
                        </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left max-w-lg w-full">
                        <h3 className="font-bold text-amber-800 mb-2">💡 備份說明：</h3>
                        <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                            <li>此備份包含：用戶資料、題庫資料、靈修短文、遊戲記錄。</li>
                            <li>支援 PostgreSQL 自動備份機制。</li>
                        </ul>
                    </div>
                    <button
                        onClick={handleBackupDownload}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95"
                    >
                        <Download size={20} />
                        立即下載資料庫備份
                    </button>
                </div>
            ) : activeTab === 'objects' ? (
                <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-stone-600 text-left border-b border-stone-200">
                            <tr>
                                <th className="px-4 py-3 font-semibold w-20">圖片</th>
                                <th className="px-4 py-3 font-semibold w-40">名稱</th>
                                <th className="px-4 py-3 font-semibold w-32">分類</th>
                                <th className="px-4 py-3 font-semibold">描述</th>
                                <th className="px-4 py-3 font-semibold w-32 text-right">建立時間</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {loading ? (
                                <tr><td colSpan="5" className="px-4 py-12 text-center text-stone-400">載入中...</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan="5" className="px-4 py-12 text-center text-stone-400">找不到資料</td></tr>
                            ) : (
                                data.map((row) => (
                                    <tr key={row.id} className="hover:bg-stone-50 transition-colors">
                                        <td className="px-4 py-3 text-center">
                                            {row.image_path ? (
                                                <img src={`${API_BASE_URL}${row.image_path}`} alt={row.name} className="w-12 h-12 object-cover rounded border border-stone-200" />
                                            ) : (
                                                <div className="w-12 h-12 bg-stone-100 flex items-center justify-center rounded border border-dashed border-stone-300 text-stone-300 text-[10px]">無圖</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-indigo-700">{row.name}</td>
                                        <td className="px-4 py-3 text-stone-500">{row.category}</td>
                                        <td className="px-4 py-3 text-stone-600 line-clamp-2" title={row.description}>{row.description}</td>
                                        <td className="px-4 py-3 text-right text-stone-400 text-xs font-mono">{formatDate(row.created_at)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 flex items-center justify-between text-sm">
                        <span className="text-stone-500">共 {pagination.total} 筆資料</span>
                        <div className="flex gap-2 items-center">
                            <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent"><ChevronLeft size={16} /></button>
                            <span className="text-stone-600 font-medium px-2">{pagination.page} / {pagination.totalPages || 1}</span>
                            <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'locations' ? (
                <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-stone-600 text-left border-b border-stone-200">
                            <tr>
                                <th className="px-4 py-3 font-semibold w-20">圖片</th>
                                <th className="px-4 py-3 font-semibold w-40">名稱</th>
                                <th className="px-4 py-3 font-semibold w-40">現代名稱</th>
                                <th className="px-4 py-3 font-semibold">經緯度</th>
                                <th className="px-4 py-3 font-semibold">描述</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {loading ? (
                                <tr><td colSpan="5" className="px-4 py-12 text-center text-stone-400">載入中...</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan="5" className="px-4 py-12 text-center text-stone-400">找不到資料</td></tr>
                            ) : (
                                data.map((row) => (
                                    <tr key={row.id} className="hover:bg-stone-50 transition-colors">
                                        <td className="px-4 py-3">
                                            {row.image_path ? (
                                                <img src={`${API_BASE_URL}${row.image_path}`} alt={row.name} className="w-12 h-12 object-cover rounded border border-stone-200" />
                                            ) : (
                                                <div className="w-12 h-12 bg-stone-100 flex items-center justify-center rounded border border-dashed border-stone-300 text-stone-300 text-[10px]">無圖</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-indigo-700">{row.name}</td>
                                        <td className="px-4 py-3 text-stone-500">{row.modern_name || '-'}</td>
                                        <td className="px-4 py-3 text-stone-400 text-xs font-mono">{row.lat}, {row.lng}</td>
                                        <td className="px-4 py-3 text-stone-600 line-clamp-2" title={row.description}>{row.description}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 flex items-center justify-between text-sm">
                        <span className="text-stone-500">共 {pagination.total} 筆資料</span>
                        <div className="flex gap-2 items-center">
                            <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent"><ChevronLeft size={16} /></button>
                            <span className="text-stone-600 font-medium px-2">{pagination.page} / {pagination.totalPages || 1}</span>
                            <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'questions' ? (
                <div className="space-y-4">
                    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50 text-stone-600 text-left border-b border-stone-200">
                                <tr>
                                    <th className="px-4 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                            checked={data.length > 0 && selectedIds.length === data.length}
                                            onChange={toggleAll}
                                        />
                                    </th>
                                    <th className="px-4 py-3 font-semibold w-24">狀態</th>
                                    <th className="px-4 py-3 font-semibold w-24">來源</th>
                                    <th className="px-4 py-3 font-semibold w-28">題型</th>
                                    <th className="px-4 py-3 font-semibold w-28">書卷</th>
                                    <th className="px-4 py-3 font-semibold">題目</th>
                                    <th className="px-4 py-3 font-semibold w-40">正確答案</th>
                                    <th className="px-4 py-3 font-semibold w-72">錯項</th>
                                    <th className="px-4 py-3 font-semibold w-24 text-right">時間</th>
                                    <th className="px-4 py-3 w-16"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {loading ? (
                                    <tr><td colSpan="10" className="px-4 py-12 text-center text-stone-400">載入中...</td></tr>
                                ) : data.length === 0 ? (
                                    <tr><td colSpan="10" className="px-4 py-12 text-center text-stone-400">找不到資料</td></tr>
                                ) : (
                                    data.map((row) => {
                                        const distractorPreview = getDistractorPreview(row);
                                        return (
                                        <tr key={row.id} className={`hover:bg-stone-50 transition-colors group ${selectedIds.includes(row.id) ? 'bg-indigo-50/50' : ''}`}>
                                            <td className="px-4 py-3 align-top">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                                    checked={selectedIds.includes(row.id)}
                                                    onChange={() => toggleSelection(row.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex flex-col gap-1 items-start">
                                                    {row.status === 'flagged' || row.quality === 'suspicious' ? (
                                                        <div 
                                                            className="flex items-center gap-1 text-amber-600 text-[10px] font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 cursor-help" 
                                                            title={row.metadata?.audit_reason || 'AI 標記：疑似重複或其他異常'}
                                                        >
                                                            <AlertTriangle size={10} /> 待審
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-green-600 text-[10px] font-bold bg-green-50 px-1.5 py-0.5 rounded border border-green-200" title="正常">
                                                            <CheckCircle size={10} /> 正常
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                {row.source?.startsWith('patrol:') || row.source?.includes('REPLENISH') ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">🌊 補題</span>
                                                        <span className="text-[8px] text-stone-400 mt-1 font-mono uppercase tracking-tighter">
                                                            {row.source.split(':').pop()?.replace('AI_REPLENISH_BANK_', 'V')}
                                                        </span>
                                                    </div>
                                                ) : row.source === 'game' ? (
                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">🎮 遊戲</span>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">🛠️ 系統</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-block
                                                    ${row.category === 'verse_fill' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                        row.category === 'person' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                            row.category === 'geography' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                row.category === 'theology' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                    'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                    {categoryTabs.find(c => c.id === row.category)?.label || row.category || '未分類'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-stone-700 align-top">
                                                <div className="font-bold text-sm">{row.book}</div>
                                                <div className="text-stone-400 text-[10px] mt-0.5">第 {row.chapter} 章 {row.verse_ref || row.verse}</div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="text-stone-800 font-medium line-clamp-2 leading-relaxed mb-1" title={row.question}>
                                                    {row.question}
                                                </div>
                                                {row.evidence && (
                                                    <div className="mt-1 text-[10px] text-stone-400 flex items-center gap-1 max-w-md truncate" title={row.evidence}>
                                                        <BookOpen size={10} /> {row.evidence}
                                                    </div>
                                                )}

                                                {/* AI 審核診斷區塊 (僅在標記時顯示) */}
                                                {(row.status === 'flagged' || row.metadata?.audit_reason) && (
                                                    <div className="mt-2 p-2 bg-amber-50/80 border border-amber-200 rounded-lg animate-in slide-in-from-top-1 duration-300">
                                                        <div className="flex items-center gap-2 mb-1 text-amber-800 font-black text-[9px] uppercase tracking-widest justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <AlertTriangle size={12} className="text-amber-500" />
                                                                AI 審核建議
                                                            </div>
                                                            <button
                                                                onClick={() => handleAutoFix(row.id)}
                                                                disabled={fixingIds.has(row.id)}
                                                                className="flex items-center gap-1 bg-amber-200/50 hover:bg-amber-300 text-amber-900 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50"
                                                            >
                                                                <Zap size={10} />
                                                                {fixingIds.has(row.id) ? '修復中...' : '✨ 一鍵修正'}
                                                            </button>
                                                        </div>
                                                        <div className="text-xs text-amber-700 leading-relaxed font-medium">
                                                            {row.metadata?.audit_reason || '疑似語意重複或內容異常，建議人工查核'}
                                                        </div>
                                                        {row.metadata?.duplicate_of && (
                                                            <DuplicatePreview 
                                                                id={row.metadata.duplicate_of} 
                                                                API_BASE_URL={API_BASE_URL}
                                                                token={getToken()}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-start gap-2">
                                                    <span className="shrink-0 text-[10px] font-bold bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded uppercase">Ans</span>
                                                    <span className="text-xs text-stone-700 leading-relaxed break-words">{row.answer}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                {distractorPreview.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {distractorPreview.slice(0, 5).map((opt, idx) => (
                                                            <span
                                                                key={`${row.id}-dist-${idx}`}
                                                                className="max-w-[10rem] truncate text-[11px] bg-stone-50 text-stone-600 px-2 py-0.5 rounded border border-stone-200"
                                                                title={opt}
                                                            >
                                                                {opt}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                        尚無錯項池
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-stone-400 text-xs font-mono align-top">
                                                {formatDate(row.created_at || row.createdAt || row.date)}
                                            </td>
                                            <td className="px-4 py-3 text-center align-top">
                                                <button
                                                    onClick={() => setEditingQuestion(row)}
                                                    className="p-2 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                >
                                                    <PenSquare size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>

                        <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 flex items-center justify-between text-sm">
                            <span className="text-stone-500">共 {pagination.total} 筆資料</span>
                            <div className="flex gap-2 items-center">
                                <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                    className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent"><ChevronLeft size={16} /></button>
                                <span className="text-stone-600 font-medium px-2">{pagination.page} / {pagination.totalPages || 1}</span>
                                <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                    className="p-1.5 border border-stone-300 rounded hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent"><ChevronRight size={16} /></button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <QuestionEditDrawer
                question={editingQuestion}
                isOpen={!!editingQuestion}
                onClose={() => setEditingQuestion(null)}
                onSave={handleEditSave}
            />
        </div>
    );
}
