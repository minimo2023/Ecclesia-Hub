
import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { useAuth } from '../../../contexts/AuthContext';
import { 
    Ship, MapPin, RotateCw, Compass, HelpCircle, 
    CheckCircle2, Clock, ArrowRight, BarChart3, 
    Layers, Anchor, Activity, Zap, CreditCard
} from 'lucide-react';

/**
 * SeaPatrolTab (夜間海巡部隊監控分頁)
 * 展示三大艦隊的巡航座標、譯本輪替狀態與昨晚出題成果
 */
export default function SeaPatrolTab() {
    const { getToken } = useAuth();
    const [status, setStatus] = useState({ isWorking: false, mode: '待機中', startedAt: null, lastPulseAt: null, pulseCount: 0, pendingGaps: 0, totalStoredThisSession: 0, paidPatrolUntil: 0 });
    const [fleet, setFleet] = useState(null);
    const [stats, setStats] = useState(null);
    const [samples, setSamples] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [pulsing, setPulsing] = useState(false);
    const [countdown, setCountdown] = useState('');  // 付費模式倒數文字
    const countdownRef = useRef(null);

    useEffect(() => {
        loadData();
    }, []);

    // 倒數計時器：監視 paidPatrolUntil
    useEffect(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        const until = status.paidPatrolUntil || 0;
        if (!until || Date.now() >= until) {
            setCountdown('');
            return;
        }
        const tick = () => {
            const diff = until - Date.now();
            if (diff <= 0) {
                setCountdown('');
                clearInterval(countdownRef.current);
                return;
            }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
        };
        tick();
        countdownRef.current = setInterval(tick, 1000);
        return () => clearInterval(countdownRef.current);
    }, [status.paidPatrolUntil]);

    useEffect(() => {
        let timer;
        if (autoRefresh) {
            timer = setInterval(() => {
                loadData(true);
            }, 5000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [autoRefresh]);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const token = getToken();
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            // 並發下載所有數據
            const [statusRes, statsRes, samplesRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/admin/patrol/status`, { headers }),
                fetch(`${API_BASE_URL}/api/admin/patrol/stats`, { headers }),
                fetch(`${API_BASE_URL}/api/admin/patrol/samples`, { headers })
            ]);

            if (statusRes.ok) {
                const d = await statusRes.json();
                setFleet(d.fleet);
                setStatus({
                    isWorking: d.isWorking,
                    mode: d.mode || '全時間補題',
                    startedAt: d.startedAt,
                    lastPulseAt: d.lastPulseAt,
                    pulseCount: d.pulseCount || 0,
                    pendingGaps: d.pendingGaps || 0,
                    totalStoredThisSession: d.totalStoredThisSession || 0,
                    paidPatrolUntil: d.paidPatrolUntil || 0,
                });
            }
            if (statsRes.ok) {
                const d = await statsRes.json();
                setStats(d.summary);
            }
            if (samplesRes.ok) {
                const d = await samplesRes.json();
                setSamples(d.samples);
            }
        } catch (error) {
            console.error('[SeaPatrol] Fetch error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleManualRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const handleManualPulse = async () => {
        setPulsing(true);
        try {
            const token = getToken();
            const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
            const res = await fetch(`${API_BASE_URL}/api/admin/patrol/pulse`, { method: 'POST', headers });
            const data = await res.json();
            // 若付費模式已啟用，立即引入倒數
            if (data.paidPatrolUntil) {
                setStatus(prev => ({ ...prev, paidPatrolUntil: data.paidPatrolUntil }));
            }
            setTimeout(() => { loadData(true); setPulsing(false); }, 2000);
        } catch (e) {
            setPulsing(false);
        }
    };

    if (loading && !refreshing) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-stone-400 space-y-4">
                <Ship className="animate-bounce text-indigo-400" size={48} />
                <p className="animate-pulse font-medium">正在聯絡海上艦隊...</p>
            </div>
        );
    }

    const vessels = fleet ? Object.entries(fleet).map(([id, data]) => ({ id, ...data })) : [];

    const getTranslationColor = (t) => {
        if (t === 'CUV_TRAD') return 'bg-blue-100 text-blue-700 border-blue-200';
        if (t === 'CNV_TRAD') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (t === 'tcv95') return 'bg-purple-100 text-purple-700 border-purple-200';
        return 'bg-stone-100 text-stone-700 border-stone-200';
    };

    const getTranslationLabel = (t) => {
        if (t === 'CUV_TRAD') return '和合本';
        if (t === 'CNV_TRAD') return '新譯本';
        if (t === 'TCV2010_TRAD' || t === 'tcv95') return '現中譯';
        return t;
    };

    const formatTime = (record) => {
        // 從紀錄中尋找所有可能的時間欄位
        const dateStr = record?.createdAt || record?.created_at || record?.timestamp || record?.updatedAt || record?.updated_at || record?.date;
        
        if (!dateStr) {
            // Debug 用：看看究竟拿到什麼欄位
            console.warn('[SeaPatrol] Missing time fields. Keys available:', record ? Object.keys(record) : 'none');
            return '剛剛'; // 若抓不到時間，預設顯示「剛剛」會比「Pending」體驗更好
        }
        
        const date = new (typeof dateStr === 'string' || typeof dateStr === 'number' ? Date : Object)(dateStr);
        if (isNaN(date.getTime())) return '剛剛';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            
            {/* 1. Dashboard Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-100 flex items-center justify-between">
                    <div>
                        <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">今日海巡產出</p>
                        <h2 className="text-3xl font-black">{stats?.totalToday || 0} <span className="text-lg font-normal opacity-70">題</span></h2>
                    </div>
                    <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md">
                        <Zap size={24} />
                    </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">活躍艦隻</p>
                        <h2 className="text-3xl font-black text-stone-800">{vessels.filter(v => v.active).length} <span className="text-lg font-normal opacity-40">/ {vessels.length}</span></h2>
                    </div>
                    <div className="bg-emerald-50 text-emerald-500 p-3 rounded-xl border border-emerald-100">
                        <Activity size={24} />
                    </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">補題服務</p>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-black text-stone-800">
                                {status.startedAt ? (status.isWorking ? '補題中' : '待機') : '未啟動'}
                            </h2>
                            {status.isWorking && (
                                <div className="flex h-3 w-3 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-stone-400 flex items-center gap-1">
                            <Clock size={10} />
                            {status.lastPulseAt ? `上次: ${new Date(status.lastPulseAt).toLocaleTimeString()}` : '尚未 Pulse'}
                            {' · '}第 {status.pulseCount} 次
                        </p>
                        <p className="text-[10px] text-stone-400">
                            本次已存 {status.totalStoredThisSession} 題 · 待補書卷 {status.pendingGaps} 本
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {/* 付費補題模式倒數指示器 */}
                        {countdown && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
                                <CreditCard size={10} />
                                <span className="text-[10px] font-bold font-mono">{countdown}</span>
                            </div>
                        )}
                        <button
                            id="btn-manual-pulse"
                            onClick={handleManualPulse}
                            disabled={pulsing || status.isWorking || !!countdown}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-xl border transition-all flex items-center gap-1.5 ${
                                countdown
                                ? 'bg-stone-100 text-stone-300 border-stone-200 cursor-not-allowed'
                                : pulsing || status.isWorking
                                ? 'bg-stone-100 text-stone-300 border-stone-200 cursor-not-allowed'
                                : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                            }`}
                            title={countdown ? `付費補題模式進行中，剩餘 ${countdown}` : '手動觸發付費補題 (2小時)'}
                        >
                            <Zap size={10} />
                            {pulsing ? '啟動中...' : countdown ? `付費中 (${countdown})` : '手動 Pulse'}
                        </button>
                        <button
                            onClick={handleManualRefresh}
                            className={`p-2 rounded-xl border transition-all ${refreshing ? 'bg-amber-50 text-amber-500 border-amber-100 animate-spin' : 'bg-stone-50 text-stone-500 border-stone-100 hover:bg-stone-100'}`}
                            title="手動更新"
                        >
                            <RotateCw size={18} />
                        </button>
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all flex items-center gap-1.5 ${
                                autoRefresh
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-stone-100 text-stone-400 border-stone-200 hover:bg-stone-200'
                            }`}
                        >
                            <div className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-stone-300'}`} />
                            {autoRefresh ? '即時監測中' : '自動更新已停'}
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Fleet Movement */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-black text-stone-700 flex items-center gap-2">
                        <Anchor size={18} className="text-indigo-500" />
                        艦隊巡邏坐標 (Real-time Pointers)
                    </h3>
                    <div className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">
                        Automatic Rotation Active
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {vessels.map((v) => (
                        <div key={v.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                            <div className="bg-stone-50 p-4 border-b border-stone-100 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${v.active ? 'bg-indigo-500 text-white' : 'bg-stone-200 text-stone-400'}`}>
                                        <Ship size={16} />
                                    </div>
                                    <span className="font-black text-stone-800 text-sm">{v.id}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTranslationColor(v.translation)}`}>
                                    {getTranslationLabel(v.translation)}
                                </span>
                            </div>
                            <div className="p-5 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 bg-stone-100 p-2 rounded-full text-stone-400">
                                        <MapPin size={14} />
                                    </div>
                                    <div>
                                        <p className="text-stone-400 text-[10px] font-bold uppercase">目前航道</p>
                                        <p className="text-lg font-black text-stone-800 leading-tight">
                                            {v.book}
                                        </p>
                                        <p className="text-sm text-stone-500 font-medium">第 {v.chapter} 章</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex items-center gap-1.5">
                                        <Compass size={12} className="text-stone-300" />
                                        <span className="text-[10px] text-stone-400 font-mono">STEP: {v.verseStart || v.verse_start}</span>
                                    </div>
                                    <div className="text-[10px] text-stone-300 italic">
                                        {(v.lastPatrolAt || v.last_patrol_at) ? new Date(v.lastPatrolAt || v.last_patrol_at).toLocaleTimeString() : 'Waiting...'}
                                    </div>
                                </div>

                                {/* Progress Bar (Mockup based on chapters if known, or just static) */}
                                <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden relative">
                                    <div className="absolute top-0 left-0 h-full bg-indigo-500 w-1/3 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Recent Samples */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
                    <h3 className="font-bold text-stone-700 flex items-center gap-2">
                        <Layers size={18} className="text-indigo-500" />
                        最新巡邏產出抽檢
                    </h3>
                    <span className="text-xs text-stone-500 font-medium">顯示最近 10 筆紀錄</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-stone-50/50 text-stone-500 text-left border-b border-stone-100">
                            <tr>
                                <th className="px-6 py-3 font-black uppercase tracking-tighter w-24">來源艦隻</th>
                                <th className="px-6 py-3 font-black uppercase tracking-tighter w-24">譯本</th>
                                <th className="px-6 py-3 font-black uppercase tracking-tighter w-32">範圍</th>
                                <th className="px-6 py-3 font-black uppercase tracking-tighter">題目內容</th>
                                <th className="px-6 py-3 font-black uppercase tracking-tighter w-32 text-right">生成時間</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                            {samples.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-stone-400 italic">
                                        今日尚無海巡產出，請待凌晨作業時窗...
                                    </td>
                                </tr>
                            ) : (
                                samples.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-stone-700 flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                {s.source.replace('patrol:', '')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${getTranslationColor(s.version)}`}>
                                                {getTranslationLabel(s.version)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-stone-800">{s.book}</div>
                                            <div className="text-[10px] text-stone-400">Ch.{s.chapter}:{s.verseStart || s.verse_start}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-stone-700 font-medium leading-relaxed max-w-md line-clamp-1">{s.question}</div>
                                            <div className="text-emerald-600 font-bold mt-0.5 mt-1 flex items-center gap-1">
                                                <CheckCircle2 size={10} />
                                                {s.answer}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="text-stone-400 font-mono scale-90 origin-right">
                                                {formatTime(s)}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-stone-50/30 border-t border-stone-100 flex justify-center">
                    <button className="text-stone-400 hover:text-indigo-600 text-xs font-bold flex items-center gap-1 transition-colors">
                        查看完整海巡紀錄 <ArrowRight size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
}
