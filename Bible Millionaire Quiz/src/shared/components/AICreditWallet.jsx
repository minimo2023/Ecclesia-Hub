import React, { useState, useEffect } from 'react';
import { Sparkles, X, Clock, ArrowDownRight, ArrowUpRight, Loader2, Coins } from 'lucide-react';

export default function AICreditWallet({ isOpen, onClose }) {
    const [walletData, setWalletData] = useState(null);
    const [ledgerData, setLedgerData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'exchange' | 'buy'
    
    // Exchange states
    const [exchangeAmount, setExchangeAmount] = useState(10); // Default to buy 10 AI credits
    const [isExchanging, setIsExchanging] = useState(false);
    const EXCHANGE_RATE = 50; // 50 coins = 1 AI credit

    useEffect(() => {
        if (isOpen) {
            setActiveTab('overview');
            fetchWalletData();
            fetchLedgerData();
        }
    }, [isOpen]);

    const fetchWalletData = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('/api/users/ai-wallet', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setWalletData(json.data);
            } else {
                throw new Error(json.error || 'Failed to fetch wallet');
            }
        } catch (err) {
            console.error('Fetch wallet error:', err);
            setError(err.message);
        }
    };

    const fetchLedgerData = async () => {
        setIsLoading(true);
        const limit = 50;
        const offset = 0;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`/api/users/ai-ledger?limit=${limit}&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setLedgerData(json.data.items);
            } else {
                throw new Error(json.error || 'Failed to fetch ledger');
            }
        } catch (err) {
            console.error('Fetch ledger error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExchange = async () => {
        if (exchangeAmount <= 0) return;
        setIsExchanging(true);
        setError(null);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('/api/users/exchange-ai-credits', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ aiCreditsToBuy: exchangeAmount })
            });
            const json = await res.json();
            
            if (json.success) {
                // Refresh data
                await fetchWalletData();
                await fetchLedgerData();
                
                alert(`兌換成功！已獲得 ${exchangeAmount} 點 AI 代幣。`);
                setActiveTab('overview');
            } else {
                throw new Error(json.error || '兌換失敗');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsExchanging(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-sm">
            <div className="bg-slate-100 border border-slate-300 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-300 bg-slate-200">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-100 border border-indigo-200 rounded-lg text-indigo-700">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">AI 錢包</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-300 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-300 bg-slate-100">
                    <button 
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'overview' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white/70' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        餘額明細
                    </button>
                    <button 
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'exchange' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white/70' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
                        onClick={() => setActiveTab('exchange')}
                    >
                        智匯金幣兌換
                    </button>
                    <button 
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'buy' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white/70' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
                        onClick={() => setActiveTab('buy')}
                    >
                        購買點數
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100">
                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-start gap-2">
                            <span className="font-bold">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {activeTab === 'overview' && (
                        <>
                            {/* Total Balance Card */}
                            <div className="bg-white/90 border border-slate-300 rounded-2xl p-6 text-slate-900 mb-6 relative overflow-hidden shadow-sm">
                                <Sparkles className="absolute right-4 top-4 w-32 h-32 text-indigo-200 opacity-40" />
                                <p className="text-slate-600 font-medium mb-1 relative z-10">總 AI 代幣餘額</p>
                                <div className="text-5xl font-bold relative z-10 flex items-baseline gap-2">
                                    {walletData?.totalCredits ?? <Loader2 className="w-8 h-8 animate-spin" />}
                                    <span className="text-lg font-normal text-slate-500">點</span>
                                </div>
                                <p className="text-xs text-slate-600 mt-4 relative z-10">
                                    可用於聖經時空旅人、AI 查詢與靈修延伸功能
                                </p>
                            </div>

                            {/* Pools Breakdown */}
                            <div className="mb-8">
                                <h3 className="text-sm font-bold text-stone-800 mb-3 flex items-center justify-between">
                                    <span>代幣組成明細</span>
                                    <span className="text-xs font-normal text-stone-500 bg-stone-100 px-2 py-1 rounded-md">扣點順序: 免費 ➔ 兌換 ➔ 付費</span>
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                                        <p className="text-xs text-emerald-600 font-bold mb-1">免費紅利</p>
                                        <p className="text-xl font-bold text-emerald-700">{walletData?.pools?.bonus ?? '-'}</p>
                                    </div>
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                                        <p className="text-xs text-blue-600 font-bold mb-1">智匯金幣兌換</p>
                                        <p className="text-xl font-bold text-blue-700">{walletData?.pools?.exchange ?? '-'}</p>
                                    </div>
                                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                                        <p className="text-xs text-purple-600 font-bold mb-1">付費購買</p>
                                        <p className="text-xl font-bold text-purple-700">{walletData?.pools?.paid ?? '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Ledger */}
                            <div>
                                <h3 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-stone-400" />
                                    <span>最近異動紀錄</span>
                                </h3>
                                
                                {isLoading ? (
                                    <div className="flex justify-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-stone-300" />
                                    </div>
                                ) : ledgerData.length === 0 ? (
                                    <div className="text-center py-8 text-stone-400 text-sm bg-stone-50 rounded-xl border border-dashed border-stone-200">
                                        尚無任何代幣使用紀錄
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {ledgerData.map((record) => (
                                            <div key={record.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100 hover:bg-stone-100 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-1.5 rounded-full ${record.direction === 'credit' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                                        {record.direction === 'credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-stone-700">{record.reasonLabel}</p>
                                                        <p className="text-[10px] text-stone-400">{new Date(record.createdAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                </div>
                                                <div className={`font-bold font-mono ${record.direction === 'credit' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {record.direction === 'credit' ? '+' : '-'}{record.amount}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {activeTab === 'exchange' && (
                        <div className="py-4">
                            <div className="bg-amber-50 rounded-xl p-4 mb-6 border border-amber-100">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="bg-amber-100 p-2 rounded-lg"><Coins className="w-5 h-5 text-amber-600" /></div>
                                    <div>
                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">匯率</p>
                                        <p className="text-sm font-bold text-stone-700">50 枚智匯金幣 = 1 點 AI 代幣</p>
                                    </div>
                                </div>
                                <p className="text-xs text-stone-500 mt-2">在遊戲中學習經文與答題，可以免費獲得智匯金幣。利用擁有的智匯金幣來換取更多 AI 互動次數吧！</p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-bold text-stone-700 mb-2">請選擇欲兌換的 AI 代幣數量：</label>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    {[1, 10, 50, 100].map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => setExchangeAmount(amt)}
                                            className={`py-2 rounded-lg font-bold transition-colors ${exchangeAmount === amt ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                                        >
                                            {amt} 點
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl border border-stone-200">
                                    <div className="text-stone-500 text-sm font-medium">需扣除智匯金幣</div>
                                    <div className="flex items-center gap-1.5 text-amber-600 font-bold text-xl">
                                        <Coins className="w-5 h-5" />
                                        <span>{exchangeAmount * EXCHANGE_RATE}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleExchange}
                                disabled={isExchanging || exchangeAmount <= 0}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white font-bold rounded-xl transition-colors"
                            >
                                {isExchanging ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> 處理中...</>
                                ) : (
                                    <>確認兌換 {exchangeAmount} 點 AI 代幣</>
                                )}
                            </button>
                        </div>
                    )}
                    
                    {activeTab === 'buy' && (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <div className="p-4 bg-purple-50 rounded-full mb-4">
                                <Sparkles className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-stone-800 mb-2">購買 AI 代幣</h3>
                            <p className="text-stone-500 max-w-sm">
                                為了提供更好的 AI 體驗，我們正在整合金流服務中。未來您將能直接購買更多 AI 互動點數，即將推出，敬請期待！
                            </p>
                            <div className="mt-8 px-6 py-2 bg-stone-100 text-stone-600 rounded-full font-bold text-sm">
                                Coming Soon 🚀
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
