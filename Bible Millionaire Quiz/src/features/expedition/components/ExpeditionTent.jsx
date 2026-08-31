import React from 'react';

export default function ExpeditionTent({
    inventory = {},
    onUseItem,
    stage = 1
}) {
    const hasTent = (inventory.tent || 0) > 0;

    const handleUseTent = () => {
        if (hasTent) {
            // Main screen handles confirmation modal
            onUseItem && onUseItem('tent');
        } else {
            alert('您沒有帳篷！請至商店購買。');
        }
    };

    return (
        <div className="h-24 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-6 gap-4">
            <div className="text-amber-400 font-bold bg-black/60 px-4 py-2 rounded-full border border-amber-500/30">
                🚩 當前進度：第 {stage} 關
            </div>

            <button
                onClick={handleUseTent}
                disabled={!hasTent}
                className={`flex items-center gap-2 px-6 py-2 rounded-full border transition-all ${hasTent
                    ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:scale-105'
                    : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                    }`}
            >
                <span className="text-2xl">⛺</span>
                <span className="font-medium">使用帳篷存檔</span>
                {hasTent && <span className="bg-white/20 px-2 rounded-full text-xs">{inventory.tent}</span>}
            </button>
        </div>
    );
}
