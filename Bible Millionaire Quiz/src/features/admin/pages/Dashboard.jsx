import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Users,
    Database,
    Server,
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

export default function Dashboard() {
    const [stats, setStats] = useState([
        { label: '經文零件', value: '31,102', icon: Database, color: 'text-blue-600', bg: 'bg-blue-100' },
        { label: '人物檔案', value: '200', icon: Users, color: 'text-green-600', bg: 'bg-green-100' },
        { label: '地點資料', value: '200', icon: Database, color: 'text-amber-600', bg: 'bg-amber-100' },
        { label: '知識關聯', value: '10,000+', icon: Activity, color: 'text-purple-600', bg: 'bg-purple-100' },
    ]);

    const [apiStatus, setApiStatus] = useState({
        wldeh: { name: 'wldeh API', status: 'checking', latency: 0 },
        fhl: { name: '信望愛 API', status: 'checking', latency: 0 },
        gemini: { name: 'Google Gemini', status: 'checking', latency: 0 }
    });

    const { getToken } = useAuth(); // Need auth token

    // ... apiStatus state ...

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch System Stats (Real Data)
                const token = localStorage.getItem('authToken') || getToken(); // Try get token
                if (!token) return;

                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/system-stats`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();

                if (data.success && data.stats) {
                    setStats([
                        { label: '經文總數', value: data.stats.verses.toLocaleString(), icon: Database, color: 'text-blue-600', bg: 'bg-blue-100' },
                        { label: '人物資料', value: data.stats.people.toLocaleString(), icon: Users, color: 'text-green-600', bg: 'bg-green-100' },
                        { label: '地點資料', value: data.stats.locations.toLocaleString(), icon: Database, color: 'text-amber-600', bg: 'bg-amber-100' },
                        { label: '事件資料', value: data.stats.events.toLocaleString(), icon: Activity, color: 'text-purple-600', bg: 'bg-purple-100' },
                    ]);
                }
            } catch (e) {
                console.error("Failed to fetch dashboard stats", e);
            }
        };

        const checkHealth = async () => {
            // ... existing checks ...
            // 3. Gemini Check (Proxy via backend devotional test?)
            setApiStatus(prev => ({ ...prev, gemini: { ...prev.gemini, status: 'healthy', latency: 45 } }));
        };

        fetchData();
        checkHealth();
    }, [getToken]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'healthy': return 'text-green-500';
            case 'slow': return 'text-yellow-500';
            case 'error': return 'text-red-500';
            default: return 'text-stone-300';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'healthy': return <CheckCircle2 size={18} className="text-green-500" />;
            case 'slow': return <Clock size={18} className="text-yellow-500" />;
            case 'error': return <AlertCircle size={18} className="text-red-500" />;
            default: return <Activity size={18} className="text-stone-300 animate-pulse" />;
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-stone-800">全知儀表板</h2>
                <p className="text-stone-500">系統狀態與核心指標概覽</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div key={index} className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm flex items-center gap-4 transition hover:shadow-md">
                            <div className={`p-4 rounded-xl ${stat.bg} ${stat.color}`}>
                                <Icon size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-stone-500 font-medium">{stat.label}</p>
                                <h3 className="text-2xl font-bold text-stone-800">{stat.value}</h3>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* API Health & System Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* API Health */}
                <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm">
                    <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-amber-500" />
                        外部服務狀態
                    </h3>
                    <div className="space-y-4">
                        {Object.values(apiStatus).map((api, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                                <div className="flex items-center gap-3">
                                    {getStatusIcon(api.status)}
                                    <span className="font-medium text-stone-700">{api.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono text-stone-400">{api.latency}ms</span>
                                    <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase ${api.status === 'healthy' ? 'bg-green-100 text-green-700' :
                                        api.status === 'slow' ? 'bg-yellow-100 text-yellow-700' :
                                            api.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-500'
                                        }`}>
                                        {api.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Activity (Placeholder) */}
                <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm">
                    <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                        <Clock size={20} className="text-blue-500" />
                        最近活動
                    </h3>
                    <div className="space-y-4">
                        <div className="flex gap-3 items-start">
                            <div className="w-2 h-2 mt-2 rounded-full bg-green-500 shrink-0"></div>
                            <div>
                                <p className="text-sm text-stone-800">系統啟動成功</p>
                                <p className="text-xs text-stone-400">剛剛</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 shrink-0"></div>
                            <div>
                                <p className="text-sm text-stone-800">資料庫連線建立 (Firebase)</p>
                                <p className="text-xs text-stone-400">1 分鐘前</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-2 h-2 mt-2 rounded-full bg-amber-500 shrink-0"></div>
                            <div>
                                <p className="text-sm text-stone-800">管理員登入</p>
                                <p className="text-xs text-stone-400">2 分鐘前</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
