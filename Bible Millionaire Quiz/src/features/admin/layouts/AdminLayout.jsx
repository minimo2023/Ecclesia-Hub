import React from 'react';
import {
    Compass,
    Users,
    Coins,
    BookOpen,
    Cpu,
    HeartHandshake,
    ShieldCheck,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronRight,
    Map,
    AlertTriangle,
    ScanSearch,
    BookHeart,
    DollarSign,
    Sliders,
    Anchor,
    Ship
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { API_BASE_URL } from '../../../config/api';

/**
 * Governor 360 Admin Layout — 4 Zone Sidebar v3.0
 */
export default function AdminLayout({ children, currentView, onNavigate, onLogout }) {
    const { user, getToken } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 1024);

    const [auditAlert, setAuditAlert] = React.useState({ hasAlert: false, flaggedCount: 0, lastAuditAt: null });
    const [showAuditPopup, setShowAuditPopup] = React.useState(false);

    React.useEffect(() => {
        const fetchAuditStatus = async () => {
            try {
                const token = getToken();
                const res = await fetch(`${API_BASE_URL}/api/admin/questions/audit-status`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (res.ok) {
                    const data = await res.json();
                    setAuditAlert(data);
                    if (data.hasAlert) setTimeout(() => setShowAuditPopup(true), 800);
                }
            } catch (e) { /* silent */ }
        };
        fetchAuditStatus();
    }, []);

    const handleAcknowledge = async () => {
        try {
            const token = getToken();
            await fetch(`${API_BASE_URL}/api/admin/questions/audit/acknowledge`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            setAuditAlert(prev => ({ ...prev, hasAlert: false }));
        } catch (e) { }
        setShowAuditPopup(false);
    };

    const adminRoles = Array.isArray(user?.adminRoles) ? user.adminRoles : [];
    const isSuperAdmin = user?.role === 'super_admin' || adminRoles.includes('super_admin');

    // 4 Zone 分區結構
    const moduleSections = [
        {
            label: null,
            modules: [
                { id: 'dashboard', label: '指揮艦橋', icon: Compass, roles: ['admin_ops'] },
            ]
        },
        {
            label: '內容與數據管理',
            color: 'blue',
            modules: [
                { id: 'content', label: '題庫管理', icon: BookOpen, roles: ['admin_content'] },
                { id: 'users', label: '會員管理', icon: Users, roles: ['admin_support', 'admin_ops'] },
                { id: 'devotions', label: '靈修短文', icon: BookHeart, roles: ['admin_content'] },
            ]
        },
        {
            label: '資產與成本追蹤',
            color: 'indigo',
            modules: [
                { id: 'economy', label: '資產流通', icon: Coins, roles: ['admin_economy'] },
                { id: 'ai-gov', label: 'AI 營運觀測站', icon: Cpu, roles: ['admin_ai'] },
            ]
        },
        {
            label: '遊戲與系統配置',
            color: 'amber',
            modules: [
                { id: 'expedition', label: '遊戲管理', icon: Map, roles: ['admin_content', 'admin_ops'] },
                { id: 'patrol', label: '補題艦隊', icon: Anchor, roles: ['admin_content', 'admin_ops'] },
            ]
        },
        {
            label: '其他',
            color: 'stone',
            modules: [
                { id: 'support', label: '用戶回饋', icon: HeartHandshake, roles: ['admin_support'] },
                { id: 'audit', label: '審計日誌', icon: ShieldCheck, roles: ['super_admin'] },
                { id: 'system', label: '系統資訊', icon: Settings, roles: ['super_admin'] },
            ]
        }
    ];

    const sectionColorMap = {
        blue: { label: 'text-blue-500', dot: 'bg-blue-400' },
        indigo: { label: 'text-indigo-500', dot: 'bg-indigo-400' },
        amber: { label: 'text-amber-500', dot: 'bg-amber-400' },
        stone: { label: 'text-stone-400', dot: 'bg-stone-300' },
    };

    React.useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) setIsSidebarOpen(true);
            else setIsSidebarOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const renderNavItem = (item) => {
        const Icon = item.icon;
        const isAllowed = isSuperAdmin || item.roles.some(r => adminRoles.includes(r));
        if (!isAllowed) return null;
        const isActive = currentView === item.id;
        return (
            <button
                key={item.id}
                onClick={() => {
                    onNavigate(item.id);
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`
                    w-full flex items-center justify-between px-5 py-3 rounded-2xl transition-all duration-300 group relative
                    ${isActive
                        ? 'bg-stone-900 text-white shadow-xl shadow-stone-200'
                        : 'text-stone-500 hover:bg-white hover:text-stone-900 hover:shadow-sm'
                    }
                `}
            >
                <div className="flex items-center gap-3.5">
                    <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-amber-500' : 'bg-stone-50 group-hover:bg-amber-50'}`}>
                        <Icon size={16} className={isActive ? 'text-white' : 'text-stone-400 group-hover:text-amber-600'} />
                    </div>
                    <span className="text-[13px] font-bold tracking-wide">{item.label}</span>
                </div>
                {isActive && (
                    <div className="flex items-center">
                        <div className="w-1 h-1 bg-amber-500 rounded-full mr-2"></div>
                        <ChevronRight size={13} className="opacity-70" />
                    </div>
                )}
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-[#F9F7F5] flex font-sans text-stone-800">
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-white/70 backdrop-blur-xl border-r border-stone-200/50 shadow-[20px_0_40px_-15px_rgba(0,0,0,0.05)] transform transition-transform duration-300 ease-out
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    lg:relative lg:translate-x-0
                `}
            >
                {/* Logo */}
                <div className="h-20 flex items-center justify-between px-6 border-b border-stone-100/50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-200/40">
                            <ShieldCheck className="text-white w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="font-black text-lg leading-tight text-stone-800 tracking-tight">
                                Governor <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">360</span>
                            </h1>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse"></span>
                                <p className="text-[9px] text-stone-400 uppercase tracking-[0.2em] font-bold">Logos Voyager v3.0</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1.5 text-stone-400 hover:text-stone-600">
                        <X size={18} />
                    </button>
                </div>

                {/* User */}
                <div className="px-4 py-3 border-b border-stone-100/50">
                    <div className="flex items-center gap-3 px-2 mb-2.5">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-xl bg-white border border-stone-100 flex items-center justify-center shadow-sm">
                                <span className="text-xs font-black text-stone-600">
                                    {user?.displayName?.substring(0, 1) || 'A'}
                                </span>
                            </div>
                            {auditAlert.hasAlert && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <p className="text-sm font-black text-stone-800 truncate">{user?.displayName || '管理員'}</p>
                                {auditAlert.hasAlert && (
                                    <button
                                        onClick={() => setShowAuditPopup(true)}
                                        className="flex items-center gap-1 text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full hover:bg-red-200 transition-colors"
                                    >
                                        <AlertTriangle size={8} />{auditAlert.flaggedCount}
                                    </button>
                                )}
                            </div>
                            <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">{isSuperAdmin ? 'Super Admin' : 'Staff Admin'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-stone-500 hover:text-red-600 hover:bg-red-50/50 rounded-xl transition-all border border-stone-100 hover:border-red-100 text-[10px] font-black uppercase tracking-widest"
                    >
                        <LogOut size={12} /> 退出控制中心
                    </button>
                </div>

                {/* Navigation — 4 Zones */}
                <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-220px)] custom-scrollbar">
                    {moduleSections.map((section, sIdx) => {
                        const visibleItems = section.modules.filter(m =>
                            isSuperAdmin || m.roles.some(r => adminRoles.includes(r))
                        );
                        if (visibleItems.length === 0) return null;
                        const colors = section.color ? sectionColorMap[section.color] : null;

                        return (
                            <div key={sIdx} className={sIdx > 0 ? 'pt-2' : ''}>
                                {section.label && (
                                    <div className="flex items-center gap-2 px-5 pt-1 pb-1.5">
                                        {colors && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>}
                                        <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${colors ? colors.label : 'text-stone-400'}`}>
                                            {section.label}
                                        </span>
                                    </div>
                                )}
                                <div className="space-y-0.5">
                                    {visibleItems.map(item => renderNavItem(item))}
                                </div>
                                {sIdx < moduleSections.length - 1 && section.label && (
                                    <div className="mx-5 mt-2 border-t border-stone-100/80" />
                                )}
                            </div>
                        );
                    })}

                    {/* 審核中心動態警示 */}
                    {auditAlert.hasAlert && (
                        <button
                            onClick={() => { onNavigate('content?tab=pending'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                            className="w-full flex items-center justify-between px-5 py-3 rounded-2xl transition-all bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 shadow-sm mt-1"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="p-1.5 rounded-lg bg-red-500">
                                    <AlertTriangle size={16} className="text-white" />
                                </div>
                                <span className="text-[13px] font-black">審核中心 ({auditAlert.flaggedCount})</span>
                            </div>
                            <ChevronRight size={13} />
                        </button>
                    )}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="lg:hidden h-16 bg-white border-b border-stone-200 flex items-center px-5 justify-between shrink-0">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded-lg">
                        <Menu size={22} />
                    </button>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-amber-600 w-4 h-4" />
                        <span className="font-bold text-stone-800 text-sm tracking-tight">Governor 360</span>
                    </div>
                    <div className="w-9"></div>
                </header>

                <div className="flex-1 overflow-auto bg-[#F9F7F5] relative">
                    <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-10 animate-in fade-in duration-500">
                        {children}
                    </div>
                </div>
            </main>

            {/* AI 自檢通知彈窗 */}
            {showAuditPopup && (
                <div className="fixed bottom-6 right-6 z-[100] w-[320px] animate-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white rounded-2xl shadow-2xl shadow-stone-200/60 border border-stone-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ScanSearch className="text-white" size={16} />
                                <span className="text-white text-sm font-black">AI 週期自檢完成</span>
                            </div>
                            <button onClick={() => setShowAuditPopup(false)} className="text-white/70 hover:text-white">
                                <X size={15} />
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                                    <AlertTriangle className="text-red-500" size={16} />
                                </div>
                                <div>
                                    <p className="text-stone-800 font-bold text-sm">發現 <span className="text-red-600">{auditAlert.flaggedCount} 題</span>疑似語意重複</p>
                                    <p className="text-stone-500 text-xs mt-1 leading-relaxed">AI 已標記待審題目，請前往題庫管理確認。</p>
                                    {auditAlert.lastAuditAt && (
                                        <p className="text-stone-400 text-[10px] mt-1.5">
                                            上次掃描：{new Date(auditAlert.lastAuditAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="px-4 pb-4 flex gap-2">
                            <button
                                onClick={() => { onNavigate('content'); setShowAuditPopup(false); }}
                                className="flex-1 bg-stone-900 hover:bg-stone-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors"
                            >
                                前往題庫管理 →
                            </button>
                            <button
                                onClick={handleAcknowledge}
                                className="px-3 py-2.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 text-xs font-bold rounded-xl transition-colors"
                            >
                                已知曉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
