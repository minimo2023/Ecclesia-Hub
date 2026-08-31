import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Coins, Wallet, CheckCircle, AlertCircle, RefreshCw, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../src/contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { useCoinSystem } from '../../../../src/contexts/CoinSystemContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function AssetExchangePage({ isTab = false }) {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    const { coins } = useCoinSystem();
    
    const [direction, setDirection] = useState('coin_to_credit'); // 'coin_to_credit' | 'credit_to_coin'
    const [amount, setAmount] = useState(50);
    const [rates, setRates] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', msg: '' }
    const [isExchanging, setIsExchanging] = useState(false);

    useEffect(() => {
        const fetchRates = async () => {
            try {
                const res = await apiClient.get('/users/exchange-rates');
                const data = res.data;
                if (data.success) {
                    setRates(data.data);
                    setAmount(data.data.rateCoinToCredit);
                }
            } catch (err) {
                console.error('Fetch rates error:', err);
            }
        };

        fetchRates();
    }, []);

    const handleSwap = () => {
        const newDirection = direction === 'coin_to_credit' ? 'credit_to_coin' : 'coin_to_credit';
        setDirection(newDirection);
        if (rates) {
            setAmount(newDirection === 'coin_to_credit' ? rates.rateCoinToCredit : 1);
        }
        setStatus(null);
    };

    const handleExchange = async () => {
        const credits = direction === 'coin_to_credit' ? Math.floor(amount / rates.rateCoinToCredit) : amount;
        if (credits <= 0) return;
        
        setIsExchanging(true);
        setStatus(null);
        
        try {
            const res = await apiClient.post('/users/exchange-assets', {
                amount: credits,
                direction
            });
            const data = res.data;
            if (data.success) {
                setStatus({ type: 'success', msg: `兌換成功，獲得 ${data.data.awarded} ${direction === 'coin_to_credit' ? '點數' : '金幣'}` });
                refreshUser(true);
            } else {
                setStatus({ type: 'error', msg: data.error || '兌換失敗' });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: '網路連線失敗' });
        } finally {
            setIsExchanging(false);
        }
    };

    if (!rates) {
        return (
            <div className={`flex flex-col bg-slate-50 ${isTab ? 'h-full' : 'flex-1'}`}>
                {!isTab && (
                    <header className="app-topbar flex items-center px-4">
                        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600 hover:text-slate-600 transition">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <h1 className="flex-1 text-base font-black text-slate-900 tracking-wider text-center mr-6">BI 資產兌換</h1>
                    </header>
                )}
                <div className="flex-1 flex justify-center items-center">
                    <RefreshCw className="animate-spin text-slate-300 w-8 h-8" />
                </div>
            </div>
        );
    }

    const currentRate = direction === 'coin_to_credit' ? rates.rateCoinToCredit : rates.rateCreditToCoin;
    const calculatedGain = direction === 'coin_to_credit'
        ? Math.floor(amount / currentRate)
        : amount * currentRate;

    return (
        <div className={`flex flex-col bg-slate-50 ${isTab ? 'h-full' : 'flex-1 pb-safe animate-in slide-in-from-right-full duration-300'}`}>
            {!isTab && (
                <header className="app-topbar flex items-center px-4">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600 hover:text-slate-600 active:bg-slate-100 rounded-full transition">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="flex-1 text-base font-black text-slate-900 tracking-wider text-center mr-6">BI 資產兌換</h1>
                </header>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* Rate Info */}
                <div className="text-center space-y-1 mt-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-600">BI 官方匯率</p>
                    <p className="inline-block rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-black text-slate-700 shadow-sm">
                        {direction === 'coin_to_credit' ? `${currentRate} 金幣 = 1 點數` : `1 點數 = ${currentRate} 金幣`}
                    </p>
                </div>

                {/* Balances */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="app-card flex flex-col items-center justify-center p-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">可用金幣</span>
                        <div className="font-black text-amber-700 text-2xl flex items-center gap-1.5">
                            <Coins size={18} /> {coins}
                        </div>
                    </div>
                    <div className="app-card flex flex-col items-center justify-center p-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">可用點數</span>
                        <div className="font-black text-indigo-700 text-2xl flex items-center gap-1.5">
                            <Wallet size={18} /> {user?.ai_credits || 0}
                        </div>
                    </div>
                </div>

                {/* Exchange Form */}
                <div className="app-card p-5">
                    <div className="flex flex-col gap-3 relative">
                        {/* FROM */}
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">
                                支付 ({direction === 'coin_to_credit' ? '金幣' : '點數'})
                            </div>
                            <div className="flex items-center gap-3">
                                {direction === 'coin_to_credit' ? <Coins className="text-amber-700 w-6 h-6" /> : <Wallet className="text-indigo-700 w-6 h-6" />}
                                <input 
                                    type="number" min="1" 
                                    max={direction === 'coin_to_credit' ? coins : (user?.ai_credits || 0)}
                                    step={direction === 'coin_to_credit' ? rates.rateCoinToCredit : 1}
                                    value={amount}
                                    onChange={e => setAmount(parseInt(e.target.value) || 0)}
                                    className="bg-transparent text-3xl font-black text-slate-800 w-full outline-none"
                                />
                            </div>
                        </div>

                        {/* SWAP BUTTON */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                            <button 
                                onClick={handleSwap}
                                className="bg-indigo-600 text-white rounded-full p-3 hover:scale-110 active:scale-95 transition-all shadow-xl border-4 border-slate-100"
                            >
                                <ArrowRightLeft size={16} />
                            </button>
                        </div>

                        {/* TO */}
                        <div className="bg-indigo-50/30 rounded-2xl p-4 border border-indigo-50/50">
                            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400/80 mb-2">
                                獲得 ({direction === 'coin_to_credit' ? '點數' : '金幣'})
                            </div>
                            <div className="flex items-center gap-3">
                                {direction === 'coin_to_credit' ? <Wallet className="text-indigo-700 w-6 h-6" /> : <Coins className="text-amber-700 w-6 h-6" />}
                                <div className="text-3xl font-black text-slate-800">
                                    {calculatedGain}
                                </div>
                            </div>
                        </div>
                    </div>

                    {status && (
                        <div className={`mt-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                            status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                            {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {status.msg}
                        </div>
                    )}

                    <div className="mt-6">
                        <button
                            onClick={handleExchange}
                            disabled={isExchanging || amount <= 0 || (direction === 'coin_to_credit' ? amount > coins : amount > (user?.ai_credits || 0)) || (direction === 'coin_to_credit' && amount < currentRate)}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white shadow-md shadow-indigo-200/60 transition active:bg-indigo-700 disabled:bg-slate-300 disabled:opacity-50 disabled:shadow-none"
                        >
                            {isExchanging ? <RefreshCw className="animate-spin w-5 h-5" /> : <ArrowRightLeft className="w-5 h-5" />}
                            確認兌換
                        </button>
                        
                        <div className="text-center text-[10px] font-bold tracking-widest text-red-400 mt-3 h-4">
                            {direction === 'coin_to_credit' && amount < currentRate && '兌換數量低於最低門檻。'}
                            {(direction === 'coin_to_credit' ? amount > coins : amount > (user?.ai_credits || 0)) && '可用餘額不足。'}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
