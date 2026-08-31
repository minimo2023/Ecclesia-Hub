import React, { useState } from 'react';
import { ArrowLeftRight, Package, User, Send } from 'lucide-react';

/**
 * ExpeditionItemTrade - 道具交換介面
 * 讓隊員之間可以互相交換道具
 */
export default function ExpeditionItemTrade({
    team,
    inventory,
    shopItems,
    displayName,
    onTradeRequest,
    onIntent
}) {
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedTargets, setSelectedTargets] = useState([]); // Array of members
    const [quantity, setQuantity] = useState(1);
    const [hasSent, setHasSent] = useState(false);

    // 過濾出除了自己以外的隊員
    const teammates = team?.members?.filter(m => m.displayName !== displayName) || [];

    // 取得道具資訊
    const getItemInfo = (itemId) => shopItems?.find(i => i.id === itemId) || { name: itemId, icon: '📦' };

    // 可交換的道具 (庫存 > 0)
    const tradableItems = Object.entries(inventory || {})
        .filter(([_, qty]) => qty > 0)
        .map(([id, qty]) => ({ id, qty, ...getItemInfo(id) }));

    // Reset when item changes
    const handleSelectItem = (itemId) => {
        setSelectedItem(itemId);
        setQuantity(1);
        // Keep targets selected to allow easy switching item
    };

    const handleSelectTarget = (member) => {
        const isSelected = selectedTargets.some(t => t.displayName === member.displayName);
        let newTargets;

        if (isSelected) {
            newTargets = selectedTargets.filter(t => t.displayName !== member.displayName);
        } else {
            newTargets = [...selectedTargets, member];
            if (onIntent) onIntent(member.displayName);
        }

        setSelectedTargets(newTargets);

        // Auto-adjust quantity if total cost exceeds stock
        if (selectedItem) {
            const item = tradableItems.find(i => i.id === selectedItem);
            if (item) {
                const count = newTargets.length || 1;
                const maxPerPerson = Math.floor(item.qty / count);
                if (quantity > maxPerPerson) setQuantity(Math.max(1, maxPerPerson));
            }
        }
    };

    const handleQuantityChange = (delta) => {
        if (!selectedItem) return;
        const item = tradableItems.find(i => i.id === selectedItem);
        if (!item) return;

        const count = selectedTargets.length || 1;
        const maxPerPerson = Math.floor(item.qty / count);

        const newQty = quantity + delta;
        if (newQty >= 1 && newQty <= maxPerPerson) {
            setQuantity(newQty);
        }
    };

    const handleTrade = () => {
        if (selectedItem && selectedTargets.length > 0) {
            if (onTradeRequest) {
                // Pass quantity per person
                onTradeRequest(selectedItem, selectedTargets, quantity);
            }
            // Reset quantity but keep selections for ease of use? 
            // Better to clear to prevent accidental double send.
            setQuantity(1);
            setHasSent(true);
            setTimeout(() => setHasSent(false), 2000);
        }
    };

    // Calculate Total Cost
    const totalCost = selectedItem && quantity * selectedTargets.length;
    const currentStock = selectedItem ? (tradableItems.find(i => i.id === selectedItem)?.qty || 0) : 0;

    if (!team) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center text-slate-400">
                    <ArrowLeftRight className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">請先加入隊伍</p>
                    <p className="text-sm mt-2">加入隊伍後才能贈送道具給隊友</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-4 md:p-6">
            {/* Header */}
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                    <ArrowLeftRight className="w-6 h-6 text-cyan-400" />
                    物資調度
                </h2>
                <p className="text-slate-400 text-sm">選擇道具進行分配 (支援多人)</p>
            </div>

            <div className="flex-1 flex flex-col md:grid md:grid-cols-3 gap-4 min-h-0 overflow-hidden">
                {/* Column 1: My Items */}
                <div className="bg-slate-900/70 rounded-xl border border-slate-700 p-3 md:p-4 flex flex-col min-h-0 max-h-40 md:max-h-none">
                    <h3 className="font-bold text-cyan-400 mb-2 flex items-center gap-2 text-sm md:text-base">
                        <Package className="w-4 h-4" /> 我的道具
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-1 md:space-y-2">
                        {tradableItems.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-2">沒有可贈送的道具</p>
                        ) : (
                            tradableItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelectItem(item.id)}
                                    className={`w-full p-2 md:p-3 rounded-lg border transition-all text-left flex items-center gap-2 ${selectedItem === item.id
                                        ? 'bg-cyan-600/30 border-cyan-500 text-white'
                                        : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:border-cyan-500/50'
                                        }`}
                                >
                                    <span className="text-lg md:text-xl">{item.icon || '📦'}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate">{item.name}</div>
                                        <div className="text-xs text-slate-400">持有: {item.qty}</div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Column 2: Trade Arrow & Action */}
                <div className="flex md:flex-col items-center justify-center gap-3 md:gap-4 py-2 md:py-0">
                    <div className={`w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${selectedItem && selectedTargets.length > 0
                        ? 'bg-cyan-600 text-white animate-pulse'
                        : 'bg-slate-800 text-slate-500'
                        }`}>
                        <ArrowLeftRight className="w-5 h-5 md:w-8 md:h-8" />
                    </div>

                    {/* Quantity Selector */}
                    {selectedItem && (
                        <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-600">
                                <button
                                    onClick={() => handleQuantityChange(-1)}
                                    className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-50"
                                    disabled={quantity <= 1}
                                >
                                    -
                                </button>
                                <span className="w-8 text-center font-bold">{quantity}</span>
                                <button
                                    onClick={() => handleQuantityChange(1)}
                                    className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-50"
                                    disabled={selectedItem && (quantity + 1) * (selectedTargets.length || 1) > currentStock}
                                >
                                    +
                                </button>
                            </div>
                            <div className="text-[10px] text-slate-400">每人數量</div>
                        </div>
                    )}

                    <button
                        onClick={handleTrade}
                        disabled={!selectedItem || selectedTargets.length === 0 || hasSent}
                        className={`px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold flex items-center gap-2 transition-all text-sm md:text-base ${selectedItem && selectedTargets.length > 0 && !hasSent
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/50'
                            : hasSent
                                ? 'bg-green-600 text-white'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            }`}
                    >
                        {hasSent ? (
                            <>✅ 已發送</>
                        ) : (
                            <>
                                <Send className="w-4 h-4 md:w-5 md:h-5" />
                                確認發送
                            </>
                        )}
                    </button>

                    {selectedItem && selectedTargets.length > 0 && (
                        <div className="text-center text-xs text-cyan-300 animate-in fade-in">
                            共消耗 {totalCost} 個 {getItemInfo(selectedItem).name} <br />
                            分配給 {selectedTargets.length} 人
                        </div>
                    )}
                </div>

                {/* Column 3: Teammates */}
                <div className="bg-slate-900/70 rounded-xl border border-slate-700 p-3 md:p-4 flex flex-col min-h-0 max-h-40 md:max-h-none">
                    <h3 className="font-bold text-amber-400 mb-2 flex items-center gap-2 text-sm md:text-base">
                        <User className="w-4 h-4" /> 選擇對象 ({selectedTargets.length})
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-1 md:space-y-2">
                        {teammates.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-2">目前沒有其他隊員</p>
                        ) : (
                            teammates.map((member, idx) => {
                                const isSelected = selectedTargets.some(t => t.displayName === member.displayName);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectTarget(member)}
                                        className={`w-full p-2 md:p-3 rounded-lg border transition-all text-left flex items-center gap-2 ${isSelected
                                            ? 'bg-amber-600/30 border-amber-500 text-white ring-1 ring-amber-500'
                                            : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:border-amber-500/50'
                                            }`}
                                    >
                                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm md:text-lg relative">
                                            {member.displayName?.charAt(0) || '?'}
                                            {isSelected && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border border-black"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">{member.displayName}</div>
                                            <div className="text-xs text-slate-400">
                                                {member.online ? '🟢 在線' : '⚫ 離線'}
                                                {selectedItem && (
                                                    <span className="ml-2 text-cyan-400">
                                                        (持有: {member.inventory?.[selectedItem] || 0})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
