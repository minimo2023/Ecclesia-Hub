import React, { useState } from 'react';
import { Trophy, Target, Zap, Clock, RotateCcw, Home, Coins } from 'lucide-react';
import RatingAndSupport from './shared/RatingAndSupport';
import SupportModal from '../../../shared/components/SupportModal';

/**
 * SpeedResultsScreen - 快問快答模式結果頁面
 *
 * 版面設計：
 * - 手機（直式）：垂直排列，成績在上、按鈕固定底部
 * - 桌機（lg:）：左右分割，成績左 70% / 操作右 30%
 */
export default function SpeedResultsScreen({
    correctCount = 0,
    totalAnswered = 0,
    coinsEarned = 0,
    bonusCoins = 0,
    onReplay,
    onBackToMenu
}) {
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

    // 評分等級
    const getGrade = () => {
        if (accuracy >= 90) return { grade: 'S', color: 'text-orange-500', bg: 'from-orange-500 to-rose-500' };
        if (accuracy >= 80) return { grade: 'A', color: 'text-violet-600', bg: 'from-purple-500 to-pink-600' };
        if (accuracy >= 70) return { grade: 'B', color: 'text-indigo-600', bg: 'from-blue-500 to-cyan-600' };
        if (accuracy >= 60) return { grade: 'C', color: 'text-emerald-600', bg: 'from-green-500 to-emerald-600' };
        return { grade: 'D', color: 'text-slate-500', bg: 'from-slate-500 to-slate-600' };
    };

    const gradeInfo = getGrade();

    const [isSaving, setIsSaving] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);

    const handleRate = async (value) => {
        try {
            await fetch('/api/game/rating', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'speed', rating: value })
            });
        } catch (e) {
            console.error('Failed to submit rating:', e);
        }
    };

    const getMessage = () => {
        if (accuracy >= 90) return { text: '🏆 完美表現！你是聖經專家！', color: 'text-orange-500' };
        if (accuracy >= 70) return { text: '👍 表現優秀！繼續加油！', color: 'text-indigo-600' };
        if (accuracy >= 50) return { text: '📖 繼續研讀，會更進步！', color: 'text-emerald-600' };
        return { text: '💪 再接再厲，多多練習！', color: 'text-slate-500' };
    };

    const message = getMessage();

    return (
        <div className="h-[100dvh] w-full bg-slate-50 text-slate-900 overflow-hidden flex flex-col animate-fade-in font-sans">

            {/* ── 手機版：垂直佈局 ── */}
            <div className="flex-1 flex flex-col lg:hidden overflow-y-auto pb-36">

                {/* 標題 */}
                <div className="text-center px-6 pt-8 pb-4">
                    <div className="flex items-center justify-center gap-3 mb-1">
                        <Clock className="w-8 h-8 text-violet-600" />
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">快問快答 完成！</h1>
                    </div>
                    <p className="text-slate-500 font-bold tracking-[0.3em] text-[10px]">限時挑戰結果</p>
                </div>

                {/* 等級徽章 */}
                <div className="flex flex-col items-center px-6 pb-6">
                    <div className="relative mb-6">
                        <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${gradeInfo.bg} flex items-center justify-center shadow-[0_0_50px_rgba(168,85,247,0.3)]`}>
                            <span className="text-7xl font-black text-white drop-shadow-2xl">{gradeInfo.grade}</span>
                        </div>
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-100 px-5 py-1.5 rounded-full border-2 border-slate-200 shadow-xl">
                            <span className="text-lg font-black text-slate-900">{accuracy}%</span>
                        </div>
                    </div>

                    {/* 統計卡片 */}
                    <div className="w-full max-w-sm grid grid-cols-2 gap-3 mt-4">
                        {/* 答對題數 */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-200 text-center">
                            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <Target className="w-5 h-5 text-emerald-600" />
                            </div>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">答對題數</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-black text-emerald-600">{correctCount}</span>
                                <span className="text-slate-600 text-xs font-bold">/ {totalAnswered}</span>
                            </div>
                        </div>

                        {/* 獲得金幣 */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-200 text-center">
                            <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <Coins className="w-5 h-5 text-amber-400" />
                            </div>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">獲得金幣</p>
                            <div className="flex flex-col items-center">
                                <span className="text-3xl font-black text-amber-400">💰 {coinsEarned}</span>
                                {bonusCoins > 0 && (
                                    <span className="text-emerald-400 text-[10px] font-black mt-0.5 animate-pulse">+{bonusCoins} 額外獎勵</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 評語 */}
                    <div className="w-full max-w-sm mt-3 bg-white/90 rounded-2xl p-4 text-center border border-slate-200">
                        <p className={`text-base font-bold ${message.color}`}>{message.text}</p>
                    </div>
                </div>
            </div>

            {/* 手機版固定底部按鈕 */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-slate-100/95 backdrop-blur-md border-t border-slate-200 safe-area-pb space-y-3">
                <button
                    onClick={() => onReplay?.()}
                    className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 active:from-indigo-700 active:to-violet-700 rounded-2xl text-white font-black text-base shadow-xl shadow-purple-900/20 transition-all active:scale-95"
                >
                    <RotateCcw className="w-5 h-5" />
                    再玩一次
                </button>
                <button
                    onClick={onBackToMenu}
                    className="w-full flex items-center justify-center gap-3 py-4 bg-white active:bg-slate-100 rounded-2xl text-slate-700 border border-slate-200 font-black text-base transition-all active:scale-95"
                >
                    <Home className="w-5 h-5" />
                    返回問答挑戰
                </button>
            </div>

            {/* ── 桌機版：左右分割佈局（原設計保留）── */}
            <main className="hidden lg:flex flex-1 overflow-hidden safe-area-pl safe-area-pr safe-area-pb">

                {/* Left Section: Grade & Performance Summary (70%) */}
                <section className="flex-[0.7] flex flex-col items-center justify-center p-10 space-y-8 overflow-y-auto">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-3 mb-2">
                            <Clock className="w-10 h-10 text-violet-600" />
                            <h1 className="text-5xl font-black text-slate-900 tracking-tight">快問快答 完成！</h1>
                        </div>
                        <p className="text-slate-500 font-bold tracking-[0.3em] text-xs">限時挑戰結果</p>
                    </div>

                    <div className="flex flex-row items-center gap-16 w-full max-w-4xl justify-center">
                        {/* Grade Badge */}
                        <div className="relative shrink-0 scale-125">
                            <div className={`w-40 h-40 rounded-full bg-gradient-to-br ${gradeInfo.bg} flex items-center justify-center shadow-[0_0_50px_rgba(168,85,247,0.3)]`}>
                                <span className="text-8xl font-black text-white drop-shadow-2xl">{gradeInfo.grade}</span>
                            </div>
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-100 px-6 py-2 rounded-full border-2 border-slate-200 shadow-xl">
                                <span className="text-xl font-black text-slate-900">{accuracy}%</span>
                            </div>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <div className="bg-white rounded-[32px] p-6 border border-slate-200 text-center shadow-inner">
                                <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                                    <Target className="w-6 h-6 text-emerald-600" />
                                </div>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">答對題數</p>
                                <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-4xl font-black text-emerald-600">{correctCount}</span>
                                    <span className="text-slate-600 text-sm font-bold">/ {totalAnswered}</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-[32px] p-6 border border-slate-200 text-center shadow-inner">
                                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                                    <Coins className="w-6 h-6 text-amber-400" />
                                </div>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">獲得智匯金幣</p>
                                <div className="flex flex-col">
                                    <span className="text-4xl font-black text-amber-400">💰 {coinsEarned}</span>
                                    {bonusCoins > 0 && (
                                        <span className="text-emerald-400 text-[10px] font-black mt-1 animate-pulse">+{bonusCoins} 額外獎勵</span>
                                    )}
                                </div>
                            </div>

                            <div className="col-span-2 bg-indigo-50 rounded-2xl p-4 text-center border border-slate-200">
                                <p className={`text-lg font-bold ${message.color}`}>{message.text}</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right Section: Action Controls (30%) */}
                <aside className="flex-[0.3] bg-white/90 border-l border-slate-200 flex flex-col overflow-hidden backdrop-blur-xl shrink-0">
                    <div className="flex-1 flex flex-col p-6 space-y-6">
                        <div className="flex-1">
                            <RatingAndSupport 
                                onRate={handleRate} 
                                onSupportClick={() => setShowSupportModal(true)} 
                            />
                        </div>
                        <div className="space-y-4">
                            <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 text-center">
                                操作中心 CONTROLS
                            </div>
                            <button
                                onClick={() => onReplay?.()}
                                className="w-full flex items-center justify-center gap-3 py-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-2xl text-white font-black text-lg shadow-xl shadow-purple-900/20 transition-all active:scale-95 group"
                            >
                                <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                                再玩一次
                            </button>
                            <button
                                onClick={onBackToMenu}
                                className="w-full flex items-center justify-center gap-3 py-5 bg-white hover:bg-slate-100 rounded-2xl text-slate-700 border border-slate-200 font-black text-lg transition-all active:scale-95"
                            >
                                <Home className="w-5 h-5" />
                                返回問答挑戰
                            </button>
                        </div>
                    </div>
                </aside>
            </main>
            
            <SupportModal 
                isOpen={showSupportModal} 
                onClose={() => setShowSupportModal(false)} 
            />
        </div>
    );
}
