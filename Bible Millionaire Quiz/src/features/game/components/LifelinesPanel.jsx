import React from 'react';
import { LIFELINE_CONFIG } from '../data/lifelines';

export default function LifelinesPanel({
    lifelineStatus,
    onFiftyFifty,
    onPhoneFriend,
    onAskAudience,
    onWalkAway,
    disabled,
    // Coin system props
    coinSystem,
    isClassicMode,
    isSpeedMode,
    isLoggedIn,
    lastSpentAmt = 0,
    lastSpentId = null
}) {
    // Map handlers to IDs
    const handlers = {
        fiftyFifty: onFiftyFifty,
        phoneFriend: onPhoneFriend,
        askAudience: onAskAudience,
        walkAway: onWalkAway
    };

    // Map lifeline IDs to coin system types
    // keys must match LIFELINE_COSTS in useCoinSystem.js
    const lifelineToCoinType = {
        fiftyFifty: 'fiftyFifty',
        phoneFriend: 'phoneFriend',
        askAudience: 'askAudience'
    };

    const handleRedeemClick = async (lifelineId) => {
        const coinType = lifelineToCoinType[lifelineId];
        if (coinType && coinSystem?.redeemLifeline) {
            const result = await coinSystem.redeemLifeline(coinType);
            return result?.success;
        }
        return false;
    };

    const getCost = (lifelineId) => {
        const coinType = lifelineToCoinType[lifelineId];
        return coinSystem?.LIFELINE_COSTS?.[coinType] || 0;
    };

    const canAffordLifeline = (lifelineId) => {
        const coinType = lifelineToCoinType[lifelineId];
        return coinSystem?.canAfford?.(coinType) || false;
    };

    return (
        <div className="bg-white p-3 md:p-6 rounded-[2rem] backdrop-blur-sm shadow-2xl h-fit w-fit lg:self-start lg:mt-0 mx-auto lg:mx-0">
            <h3 className="text-lg md:text-xl font-bold text-slate-700 text-center mb-2 md:mb-4 tracking-widest border-b border-slate-200 pb-2">
                輔助功能
            </h3>

            <div className="grid grid-cols-2 gap-3 md:gap-6">
                {LIFELINE_CONFIG.map((config) => {
                    // Speed Mode: Hide specific lifelines (Walk Away)
                    if (isSpeedMode && config.id === 'walkAway') return null;

                    const isWalkAway = config.id === 'walkAway';
                    const status = isWalkAway ? 'available' : lifelineStatus[config.id];
                    const isUsed = !isWalkAway && !status;
                    const isDisabled = disabled || isUsed;
                    const isActive = !isDisabled && (isWalkAway || status);

                    // Check if can redeem this lifeline
                    const coinType = lifelineToCoinType[config.id];
                    const cost = getCost(config.id);
                    const affordable = canAffordLifeline(config.id);

                    // Show redeem option if:
                    // 1. Mode supports it (Classic/Speed)
                    // 2. Item is already used (need to buy back)
                    // 3. System is ready
                    const canRedeem = (isClassicMode || isSpeedMode) && isUsed && coinSystem;

                    // Click Logic: If redeemable, redeem. Else normal handler.
                    const handleClick = async () => {
                        if (canRedeem) {
                            // Only allow click if affordable
                            if (affordable) {
                                const success = await handleRedeemClick(config.id);
                                if (success !== false) {
                                    handlers[config.id](true); // bypassCheck = true
                                }
                            } else {
                                // Optional: Shake animation or toast for "Not enough money"
                            }
                        } else {
                            handlers[config.id]();
                        }
                    };

                    // Style Logic
                    let buttonStyle = "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed opacity-60";

                    if (disabled) {
                        buttonStyle = "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed opacity-50";
                    } else if (canRedeem) {
                        if (affordable) {
                            buttonStyle = "bg-slate-100 hover:bg-slate-100 border-amber-500/50 cursor-pointer shadow-amber-500/20";
                        } else {
                            // Redeemable but cant afford
                            buttonStyle = "bg-white text-slate-600 border-slate-200 cursor-not-allowed opacity-50";
                        }
                    } else if (isActive) {
                        if (isWalkAway) {
                            buttonStyle = "bg-rose-600 hover:bg-rose-500 text-white border-rose-300 shadow-rose-500/30";
                        } else {
                            buttonStyle = "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-300 shadow-indigo-500/30";
                        }
                    }

                    return (
                        <div key={config.id} className="flex flex-col items-center gap-1 md:gap-2 group relative">
                            <button
                                onClick={handleClick}
                                disabled={disabled || (isUsed && !canRedeem) || (canRedeem && !affordable)}
                                className={`w-18 h-18 md:w-24 md:h-24 rounded-2xl flex items-center justify-center shadow-lg transition-all transform hover:scale-105 active:scale-95 border-4 ${buttonStyle} ${config.id === 'fiftyFifty' ? 'text-xl md:text-3xl' : 'text-2xl md:text-5xl'} font-black`}
                                title={config.name}
                            >
                                {config.icon}

                                {/* 消耗漂浮文字 */}
                                {lastSpentId === config.id && lastSpentAmt > 0 && (
                                    <div className="cost-float-text -top-10 left-1/2 -translate-x-1/2">
                                        -{lastSpentAmt}
                                    </div>
                                )}

                                {/* Desktop Badge Style */}
                                {canRedeem && (
                                    <div className={`absolute -top-3 -right-3 bg-orange-500 text-white text-xs md:text-sm font-bold px-2 py-1 rounded-full shadow-lg border-2 border-slate-200 animate-bounce ${affordable ? '' : 'opacity-50 grayscale'}`}>
                                        💰{cost || '??'}
                                    </div>
                                )}
                            </button>
                            <span className={`text-xs md:text-sm font-bold text-slate-500 ${isActive ? (isWalkAway ? 'group-hover:text-red-300' : 'group-hover:text-indigo-600') : ''}`}>
                                {config.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

