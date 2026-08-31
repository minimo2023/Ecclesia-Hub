import React, { useState, useEffect } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Clock, Info, ShieldInfo } from 'lucide-react';

/**
 * [SOVEREIGN] LogosLedger (聖經智匯存摺)
 * 用戶專屬的資產結算審計明細。
 * 核心職責：
 * 1. 透明化：展示金幣與 AI 額度的最新流動。
 * 2. 主權感：延續 Logos Bank 的視覺語彙。
 */
const LogosLedger = ({ type = 'coin' }) => {
    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchLedger = async () => {
            try {
                setLoading(true);
                const endpoint = type === 'coin' ? '/api/user/ledger' : '/api/user/ai-ledger';
                const res = await fetch(endpoint, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                });
                const data = await res.json();
                
                if (data.success) {
                    setLedger(data.ledger || []);
                } else {
                    setError(data.error);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchLedger();
    }, [type]);

    const formatReason = (reason) => {
        const mapping = {
            'DAILY_SIGNIN': '☀️ 每日靈修簽到',
            'EXPEDITION_QUESTION_S1': '🛡️ 遠征答對獎勵 (階段 1)',
            'EXPEDITION_STAGE_CLEAR_S1': '🏁 遠征通關 (階段 1)',
            'MIGRATION_INITIAL_BALANCE': '🏦 聖經銀行主權接管 (歷史餘額結轉)',
            'GIFT_FROM_TEAMMATE': '🎁 戰友贈予物資',
            'AI_QUESTION_GENERATION': '🤖 AI 輔助命題消耗'
        };
        return mapping[reason] || reason;
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-12 gap-4 animate-pulse">
            <div className="w-12 h-12 bg-white/5 rounded-full border border-white/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-slate-500 text-sm font-medium">翻開聖經總帳中...</p>
        </div>
    );

    if (error) return (
        <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-3xl text-center">
            <ShieldInfo className="w-8 h-8 text-red-500 mx-auto mb-4" />
            <p className="text-red-400 text-sm">{error}</p>
        </div>
    );

    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between px-2 mb-6 text-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-2xl flex items-center justify-center border border-amber-500/30">
                        <BookOpen className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight uppercase">主權結算存摺</h2>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Logos Bank Ledger Audit</p>
                    </div>
                </div>
            </header>

            {ledger.length === 0 ? (
                <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center text-slate-500">
                    目前尚無主權異動紀律
                </div>
            ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {ledger.map((entry, idx) => (
                        <div key={idx} className="group flex items-center gap-4 p-4 bg-white/5 hover:bg-white/[0.08] transition-all duration-300 rounded-2xl border border-white/5 hover:border-white/10">
                            {/* Icon Indicator */}
                            <div className={`p-3 rounded-xl ${entry.change_amount >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                                {entry.change_amount >= 0 ? 
                                    <TrendingUp className="w-4 h-4 text-emerald-500" /> : 
                                    <TrendingDown className="w-4 h-4 text-red-500" />
                                }
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="text-slate-200 font-bold text-sm truncate">
                                    {formatReason(entry.reason)}
                                </div>
                                <div className="text-[10px] text-slate-500 font-medium">
                                    {new Date(entry.created_at).toLocaleString()}
                                </div>
                            </div>

                            {/* Amount */}
                            <div className="text-right">
                                <div className={`text-base font-black ${entry.change_amount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {entry.change_amount >= 0 ? '+' : ''}{entry.change_amount}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono tracking-tighter">
                                    Bal: {entry.balance_after}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <footer className="mt-8 p-4 bg-slate-900/40 rounded-2xl border border-white/5">
                <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-500/50 flex-none mt-0.5" />
                    <p className="text-xs text-slate-500 leading-relaxed italic font-serif">
                        本帳本由聖經智匯銀行 (Logos Bank) 主權託管，所有資產變動皆符合雙軌審計協議。
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default LogosLedger;
