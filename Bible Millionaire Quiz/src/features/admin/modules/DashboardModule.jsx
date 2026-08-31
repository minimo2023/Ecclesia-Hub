import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { BookHeart, Anchor, Activity, Users } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function DashboardModule() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const { getToken } = useAuth();

    const loadData = useCallback(async () => {
        const currentToken = getToken() || localStorage.getItem('adminToken');
        if (!currentToken) { setLoading(false); return; }
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/system-stats`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (res.status === 401) return;
            if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
                setStats(await res.json());
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin"></div>
            <div className="text-stone-500 font-medium animate-pulse">正在同步 Governor 360 治理數據...</div>
        </div>
    );

    const dashboardStats = stats?.stats || { users: 0, verses: 0, knowledge: 0, locations: 0 };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-stone-800 tracking-tight">Governor 360 指揮中心</h1>
                    <p className="text-xs text-stone-400 font-medium">Logos Voyager v3.0 Governance Hub</p>
                </div>
                <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    系統狀態：良好
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="註冊用戶" value={dashboardStats.users} icon="👥" color="blue" />
                <StatCard title="經文資產" value={dashboardStats.verses} icon="📖" color="amber" />
                <StatCard title="知識條目" value={dashboardStats.knowledge} icon="🧠" color="emerald" />
                <StatCard title="流通地點" value={dashboardStats.locations} icon="📍" color="stone" />
            </div>

            {/* System Health Strip */}
            <HealthStrip />
        </div>
    );
}

function HealthStrip() {
    const { getToken } = useAuth();
    const [devotion, setDevotion] = useState(null);
    const [aiStatus, setAiStatus] = useState(null);
    const [patrol, setPatrol] = useState(null);
    const [activeUsers, setActiveUsers] = useState(null);

    useEffect(() => {
        const token = getToken() || localStorage.getItem('adminToken');

        // Today's devotional status
        fetch(`${API_BASE_URL}/api/ai/devotional`)
            .then(r => r.json())
            .then(d => setDevotion(d.success ? 'ok' : 'missing'))
            .catch(() => setDevotion('error'));

        // AI quota status
        fetch(`${API_BASE_URL}/api/admin/ai/stats`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => setAiStatus(d?.data?.quotaStatus?.status || 'unknown'))
            .catch(() => setAiStatus('error'));

        // Patrol status
        fetch(`${API_BASE_URL}/api/admin/patrol/status`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => setPatrol(d))
            .catch(() => setPatrol(null));

        // Active users from economy stats
        fetch(`${API_BASE_URL}/api/admin/economy/stats`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => setActiveUsers(d?.stats?.active_users ?? d?.activeUsers ?? null))
            .catch(() => setActiveUsers(null));
    }, []);

    const aiColor = { green: 'emerald', yellow: 'amber', red: 'red', unknown: 'stone', error: 'red' }[aiStatus] || 'stone';
    const aiLabel = { green: '配額充足', yellow: '配額偏低', red: '配額耗盡', unknown: '未知', error: '連線失敗' }[aiStatus] || '載入中';

    return (
        <div>
            <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3">系統健康快覽</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* AI State */}
                <HealthCell
                    icon={<Activity size={18} />}
                    label="AI 配額狀態"
                    status={aiStatus === 'green' ? 'ok' : aiStatus === 'yellow' ? 'warn' : aiStatus === null ? 'loading' : 'error'}
                    value={aiLabel}
                    color={aiColor}
                />
                {/* Today's Devotion */}
                <HealthCell
                    icon={<BookHeart size={18} />}
                    label="今日靈修"
                    status={devotion === 'ok' ? 'ok' : devotion === null ? 'loading' : 'error'}
                    value={devotion === 'ok' ? '已生成' : devotion === 'missing' ? '尚未生成' : devotion === null ? '載入中...' : '連線失敗'}
                    color={devotion === 'ok' ? 'emerald' : devotion === 'missing' ? 'amber' : 'red'}
                    linkTo="/devotions"
                />
                {/* Patrol */}
                <HealthCell
                    icon={<Anchor size={18} />}
                    label="補題艦隊"
                    status={patrol === null ? 'loading' : 'ok'}
                    value={patrol === null ? '載入中...' : (patrol.running ? '巡航中' : '待命')}
                    color={patrol?.running ? 'blue' : 'stone'}
                    linkTo="/patrol"
                />
                {/* Active Users */}
                <HealthCell
                    icon={<Users size={18} />}
                    label="近期活躍用戶"
                    status={activeUsers === null ? 'loading' : 'ok'}
                    value={activeUsers === null ? '載入中...' : activeUsers.toLocaleString()}
                    color="indigo"
                />
            </div>
        </div>
    );
}

function HealthCell({ icon, label, status, value, color, linkTo }) {
    const colorMap = {
        emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
        amber: 'text-amber-600 bg-amber-50 border-amber-100',
        red: 'text-red-600 bg-red-50 border-red-100',
        blue: 'text-blue-600 bg-blue-50 border-blue-100',
        indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
        stone: 'text-stone-500 bg-stone-50 border-stone-200',
    };
    const dotMap = {
        ok: 'bg-emerald-500 animate-pulse',
        warn: 'bg-amber-400 animate-pulse',
        error: 'bg-red-500',
        loading: 'bg-stone-300 animate-pulse',
    };
    
    const navigate = useNavigate();
    
    const handleClick = () => {
        if (linkTo) {
            navigate(linkTo);
        }
    };

    return (
        <div 
            className={`p-4 rounded-2xl border ${colorMap[color] || colorMap.stone} ${linkTo ? 'cursor-pointer hover:shadow-md transition-shadow hover:scale-[1.02] duration-200' : ''}`}
            onClick={handleClick}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="opacity-60">{icon}</div>
                <span className={`w-2 h-2 rounded-full ${dotMap[status]}`} />
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</div>
            <div className="text-lg font-black font-mono">{value}</div>
        </div>
    );
}

function StatCard({ title, value, icon, color }) {
    const colorConfigs = {
        blue: { bg: 'bg-gradient-to-br from-blue-50 to-indigo-50', border: 'border-blue-100', iconBg: 'bg-blue-500', text: 'text-blue-700', shadow: 'shadow-blue-900/5' },
        amber: { bg: 'bg-gradient-to-br from-amber-50 to-orange-50', border: 'border-amber-100', iconBg: 'bg-amber-500', text: 'text-amber-700', shadow: 'shadow-amber-900/5' },
        emerald: { bg: 'bg-gradient-to-br from-emerald-50 to-teal-50', border: 'border-emerald-100', iconBg: 'bg-emerald-500', text: 'text-emerald-700', shadow: 'shadow-emerald-900/5' },
        stone: { bg: 'bg-gradient-to-br from-stone-50 to-slate-100', border: 'border-stone-200', iconBg: 'bg-stone-600', text: 'text-stone-700', shadow: 'shadow-stone-900/5' }
    };
    const config = colorConfigs[color];
    return (
        <div className={`p-6 rounded-2xl border ${config.bg} ${config.border} ${config.shadow} shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-default relative overflow-hidden`}>
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
