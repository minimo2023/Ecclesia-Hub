import React, { useState, useMemo } from 'react';
import AuthModal from '../../auth/AuthModal';
import RatingAndSupport from './shared/RatingAndSupport';
import SupportModal from '../../../shared/components/SupportModal';

const getEncouragingMessage = (percentage) => {
    if (percentage >= 96) return { emoji: '🌟', title: '超越巔峰！', message: '您的聖經知識已達大師級別，繼續保持這份對神話語的熱忱！' };
    if (percentage >= 86) return { emoji: '🎯', title: '表現優異！', message: '您對聖經的理解相當深入，每一次練習都讓您更接近真理！' };
    if (percentage >= 76) return { emoji: '💪', title: '穩步成長！', message: '您的進步令人欣慰，持續閱讀神的話語，智慧必將增添！' };
    if (percentage >= 61) return { emoji: '📖', title: '持續學習！', message: '每一道題目都是認識神的機會，您正在一步步成長中！' };
    return { emoji: '🌱', title: '播種的季節！', message: '學習聖經是一生的旅程，每次練習都是寶貴的種子，必將結出果實！' };
};

export default function GameOverScreen({ score, onReplay, onExit, onSaveScore, wrongAnswers = [], gameMode, isVictory = false, totalQuestions = 0, isLoggedIn, user, isInfiniteMode = false }) {
    const [playerName, setPlayerName] = useState('');
    const [showNameInput, setShowNameInput] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showReplayModal, setShowReplayModal] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);

    const handleRate = async (value) => {
        try {
            await fetch('/api/game/rating', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: gameMode, rating: value })
            });
        } catch (e) {
            console.error('Failed to submit rating:', e);
        }
    };

    const accuracyStats = useMemo(() => {
        if (gameMode !== 'casual' || totalQuestions === 0) return null;
        const correctCount = totalQuestions - wrongAnswers.length;
        const percentage = Math.round((correctCount / totalQuestions) * 100);
        return { correctCount, totalQuestions, percentage, encouragement: getEncouragingMessage(percentage) };
    }, [gameMode, totalQuestions, wrongAnswers.length]);

    const handleReplayClick = () => {
        if (gameMode === 'casual' && wrongAnswers.length > 0) {
            setShowReplayModal(true);
        } else {
            onReplay();
        }
    };

    const handleSaveScore = async (name) => {
        const finalName = name || playerName.trim();
        if (!finalName) return;
        setIsSaving(true);
        try {
            await onSaveScore(finalName);
            setShowNameInput(false);
        } catch (e) {
            console.error('Failed to save score:', e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="h-[100dvh] w-full bg-slate-50 text-slate-900 flex flex-col animate-fade-in font-sans overflow-hidden lg:overflow-y-auto lg:min-h-[100dvh] lg:h-auto">

            {/* ── Hero Section ── */}
            <div className="flex-none flex flex-col items-center text-center px-6 pt-6 pb-2 lg:pt-10 lg:pb-4">
                <div className="text-5xl lg:text-7xl mb-1 lg:mb-3 drop-shadow-2xl select-none">
                    {isVictory ? '🎉' : '😢'}
                </div>
                <h1 className={`text-4xl lg:text-6xl font-black tracking-tight ${isVictory ? 'text-orange-500' : 'text-rose-600'}`}>
                    {isVictory
                        ? (isInfiniteMode ? '無限挑戰結束！' : (gameMode === 'classic' ? '挑戰完成！' : '練習完成！'))
                        : '挑戰失敗'}
                </h1>
            </div>

            {/* ── Card + Buttons Row (mobile: side-by-side, desktop: stacked centered) ── */}
            <div className="flex-1 flex items-center justify-center px-5 gap-3 lg:flex-col lg:gap-6 lg:pb-8">

                {/* ── Score Card ── */}
                {gameMode === 'classic' && (
                    <div className="flex-1 lg:flex-none bg-white border border-orange-200 rounded-3xl px-5 py-5 lg:px-16 lg:py-7 shadow-2xl text-center">
                        <div className="text-4xl lg:text-7xl font-black text-amber-400 drop-shadow-lg mb-1">
                            💰 {score || 0}
                        </div>
                        <p className="text-amber-500/70 text-xs lg:text-base font-black uppercase tracking-[0.2em]">
                            本次獲得智匯金幣
                        </p>
                    </div>
                )}

                {/* ── Accuracy Card (casual) ── */}
                {accuracyStats && (
                    <div className="flex-1 lg:flex-none bg-white border border-slate-200 rounded-3xl px-4 py-5 lg:px-16 lg:py-10 shadow-2xl lg:max-w-sm lg:w-full">
                        <div className="flex items-center gap-3 mb-3 lg:mb-4">
                            <span className="text-3xl lg:text-6xl">{accuracyStats.encouragement.emoji}</span>
                            <div>
                                <div className="text-3xl lg:text-6xl font-black text-orange-500 leading-none">
                                    {accuracyStats.percentage}%
                                </div>
                                <div className="text-slate-500 text-[10px] lg:text-xs font-bold uppercase tracking-widest mt-0.5">
                                    答對 {accuracyStats.correctCount} / {accuracyStats.totalQuestions} 題
                                </div>
                            </div>
                        </div>
                        <div className="text-sm lg:text-lg font-black text-emerald-400 mb-0.5">{accuracyStats.encouragement.title}</div>
                        <p className="text-slate-500 text-xs lg:text-sm leading-relaxed hidden lg:block">{accuracyStats.encouragement.message}</p>
                    </div>
                )}

                {/* ── Action Buttons (vertical, right side on mobile) ── */}
                <div className="flex flex-col gap-3 lg:flex-row lg:gap-4 lg:w-auto">
                    <button
                        onClick={handleReplayClick}
                        className="flex items-center justify-center gap-2 px-5 py-4 lg:px-8 lg:py-4 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-slate-950 rounded-2xl font-black text-base lg:text-xl shadow-xl transition-all"
                    >
                        <span>↺</span> 重新挑戰
                    </button>
                    <button
                        onClick={onExit}
                        className="flex items-center justify-center gap-2 px-5 py-4 lg:px-8 lg:py-4 bg-slate-100 hover:bg-slate-100 active:scale-95 text-slate-900 rounded-2xl font-black text-base lg:text-xl shadow-xl transition-all"
                    >
                        <span>←</span> 返回問答挑戰
                    </button>
                </div>
            </div>

            {/* ── Save Score (classic, non-casual) ── */}
            {showNameInput && (score > 0 || isInfiniteMode) && gameMode !== 'casual' && (
                <div className="flex-none px-5 pb-5 lg:pb-6">
                    <div className="max-w-md mx-auto">
                        <div className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-3 text-center">
                            🏆 儲存排行榜成績
                        </div>
                        {isLoggedIn && user ? (
                            <button
                                onClick={() => handleSaveScore(user.displayName || user.username)}
                                disabled={isSaving}
                                className="w-full py-3 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95 disabled:opacity-60"
                            >
                                {isSaving ? '處理中…' : `以「${user.displayName || user.username}」提交成績`}
                            </button>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="text-sm text-slate-500 text-center mb-1">
                                    目前為訪客狀態，成績只會保留在這台裝置。<br/>
                                    <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-xs font-bold leading-relaxed">
                                        清除網站資料後，訪客的金幣與測驗成績將無法復原。<br/>
                                        <span className="text-orange-600 mt-1 inline-block">登入或註冊，即可保存本次金幣與排行榜成績。</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAuthModal(true)}
                                    disabled={isSaving}
                                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95"
                                >
                                    登入或註冊並保存
                                </button>
                                <button
                                    onClick={() => handleSaveScore('訪客')}
                                    disabled={isSaving}
                                    className="w-full py-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-40 text-sm"
                                >
                                    {isSaving ? '處理中…' : '略過登入，以訪客身分繼續'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Rating & Support ── */}
            <div className="flex-none px-5 pb-8 lg:pb-12">
                <RatingAndSupport 
                    onRate={handleRate} 
                    onSupportClick={() => setShowSupportModal(true)} 
                />
            </div>



            {/* ── Replay Modal ── */}
            {showReplayModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-3">
                        <h3 className="text-2xl font-bold text-center text-slate-900 mb-2">重新挑戰選項</h3>
                        <p className="text-slate-500 text-center mb-4">您想要如何進行挑戰？</p>
                        <button
                            onClick={() => { setShowReplayModal(false); onReplay({ initialQuestions: wrongAnswers, questionCount: wrongAnswers.length }); }}
                            className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-lg transition shadow-lg active:scale-95 flex flex-col items-center"
                        >
                            <span>只挑戰錯題</span>
                            <span className="text-xs font-normal opacity-80 mt-1">({wrongAnswers.length} 題)</span>
                        </button>
                        <button
                            onClick={() => { setShowReplayModal(false); onReplay({ initialQuestions: wrongAnswers }); }}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg transition shadow-lg active:scale-95 flex flex-col items-center"
                        >
                            <span>錯題 + 新題目</span>
                            <span className="text-xs font-normal opacity-80 mt-1">(補足原題目數量)</span>
                        </button>
                        <button
                            onClick={() => { setShowReplayModal(false); onReplay(); }}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-lg transition shadow-lg active:scale-95"
                        >
                            重新出題
                        </button>
                        <button
                            onClick={() => setShowReplayModal(false)}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-100 text-slate-700 rounded-xl font-bold transition"
                        >
                            取消
                        </button>
                    </div>
                </div>
            )}

            {/* Auth Modal for Guests */}
            <AuthModal 
                isOpen={showAuthModal} 
                onClose={() => setShowAuthModal(false)} 
                onLoginSuccess={() => setShowAuthModal(false)} 
            />

            {/* Support Modal */}
            <SupportModal 
                isOpen={showSupportModal} 
                onClose={() => setShowSupportModal(false)} 
            />
        </div>
    );
}
