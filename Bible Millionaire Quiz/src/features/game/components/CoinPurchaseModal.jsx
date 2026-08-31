import React from 'react';

/**
 * CoinPurchaseModal - 智匯金幣兌換道具確認視窗
 */
export default function CoinPurchaseModal({
    isOpen,
    onClose,
    onConfirm,
    lifelineType,
    cost,
    currentCoins,
    isLoading
}) {
    if (!isOpen) return null;

    const canAfford = currentCoins >= cost;

    const lifelineNames = {
        'fiftyFifty': '50:50',
        'phoneFriend': '求助專家',
        'askAudience': '觀眾投票',
        'addTime': '延長時間'
    };

    const lifelineEmojis = {
        'fiftyFifty': '🎯',
        'phoneFriend': '📞',
        'askAudience': '👥',
        'addTime': '⏳'
    };

    const handleConfirm = async () => {
        const result = await onConfirm(lifelineType);
        if (result?.success) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm">
            <div className="bg-slate-100 rounded-2xl p-6 max-w-sm mx-4 border border-slate-300 shadow-2xl animate-fadeIn">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="text-5xl mb-3">{lifelineEmojis[lifelineType]}</div>
                    <h2 className="text-xl font-bold text-slate-900">
                        兌換 {lifelineNames[lifelineType]}
                    </h2>
                </div>

                {/* Cost Info */}
                <div className="bg-white/85 rounded-xl p-4 mb-6 border border-slate-300">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-600">兌換費用</span>
                        <span className="text-amber-700 font-bold text-lg">💰 {cost}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-600">目前餘額</span>
                        <span className={`font-bold text-lg ${canAfford ? 'text-emerald-700' : 'text-red-600'}`}>
                            💰 {currentCoins}
                        </span>
                    </div>
                    {!canAfford && (
                        <div className="mt-3 text-center text-red-600 text-sm">
                            智匯金幣不足！還差 {cost - currentCoins} 枚
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canAfford || isLoading}
                        className={`flex-1 py-3 px-4 font-bold rounded-xl transition-all ${canAfford
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            } disabled:opacity-50`}
                    >
                        {isLoading ? '處理中...' : '確認兌換'}
                    </button>
                </div>
            </div>
        </div>
    );
}
