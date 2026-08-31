import React from 'react';

import { useExpedition } from '../contexts/ExpeditionContext';

export default function ExpeditionInventory() {
    const { team, inventory = {}, shopItems = [] } = useExpedition();
    
    // 檢查背包是否為空
    const isEmpty = Object.keys(inventory).length === 0;

    // [SOVEREIGN] Physical Render Guard: Moved below state logic to satisfy React
    if (!team) return null;

    return (
        <div className="flex flex-col h-full bg-transparent">
            <div className="p-3 border-b border-slate-800 flex items-center gap-2 flex-none">
                <span className="text-lg">🎒</span>
                <h3 className="font-bold text-slate-300">探險背包</h3>
            </div>

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                {isEmpty ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
                        <p>背包是空的</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {Object.entries(inventory).map(([itemId, qty]) => {
                            const itemInfo = shopItems.find(i => i.id === itemId) || { name: itemId };
                            return (
                                <div key={itemId} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                    <span className="text-slate-300 font-medium">{itemInfo.name}</span>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-black/30 rounded-full border border-slate-600/30">
                                        <span className="text-xs text-slate-400">持有</span>
                                        <span className="font-bold text-amber-400">x{qty}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
