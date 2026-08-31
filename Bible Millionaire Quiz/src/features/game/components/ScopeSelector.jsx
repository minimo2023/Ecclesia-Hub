import React from 'react';

export default function ScopeSelector({ selectedScope, onSelectScope, isInfiniteMode, setIsInfiniteMode, gameMode }) {
    return (
        <div className="w-full md:w-64 lg:w-72 flex flex-col gap-5 flex-shrink-0 p-4 h-full overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-3 mb-2 px-1">
                <h2 className="text-2xl font-bold text-slate-700">選擇範圍</h2>
            </div>

            {/* Main Scopes */}
            <div className="space-y-[1.5vh]">
                <button
                    onClick={() => { onSelectScope('full'); setIsInfiniteMode?.(false); }}
                    className={`w-full p-[2vh] rounded-2xl text-left transition-all duration-300 border-2 relative group ${selectedScope === 'full' && !isInfiniteMode
                        ? 'bg-gradient-to-r from-orange-500 to-rose-500 border-yellow-400 shadow-lg shadow-yellow-500/20 scale-105'
                        : 'bg-white border-slate-200 hover:bg-indigo-50 hover:border-slate-300 opacity-70 hover:opacity-100'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex-1 text-center">
                            <div className={`text-[3vmin] font-bold mb-[0.5vh] ${selectedScope === 'full' && !isInfiniteMode ? 'text-white' : 'text-slate-800'}`}>整本聖經</div>
                            <div className={`text-[1.5vmin] ${selectedScope === 'full' && !isInfiniteMode ? 'text-white/80' : 'text-slate-500'}`}>舊約 + 新約</div>
                        </div>
                        {selectedScope === 'full' && !isInfiniteMode && <div className="text-[4vmin] animate-pulse ml-2">✨</div>}
                    </div>
                </button>

                {gameMode === 'classic' && (
                    <button
                        onClick={() => { onSelectScope('full'); setIsInfiniteMode?.(true); }}
                        className={`w-full p-[2vh] rounded-2xl text-left transition-all duration-300 border-2 relative ${isInfiniteMode
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-400 shadow-lg shadow-purple-500/20 scale-105'
                            : 'bg-white border-slate-200 hover:bg-purple-50 hover:border-slate-300 opacity-70 hover:opacity-100'
                            }`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex-1 text-center">
                                <div className={`text-[3vmin] font-bold mb-[0.5vh] ${isInfiniteMode ? 'text-white' : 'text-slate-800'}`}>無限挑戰</div>
                                <div className={`text-[1.5vmin] ${isInfiniteMode ? 'text-white/80' : 'text-slate-500'}`}>題海生存戰</div>
                            </div>
                            {isInfiniteMode && <div className="text-[4vmin] ml-2">🏆</div>}
                        </div>
                    </button>
                )}

                <button
                    onClick={() => { onSelectScope('舊約'); setIsInfiniteMode?.(false); }}
                    className={`w-full p-[2vh] rounded-2xl text-left transition-all duration-300 border-2 relative ${selectedScope === '舊約' && !isInfiniteMode
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-600 border-blue-400 shadow-lg shadow-blue-500/20 scale-105'
                        : 'bg-white border-slate-200 hover:bg-indigo-50 hover:border-slate-300 opacity-70 hover:opacity-100'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex-1 text-center">
                            <div className={`text-[3vmin] font-bold mb-[0.5vh] ${selectedScope === '舊約' && !isInfiniteMode ? 'text-white' : 'text-slate-800'}`}>舊約</div>
                            <div className={`text-[1.5vmin] ${selectedScope === '舊約' && !isInfiniteMode ? 'text-white/80' : 'text-slate-500'}`}>39 卷書</div>
                        </div>
                        {selectedScope === '舊約' && !isInfiniteMode && <div className="text-[4vmin] ml-2">📜</div>}
                    </div>
                </button>

                <button
                    onClick={() => { onSelectScope('新約'); setIsInfiniteMode?.(false); }}
                    className={`w-full p-[2vh] rounded-2xl text-left transition-all duration-300 border-2 relative ${selectedScope === '新約' && !isInfiniteMode
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 border-green-400 shadow-lg shadow-green-500/20 scale-105'
                        : 'bg-white border-slate-200 hover:bg-indigo-50 hover:border-slate-300 opacity-70 hover:opacity-100'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex-1 text-center">
                            <div className={`text-[3vmin] font-bold mb-[0.5vh] ${selectedScope === '新約' && !isInfiniteMode ? 'text-white' : 'text-slate-800'}`}>新約</div>
                            <div className={`text-[1.5vmin] ${selectedScope === '新約' && !isInfiniteMode ? 'text-white/80' : 'text-slate-500'}`}>27 卷書</div>
                        </div>
                        {selectedScope === '新約' && !isInfiniteMode && <div className="text-[4vmin] ml-2">✝️</div>}
                    </div>
                </button>
            </div>
        </div>
    );
}
