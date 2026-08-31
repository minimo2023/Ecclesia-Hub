import React from 'react';
import { LIFELINE_CONFIG } from '../../data/lifelines';

export default function MobileLifelinesPanel({
    lifelineStatus,
    onFiftyFifty,
    onPhoneFriend,
    onAskAudience,
    onWalkAway,
    disabled,
    onRedeemLifeline,
    canAfford,
    lifelineCosts,
    variant = 'default',
    fillHeight = false,
    isSpeedMode = false
}) {
    // Map handlers to IDs
    const handlers = {
        fiftyFifty: onFiftyFifty,
        phoneFriend: onPhoneFriend,
        askAudience: onAskAudience,
        walkAway: onWalkAway
    };

    const isCompactGrid = variant === 'compact-grid';
    const isEarthTone = variant === 'earth-tone-row';

    // 如果是快答模式，不顯示離開按鈕，所以只有 3 個
    const gridCols = isSpeedMode ? 'grid-cols-3' : 'grid-cols-4';

    return (
        <div className={`${isCompactGrid ? 'bg-transparent' : isEarthTone ? 'bg-transparent' : 'bg-slate-800 px-1 py-2'} ${fillHeight ? 'flex-1 flex flex-col' : ''} safe-area-bottom`}>
            <div className={`grid ${isCompactGrid ? 'grid-cols-2 gap-1' : isEarthTone ? `${gridCols} gap-2` : `${gridCols} gap-1`} ${fillHeight ? 'flex-1' : ''}`}>
                {LIFELINE_CONFIG.map((config) => {
                    // 快答模式隱藏「離開」按鈕
                    if (isSpeedMode && config.id === 'walkAway') return null;
                    const isWalkAway = config.id === 'walkAway';
                    const status = isWalkAway ? 'available' : lifelineStatus[config.id];
                    const isUsed = !isWalkAway && (status === 'used' || status === false);
                    const isAvailable = (isWalkAway || status === 'available' || status === true) && !disabled;

                    const cost = lifelineCosts?.[config.id];
                    const affordable = canAfford?.(config.id);
                    const canRedeem = isUsed && onRedeemLifeline && cost !== undefined;

                    // Click Handler
                    const handleClick = async () => {
                        if (canRedeem) {
                            if (affordable) {
                                const result = await onRedeemLifeline(config.id);
                                const isSuccess = result === true || result?.success === true;
                                if (isSuccess) {
                                    handlers[config.id](true); // bypassCheck = true
                                }
                            }
                        } else {
                            handlers[config.id]();
                        }
                    };

                    // Styles for Earth Tone
                    let btnClass = '';
                    if (isEarthTone) {
                        if (isUsed && canRedeem) {
                            btnClass = 'bg-[#FDF8EE] border-[#C2B099] text-[#8B6B4A] cursor-pointer';
                        } else if (isUsed) {
                            btnClass = 'bg-[#F5EDDD] border-[#EFE5D0] text-[#D1BFAE] opacity-50 cursor-not-allowed';
                        } else if (isAvailable) {
                            btnClass = 'bg-[#FDF8EE] border-[#EFE5D0] text-[#6B4E31]';
                        } else {
                            btnClass = 'bg-[#F5EDDD] border-[#EFE5D0] text-[#D1BFAE] opacity-60 cursor-not-allowed';
                        }
                    } else {
                        // Original Styles
                        if (isUsed && canRedeem) {
                            btnClass = 'bg-slate-700/30 border-amber-500 text-amber-300 cursor-pointer';
                        } else if (isUsed) {
                            btnClass = 'bg-slate-700/30 border-slate-600 text-slate-500 opacity-40 cursor-not-allowed';
                        } else if (isAvailable) {
                            if (isWalkAway) btnClass = 'bg-red-600/30 border-red-500 text-red-200';
                            else btnClass = 'bg-blue-600/30 border-blue-500 text-blue-200';
                        } else {
                            btnClass = 'bg-slate-700/30 border-slate-600 text-slate-500 opacity-60 cursor-not-allowed';
                        }
                    }

                    return (
                        <button
                            key={config.id}
                            onClick={handleClick}
                            disabled={disabled || (!isAvailable && !canRedeem) || (canRedeem && !affordable)}
                            className={`relative flex flex-col items-center justify-center w-full rounded-xl font-bold border transition-all active:scale-95 text-xs ${fillHeight ? 'h-full' : isEarthTone ? 'py-3' : 'py-1'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${btnClass}`}
                        >
                            <div className="text-xl leading-none mb-1">
                                {config.icon}
                            </div>
                            <div className="leading-none mt-1">
                                {config.name}
                            </div>

                            {/* Status Overlay */}
                            {isUsed && !canRedeem && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="text-2xl text-red-500 font-bold opacity-60">✗</div>
                                </div>
                            )}

                            {/* Redemption Badge */}
                            {canRedeem && (
                                <div className={`absolute -top-2 -right-2 ${cost === 0 ? 'bg-indigo-500' : 'bg-amber-500'} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md border border-white animate-bounce ${affordable ? '' : 'opacity-50 grayscale'}`}>
                                    {cost === 0 ? '✨AI' : `💰${cost}`}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
