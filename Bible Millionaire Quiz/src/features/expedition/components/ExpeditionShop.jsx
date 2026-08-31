import React, { useState } from 'react';
import { ShoppingBag, Heart, Shield, BookOpen, Tent, Coins, X, Check, Plus, Minus, RefreshCw } from 'lucide-react';

import { useExpedition } from '../contexts/ExpeditionContext';

/**
 * ExpeditionShop - 遠征隊商店元件
 * 支援戰前/戰中購買，數量選擇
 */
export default function ExpeditionShop({ onClose }) {
    const { 
        team, userCoins: coins, inventory = {}, shopItems: items = [], handlePurchase: onPurchase 
    } = useExpedition();

    const [selectedItem, setSelectedItem] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [purchasing, setPurchasing] = useState(false);

    // [SOVEREIGN] Physical Render Guard: Satisfies Rules of Hooks
    if (!team) return null;

    const getIcon = (itemId) => {
        switch (itemId) {
            case 'healthPotion': return <Heart className="w-8 h-8 text-red-400" />;
            case 'shield': return <Shield className="w-8 h-8 text-blue-400" />;
            case 'scroll': return <BookOpen className="w-8 h-8 text-purple-400" />;
            case 'tent': return <Tent className="w-8 h-8 text-yellow-400" />;
            case 'revive': return <RefreshCw className="w-8 h-8 text-green-400" />;
            default: return <ShoppingBag className="w-8 h-8 text-slate-400" />;
        }
    };

    // 檢查是否達到購買上限
    const isMaxedOut = (item) => {
        if (!item.maxPurchase) return false;
        return (inventory[item.id] || 0) >= item.maxPurchase;
    };

    const getPrice = (item) => item.price;
    const canAfford = (item, qty = 1) => coins >= getPrice(item) * qty;
    const maxAffordable = (item) => Math.floor(coins / getPrice(item));

    const handleSelectItem = (item) => {
        if (canAfford(item)) {
            setSelectedItem(item);
            setQuantity(1);
        }
    };

    const handlePurchase = async () => {
        if (!selectedItem || !canAfford(selectedItem, quantity) || purchasing) return;

        setPurchasing(true);
        try {
            await onPurchase?.(selectedItem.id, getPrice(selectedItem), quantity);
            setSelectedItem(null);
            setQuantity(1);
        } finally {
            setPurchasing(false);
        }
    };

    const adjustQuantity = (delta) => {
        if (!selectedItem) return;
        const max = maxAffordable(selectedItem);
        setQuantity(prev => Math.max(1, Math.min(max, prev + delta)));
    };

    return (
        <div className="bg-slate-900/70 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-400" />
                    補給商店
                </h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/30 rounded-full">
                        <Coins className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-amber-300">{coins}</span>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="text-slate-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Items List */}
            <div className="p-4 flex flex-col gap-3">
                {items.map(item => {
                    const price = getPrice(item);
                    const maxedOut = isMaxedOut(item);
                    const affordable = price && canAfford(item) && !maxedOut;
                    const owned = inventory[item.id] || 0;

                    return (
                        <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${maxedOut
                                ? 'bg-slate-800/50 border-slate-700/30 opacity-40 cursor-not-allowed'
                                : affordable
                                    ? 'bg-slate-700/50 border-slate-600/50 hover:border-amber-500/50 hover:bg-slate-700 cursor-pointer'
                                    : 'bg-slate-800/50 border-slate-700/30 opacity-60 cursor-not-allowed'
                                }`}
                            onClick={() => affordable && handleSelectItem(item)}
                        >
                            <div className="flex-shrink-0">
                                {getIcon(item.id)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                    {item.name}
                                    {maxedOut && <span className="text-xs text-red-400 ml-2">(已達上限)</span>}
                                </p>
                                <p className="text-xs text-slate-400 truncate">{item.description}</p>
                            </div>
                            <div className="flex-shrink-0">
                                <span className={`font-bold text-sm ${affordable ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {price} 💰
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Purchase Confirmation Modal */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full border border-slate-700">
                        <div className="text-center mb-4">
                            {getIcon(selectedItem.id)}
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2">{selectedItem.name}</h3>
                        <p className="text-slate-400 text-center mb-4">{selectedItem.description}</p>

                        {/* 數量選擇器 */}
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <button
                                onClick={() => adjustQuantity(-1)}
                                disabled={quantity <= 1}
                                className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-30 flex items-center justify-center transition-colors"
                            >
                                <Minus className="w-5 h-5" />
                            </button>
                            <span className="text-3xl font-bold w-16 text-center">{quantity}</span>
                            <button
                                onClick={() => adjustQuantity(1)}
                                disabled={quantity >= maxAffordable(selectedItem)}
                                className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-30 flex items-center justify-center transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>

                        {/* 總價 */}
                        <div className="flex items-center justify-center gap-2 mb-6 bg-slate-700/50 rounded-lg p-3">
                            <span className="text-slate-400">總計：</span>
                            <span className="text-2xl font-bold text-amber-400">
                                {getPrice(selectedItem) * quantity} 💰
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setSelectedItem(null); setQuantity(1); }}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handlePurchase}
                                disabled={purchasing || !canAfford(selectedItem, quantity)}
                                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <Check className="w-5 h-5" />
                                {purchasing ? '購買中...' : '確認購買'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
