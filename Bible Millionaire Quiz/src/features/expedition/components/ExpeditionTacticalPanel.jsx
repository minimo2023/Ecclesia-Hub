import React from 'react';
import { Timer, Heart, Coins, Shield, User, ArrowLeft, Tent, ShoppingBag, Backpack, Zap, Star } from 'lucide-react';
import Avatar from '../../../components/common/Avatar';
import { useExpedition } from '../contexts/ExpeditionContext';

export default function ExpeditionTacticalPanel({ onUseItem }) {
    const { 
        team, actions, 
        displayName: currentUserDisplayName,
        userCoins, userPoints, inventory, shopItems,
        gameState, phase, timeLeft, countdown,
        activeIntents = {}, rewardAnims = {},
        isOwner, disabledOptions = []
    } = useExpedition();

    const { leaveTeam: onLeaveTeam, returnToCamp } = actions;

    // Map items to icons
    const getItemIcon = (itemId) => {
        if (itemId === 'revive') return '🔄';
        if (itemId === 'healthPotion') return '🧪';
        if (itemId === 'shield') return '🛡️';
        if (itemId === 'scroll') return '📜';
        if (itemId === 'tent') return '⛺';
        if (itemId === 'shoes') return '👟';
        return '📦';
    };



    // Derived: other members for the matrix
    const matrixMembers = Array.from({ length: 8 }).map((_, idx) => {
        return team?.members?.[idx] || null;
    });

    return (
        <aside className="w-full lg:h-full bg-slate-950 flex flex-col shadow-2xl relative z-20 overflow-hidden border-l border-white/5">
            {/* [Sovereign Glow] */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-50" />
            
            {/* 1. Header (Status Bar) */}
            <div className="hidden lg:flex order-1 lg:order-none bg-slate-900/60 p-4 border-b border-white/5 justify-between items-center shrink-0">
                {gameState === 'playing' ? (
                    <div className={`flex items-center gap-2 text-2xl font-mono font-black ${phase === 'answering' ? 'text-rose-500 animate-pulse' : 'text-amber-500'}`}>
                        <Timer className="w-6 h-6" />
                        <span>{phase === 'answering' ? countdown : timeLeft}s</span>
                    </div>
                ) : (
                    <span className="text-[10px] lg:text-sm font-black text-slate-500 uppercase tracking-widest">立體戰術終端</span>
                )}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                        <Coins className="w-4 h-4 lg:w-5 lg:h-5 text-amber-500 fill-amber-500/20" />
                        <span className="text-amber-500 font-black text-sm lg:text-xl">{userCoins}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
                        <Star className="w-4 h-4 lg:w-5 lg:h-5 text-blue-400 fill-blue-400/20" />
                        <span className="text-blue-400 font-black text-sm lg:text-xl">{userPoints || 0}</span>
                    </div>
                </div>
            </div>

            {/* 2. Tactical Loadout (Top section) */}
            <div className="order-3 lg:order-none shrink-0 bg-slate-900/20 p-2 lg:p-4 flex flex-col gap-1.5 lg:gap-3 border-b border-white/5 shadow-inner">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] lg:text-sm font-black text-amber-500/80 uppercase tracking-widest">
                        <Backpack className="w-3 h-3 lg:w-5 lg:h-5" /> 戰備裝組 (Tactical Bag)
                    </div>
                    {gameState === 'playing' && (
                        <span className="text-[9px] lg:text-xs text-slate-600 font-mono tracking-tighter">第 {(team?.currentQuestion || 0)+1} 關</span>
                    )}
                </div>
                
                <div className="grid grid-cols-5 lg:grid-cols-3 gap-1.5 lg:gap-2">
                    {Array.from({ length: 5 }).map((_, idx) => {
                        const currentMember = team?.members?.find(m => m.displayName === currentUserDisplayName);
                        const displayInventory = currentMember?.inventory || inventory || {};
                        const itemsInStock = Object.entries(displayInventory).filter(([id, q]) => q > 0 && id !== 'shield');
                        const itemEntry = itemsInStock[idx];
                        const itemId = itemEntry?.[0];
                        const count = itemEntry?.[1];
                        const meta = shopItems.find(i => i.id === itemId);
                        
                        const isPassive = itemId === 'shield' || itemId === 'shoes';
                        const isScrollMaxed = itemId === 'scroll' && disabledOptions?.length >= 2;
                        const isDisabled = !itemId || isPassive || (phase !== 'waiting' && phase !== 'thinking') || isScrollMaxed;

                        return (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (!isDisabled && itemId && onUseItem) onUseItem(itemId);
                                }}
                                disabled={isDisabled}
                                className={`
                                    py-2 lg:py-3 rounded-xl border relative flex flex-col items-center justify-center transition-all group overflow-hidden
                                    ${!itemId ? 'bg-slate-950/40 border-white/5 border-dashed cursor-default' : 
                                      isPassive ? 'bg-slate-800/60 border-slate-700 cursor-default shadow-[inset_0_0_15px_rgba(245,158,11,0.1)]' :
                                      isDisabled ? 'bg-slate-800/40 border-slate-800 opacity-40 grayscale' : 
                                      'bg-slate-800 border-white/10 hover:border-amber-500/50 hover:bg-slate-700 shadow-lg active:scale-90 hover:scale-[1.05]'}
                                `}
                            >
                                {itemId ? (
                                    <>
                                        <div className={`text-2xl lg:text-4xl mb-1 ${!isPassive && !isDisabled && 'group-hover:animate-bounce'}`}>{getItemIcon(itemId)}</div>
                                        <div className={`text-[8px] lg:text-xs font-black transition-colors uppercase truncate w-full px-1 text-center ${isPassive ? 'text-amber-500/70' : 'text-slate-400 group-hover:text-amber-500'}`}>
                                            {meta?.name || itemId} {isPassive && <span className="text-[8px] opacity-70 block -mt-1">(被動)</span>}
                                        </div>
                                        <div className="absolute top-1 right-1 px-1.5 py-0.5 lg:px-2 lg:py-1 bg-amber-600 text-white font-black text-[9px] lg:text-xs rounded-md border border-slate-900 shadow-md">
                                            {count}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-2xl lg:text-4xl mb-1 text-slate-800/40 flex items-center justify-center">
                                            <Zap className="w-4 h-4 lg:w-6 lg:h-6" />
                                        </div>
                                        <div className="text-[8px] lg:text-xs font-black uppercase truncate w-full px-1 text-transparent select-none">
                                            EMPTY
                                        </div>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 3. Squad Matrix */}
            <div className="order-2 lg:order-none lg:flex-1 flex flex-col min-h-0 bg-slate-950 p-2 lg:p-4 gap-2 lg:gap-4 border-b border-white/5">
                
                {/* 8-Slot Tactical Matrix */}
                <div className="flex flex-col gap-1.5 lg:gap-3 lg:flex-1 min-h-0">
                    <div className="flex items-center gap-2 text-[10px] lg:text-sm font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1 lg:pb-2">
                        <Zap className="w-3 h-3 lg:w-4 lg:h-4 text-indigo-500" /> 戰術監控矩陣 (Matrix)
                    </div>
                    <div className="flex overflow-x-auto lg:overflow-visible lg:grid gap-2 lg:gap-2 lg:grid-cols-4 lg:flex-1 pb-3 lg:pb-0 custom-scrollbar snap-x snap-mandatory px-1 lg:px-0 -mx-1 lg:mx-0">
                        {matrixMembers.map((member, idx) => {
                            if (!member) return (
                                <div key={idx} className="min-w-[22%] lg:min-w-0 shrink-0 snap-center bg-slate-900/20 border border-white/5 border-dashed rounded-xl aspect-square" />
                            );

                            const isOffline = !member.online;
                            const intent = activeIntents?.[member.displayName];

                            return (
                                <div 
                                    key={member.userId || idx} 
                                    className={`min-w-[28%] lg:min-w-0 shrink-0 snap-center relative rounded-xl border flex flex-col items-center justify-center py-2 lg:p-0 transition-all hover:scale-105 active:scale-95 group ${
                                        isOffline ? 'opacity-30 grayscale bg-red-950/10 border-red-900/20' : 
                                        member.isReady ? 'bg-slate-800/40 border-emerald-500/30' : 
                                        'bg-slate-800/40 border-white/10'
                                    } lg:aspect-square`}
                                >
                                    {member.hasShield && (
                                        <div className="absolute top-1.5 left-1.5 lg:top-2 lg:left-2 bg-sky-500/20 rounded-full p-1 border border-sky-400 z-10 shadow-lg animate-pulse">
                                            <Shield className="w-3 h-3 lg:w-4 lg:h-4 text-sky-400 fill-sky-400" />
                                        </div>
                                    )}
                                    <div className="relative w-12 h-12 lg:w-full lg:h-full flex items-center justify-center shrink-0">
                                        <Avatar avatarId={member.avatar || member.displayName} size="full" className="rounded-xl lg:rounded-xl opacity-60 group-hover:opacity-100 transition-opacity w-full h-full object-cover" />
                                        
                                        {/* Desktop overlay name (hidden on mobile) */}
                                        <div className="hidden lg:block absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-[1px] text-[10px] text-center font-black text-white/50 truncate p-0.5">
                                            {member.displayName}
                                        </div>


                                        
                                        {/* Intent Icon */}
                                        {intent && (
                                            <div className="absolute -top-1 -right-1 z-10 bg-blue-600 rounded-full w-5 h-5 lg:w-8 lg:h-8 flex items-center justify-center border border-white/20 shadow-lg animate-bounce">
                                                <span className="text-[10px] lg:text-base">{getItemIcon(intent)}</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Mobile bottom section: Name + Hearts */}
                                    <div className="flex flex-col items-center w-full mt-1.5 lg:hidden">
                                        <div className="text-[10px] font-black text-white/80 truncate w-full text-center px-1">
                                            {member.displayName}
                                        </div>
                                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                                            {[1, 2, 3].map(i => (
                                                <Heart key={i} className={`w-2.5 h-2.5 ${i <= member.lives ? 'fill-rose-500 text-rose-500' : 'fill-transparent text-slate-700'}`} />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Desktop Hearts (original style overlay) */}
                                    <div className="hidden lg:flex absolute top-0.5 right-0.5 flex-col gap-0.5">
                                        <div className="flex items-center gap-0.5 text-[10px] text-rose-500 font-bold bg-black/40 px-1 rounded">
                                            <Heart className="w-2.5 h-2.5 fill-rose-500" /> {member.lives}
                                        </div>
                                    </div>
                                    {/* Rewards/Damage Popup placeholder */}
                                    {rewardAnims[member.displayName] && (
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-amber-400 font-black text-xs lg:text-sm animate-float-up">
                                            +{rewardAnims[member.displayName].amount}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Exit / Leave Button - Mini (Moved outside Squad Matrix container for order sorting) */}
            {gameState !== 'gameover' && (
                <div className="order-4 lg:order-none p-2 lg:p-4 bg-slate-950">
                    <button 
                        onClick={() => {
                            if (isOwner) {
                                returnToCamp?.();
                            } else {
                                onLeaveTeam?.(team?.id);
                            }
                        }}
                        className="w-full py-2 bg-red-900/20 hover:bg-red-600/20 border border-red-500/20 rounded-xl text-red-500/60 hover:text-red-400 text-[10px] lg:text-sm font-black uppercase tracking-widest transition-all"
                    >
                        中止任務 (Abort Mission)
                    </button>
                </div>
            )}
        </aside>
    );
}
