import React, { useState, useEffect } from 'react';
import { User, Search, Trash2, Key, Shield, Coins, X, AlertTriangle, Crown, Settings, Plus, ChevronDown, Clock, FileText } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function BIUsersGovernanceModule() {
    const { getToken, user: authUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [deleteUser, setDeleteUser] = useState(null);
    const [resetUser, setResetUser] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [changeRoleUser, setChangeRoleUser] = useState(null);
    const [selectedRole, setSelectedRole] = useState('user');
    
    // BI Coin Management
    const [adjustCoinsUser, setAdjustCoinsUser] = useState(null);
    const [coinsAmount, setCoinsAmount] = useState(0);
    const [coinsAction, setCoinsAction] = useState('add');

    // AI Credit Management (v3.0)
    const [adjustAICreditsUser, setAdjustAICreditsUser] = useState(null);
    const [aiAmount, setAiAmount] = useState(0);
    const [aiPool, setAiPool] = useState('bonus');
    const [aiReason, setAiReason] = useState('');

    const [ledgerUser, setLedgerUser] = useState(null);
    const [ledgerData, setLedgerData] = useState([]);
    const [isLedgerLoading, setIsLedgerLoading] = useState(false);

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            if (data.success) setUsers(data.users);
            else setError(data.error);
        } catch (err) { setError(err.message); }
        finally { setIsLoading(false); }
    };

    const handleDelete = async () => {
        if (!deleteUser) return;
        setIsProcessing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users/${deleteUser.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await response.json();
            if (data.success) { setUsers(users.filter(u => u.id !== deleteUser.id)); setDeleteUser(null); }
            else alert(data.error);
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!resetUser) return;
        setIsProcessing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users/${resetUser.id}/password`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ newPassword })
            });
            const data = await response.json();
            if (data.success) { alert(`已重設 ${resetUser.username} 的密碼`); setResetUser(null); setNewPassword(''); }
            else alert(data.error);
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const handleAdjustCoins = async (e) => {
        e.preventDefault();
        if (!adjustCoinsUser) return;
        setIsProcessing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users/${adjustCoinsUser.id}/coins`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ amount: Number(coinsAmount), action: coinsAction, reason: 'Admin manual coin adjustment' })
            });
            const data = await response.json();
            if (data.success) { setUsers(users.map(u => u.id === adjustCoinsUser.id ? { ...u, coins: data.coins } : u)); setAdjustCoinsUser(null); setCoinsAmount(0); }
            else alert(data.error);
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const handleAdjustAICredits = async (e) => {
        e.preventDefault();
        if (!adjustAICreditsUser) return;
        setIsProcessing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users/${adjustAICreditsUser.id}/ai-credits`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ amount: Number(aiAmount), pool: aiPool, reason: aiReason || 'Admin manual adjustment' })
            });
            const data = await response.json();
            if (data.success) {
                fetchUsers();
                setAdjustAICreditsUser(null);
                setAiAmount(0);
                setAiReason('');
            } else {
                alert(data.error);
            }
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const handleChangeRole = async (e) => {
        e.preventDefault();
        if (!changeRoleUser) return;
        setIsProcessing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users/${changeRoleUser.id}/role`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ role: selectedRole })
            });
            const data = await response.json();
            if (data.success) { setUsers(users.map(u => u.id === changeRoleUser.id ? { ...u, role: data.role, is_admin: data.role !== 'user' ? 1 : 0 } : u)); setChangeRoleUser(null); }
            else alert(data.error);
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const fetchLedger = async (user) => {
        setLedgerUser(user);
        setIsLedgerLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/ledger`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            if (data.success) setLedgerData(data.ledger);
            else alert(data.error);
        } catch (err) { alert(err.message); }
        finally { setIsLedgerLoading(false); }
    };

    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const formatLastLogin = (ts) => {
        if (!ts) return '從未登入';
        const now = Date.now();
        const diff = now - ts;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '剛剛';
        if (minutes < 60) return `${minutes} 分鐘前`;
        if (hours < 24) return `${hours} 小時前`;
        if (days < 7) return `${days} 天前`;
        return new Date(ts).toLocaleDateString('zh-TW');
    };

    const isSuperAdmin = authUser?.role === 'super_admin' || authUser?.isAdmin || authUser?.is_admin;

    const getRoleLabel = (user) => {
        const role = user.role || (user.is_admin ? 'super_admin' : 'user');
        return { 'super_admin': '超管', 'admin_ops': '運營', 'admin_content': '內容', 'admin_economy': '經濟', 'admin_ai': 'AI監控', 'admin_support': '客服', 'user': '用戶' }[role] || role;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-stone-800 tracking-tight">用戶管理中心</h1>
                    <p className="text-xs text-stone-400 font-medium">個人帳號管理 / User & Permission Control v3.0</p>
                </div>
                <div className="relative group">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-amber-500 transition-colors" />
                    <input type="text" placeholder="搜尋用戶名或顯示名稱..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-white border border-stone-200 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none w-full sm:w-64 transition-all shadow-sm" />
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

            <div className="hidden md:block bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50/50 text-stone-500 text-left border-b border-stone-100">
                        <tr>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] w-16">#</th>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">用戶識別</th>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">系統角色</th>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] text-right">智匯金幣存量</th>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] text-right">智點餘額</th>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">最後活動</th>
                            <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] text-right">治理操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                        {isLoading ? (
                            <tr><td colSpan="7" className="px-4 py-8 text-center text-stone-400">載入中...</td></tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr><td colSpan="7" className="px-4 py-8 text-center text-stone-400">找不到用戶</td></tr>
                        ) : (
                            filteredUsers.map((user, idx) => (
                                <tr key={user.id} className="hover:bg-stone-50">
                                    <td className="px-3 py-2 text-stone-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-stone-800 text-sm">{user.displayName || user.username}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`px-2 py-0.5 rounded text-xs ${(user.role || (user.is_admin ? 'super_admin' : 'user')) === 'super_admin' ? 'bg-amber-100 text-amber-700' :
                                            user.role?.startsWith('admin') ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-600'
                                            }`}>{getRoleLabel(user)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-amber-600 text-sm">{user.coins}</td>
                                    <td className="px-3 py-2 text-right font-mono text-indigo-600 text-sm">
                                        <div className="flex flex-col items-end">
                                            <span>{Math.floor(user.totalAiCredits || 0)}</span>
                                            {user.paidAiCredits > 0 && <span className="text-[9px] text-green-500">P: {user.paidAiCredits}</span>}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-stone-500 text-xs">
                                        <div className="flex items-center gap-1">
                                            <Clock size={12} className="text-stone-400" />
                                            {formatLastLogin(user.lastLogin)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {(isSuperAdmin || authUser?.role === 'admin_economy') && (
                                                <>
                                                    <button onClick={() => { setAdjustCoinsUser(user); setCoinsAmount(0); setCoinsAction('add'); }}
                                                        className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg border border-transparent hover:border-amber-100 transition-all" title="調整智匯金幣"><Coins size={16} /> </button>
                                                    <button onClick={() => { setAdjustAICreditsUser(user); setAiAmount(0); setAiPool('bonus'); setAiReason(''); }}
                                                        className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg border border-transparent hover:border-indigo-100 transition-all" title="調整智點"><Shield size={16} /></button>
                                                </>
                                            )}
                                            {isSuperAdmin && (
                                                <button onClick={() => { setChangeRoleUser(user); setSelectedRole(user.role || (user.is_admin ? 'super_admin' : 'user')); }}
                                                    className="p-2 hover:bg-purple-50 text-purple-600 rounded-lg border border-transparent hover:border-purple-100 transition-all" title="權限設定"><Settings size={16} /></button>
                                            )}
                                            <button onClick={() => fetchLedger(user)} className="p-2 hover:bg-stone-50 text-stone-500 rounded-lg border border-transparent hover:border-stone-100 transition-all" title="流水紀錄"><FileText size={16} /></button>
                                            <button onClick={() => setDeleteUser(user)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg border border-transparent hover:border-red-100 transition-all" title="刪除帳戶"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="md:hidden bg-white border border-stone-200 rounded-lg overflow-hidden divide-y divide-stone-100 mb-20">
                {isLoading ? (
                    <div className="p-8 text-center text-stone-400">載入中...</div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-8 text-center text-stone-400">找不到用戶</div>
                ) : (
                    filteredUsers.map((user, idx) => (
                        <details key={user.id} className="group">
                            <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-stone-50 list-none">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-xs text-stone-400 w-5 shrink-0">{idx + 1}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-stone-800 text-sm truncate">{user.displayName || user.username}</div>
                                        <div className="flex items-center gap-2 text-xs text-stone-500">
                                            <span className="text-amber-600">💰{user.coins}</span>
                                            <span className="text-indigo-600">✨{Math.floor(user.totalAiCredits || 0)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`px-2 py-0.5 rounded text-xs ${(user.role || (user.is_admin ? 'super_admin' : 'user')) === 'super_admin' ? 'bg-amber-100 text-amber-700' :
                                        user.role?.startsWith('admin') ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-600'
                                        }`}>{getRoleLabel(user)}</span>
                                    <ChevronDown size={16} className="text-stone-400 group-open:rotate-180 transition-transform" />
                                </div>
                            </summary>
                            <div className="flex flex-wrap gap-2 p-3 pt-0 bg-stone-50">
                                <button onClick={() => { setAdjustCoinsUser(user); setCoinsAmount(0); setCoinsAction('add'); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded"><Coins size={12} /> 智匯金幣</button>
                                <button onClick={() => { setAdjustAICreditsUser(user); setAiAmount(0); setAiPool('bonus'); setAiReason(''); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded"><Shield size={12} /> 智點</button>
                                <button onClick={() => fetchLedger(user)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-100 text-stone-700 rounded border border-stone-200"><FileText size={12} /> 流水</button>
                                <button onClick={() => setDeleteUser(user)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded"><Trash2 size={12} /> 刪除</button>
                            </div>
                        </details>
                    ))
                )}
            </div>

            {deleteUser && (
                <Modal onClose={() => setDeleteUser(null)} title="刪除用戶">
                    <p className="mb-4">確定刪除 <strong>{deleteUser.username}</strong>？</p>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setDeleteUser(null)} className="px-4 py-2 bg-stone-200 rounded-lg">取消</button>
                        <button onClick={handleDelete} disabled={isProcessing} className="px-4 py-2 bg-red-500 text-white rounded-lg">{isProcessing ? '刪除中...' : '刪除'}</button>
                    </div>
                </Modal>
            )}

            {adjustCoinsUser && (
                <Modal onClose={() => { setAdjustCoinsUser(null); setCoinsAmount(0); }} title="調整智匯金幣 (BI Gold Coin)">
                    <form onSubmit={handleAdjustCoins}>
                        <p className="mb-2 text-sm text-stone-600">{adjustCoinsUser.username} 目前智匯金幣: <strong>{adjustCoinsUser.coins}</strong></p>
                        <div className="flex gap-2 mb-3">
                            <button type="button" onClick={() => setCoinsAction('add')} className={`flex-1 py-2 rounded-lg text-sm ${coinsAction === 'add' ? 'bg-amber-500 text-white' : 'bg-stone-200'}`}>增減 (+/-)</button>
                            <button type="button" onClick={() => setCoinsAction('set')} className={`flex-1 py-2 rounded-lg text-sm ${coinsAction === 'set' ? 'bg-amber-500 text-white' : 'bg-stone-200'}`}>設定數值</button>
                        </div>
                        <input type="number" value={coinsAmount} onChange={(e) => setCoinsAmount(e.target.value)} placeholder="金額 (負數代表減少)"
                            className="w-full border border-stone-300 px-3 py-2 rounded-lg mb-4 font-mono" required autoFocus />
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setAdjustCoinsUser(null); setCoinsAmount(0); }} className="px-4 py-2 bg-stone-200 rounded-lg text-sm">取消</button>
                            <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm">{isProcessing ? '處理中...' : '確認'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {adjustAICreditsUser && (
                <Modal onClose={() => setAdjustAICreditsUser(null)} title="調整智點 (BI Points)">
                    <form onSubmit={handleAdjustAICredits}>
                        <p className="mb-2 text-sm text-stone-600">{adjustAICreditsUser.username} 總額: <strong>{Math.floor(adjustAICreditsUser.totalAiCredits || 0)}</strong></p>
                        
                        <div className="mb-3">
                            <label className="text-xs text-stone-400 block mb-1">選擇點數池</label>
                            <div className="flex gap-1">
                                {['bonus', 'exchange', 'paid'].map(p => (
                                    <button key={p} type="button" onClick={() => setAiPool(p)} 
                                        className={`flex-1 py-1 px-2 rounded text-xs capitalize ${aiPool === p ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-500'}`}>
                                        {p === 'bonus' ? '贈送' : p === 'exchange' ? '兌換' : '付費'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <input type="number" value={aiAmount} onChange={(e) => setAiAmount(e.target.value)} placeholder="變動量 (+100 / -50)"
                            className="w-full border border-stone-300 px-3 py-2 rounded-lg mb-3 font-mono text-sm" required autoFocus />
                        
                        <input type="text" value={aiReason} onChange={(e) => setAiReason(e.target.value)} placeholder="調整原因 (必填)"
                            className="w-full border border-stone-300 px-3 py-2 rounded-lg mb-4 text-sm" required />

                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setAdjustAICreditsUser(null)} className="px-4 py-2 bg-stone-200 rounded-lg text-sm">取消</button>
                            <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">{isProcessing ? '處理中...' : '確認調整'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {changeRoleUser && (
                <Modal onClose={() => setChangeRoleUser(null)} title="設定校色權限">
                    <form onSubmit={handleChangeRole}>
                        <p className="mb-3 text-sm text-stone-600">設定 {changeRoleUser.username} 的系統角色</p>
                        <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}
                            className="w-full border border-stone-300 px-3 py-2 rounded-lg mb-4 text-sm font-sans">
                            <option value="user">一般用戶 (User)</option>
                            <option value="admin_ops">營運管理員 (Ops)</option>
                            <option value="admin_content">內容管理員 (Content)</option>
                            <option value="admin_economy">經濟管理員 (Economy)</option>
                            <option value="admin_support">客服管理員 (Support)</option>
                            <option value="super_admin">超級管理員 (Super Admin)</option>
                        </select>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setChangeRoleUser(null)} className="px-4 py-2 bg-stone-200 rounded-lg text-sm">取消</button>
                            <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm">{isProcessing ? '處理中...' : '確認'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {ledgerUser && (
                <Modal onClose={() => setLedgerUser(null)} title={`智匯金幣明細 - ${ledgerUser.displayName || ledgerUser.username}`}>
                    <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2 scrollbar-thin">
                        {isLedgerLoading ? (
                            <div className="py-8 text-center text-stone-400">讀取中...</div>
                        ) : ledgerData.length === 0 ? (
                            <div className="py-8 text-center text-stone-400">尚無交易紀錄</div>
                        ) : (
                            <div className="space-y-2">
                                {ledgerData.map(entry => (
                                    <div key={entry.id} className="p-2 bg-stone-50 rounded border border-stone-100 text-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-stone-700 truncate mr-2" title={entry.reason}>
                                                {entry.reason || '未註明'}
                                            </span>
                                            <span className={`font-bold shrink-0 ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {entry.amount >= 0 ? '+' : ''}{entry.amount}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-stone-400">
                                            <span>{new Date(entry.created_at * 1000).toLocaleString('zh-TW')}</span>
                                            <span>餘額: {entry.balance_after}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={() => setLedgerUser(null)} className="px-4 py-2 bg-stone-800 text-white rounded-lg w-full">關閉</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function Modal({ children, onClose, title }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-stone-800 tracking-tight">{title}</h3>
                    <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all"><X size={20} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
