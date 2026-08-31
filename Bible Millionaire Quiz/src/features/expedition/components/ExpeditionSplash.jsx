import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, Database, UserCheck } from 'lucide-react';

/**
 * [SOVEREIGN] ExpeditionSplash
 * 旗艦級遠征啟動緩衝頁。
 * 核心職責：
 * 1. 視覺震撼：建立高端冒險氛圍。
 * 2. 技術同步：作為資料庫與內存同步的物理緩衝時間。
 */
const ExpeditionSplash = ({ status = 'initializing', onDone }) => {
    const [progress, setProgress] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);

    const steps = [
        { icon: <Database className="w-5 h-5" />, text: '接入聖經智匯總帳...', color: 'text-blue-400' },
        { icon: <ShieldCheck className="w-5 h-5" />, text: '校對主權資產安全...', color: 'text-amber-400' },
        { icon: <UserCheck className="w-5 h-5" />, text: '身分主權異地對位...', color: 'text-emerald-400' },
        { icon: <Zap className="w-5 h-5" />, text: '啟動遠征時空維度...', color: 'text-purple-400' }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 2;
            });
        }, 30);

        const stepInterval = setInterval(() => {
            setStepIndex(prev => (prev < steps.length - 1 ? prev + 1 : prev));
        }, 600);

        return () => {
            clearInterval(interval);
            clearInterval(stepInterval);
        };
    }, []);

    // [SOVEREIGN] Check for completion and status readiness
    useEffect(() => {
        if (progress >= 100 && status === 'ready' && onDone) {
            const timeout = setTimeout(() => {
                onDone();
            }, 800); // 額外延遲一小段時間讓玩家看清 100% 狀態
            return () => clearTimeout(timeout);
        }
    }, [progress, status, onDone]);

    return (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#020617]">
            {/* Background Decorative Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none" />

            {/* Central Content */}
            <div className="relative z-10 flex flex-col items-center">
                {/* LOGOS ICON (Glow Effect) */}
                <div className="relative mb-12 group">
                    <div className="absolute inset-0 bg-amber-500/40 rounded-full blur-3xl group-hover:bg-amber-400/60 transition-all duration-700 animate-pulse" />
                    <div className="relative w-32 h-32 bg-gradient-to-br from-amber-400 to-amber-600 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(245,158,11,0.3)] transform rotate-12 group-hover:rotate-0 transition-transform duration-500">
                        <ShieldCheck className="w-20 h-20 text-slate-900" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-[0.2em] uppercase">
                    聖經遠征大冒險
                </h1>
                <div className="h-1 w-24 bg-gradient-to-r from-transparent via-amber-500 to-transparent mb-12" />

                {/* Status Card (Glassmorphism) */}
                <div className="w-80 md:w-96 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sovereign Link Status</span>
                        <span className="text-xs font-black text-amber-500">{progress}%</span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-6">
                        <div 
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Dynamic Steps */}
                    <div className="space-y-4">
                        {steps.map((step, idx) => (
                            <div 
                                key={idx} 
                                className={`flex items-center gap-4 transition-all duration-500 ${idx <= stepIndex ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                            >
                                <div className={`p-2 rounded-xl ${idx === stepIndex ? 'bg-white/10 shadow-lg' : 'bg-transparent'} ${step.color}`}>
                                    {step.icon}
                                </div>
                                <span className={`text-sm font-medium ${idx === stepIndex ? 'text-white' : 'text-slate-500'}`}>
                                    {step.text}
                                </span>
                                {idx < stepIndex && (
                                    <div className="ml-auto w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Quote */}
                <div className="absolute bottom-12 text-center px-6">
                    <p className="text-slate-500 text-sm italic font-serif">"Thy word is a lamp unto my feet, and a light unto my path."</p>
                    <p className="text-[10px] text-slate-700 mt-2 uppercase tracking-[0.3em]">Logos Bank Sovereign v2.0 Secured</p>
                </div>
            </div>
        </div>
    );
};

export default ExpeditionSplash;
