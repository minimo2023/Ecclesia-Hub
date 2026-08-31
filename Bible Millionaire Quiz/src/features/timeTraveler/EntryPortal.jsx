import React, { useState } from 'react';
import { Compass, Sparkles, AlertCircle, ArrowRight, Loader2, PlayCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 聖經時空旅人 - 入口大廳 (Entry Portal)
 * 供玩家自由輸入任意主題或經文，呼叫 Evaluator 進行動態解析。
 */
export default function EntryPortal({ onEvaluateSuccess, onCancel }) {
    const { user, isLoggedIn } = useAuth();
    const [topic, setTopic] = useState('');
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [error, setError] = useState('');
    const [parsedResult, setParsedResult] = useState(null); // The LLM evaluation JSON

    const handleEvaluate = async (e) => {
        e.preventDefault();
        if (!topic.trim()) return;
        
        if (!isLoggedIn) {
            setError('請先登入以啟用時空旅人引擎。');
            return;
        }

        setIsEvaluating(true);
        setError('');
        setParsedResult(null);

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/time-traveler/evaluate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ topic: topic.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                // Could be 402 Insufficient Credits or 400/500
                throw new Error(data.error || '無法解析該主題，請重試。');
            }

            setParsedResult(data.evaluation);
            
            // If it's a valid narrative string, we might automatically proceed or wait for user to click "Confirm"
        } catch (err) {
            console.error('[EntryPortal] Evaluate error:', err);
            setError(err.message);
        } finally {
            setIsEvaluating(false);
        }
    };

    const handleConfirmEnter = () => {
        if (parsedResult && parsedResult.is_narrative && parsedResult.scripture_reference) {
            // Pass the LLM evaluation to the parent router (App.jsx or TimeTravelerLayout.jsx)
            // so we can move to Phase 2 (Scene Engine Cache/Generation)
            onEvaluateSuccess(parsedResult, topic);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[100px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500 rounded-full mix-blend-screen filter blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="z-10 w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center p-4 bg-white/5 border border-white/10 rounded-full mb-4 shadow-xl backdrop-blur-md">
                        <Compass className="w-10 h-10 text-amber-400" />
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold mb-3 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">
                        聖經時空旅人
                    </h1>
                    <p className="text-slate-400 text-lg">成為歷史的見證者。請輸入您想親臨的聖經事件或經文。</p>
                </div>

                {/* Main Card */}
                <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700 p-6 md:p-8 rounded-3xl shadow-2xl">
                    {!parsedResult ? (
                        <form onSubmit={handleEvaluate} className="flex flex-col gap-6">
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-300 mb-2 ml-1">
                                    時空座標 (文字描述)
                                </label>
                                <textarea
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="例如：主耶穌在迦拿婚宴水變酒的故事... 或 出埃及記 14章"
                                    className="w-full bg-slate-900/50 border border-slate-600 text-slate-100 rounded-2xl p-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none text-lg transition-all"
                                    disabled={isEvaluating}
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-900/40 border border-red-500/30 rounded-xl text-red-200 text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center pt-2">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors font-medium"
                                >
                                    返回主選單
                                </button>
                                
                                <button
                                    type="submit"
                                    disabled={!topic.trim() || isEvaluating}
                                    className="group relative flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-xl font-bold shadow-lg shadow-amber-900/20 disabled:shadow-none transition-all"
                                >
                                    {isEvaluating ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>定位中...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                            <span>解析時空座標</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-slate-900/50 p-6 rounded-2xl border border-indigo-500/30">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                        <Compass className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-100">座標解析完成</h3>
                                </div>
                                
                                <div className="space-y-4 text-sm md:text-base">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                                        <span className="text-slate-400 w-24 shrink-0">定位經文：</span>
                                        <span className="text-amber-300 font-semibold">{parsedResult.scripture_reference || '查無明確經文'}</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                                        <span className="text-slate-400 w-24 shrink-0">分析結果：</span>
                                        <span className="text-slate-200 leading-relaxed">{parsedResult.reason}</span>
                                    </div>
                                    {parsedResult.is_narrative && (
                                        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                                            <span className="text-slate-400 w-24 shrink-0">命運錨點：</span>
                                            <span className="text-indigo-300 italic">"{parsedResult.canonical_anchor}"</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-between items-center">
                                <button
                                    onClick={() => setParsedResult(null)}
                                    className="px-6 py-3 rounded-xl text-slate-400 hover:text-white transition-colors"
                                >
                                    重新輸入
                                </button>
                                
                                {parsedResult.is_narrative ? (
                                    <button
                                        onClick={handleConfirmEnter}
                                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-all hover:scale-105"
                                    >
                                        <PlayCircle className="w-5 h-5" />
                                        <span>啟動時空跳躍</span>
                                    </button>
                                ) : (
                                    <button
                                        disabled
                                        className="px-8 py-3 bg-slate-700 text-slate-400 rounded-xl font-bold cursor-not-allowed"
                                    >
                                        該主題無法進行敘事體驗
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
