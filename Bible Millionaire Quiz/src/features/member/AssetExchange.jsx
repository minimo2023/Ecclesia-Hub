import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Coins, Wallet, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function AssetExchange({ user, refreshUser, onExchangeSuccess }) {
    const { getToken } = useAuth();
    const [direction, setDirection] = useState('coin_to_credit'); // 'coin_to_credit' | 'credit_to_coin'
    const [amount, setAmount] = useState(50);
    const [rates, setRates] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', msg: '' }
    const [isExchanging, setIsExchanging] = useState(false);

    useEffect(() => {
        fetchRates();
    }, []);

    const fetchRates = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/exchange-rates`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setRates(data.data);
                // Reset default amount based on direction
                setAmount(direction === 'coin_to_credit' ? data.data.rateCoinToCredit : 1);
            }
        } catch (err) {
            console.error('Fetch rates error:', err);
        }
    };

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
            const res = await fetch(`${API_BASE_URL}/api/users/exchange-assets`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ amount: credits, direction })
            });
            
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: `兌換成功！獲得 ${data.data.awarded} ${direction === 'coin_to_credit' ? '點數' : '金幣'} (扣除了 ${data.data.cost} ${direction === 'coin_to_credit' ? '金幣' : '點數'})` });
                if (onExchangeSuccess) onExchangeSuccess(data.data.aiCredits);
                refreshUser();
            } else {
                setStatus({ type: 'error', msg: data.error || '兌換失敗' });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: '網路錯誤，請稍後再試' });
        } finally {
            setIsExchanging(false);
        }
    };

    if (!rates) {
        return <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-stone-400" /></div>;
    }

    const currentRate = direction === 'coin_to_credit' ? rates.rateCoinToCredit : rates.rateCreditToCoin;
    const maxAffordable = direction === 'coin_to_credit' 
        ? Math.floor(user.coins / currentRate) * currentRate
        : Math.floor(user.aiCredits); // Assuming rateCreditToCoin is 1 Credit = X Coins. Amount is credits to spend.
    
    // For coin_to_credit: amount is coins to spend
    // For credit_to_coin: amount is credits to spend
    const calculatedGain = direction === 'coin_to_credit'
        ? Math.floor(amount / currentRate)
        : amount * currentRate;

    return (
        <div className="max-w-md mx-auto space-y-6">
            <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-stone-800">資產雙向兌換</h2>
                <p className="text-sm text-stone-500">
                    目前匯率：{direction === 'coin_to_credit' ? `${currentRate} 金幣 = 1 點數` : `1 點數 = ${currentRate} 金幣`}
                </p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-indigo-500" />
                
                {/* Balances */}
                <div className="flex justify-between items-center mb-6 px-2">
                    <div className="text-center">
                        <div className="text-xs text-stone-500 mb-1 font-bold">可用金幣</div>
                        <div className="font-black text-amber-600 flex items-center justify-center gap-1">
                            <Coins size={14} /> {user.coins}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-stone-500 mb-1 font-bold">可用點數</div>
                        <div className="font-black text-indigo-600 flex items-center justify-center gap-1">
                            <Wallet size={14} /> {user.aiCredits}
                        </div>
                    </div>
                </div>

                {/* Exchange Form */}
                <div className="space-y-4">
                    <div className="flex flex-col gap-4 relative">
                        {/* FROM */}
                        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                            <div className="text-xs font-bold text-stone-500 mb-2">
                                您將扣除 ({direction === 'coin_to_credit' ? '金幣' : '點數'})
                            </div>
                            <div className="flex items-center gap-2">
                                {direction === 'coin_to_credit' ? <Coins className="text-amber-500" /> : <Wallet className="text-indigo-500" />}
                                <input 
                                    type="number" min="1" max={direction === 'coin_to_credit' ? user.coins : user.aiCredits}
                                    step={direction === 'coin_to_credit' ? rates.rateCoinToCredit : 1}
                                    value={amount}
                                    onChange={e => setAmount(parseInt(e.target.value) || 0)}
                                    className="bg-transparent text-2xl font-black text-stone-800 w-full outline-none"
                                />
                            </div>
                        </div>

                        {/* SWAP BUTTON */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                            <button 
                                onClick={handleSwap}
                                className="bg-white border border-stone-200 rounded-full p-2 hover:bg-stone-50 hover:scale-110 transition-all shadow-sm group"
                            >
                                <ArrowRightLeft size={18} className="text-stone-500 group-hover:text-stone-800 transition-colors" />
                            </button>
                        </div>

                        {/* TO */}
                        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                            <div className="text-xs font-bold text-stone-500 mb-2">
                                您將獲得 ({direction === 'coin_to_credit' ? '點數' : '金幣'})
                            </div>
                            <div className="flex items-center gap-2">
                                {direction === 'coin_to_credit' ? <Wallet className="text-indigo-500" /> : <Coins className="text-amber-500" />}
                                <div className="text-2xl font-black text-stone-800">
                                    {calculatedGain}
                                </div>
                            </div>
                        </div>
                    </div>

                    {status && (
                        <div className={`p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${
                            status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                            {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {status.msg}
                        </div>
                    )}

                    <button
                        onClick={handleExchange}
                        disabled={isExchanging || amount <= 0 || (direction === 'coin_to_credit' ? amount > user.coins : amount > user.aiCredits) || (direction === 'coin_to_credit' && amount < currentRate)}
                        className="w-full py-3.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isExchanging ? <RefreshCw className="animate-spin" size={18} /> : <ArrowRightLeft size={18} />}
                        確認兌換
                    </button>
                    
                    <div className="text-center text-xs text-stone-400 mt-2">
                        {direction === 'coin_to_credit' && amount < currentRate && '兌換數量不足最低門檻'}
                        {(direction === 'coin_to_credit' ? amount > user.coins : amount > user.aiCredits) && '餘額不足'}
                    </div>
                </div>
            </div>
        </div>
    );
}
