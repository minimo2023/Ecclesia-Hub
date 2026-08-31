import React, { useState, useEffect } from 'react';
import { Server, Database, HardDrive, Wifi, Info, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function SettingsModule() {
    const { getToken } = useAuth();
    const [settings, setSettings] = useState({
        autoBackup: true,
        crawlInterval: '24',
        maxStorageGB: '50',
        enableLogging: true,
    });
    const [sysInfo, setSysInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { fetchSysInfo(); }, []);

    const fetchSysInfo = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/system-stats`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setSysInfo(data);
            }
        } catch (err) {
            console.error('Fetch System Info Error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    function handleChange(key, value) {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    function handleSave() {
        alert('設定已儲存');
    }

    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    };

    const system = sysInfo?.system || {};
    const stats = sysInfo?.stats || {};

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-stone-800 tracking-tight flex items-center gap-2">
                    <Server className="text-amber-500" />
                    系統設定與狀態
                </h2>
                <button onClick={fetchSysInfo} className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors">
                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Server Info */}
                <div className="bg-white border border-stone-200 p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-bold text-stone-800 mb-6 flex items-center gap-2">
                        <Server size={20} className="text-blue-500" />
                        伺服器資訊
                    </h3>
                    <div className="space-y-4 text-sm">
                        <InfoRow label="作業系統" value={system.platform ? `${system.platform} (${system.arch})` : '正在載入...'} />
                        <InfoRow label="Node.js 版本" value={system.nodeVersion || '正在載入...'} />
                        <InfoRow label="系統版本" value={system.osRelease || '-'} />
                        <InfoRow label="執行狀態" value="運行中" valueColor="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-bold" />
                        <InfoRow label="運行時間" value={system.uptime ? `${Math.floor(system.uptime / 3600)} 小時` : '-'} />
                    </div>
                </div>

                {/* Storage Info */}
                <div className="bg-white border border-stone-200 p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-bold text-stone-800 mb-6 flex items-center gap-2">
                        <HardDrive size={20} className="text-purple-500" />
                        資源消耗
                    </h3>
                    <div className="space-y-4 text-sm">
                        <InfoRow label="資料庫總大小" value={formatSize(system.totalDbSize)} valueColor="text-stone-800 font-bold" />
                        <InfoRow label="記憶體使用 (RSS)" value={system.memoryUsage ? formatSize(system.memoryUsage.rss) : '-'} />
                        <InfoRow label="Heap 使用" value={system.memoryUsage ? formatSize(system.memoryUsage.heapUsed) : '-'} />
                        <InfoRow label="負載 (1/5/15m)" value={system.loadAvg ? system.loadAvg.map(l => l.toFixed(2)).join(' / ') : '-'} />
                    </div>
                </div>

                {/* Content Stats */}
                <div className="bg-white border border-stone-200 p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-bold text-stone-800 mb-6 flex items-center gap-2">
                        <Database size={20} className="text-emerald-500" />
                        內容統計
                    </h3>
                    <div className="space-y-4 text-sm">
                        <InfoRow label="總用戶數" value={stats.users || 0} />
                        <InfoRow label="經文總計" value={stats.verses || 0} />
                        <InfoRow label="地點記錄" value={stats.locations || 0} />
                        <InfoRow label="各表大小" value="查看詳情" />
                        <div className="pl-4 border-l-2 border-stone-100 space-y-2 mt-2 opacity-70">
                            {system.dbSizes && Object.entries(system.dbSizes).map(([name, size]) => (
                                <div key={name} className="flex justify-between text-[11px] font-mono">
                                    <span>{name}</span>
                                    <span>{formatSize(size)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Database Settings (Controlled) */}
                <div className="bg-white border border-stone-200 p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-bold text-stone-800 mb-6 flex items-center gap-2">
                        <Wifi size={20} className="text-amber-500" />
                        系統自動化
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-stone-600 mb-2">自動備份間隔（小時）</label>
                            <input
                                type="number"
                                value={settings.crawlInterval}
                                onChange={(e) => handleChange('crawlInterval', e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                            <span className="text-sm font-bold text-stone-600">啟用自動備份</span>
                            <button
                                onClick={() => handleChange('autoBackup', !settings.autoBackup)}
                                className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${settings.autoBackup ? 'bg-emerald-500' : 'bg-stone-300'}`}
                            >
                                <div className={`w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${settings.autoBackup ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
                <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-8 py-3 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-bold shadow-lg shadow-stone-900/10 transition-colors"
                >
                    <Save size={18} />
                    儲存系統配置
                </button>
            </div>
        </div>
    );
}

function InfoRow({ label, value, valueColor = 'text-stone-700' }) {
    return (
        <div className="flex justify-between items-center py-1 border-b border-stone-50">
            <span className="text-stone-500 font-medium">{label}</span>
            <span className={`font-mono text-xs ${valueColor}`}>{value}</span>
        </div>
    );
}
