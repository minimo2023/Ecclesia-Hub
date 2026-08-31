import React, { useState } from 'react';
import { Database, LogOut, Menu, X, User, Zap, MessageSquare, Map } from 'lucide-react';

export default function AdminShell({ children, currentView, onNavigate, onLogout }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const menuItems = [
        { id: 'users', label: '用戶管理', icon: User },
        { id: 'dashboard', label: '每日靈修', icon: Zap },
        { id: 'knowledge', label: '資料庫檢視', icon: Database },

        { id: 'feedback', label: '意見回饋', icon: MessageSquare },
        { id: 'expedition', label: '遠征隊設定', icon: Map },
    ];

    return (
        <div className="min-h-screen bg-stone-100 text-stone-800 flex">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-stone-200 transform transition-transform 
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 flex flex-col`}>

                <div className="h-14 flex items-center px-4 border-b border-stone-200 bg-amber-500">
                    <span className="font-bold text-white">管理中心</span>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;
                        return (
                            <button key={item.id} onClick={() => { onNavigate(item.id); setIsSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                                    ${isActive ? 'bg-amber-100 text-amber-700' : 'text-stone-600 hover:bg-stone-100'}`}>
                                <Icon size={18} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Header - 包含登出按鈕 */}
                <header className="h-14 border-b border-stone-200 flex items-center justify-between px-4 bg-white">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-stone-500 md:hidden">
                            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                        <span className="font-bold text-stone-800">管理中心</span>
                    </div>
                    <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 text-sm text-stone-500 hover:text-red-500 border border-stone-200 rounded-lg hover:bg-red-50 transition-colors">
                        <LogOut size={16} />
                        <span className="hidden sm:inline">登出</span>
                    </button>
                </header>

                <div className="flex-1 overflow-auto p-4 md:p-6">
                    {children}
                </div>
            </main>

            {isSidebarOpen && <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
        </div>
    );
}
