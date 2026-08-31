import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Settings, Package, Map, Heart, Clock, Coins, Shield, BookOpen, Tent, Users, Database, AlertCircle, Plus, Sliders, Gift } from 'lucide-react';
import { ShopItemsEditor, ClassicRewardEditor, SpeedRewardEditor } from '../components/SpecificEditors';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * ExpeditionModule - 遠征隊設定管理模組 (獨立)
 * Admin panel for configuring Bible Expedition mode
 */
export default function ExpeditionModule() {
    const { getToken } = useAuth();
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [activeTeams, setActiveTeams] = useState([]);
    const [loadingActive, setLoadingActive] = useState(false);
    const [poolStats, setPoolStats] = useState({ total: 0 });
    const [loadingPool, setLoadingPool] = useState(false);
    const [activeTab, setActiveTab] = useState('monitoring');

    // Fetch config from API
    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/expedition/admin/config`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                // Convert array to object by key
                const configObj = {};
                data.config.forEach(item => {
                    configObj[item.key] = item.value;
                });
                setConfig(configObj);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
        fetchActiveTeams();
        fetchPoolStats();
        const interval = setInterval(() => {
            fetchActiveTeams();
            fetchPoolStats();
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchConfig]);

    const fetchActiveTeams = async () => {
        setLoadingActive(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/expedition/admin/active-teams`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setActiveTeams(data.teams);
            }
        } catch (err) {
            console.error('Fetch active teams error:', err);
        } finally {
            setLoadingActive(false);
        }
    };

    const fetchPoolStats = async () => {
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/expedition/admin/pool-stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setPoolStats(data.stats);
            }
        } catch (err) {
            console.error('Fetch pool stats error:', err);
        }
    };

    const handlePoolRefill = async (stage, count = 10) => {
        setLoadingPool(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/expedition/admin/pool-refill`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ stage, count })
            });
            const data = await response.json();
            if (data.success) {
                setSuccess(data.message);
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingPool(false);
        }
    };

    const handleStageAdjustment = async (teamId, newStage) => {
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/expedition/admin/team/${teamId}/stage`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ stage: parseInt(newStage) })
            });
            const data = await response.json();
            if (data.success) {
                setSuccess(data.message);
                fetchActiveTeams();
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    // Save config to API
    const saveConfig = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/expedition/admin/config`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ config })
            });
            const data = await response.json();
            if (data.success) {
                setSuccess('設定已儲存！');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Update a specific config value
    const updateConfig = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    // Update shop item price
    const updateShopItem = (itemId, field, value) => {
        const items = [...(config.shop_items || [])];
        const idx = items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            items[idx] = { ...items[idx], [field]: parseInt(value) || 0 };
            updateConfig('shop_items', items);
        }
    };

    // Update stage setting
    const updateStage = (stageId, field, value) => {
        const stages = [...(config.stages || [])];
        const idx = stages.findIndex(s => s.id === stageId);
        if (idx !== -1) {
            stages[idx] = { ...stages[idx], [field]: ['countdown', 'reward', 'milestone', 'perQuestionReward'].includes(field) ? parseInt(value) || 0 : value };
            updateConfig('stages', stages);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="w-12 h-12 border-4 border-stone-100 border-t-rose-500 rounded-full animate-spin" />
                <p className="text-stone-400 text-sm font-medium animate-pulse">正在加載遠征隊戰略情報...</p>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                    <AlertCircle size={24} />
                </div>
                <div>
                    <h3 className="font-bold text-red-800">配置加載失敗</h3>
                    <p className="text-sm text-red-600/70">{error || '請檢查後端 API 連線或管理員權限'}</p>
                    <button onClick={fetchConfig} className="mt-2 text-xs font-bold text-red-700 hover:underline">點擊重試</button>
                </div>
            </div>
        );
    }

    const shopItems = config.shop_items || [];
    const stages = config.stages || [];
    const questionRatio = config.question_ratio || { bible: 0.8, geography: 0.2 };
    const initialLives = parseInt(config.initial_lives) || 3;
    const lifelineCosts = config.lifeline_costs || { fiftyFifty: 10, phoneFriend: 15, askAudience: 15, addTime: 10 };
    const classicReward = config.classic_reward_config || { perQuestion: 1, victoryBonus: 0.2 };
    const speedReward = config.speed_reward_config || { perQuestion: 2 };
    const registrationBonus = parseInt(config.registration_bonus) || 0;
    const registrationBonusPoints = parseInt(config.registration_bonus_points) || 0;
    const dailyLoginBonus = parseInt(config.daily_login_bonus) || 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-2">
                <div>
                    <h1 className="text-3xl font-black text-stone-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-rose-500 rounded-xl shadow-lg shadow-rose-200">
                            <Map className="text-white" size={24} />
                        </div>
                        遠征戰略中心
                    </h1>
                    <p className="text-xs text-stone-400 mt-2 font-medium tracking-wide">地理與經文遠征隊 · 系統難度與物資管理 · 指揮部專用</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={fetchConfig}
                        disabled={loading}
                        className="p-3 bg-white border border-stone-200 hover:bg-stone-50 rounded-2xl text-stone-500 transition-all active:scale-95 shadow-sm"
                        title="同步雲端設定"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={saveConfig}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-3.5 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl font-black shadow-xl shadow-stone-900/20 transition-all active:scale-95 text-sm tracking-widest"
                    >
                        <Save size={18} />
                        {saving ? '同步中...' : '發布配置'}
                    </button>
                </div>
            </div>

            {/* Notification Bar */}
            {(error || success) && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 border shadow-sm transition-all animate-in fade-in slide-in-from-top-2 ${error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    }`}>
                    {error ? <AlertCircle size={18} /> : <RefreshCw size={18} className="animate-spin" />}
                    <span className="text-sm font-bold">{error ? `致命錯誤: ${error}` : `成功操作: ${success}`}</span>
                </div>
            )}

            {/* Main Config Grid */}
            
            {/* Tabs */}
            <div className="flex gap-4 border-b border-stone-200 mb-6">
                <button 
                    onClick={() => setActiveTab('monitoring')}
                    className={`pb-3 px-2 text-sm font-bold transition-colors border-b-2 ${activeTab === 'monitoring' ? 'border-amber-500 text-amber-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
                >指揮監控與核心規則</button>
                <button 
                    onClick={() => setActiveTab('parameters')}
                    className={`pb-3 px-2 text-sm font-bold transition-colors border-b-2 ${activeTab === 'parameters' ? 'border-amber-500 text-amber-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
                >系統經濟與細部參數</button>
            </div>

            {activeTab === 'monitoring' ? (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Left Column: Basic & Economy */}
                <div className="xl:col-span-2 space-y-6">
                    {/* Game Rules Card */}
                    <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                            <h2 className="text-base font-black text-stone-800 flex items-center gap-2">
                                <Settings className="text-stone-400" size={18} />
                                遠征核心規則
                            </h2>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <ControlGroup icon={<Heart className="text-rose-400" />} label="初始生命值" description="單場冒險生命總量">
                                    <input
                                        type="number"
                                        value={initialLives}
                                        onChange={(e) => updateConfig('initial_lives', e.target.value)}
                                        className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-2 text-stone-800 font-bold focus:ring-2 focus:ring-rose-500/20 outline-none"
                                    />
                                </ControlGroup>

                                <ControlGroup icon={<BookOpen className="text-blue-400" />} label="題目分配比 (經文)" description="剩餘比例自動分配給地理">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={Math.round(questionRatio.bible * 100)}
                                            onChange={(e) => updateConfig('question_ratio', {
                                                bible: parseInt(e.target.value) / 100,
                                                geography: 1 - parseInt(e.target.value) / 100
                                            })}
                                            className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-2 text-stone-800 font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                                        />
                                        <span className="text-stone-400 font-bold">%</span>
                                    </div>
                                </ControlGroup>

                                <ControlGroup icon={<Database className="text-emerald-400" />} label="本地緩存快取" description="當前已編譯題庫總量">
                                    <div className="h-10 flex items-center font-mono text-emerald-600 font-bold bg-emerald-50 px-4 rounded-xl border border-emerald-100">
                                        {poolStats.total || 0} Pkts
                                    </div>
                                </ControlGroup>
                            </div>
                        </div>
                    </div>

                    {/* Economy Settings Card */}
                    <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-stone-50 border-b border-stone-100">
                            <h2 className="text-base font-black text-stone-800 flex items-center gap-2">
                                <Coins className="text-amber-500" size={18} />
                                貨幣體系與輔助消耗
                            </h2>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                
                                {/* Mode Rewards via Editors */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest border-b border-stone-50 pb-2">模式獎勵係數</h3>
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-xs font-bold text-stone-700 mb-2">傳統模式 (Classic)</h4>
                                            <ClassicRewardEditor value={classicReward} onChange={val => updateConfig('classic_reward_config', val)} />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-stone-700 mb-2">極速模式 (Speed)</h4>
                                            <SpeedRewardEditor value={speedReward} onChange={val => updateConfig('speed_reward_config', val)} />
                                        </div>
                                    </div>
                                </div>
                                {/* Lifelines */}

                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest border-b border-stone-50 pb-2">輔助工具消耗 (💰)</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <LifelineBox label="50:50" value={lifelineCosts.fiftyFifty} onChange={v => updateConfig('lifeline_costs', { ...lifelineCosts, fiftyFifty: v })} />
                                        <LifelineBox label="好友熱線" value={lifelineCosts.phoneFriend} onChange={v => updateConfig('lifeline_costs', { ...lifelineCosts, phoneFriend: v })} />
                                        <LifelineBox label="觀眾投票" value={lifelineCosts.askAudience} onChange={v => updateConfig('lifeline_costs', { ...lifelineCosts, askAudience: v })} />
                                        <LifelineBox label="時空延展" value={lifelineCosts.addTime} onChange={v => updateConfig('lifeline_costs', { ...lifelineCosts, addTime: v })} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stage Master Card */}
                    <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-stone-50 border-b border-stone-100">
                            <h2 className="text-base font-black text-stone-800 flex items-center gap-2">
                                <Map className="text-rose-400" size={18} />
                                遠征里程碑與難度階梯
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-stone-50/50 text-stone-400 text-left border-b border-stone-100">
                                    <tr>
                                        <th className="px-6 py-3">階段標識</th>
                                        <th className="px-6 py-3">任務目標 (題)</th>
                                        <th className="px-6 py-3">倒數 (秒)</th>
                                        <th className="px-6 py-3">通關賞金</th>
                                        <th className="px-6 py-3">視覺色標</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-50">
                                    {stages.map((stage, idx) => (
                                        <tr key={stage.id} className="hover:bg-stone-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs" style={{ backgroundColor: `${stage.bgColor}20`, color: stage.bgColor }}>
                                                        S{idx + 1}
                                                    </div>
                                                    <span className="font-bold text-stone-700">{stage.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <input type="number" value={stage.milestone} onChange={(e) => updateStage(stage.id, 'milestone', e.target.value)} className="w-20 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-mono text-center" />
                                            </td>
                                            <td className="px-6 py-4">
                                                <input type="number" value={stage.countdown} onChange={(e) => updateStage(stage.id, 'countdown', e.target.value)} className="w-16 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-mono text-center" />
                                            </td>
                                            <td className="px-6 py-4 font-bold text-amber-600">
                                                <input type="number" value={stage.reward} onChange={(e) => updateStage(stage.id, 'reward', e.target.value)} className="w-20 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-mono text-center" />
                                            </td>
                                            <td className="px-6 py-4">
                                                <input type="color" value={stage.bgColor} onChange={(e) => updateStage(stage.id, 'bgColor', e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border-2 border-white shadow-sm" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column: Live Monitoring */}
                <div className="space-y-6">
                    {/* Live Teams Box */}
                    <div className="bg-white border border-stone-200 rounded-3xl shadow-sm h-fit">
                        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
                            <h2 className="text-sm font-black text-stone-800 flex items-center gap-2">
                                <Users className="text-indigo-400" size={16} />
                                實時隊伍監控
                            </h2>
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        </div>
                        <div className="p-4 space-y-3">
                            {activeTeams.length === 0 ? (
                                <div className="py-12 text-center space-y-2">
                                    <div className="w-10 h-10 bg-stone-50 rounded-full flex items-center justify-center mx-auto">
                                        <Users className="text-stone-200" size={20} />
                                    </div>
                                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">目前無活躍探險隊</p>
                                </div>
                            ) : activeTeams.map(team => (
                                <div key={team.id} className="p-4 rounded-2xl bg-stone-50 border border-stone-100 group transition-all hover:border-indigo-200 hover:shadow-sm">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="min-w-0">
                                            <div className="font-bold text-stone-800 text-sm truncate">{team.name}</div>
                                            <div className="text-[10px] text-stone-400 font-mono">@{team.ownerName}</div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${team.phase === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                                            }`}>
                                            {team.phase === 'waiting' ? '準備中' : '冒險中'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-400 transition-all" style={{ width: `${(team.currentStage / 4) * 100}%` }} />
                                        </div>
                                        <span className="text-[10px] font-black text-stone-500">S{team.currentStage}</span>
                                    </div>
                                    <select
                                        value={team.currentStage}
                                        onChange={(e) => handleStageAdjustment(team.id, e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-[10px] font-bold text-stone-600 outline-none focus:border-indigo-400 transition-colors"
                                    >
                                        {[1, 2, 3, 4].map(s => <option key={s} value={s}>調整至 Stage {s}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Question Pool Monitoring - Simplified */}
                    <div className="bg-white border border-stone-200 rounded-3xl shadow-sm">
                        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
                            <h2 className="text-sm font-black text-stone-800 flex items-center gap-2">
                                <Database className="text-cyan-400" size={16} />
                                遠征題庫存量 (全域)
                            </h2>
                        </div>
                        <div className="p-6 text-center space-y-4">
                            <div className="py-4">
                                <span className="text-4xl font-black font-mono text-stone-800">{poolStats.total || 0}</span>
                                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-2">目前可用之高品質種子題目</p>
                            </div>
                            <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100 text-[10px] text-indigo-700 leading-relaxed font-bold">
                                🛸 自治巡邏模式中：背景艦隊正自動維護此庫存。系統將確保每卷聖經均有充足的高品質題目種子。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Left: Incentives & Shop */}
                    <div className="space-y-6">
                        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                                <h2 className="text-base font-black text-stone-800 flex items-center gap-2">
                                    <Gift className="text-pink-400" size={18} />
                                    玩家激勵與登入福利
                                </h2>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-1 gap-4">
                                    <ControlGroup icon={<Coins className="text-amber-400" />} label="註冊贈送金幣" description="新玩家創建帳號時給予">
                                        <input
                                            type="number"
                                            value={registrationBonus}
                                            onChange={(e) => updateConfig('registration_bonus', parseInt(e.target.value) || 0)}
                                            className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-2 text-stone-800 font-bold focus:ring-2 focus:ring-amber-500/20 outline-none"
                                        />
                                    </ControlGroup>
                                    <ControlGroup icon={<Sliders className="text-blue-400" />} label="註冊贈送點數" description="用於部分系統功能">
                                        <input
                                            type="number"
                                            value={registrationBonusPoints}
                                            onChange={(e) => updateConfig('registration_bonus_points', parseInt(e.target.value) || 0)}
                                            className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-2 text-stone-800 font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                                        />
                                    </ControlGroup>
                                    <ControlGroup icon={<Heart className="text-rose-400" />} label="每日登入福利" description="每日登入贈送金幣">
                                        <input
                                            type="number"
                                            value={dailyLoginBonus}
                                            onChange={(e) => updateConfig('daily_login_bonus', parseInt(e.target.value) || 0)}
                                            className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-2 text-stone-800 font-bold focus:ring-2 focus:ring-rose-500/20 outline-none"
                                        />
                                    </ControlGroup>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Right: Shop Items */}
                    <div className="space-y-6">
                        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                                <h2 className="text-base font-black text-stone-800 flex items-center gap-2">
                                    <Package className="text-indigo-400" size={18} />
                                    遠征商城物品
                                </h2>
                            </div>
                            <div className="p-6">
                                <ShopItemsEditor value={shopItems} onChange={val => updateConfig('shop_items', val)} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Support Components
function ControlGroup({ icon, label, description, children }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-stone-50 flex items-center justify-center">
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="text-xs font-black text-stone-800 truncate">{label}</div>
                    <div className="text-[10px] text-stone-400 truncate">{description}</div>
                </div>
            </div>
            {children}
        </div>
    );
}

function RewardRow({ label, value, onChange, step = 1 }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-stone-50 group">
            <span className="text-[11px] font-bold text-stone-500 group-hover:text-stone-700 transition-colors">{label}</span>
            <input
                type="number" step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
                className="w-16 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-right text-xs font-bold text-amber-600 focus:border-amber-400 outline-none"
            />
        </div>
    );
}

function LifelineBox({ label, value, onChange }) {
    return (
        <div className="bg-stone-50 border border-stone-100 p-3 rounded-2xl hover:border-stone-200 transition-all">
            <div className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5">{label}</div>
            <div className="flex items-center gap-1">
                <input
                    type="number" value={value}
                    onChange={e => onChange(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-black text-stone-800 focus:border-stone-400 outline-none"
                />
                <span className="text-[8px] text-amber-500">💰</span>
            </div>
        </div>
    );
}
