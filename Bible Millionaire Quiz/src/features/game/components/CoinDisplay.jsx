import React from 'react';

/**
 * CoinDisplay - 遊戲中的智匯金幣顯示元件
 * 顯示總餘額和本局已獲得智匯金幣
 */
export default function CoinDisplay({ coinSystem, currentLevel, isLoggedIn }) {
    // Always show in classic mode
    if (!coinSystem) return null;

    const { coins, coinsEarnedThisGame, bonusCoins, hasBonus } = coinSystem;
    const showBonusIndicator = hasBonus && currentLevel >= 4; // Show from Q5 (0-indexed = 4)

    // Not logged in - show prompt
    if (!isLoggedIn) {
        return (
            <div className="absolute top-4 left-4 z-20">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full border border-slate-500/30">
                    <span className="text-slate-400 text-xs">💰 登入後可獲得智匯金幣</span>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-1">
            {/* Total Balance */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full border border-amber-500/30">
                <span className="text-amber-400 text-sm">💰</span>
                <span className="font-bold text-amber-300">{coins}</span>
            </div>

            {/* Session Earnings */}
            {coinsEarnedThisGame > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/60 backdrop-blur-sm rounded-full border border-emerald-500/30">
                    <span className="text-emerald-300 text-xs">+{coinsEarnedThisGame}</span>
                    {bonusCoins > 0 && (
                        <span className="text-yellow-300 text-xs">
                            (含{bonusCoins}加成)
                        </span>
                    )}
                </div>
            )}

            {/* Bonus Indicator */}
            {showBonusIndicator && (
                <div className="flex items-center gap-1 px-2 py-1 bg-yellow-900/60 backdrop-blur-sm rounded-full border border-yellow-500/30 animate-pulse">
                    <span className="text-yellow-300 text-xs">🌟 +10% 加成中</span>
                </div>
            )}
        </div>
    );
}

