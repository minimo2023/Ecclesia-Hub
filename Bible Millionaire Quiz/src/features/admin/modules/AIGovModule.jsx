import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, TrendingUp, Activity, DollarSign, Save, X, Zap, BarChart3, Bot, Clock, CheckCircle, ShieldCheck, History, Layout, Plus, Calendar, Layers } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const GENERAL_FLASH_MODEL_PATTERN =
    /^gemini-(?:flash-latest|\d+(?:\.\d+)*-flash(?:-lite)?(?:-(?:(?:preview|exp|latest)(?:-[a-z0-9]+)*|\d{3}))?)$/;

const isGeneralPurposeFlashModel = (modelId) =>
    GENERAL_FLASH_MODEL_PATTERN.test(modelId.trim().toLowerCase());

/**
 * AI 治理與成本觀測站 (AI Governance & Cost Observatory)
 * V9 - 整合模型主權、免改碼動態更新、免費與付費 API 精確拆分
 */
export default function AIGovModule() {
    const { getToken } = useAuth();
    const [configs, setConfigs] = useState([]);
    const [systemConfig, setSystemConfig] = useState({});
    
    // Cost Analysis State
    const [costData, setCostData] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState('current_period'); // 'current_period' or 'YYYY-MM'
    
    // Logs State
    const [logs, setLogs] = useState([]);
    
    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    
    // Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [editingModelId, setEditingModelId] = useState('');
    const [editForm, setEditForm] = useState({
        friendly_name: '', input_price_per_1k_points: 0, output_price_per_1k_points: 0, is_active: true
    });
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => { 
        loadAll(); 
        if (activeTab === 'logs') fetchLogs();
    }, [selectedPeriod]);

    useEffect(() => {
        if (activeTab === 'logs' && logs.length === 0) fetchLogs();
    }, [activeTab]);

    const loadAll = async () => {
        setIsLoading(true);
        setError(null);
        await Promise.all([loadConfigs(), loadCostAnalysis()]);
        setIsLoading(false);
    };

    const loadConfigs = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/ai/config`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setConfigs(data.data || []);
                setSystemConfig(data.systemConfig || {});
            } else setError(data.error);
        } catch (err) { setError(err.message); }
    };

    const loadCostAnalysis = async () => {
        try {
            let url = `${API_BASE_URL}/api/admin/ai/cost-analysis`;
            if (selectedPeriod === 'current_period') url += `?mode=current_period`;
            else url += `?month=${selectedPeriod}`;
            
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await res.json();
            if (data.success) {
                setCostData(data.data);
            }
        } catch (err) { console.error('AI Cost Analysis load error:', err); }
    };

    const fetchLogs = async () => {
        setIsLogsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/ai/logs`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            
            if (data.success && Array.isArray(data.data)) {
                const sortedLogs = data.data.map(log => ({
                    ...log,
                    createdAt: new Date(log.createdAt)
                }));
                setLogs(sortedLogs);
            }
        } catch (error) {
            console.error("Error fetching AI logs:", error);
        } finally {
            setIsLogsLoading(false);
        }
    };

    const handleSetDefaultModel = async (modelId) => {
        if (!isGeneralPurposeFlashModel(modelId)) {
            return alert('僅能使用尚未停用、可處理文字的 Gemini Flash 系列模型。');
        }
        if (!confirm(`確定要將系統預設模型切換為 ${modelId} 嗎？\n系統將立即熱更新，無需重啟伺服器。`)) return;
        setIsProcessing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/ai/default-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ modelId })
            });
            const data = await res.json();
            if (data.success) {
                await loadConfigs();
                alert(data.message);
            } else alert(data.error);
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const openEditModal = (model = null) => {
        if (model) {
            setIsCreatingNew(false);
            setEditingModelId(model.model_id);
            setEditForm({
                friendly_name: model.friendly_name || '',
                input_price_per_1k_points: model.input_price_per_1k_points || 0,
                output_price_per_1k_points: model.output_price_per_1k_points || 0,
                is_active: model.is_active ?? true
            });
        } else {
            setIsCreatingNew(true);
            setEditingModelId('');
            setEditForm({
                friendly_name: '', input_price_per_1k_points: 0, output_price_per_1k_points: 0, is_active: true
            });
        }
        setIsEditModalOpen(true);
    };

    const handleSaveConfig = async () => {
        if (!editingModelId.trim()) return alert('請輸入 Model ID');
        if (!isGeneralPurposeFlashModel(editingModelId)) {
            return alert('僅能設定通用 Gemini Flash／Flash-Lite 模型；Pro、Live、TTS 與影像模型不適用。');
        }
        setIsProcessing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/ai/config/${editingModelId.trim()}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(editForm)
            });
            if (res.ok) {
                setIsEditModalOpen(false);
                await loadConfigs();
            } else {
                const err = await res.json();
                alert(err.error || '儲存失敗');
            }
        } catch (err) { alert(err.message); }
        finally { setIsProcessing(false); }
    };

    const handleSyncOffset = async () => {
        const offset = prompt('請輸入目前的外部額度累計 (TWD):', '0');
        if (offset === null) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/ai/sync-initial`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ offset: parseFloat(offset) || 0 })
            });
            if (res.ok) loadAll();
        } catch (err) { alert('同步失敗'); }
    };

    const getNextResetDate = () => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0);
    };

    const nextReset = getNextResetDate();
    const daysToReset = Math.ceil((nextReset.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    
    const totals = costData?.totals || {};
    const budgetLimit = parseFloat(systemConfig?.budget_limit_twd || 1000);
    const totalPointsConsumed = parseFloat(totals.totalCost || 0);
    const usagePercent = Math.min((totalPointsConsumed / budgetLimit) * 100, 100);
    const currentDefaultModelId = systemConfig.default_ai_model || '尚未設定';

    // 生成月份選單 (最近 6 個月)
    const monthOptions = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setDate(1); // 強制將日期設為當月 1 號，避免月底日期溢出導致月份進位 (例如 30/31 號在 2 月時會溢出到 3 月)
        d.setMonth(d.getMonth() - i);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthOptions.push(val);
    }

    if (isLoading && !costData) return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="text-stone-400 font-bold animate-pulse tracking-widest uppercase text-xs">治理中心數據載入中...</div>
        </div>
    );

    return (
        <div className="h-[var(--app-height)] flex flex-col overflow-hidden bg-stone-50/30">
            {/* Header Area */}
            <div className="shrink-0 p-6 pb-0 space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-indigo-600 font-black tracking-widest text-[11px] uppercase bg-indigo-50 w-fit px-3 py-1 rounded-full border border-indigo-100">
                            <ShieldCheck size={14} />
                            Cost Observatory V9
                        </div>
                        <h1 className="text-3xl font-black text-stone-800 tracking-tight flex items-center gap-3">
                            AI 營運與成本觀測站
                        </h1>
                        <p className="text-sm text-stone-400 font-medium">全局模型主權與實時計費儀表板</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleSyncOffset} 
                            className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-stone-200 flex items-center gap-2 shadow-sm shadow-stone-100/50"
                        >
                            <BarChart3 size={14} /> 預算校正
                        </button>
                        <button 
                            onClick={loadAll} 
                            className="p-2.5 bg-white border border-stone-200 hover:border-indigo-300 text-stone-500 hover:text-indigo-600 rounded-xl transition-all shadow-sm"
                        >
                            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-stone-200 gap-8">
                    {[
                        { id: 'overview', label: '成本分析', icon: Activity },
                        { id: 'config', label: '模型主權', icon: Cpu },
                        { id: 'logs', label: '實時日誌', icon: History },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 px-1 flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all relative ${
                                activeTab === tab.id ? 'text-indigo-600' : 'text-stone-400 hover:text-stone-700'
                            }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full shadow-[0_-2px_8px_rgba(79,70,229,0.3)]" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                
                {/* Tab: Overview (Cost Analysis) */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {/* Period Selector & Budget */}
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="bg-white border border-stone-200 p-8 rounded-[2rem] shadow-sm flex-1 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                                    <DollarSign size={120} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="space-y-1">
                                            <span className="text-xs font-black uppercase text-stone-400 tracking-widest">付費通量實支累計 (TWD)</span>
                                            <div className="text-4xl font-black text-stone-800 flex items-baseline gap-1">
                                                <span className="text-xl text-stone-300 font-bold mr-1">NT$</span>
                                                <span className="font-mono">{totalPointsConsumed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                <span className="text-stone-200 font-medium text-xl mx-2">/</span>
                                                <span className="text-stone-300 font-medium text-xl font-mono">{budgetLimit}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <select 
                                                value={selectedPeriod}
                                                onChange={(e) => setSelectedPeriod(e.target.value)}
                                                className="bg-stone-50 border border-stone-200 text-stone-600 text-xs font-black tracking-widest uppercase rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
                                            >
                                                <option value="current_period">當前帳期 (本月)</option>
                                                {monthOptions.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div className="w-full h-4 bg-stone-100 rounded-full p-1 mb-3 shadow-inner">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-1000 shadow-sm ${
                                                    usagePercent > 90 ? 'bg-rose-500' : 
                                                    usagePercent > 70 ? 'bg-amber-500' : 
                                                    'bg-indigo-500'
                                                }`}
                                                style={{ width: `${usagePercent}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-xs font-black text-stone-400 uppercase tracking-widest">
                                            <span>預算使用率 <span className="text-stone-700 font-mono">{usagePercent.toFixed(1)}%</span></span>
                                            {selectedPeriod === 'current_period' && (
                                                <span className="flex items-center gap-1.5 text-indigo-500">
                                                    <Clock size={12} /> 帳期重置倒數 {daysToReset} 天
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Split Stats (Free vs Paid) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Paid Stats */}
                            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white p-8 rounded-[2rem] shadow-lg relative overflow-hidden">
                                <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12">
                                    <DollarSign size={200} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-indigo-100 flex items-center gap-2">
                                            <Zap size={16} className="text-amber-300 fill-amber-300" /> 付費 API 消耗
                                        </h3>
                                        <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold font-mono">
                                            {totals.paid_requests || 0} REQS
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-4xl font-black font-mono tracking-tight">
                                            {(totals.paid_tokens || 0).toLocaleString()}
                                        </div>
                                        <div className="text-indigo-200 text-xs font-black uppercase tracking-widest">
                                            Total Paid Tokens
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Free Stats */}
                            <div className="bg-white border border-stone-200 p-8 rounded-[2rem] shadow-sm relative overflow-hidden">
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                                            <ShieldCheck size={16} /> 免費 API 消耗 (快取/特殊)
                                        </h3>
                                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold font-mono">
                                            {totals.free_requests || 0} REQS
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-4xl font-black font-mono tracking-tight text-stone-800">
                                            {(totals.free_tokens || 0).toLocaleString()}
                                        </div>
                                        <div className="text-stone-400 text-xs font-black uppercase tracking-widest">
                                            Total Free Tokens
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Module Breakdown */}
                        {costData?.byModule && costData.byModule.length > 0 && (
                            <div className="bg-white border border-stone-200 rounded-[2rem] overflow-hidden shadow-sm">
                                <div className="px-8 py-6 bg-stone-50 border-b border-stone-100 flex items-center gap-3">
                                    <span className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Layers size={18} /></span>
                                    <div className="text-sm font-black text-stone-700 uppercase tracking-widest">各模組消耗排行</div>
                                </div>
                                <div className="p-4">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-stone-400 text-left">
                                                <tr>
                                                    <th className="px-6 py-4 font-black uppercase text-xs tracking-widest">模組名稱</th>
                                                    <th className="px-6 py-4 font-black uppercase text-xs tracking-widest text-right">免費 Tokens</th>
                                                    <th className="px-6 py-4 font-black uppercase text-xs tracking-widest text-right">付費 Tokens</th>
                                                    <th className="px-6 py-4 font-black uppercase text-xs tracking-widest text-right text-indigo-600">產生費用 (TWD)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-stone-50">
                                                {costData.byModule.map((mod, idx) => (
                                                    <tr key={idx} className="hover:bg-stone-50/50 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="font-black text-stone-700 uppercase tracking-wider text-xs">{mod.module_name}</div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-mono text-emerald-600 font-medium">
                                                            {mod.free_tokens?.toLocaleString() || 0}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-mono text-stone-500 font-medium">
                                                            {mod.paid_tokens?.toLocaleString() || 0}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-mono font-black text-indigo-600">
                                                            {parseFloat(mod.total_cost || 0).toFixed(4)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Config (Model Sovereignty) */}
                {activeTab === 'config' && (
                    <div className="animate-in fade-in duration-300 space-y-6">
                        {/* Current Default Model Banner */}
                        <div className="bg-stone-900 text-white p-8 rounded-[2rem] shadow-xl flex flex-col md:flex-row justify-between items-center gap-6 border border-stone-800">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap size={16} className="text-amber-400 fill-amber-400" />
                                    <h3 className="text-xs font-black uppercase tracking-widest text-stone-400">系統全域預設模型 (Default Active)</h3>
                                </div>
                                <div className="text-2xl font-black text-white font-mono bg-stone-800 px-4 py-2 rounded-xl inline-block border border-stone-700">
                                    {currentDefaultModelId}
                                </div>
                            </div>
                            <div className="text-[11px] text-stone-400 max-w-sm font-medium leading-relaxed bg-stone-800/50 p-4 rounded-xl border border-stone-700/50">
                                系統呼叫 AI 時若無指定特定模型，將統一採用此模型。變更預設模型將立即在背景觸發熱更新 (Hot Reload)，無需重啟伺服器。
                            </div>
                        </div>

                        {/* Models Matrix */}
                        <div className="bg-white border border-stone-200 rounded-[2rem] overflow-hidden shadow-sm">
                            <div className="px-8 py-6 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm"><Cpu size={18} /></span>
                                    <div className="text-sm font-black text-stone-700 uppercase tracking-widest">可用模型矩陣 (Models Pool)</div>
                                </div>
                                <button 
                                    onClick={() => openEditModal(null)}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
                                >
                                    <Plus size={16} /> 新增模型
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-stone-50/50 text-stone-400 text-left border-b border-stone-100">
                                        <tr>
                                            <th className="px-8 py-4 font-black uppercase text-xs tracking-widest">標籤 / 狀態</th>
                                            <th className="px-8 py-4 font-black uppercase text-xs tracking-widest">Model ID</th>
                                            <th className="px-8 py-4 font-black uppercase text-xs tracking-widest text-right">IN Rate / 1M</th>
                                            <th className="px-8 py-4 font-black uppercase text-xs tracking-widest text-right">OUT Rate / 1M</th>
                                            <th className="px-8 py-4 font-black uppercase text-xs tracking-widest text-center">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-50">
                                        {configs.map(model => (
                                            <tr key={model.model_id} className={`hover:bg-stone-50/50 transition-colors ${model.model_id === currentDefaultModelId ? 'bg-indigo-50/20' : ''}`}>
                                                <td className="px-8 py-5">
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="font-black text-stone-800">{model.friendly_name}</div>
                                                        <span className={`w-fit px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                                                            model.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'
                                                        }`}>
                                                            {model.is_active !== false ? 'Active' : 'Offline'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2 py-1 rounded w-fit">{model.model_id}</div>
                                                    {model.model_id === currentDefaultModelId && (
                                                        <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1.5 flex items-center gap-1">
                                                            <CheckCircle size={12} /> 全域預設
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-8 py-5 text-right font-mono font-bold text-indigo-600">NT$ {model.input_price_per_1k_points}</td>
                                                <td className="px-8 py-5 text-right font-mono font-bold text-indigo-600">NT$ {model.output_price_per_1k_points}</td>
                                                <td className="px-8 py-5 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {model.model_id !== currentDefaultModelId && model.is_active !== false && (
                                                            <button
                                                                onClick={() => handleSetDefaultModel(model.model_id)}
                                                                className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-stone-200"
                                                            >
                                                                設為預設
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => openEditModal(model)}
                                                            className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-sm"
                                                        >
                                                            編輯
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Logs */}
                {activeTab === 'logs' && (
                    <div className="bg-white border border-stone-200 rounded-[2rem] overflow-hidden shadow-sm flex flex-col h-full animate-in fade-in duration-300">
                        <div className="shrink-0 px-8 py-5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <History size={18} className="text-stone-400" />
                                <span className="text-sm font-black text-stone-700 uppercase tracking-widest">實時審計紀錄 Real-time Audit</span>
                            </div>
                            <button onClick={fetchLogs} className="p-2 hover:bg-stone-200 rounded-lg text-stone-500 transition-all border border-stone-200 bg-white shadow-sm">
                                <RefreshCw size={14} className={isLogsLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto px-4 divide-y divide-stone-50">
                            {isLogsLoading && logs.length === 0 ? (
                                <div className="p-16 text-center text-xs font-black text-stone-400 uppercase tracking-widest">數據同步中...</div>
                            ) : logs.length === 0 ? (
                                <div className="p-16 text-center text-xs font-black text-stone-400 uppercase tracking-widest">目前無日誌數據</div>
                            ) : (
                                logs.map(log => (
                                    <div key={log.id} className="p-6 hover:bg-stone-50 transition-colors group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-500">
                                                    <Activity size={16} />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-stone-800 uppercase tracking-widest">
                                                        {log.moduleName || 'system'}
                                                    </div>
                                                    <div className="text-[10px] text-stone-400 font-bold mt-0.5 tracking-widest uppercase">
                                                        {log.createdAt.toLocaleDateString()} {log.createdAt.toLocaleTimeString()} | {log.modelName || log.modelId || 'unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-[10px] font-mono text-stone-300">#AUDIT_{log.id}</div>
                                        </div>
                                        <div className="ml-11">
                                            <pre className="text-[10px] font-mono bg-stone-50 border border-stone-100 p-3 rounded-lg overflow-x-auto text-stone-600">
                                                {JSON.stringify({
                                                    tokens: `${log.promptTokens ?? 0} in / ${log.completionTokens ?? 0} out`,
                                                    cost_twd: parseFloat(String(log.totalCostTwd ?? 0)).toFixed(5),
                                                    model: log.modelName || log.modelId
                                                }, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Config Modal (Create/Edit) */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-md" onClick={() => setIsEditModalOpen(false)} />
                    <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl relative z-10 border border-stone-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                            <h3 className="font-black text-stone-800 flex items-center gap-2">
                                <Cpu size={20} className="text-indigo-600" /> 
                                {isCreatingNew ? '新增模型 Register Model' : '更新配置 Update Config'}
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-stone-200 rounded-xl transition-all"><X size={20} /></button>
                        </div>
                        <div className="p-8 space-y-6">
                            {isCreatingNew && (
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-stone-400">Model ID (Google 官方標識)</label>
                                    <input 
                                        type="text" 
                                        placeholder="例如: gemini-3.5-flash"
                                        value={editingModelId} 
                                        onChange={e => setEditingModelId(e.target.value)}
                                        className="w-full bg-stone-50 border border-stone-200 p-4 rounded-xl text-sm font-mono font-bold text-stone-800 focus:outline-none focus:border-indigo-500 transition-all" 
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-stone-400">顯示名稱 Friendly Label</label>
                                <input 
                                    type="text" 
                                    placeholder="例如: Gemini 2.5 Flash Lite"
                                    value={editForm.friendly_name} 
                                    onChange={e => setEditForm(f => ({ ...f, friendly_name: e.target.value }))}
                                    className="w-full bg-stone-50 border border-stone-200 p-4 rounded-xl text-sm font-bold text-stone-800 focus:outline-none focus:border-indigo-500 transition-all" 
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Input (1M) TWD</label>
                                    <input 
                                        type="number" step="0.001" 
                                        value={editForm.input_price_per_1k_points}
                                        onChange={e => setEditForm(f => ({ ...f, input_price_per_1k_points: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl text-sm font-bold font-mono text-indigo-700" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Output (1M) TWD</label>
                                    <input 
                                        type="number" step="0.001" 
                                        value={editForm.output_price_per_1k_points}
                                        onChange={e => setEditForm(f => ({ ...f, output_price_per_1k_points: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl text-sm font-bold font-mono text-indigo-700" 
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-5 bg-stone-50 rounded-2xl border border-stone-100">
                                <div>
                                    <div className="text-xs font-black text-stone-700 uppercase tracking-widest">加入活動模型池 (Active)</div>
                                    <p className="text-[10px] text-stone-400 font-bold mt-1 uppercase tracking-tight">開啟後將列為備用或可選模型</p>
                                </div>
                                <button 
                                    onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${editForm.is_active ? 'bg-indigo-600' : 'bg-stone-300'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editForm.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                        <div className="px-8 py-6 bg-stone-50 border-t border-stone-100 flex justify-end gap-4">
                            <button onClick={() => setIsEditModalOpen(false)} className="text-xs font-black text-stone-400 uppercase tracking-widest">取消</button>
                            <button 
                                onClick={handleSaveConfig} 
                                disabled={isProcessing}
                                className="px-6 py-3 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-stone-200 active:scale-95 transition-all"
                            >
                                {isProcessing ? '同步中...' : '確定儲存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
