import React, { useState, useEffect } from 'react';

export default function LeaderboardModal({ scores: initialScores, onClose, mode = 'classic' }) {
    const [scores, setScores] = useState(initialScores || []);
    const [isLoading, setIsLoading] = useState(!initialScores);

    useEffect(() => {
        if (initialScores) return; // If scores are passed directly, don't fetch

        const fetchLeaderboard = async () => {
            try {
                const endpoint = mode === 'infinite' ? '/api/leaderboard/infinite' : '/api/leaderboard';
                const response = await fetch(endpoint);
                const data = await response.json();
                
                // For infinite mode, the field is 'level', for classic it's 'score'
                // We'll normalize it to 'score' for display
                if (mode === 'infinite') {
                    setScores(data.map(item => ({
                        ...item,
                        score: item.level,
                        date: new Date(item.date).toLocaleDateString('zh-TW')
                    })));
                } else {
                    setScores(data.map(item => ({
                        ...item,
                        date: new Date(item.timestamp).toLocaleDateString('zh-TW')
                    })));
                }
            } catch (err) {
                console.error("Failed to fetch leaderboard:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLeaderboard();
    }, [mode, initialScores]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-800 border-2 border-yellow-500 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold"
                >
                    ✕
                </button>

                <h3 className="text-3xl font-bold text-yellow-500 mb-6 text-center flex items-center justify-center gap-3">
                    <span>🏆</span> {mode === 'infinite' ? '無限挑戰榜' : '排行榜'}
                </h3>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {isLoading ? (
                        <p className="text-center text-slate-400 py-8">載入中...</p>
                    ) : scores.length === 0 ? (
                        <p className="text-center text-slate-400 py-8">暫無紀錄，快來挑戰吧！</p>
                    ) : (
                        scores.slice(0, 15).map((score, index) => (
                            <div
                                key={index}
                                className={`flex justify-between items-center p-3 rounded-lg border ${index === 0 ? 'bg-yellow-900/30 border-yellow-500/50' :
                                    index === 1 ? 'bg-slate-700/50 border-slate-500/50' :
                                        index === 2 ? 'bg-orange-900/30 border-orange-500/50' :
                                            'bg-slate-800 border-slate-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    {score.isVictory && <span className="text-2xl" title="完全通關">👑</span>}
                                    <span className={`w-6 text-center font-bold ${index === 0 ? 'text-yellow-400 text-xl' :
                                        index === 1 ? 'text-slate-300 text-lg' :
                                            index === 2 ? 'text-orange-400 text-lg' :
                                                'text-slate-500'
                                        }`}>
                                        {index + 1}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-white">{score.name}</span>
                                        <span className="text-xs text-slate-400">{score.date}</span>
                                    </div>
                                </div>
                                <div className="text-green-400 font-mono font-bold flex items-center gap-1">
                                    {mode === 'infinite' ? 'Lv.' : ''}{score.score.toLocaleString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors"
                >
                    關閉
                </button>
            </div>
        </div>
    );
}
