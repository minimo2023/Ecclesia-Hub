import React, { useState, useEffect } from 'react';
import { Coins, TrendingUp, Search, Users, FileText, RefreshCw, X, AlertCircle, ArrowUpRight, ArrowDownRight, Wallet, Settings, Save } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function EconomyModule() {
    const { getToken } = useAuth();
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState({ totalCoins: 0, totalAiCredits: 0, activeUsers: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [ledgerData, setLedgerData] = useState([]);
    const [isLedgerLoading, setIsLedgerLoading] = useState(false);
    const [ledgerTab, setLedgerTab] = useState('coin'); // 'coin' or 'ai'
    const [reconcileStatus, setReconcileStatus] = useState(null); // null | 'loading' | result
    
    // Exchange Rates config
    const [rates, setRates] = useState({ rateCoinToCredit: 50, rateCreditToCoin: 45 });
    const [isSavingRates, setIsSavingRates] = useState(false);
    const [rateMessage, setRateMessage] = useState(null);

    useEffect(() => {
        fetchUsers();
        fetchEconomyStats();
        fetchRates();
    }, []);

    const fetchRates = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/economy/config`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) setRates(data.data);
        } catch (err) { console.error('Fetch rates error:', err); }
    };

    const handleSaveRates = async () => {
        setIsSavingRates(true);
        setRateMessage(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/economy/config`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(rates)
            });
            const data = await res.json();
            if (data.success) {
                setRateMessage({ type: 'success', text: '匯率已更新' });
                setTimeout(() => setRateMessage(null), 3000);
            } else {
                setRateMessage({ type: 'error', text: data.error });
            }
        } catch (err) {
            setRateMessage({ type: 'error', text: err.message });
        } finally {
            setIsSavingRates(false);
        }
    };

    const fetchUsers = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) setUsers(data.users);
            else setError(data.error);
        } catch (err) { setError(err.message); }
        finally { setIsLoading(false); }
    };

    const fetchEconomyStats = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/economy/stats`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setStats(prev => ({
                    ...prev,
                    totalCoins: data.totalCoins,
                    totalAiCredits: data.totalAiCredits
                }));
            }
        } catch (err) { console.error('Fetch economy stats error:', err); }
    };

    const fetchLedger = async (user, type = 'coin') => {
        setSelectedUser(user);
        setLedgerTab(type);
        setIsLedgerLoading(true);
        setLedgerData([]);
        const endpoint = type === 'coin' ? 'ledger' : 'ai-ledger';
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/${endpoint}?limit=200`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) setLedgerData(data.ledger);
        } catch (err) { console.error(err); }
        finally { setIsLedgerLoading(false); }
    };

    const handleReconcile = async () => {
        setReconcileStatus('loading');
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/economy/reconcile`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setReconcileStatus(data);
            // Refresh after fix
            fetchUsers();
            fetchEconomyStats();
        } catch (err) {
            setReconcileStatus({ success: false, error: err.message });
        }
    };

    const activeUsers = users.filter(u => {
        if (!u.lastLogin && !u.last_login) return false;
        // Simple active check: login within last 7 days
        const lastLogin = new Date(u.lastLogin || u.last_login).getTime();
        return (Date.now() - lastLogin) < 7 * 24 * 60 * 60 * 1000;
    }).length;

    const filteredUsers = users.filter(u =>
        u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-stone-800 tracking-tight flex items-center gap-2">
                        <Coins className="text-amber-500" size={24} />
                        經濟體系治理
                    </h1>
                    <p className="text-xs text-stone-400 mt-1">全平台資產概覽 · 智匯金幣與智匯點數一站式監控</p>
                </div>
            <div className="flex items-center gap-2">
                {/* Reconcile Button */}
                <button
                    onClick={handleReconcile}
                    disabled={reconcileStatus === 'loading'}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 transition-colors disabled:opacity-50"
                    title="修補歷史資料：確保每位用戶都有正確的 AI 點數錢包記錄"
                >
                    {reconcileStatus === 'loading'
                        ? <><RefreshCw size={14} className="animate-spin" /> 修補中...</>
                        : <><Wallet size={14} /> 錢包稽核修補</>}
                </button>
                <button
                    onClick={() => { fetchUsers(); fetchEconomyStats(); }}
                    className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors"
                    title="重新整理"
                >
                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="全站智匯金幣流通量" value={stats.totalCoins} icon={<Coins size={18} />} color="amber" />
                <StatCard title="全站智匯點數負債" value={stats.totalAiCredits} icon={<Wallet size={18} />} color="indigo" />
                <StatCard title="註冊帳號總數" value={users.length} icon={<Users size={18} />} color="blue" />
                <StatCard title="近期活躍用戶" value={activeUsers} icon={<TrendingUp size={18} />} color="emerald" />
            </div>

            {/* Exchange Rates Config */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="text-stone-400" size={18} />
                    <h3 className="font-bold text-stone-700 text-sm">全域兌換匯率設定</h3>
                </div>
                <div className="flex flex-col md:flex-row items-end gap-4">
                    <div className="flex-1 space-y-1">
                        <label className="text-xs font-bold text-stone-500">金幣換點數 (X 金幣 = 1 點數)</label>
                        <input 
                            type="number" min="1"
                            value={rates.rateCoinToCredit}
                            onChange={e => setRates({...rates, rateCoinToCredit: parseInt(e.target.value) || 0})}
                            className="w-full border border-stone-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                    </div>
                    <div className="flex-1 space-y-1">
                        <label className="text-xs font-bold text-stone-500">點數換金幣 (1 點數 = X 金幣)</label>
                        <input 
                            type="number" min="1"
                            value={rates.rateCreditToCoin}
                            onChange={e => setRates({...rates, rateCreditToCoin: parseInt(e.target.value) || 0})}
                            className="w-full border border-stone-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                    </div>
                    <button 
                        onClick={handleSaveRates} disabled={isSavingRates}
                        className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors h-[38px]"
                    >
                        {isSavingRates ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} 儲存匯率
                    </button>
                </div>
                {rateMessage && (
                    <div className={`mt-3 text-xs font-bold flex items-center gap-1 ${rateMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {rateMessage.type === 'success' ? <RefreshCw size={14} /> : <AlertCircle size={14} />} {rateMessage.text}
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Reconcile Result */}
            {reconcileStatus && reconcileStatus !== 'loading' && (
                <div className={`border p-4 rounded-xl text-sm flex items-start gap-3 ${
                    reconcileStatus.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                        <div className="font-bold mb-1">
                            {reconcileStatus.success ? '✅ 錢包稽核修補完成' : '❌ 修補失敗'}
                        </div>
                        {reconcileStatus.summary && (
                            <div className="text-xs space-y-0.5">
                                <div>共 {reconcileStatus.summary.total} 位用戶</div>
                                <div className="text-emerald-700">已補建錢包：{reconcileStatus.summary.created} 位</div>
                                <div>原本正常：{reconcileStatus.summary.alreadyOk} 位</div>
                            </div>
                        )}
                        {reconcileStatus.error && <div className="text-xs mt-1">{reconcileStatus.error}</div>}
                    </div>
                    <button onClick={() => setReconcileStatus(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><X size={14} /></button>
                </div>
            )}

            {/* Search */}
            <div className="relative max-w-xs">
                <Search size={16} className="absolute left-3 top-2.5 text-stone-400" />
                <input
                    type="text" placeholder="搜尋用戶 (ID/名稱)..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="bg-white border border-stone-300 pl-9 pr-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none w-full"
                />
            </div>

            {/* Users Asset Table */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
                    <h3 className="font-bold text-stone-700 text-sm">用戶資產明細</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50/50 text-stone-500 text-left border-b border-stone-100">
                            <tr>
                                <th className="px-4 py-3 font-semibold">排名</th>
                                <th className="px-4 py-3 font-semibold">用戶標籤</th>
                                <th className="px-4 py-3 font-semibold text-right">智匯金幣 (BI Gold Coin)</th>
                                <th className="px-4 py-3 font-semibold text-right">贈送智匯點數</th>
                                <th className="px-4 py-3 font-semibold text-right">兌換智匯點數</th>
                                <th className="px-4 py-3 font-semibold text-right">付費智匯點數</th>
                                <th className="px-4 py-3 font-semibold text-right font-bold text-stone-800">資產總計 (BI point)</th>
                                <th className="px-4 py-3 font-semibold text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                            {isLoading ? (
                                <tr><td colSpan="8" className="py-16 text-center text-stone-400 animate-pulse">正在同步區塊鏈帳本...</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan="8" className="py-16 text-center text-stone-400">尚無符合條件的數據</td></tr>
                            ) : filteredUsers.map((user, idx) => (
                                <tr key={user.id} className="hover:bg-stone-50/50 transition-colors group">
                                    <td className="px-4 py-3 text-stone-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-stone-800 group-hover:text-amber-600 transition-colors">{user.displayName || user.username}</div>
                                        <div className="text-[10px] text-stone-400 font-mono">ID: {user.id.slice(0, 8)}...</div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-amber-600 font-bold">{(user.coins || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono text-stone-500">{Math.floor(user.bonusAiCredits ?? user.bonus_ai_credits ?? 0)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-stone-500">{Math.floor(user.exchangeAiCredits ?? user.exchange_ai_credits ?? 0)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{Math.floor(user.paidAiCredits ?? user.paid_ai_credits ?? 0)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-stone-800 font-black">
                                        {Math.floor(user.totalAiCredits ?? user.total_ai_credits ?? 0).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => fetchLedger(user, 'coin')}
                                            className="p-1.5 hover:bg-stone-100 text-stone-500 rounded-lg transition-colors inline-flex items-center gap-1"
                                            title="檢視流水帳"
                                        >
                                            <FileText size={14} />
                                            <span className="text-[10px] font-bold">Ledger</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Multi-Ledger Modal */}
            {selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedUser(null)}>
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 bg-stone-50 border-b border-stone-200">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-black text-stone-800">{selectedUser.displayName || selectedUser.username}</h3>
                                        <span className="text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded font-mono">@{selectedUser.username}</span>
                                    </div>
                                    <p className="text-xs text-stone-400 mt-1">資產流水稽查記錄</p>
                                </div>
                                <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                                    <X size={20} className="text-stone-400" />
                                </button>
                            </div>

                            {/* Tab Switcher */}
                            <div className="flex gap-1 p-1 bg-stone-200/50 rounded-xl w-fit">
                                <button
                                    onClick={() => fetchLedger(selectedUser, 'coin')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${ledgerTab === 'coin' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                                >
                                    智匯金幣流水 (BI Gold Coin)
                                </button>
                                <button
                                    onClick={() => fetchLedger(selectedUser, 'ai')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${ledgerTab === 'ai' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                                >
                                    智匯點數流水 (BI point)
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 transition-all">
                            {isLedgerLoading ? (
                                <div className="py-24 text-center space-y-4">
                                    <div className="w-10 h-10 border-4 border-stone-200 border-t-amber-500 rounded-full animate-spin mx-auto" />
                                    <p className="text-stone-400 text-sm font-medium">正在校對交易日誌...</p>
                                </div>
                            ) : ledgerData.length === 0 ? (
                                <div className="py-24 text-center">
                                    <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <FileText className="text-stone-200" size={32} />
                                    </div>
                                    <p className="text-stone-400 text-sm">此帳號尚無{ledgerTab === 'coin' ? '智匯金幣' : '智匯點數'}異動紀錄</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {ledgerData.map(entry => (
                                        <div key={entry.id} className="group p-4 bg-white hover:bg-stone-50 rounded-2xl border border-stone-100 hover:border-stone-200 shadow-sm transition-all flex items-center justify-between">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${entry.amount >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                    {entry.amount >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-stone-800 text-sm truncate">{entry.reason || '系統處理'}</div>
                                                    <div className="text-[10px] text-stone-400 flex items-center gap-2 mt-0.5">
                                                        <span>{new Date(entry.createdAt || entry.created_at).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                        {(entry.creditPool || entry.credit_pool) && <span className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-500 uppercase">{entry.creditPool || entry.credit_pool}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 ml-4">
                                                <div className={`text-base font-black font-mono transition-transform group-hover:scale-105 ${entry.amount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {entry.amount >= 0 ? '+' : ''}{Math.floor(entry.amount)}
                                                </div>
                                                <div className="text-[10px] text-stone-400 font-bold">餘額: {Math.floor(entry.balanceAfter ?? entry.totalBalanceAfter ?? entry.balance_after ?? entry.total_balance_after ?? 0)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex justify-between items-center">
                            <div className="text-[11px] text-stone-400 font-medium">記錄僅顯示最近 200 筆</div>
                            <button onClick={() => setSelectedUser(null)} className="px-6 py-2 bg-stone-800 text-white rounded-xl text-sm font-bold hover:bg-stone-700 shadow-lg shadow-stone-900/10 transition-all">關閉介面</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, icon, color }) {
    const colorConfigs = {
        blue: {
            bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
            border: 'border-blue-100',
            iconBg: 'bg-blue-500',
            text: 'text-blue-700',
            shadow: 'shadow-blue-900/5'
        },
        amber: {
            bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
            border: 'border-amber-100',
            iconBg: 'bg-amber-500',
            text: 'text-amber-700',
            shadow: 'shadow-amber-900/5'
        },
        indigo: {
            bg: 'bg-gradient-to-br from-indigo-50 to-purple-50',
            border: 'border-indigo-100',
            iconBg: 'bg-indigo-500',
            text: 'text-indigo-700',
            shadow: 'shadow-indigo-900/5'
        },
        emerald: {
            bg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
            border: 'border-emerald-100',
            iconBg: 'bg-emerald-500',
            text: 'text-emerald-700',
            shadow: 'shadow-emerald-900/5'
        }
    };
    
    const config = colorConfigs[color];
    
    return (
        <div className={`p-6 rounded-2xl border ${config.bg} ${config.border} ${config.shadow} shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-default relative overflow-hidden`}>
            {/* Background Accent */}
            <div className={`absolute -right-4 -bottom-4 w-16 h-16 rounded-full ${config.iconBg} opacity-5 group-hover:scale-150 transition-transform duration-500`}></div>
            
            <div className="flex items-center justify-between mb-3 relative z-10">
                <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${config.text} opacity-70`}>{title}</span>
                <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center text-white shadow-sm group-hover:rotate-12 transition-transform`}>
                   <span className="text-sm">{icon}</span>
                </div>
            </div>
            <div className={`text-3xl font-black font-mono tracking-tight ${config.text} relative z-10`}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
        </div>
    );
}
