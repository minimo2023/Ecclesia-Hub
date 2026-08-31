import React, { useState, useEffect, useRef } from 'react';
import {
    Heart, Shield, Tent, Edit2, Share2, LogOut, Play, Users,
    UserPlus, AlertTriangle, ShoppingCart, Package, ArrowRight,
    ArrowLeft, Gift, Bell, Check, Info, Coins, Backpack, Send,
    MessageSquare, Trash2, ShieldCheck, Zap, X
} from 'lucide-react';
import CreateTeamModal from './lobby/CreateTeamModal';
import Avatar from '../../../components/common/Avatar';
import { useAuth } from '../../../contexts/AuthContext';
import { useExpedition } from '../contexts/ExpeditionContext';

/**
 * [V23] Tactical Comms Terminal
 */
function ExpeditionChat({ messages, onSendMessage, currentUserDisplayName }) {
    const [input, setInput] = useState('');
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Lifted tag handler support
    useEffect(() => {
        const handleGlobalTag = (e) => {
            if (e.detail && e.detail.name) {
                setInput(prev => `@${e.detail.name} ${prev}`);
            }
        };
        window.addEventListener('expedition:tag', handleGlobalTag);
        return () => window.removeEventListener('expedition:tag', handleGlobalTag);
    }, []);

    const handleSend = () => {
        if (!input.trim()) return;
        onSendMessage(input);
        setInput('');
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60 border border-white/10 rounded-[2rem] lg:rounded-[2rem] rounded-none relative group overflow-hidden shadow-2xl">
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-10" />

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-3 space-y-2 lg:space-y-1.5 custom-scrollbar font-mono text-sm lg:text-[10px]">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-6 opacity-40">
                        <div className="text-slate-500 italic text-sm lg:text-[10px]">--- 無待傳訊號 (Standby) ---</div>
                        <div className="flex flex-col items-center gap-3 lg:hidden mt-10">
                            <Tent size={64} className="text-slate-600 mb-2" />
                            <div className="text-lg font-black text-slate-400">目前沒有任何訊息</div>
                            <div className="text-sm text-slate-500">等待隊友加入或發送訊息吧！</div>
                        </div>
                    </div>
                )}
                {messages.map((m, i) => {
                    const isSystem = m.type === 'system' || m.from === 'SYSTEM';
                    const isTagged = m.content.includes(`@${currentUserDisplayName}`);

                    return (
                        <div key={i} className={`animate-in fade-in slide-in-from-left-1 duration-200 ${isTagged ? 'bg-amber-500/10 p-1.5 rounded-lg border-l-2 border-amber-500' : ''}`}>
                            {isSystem ? (
                                <span className="text-indigo-400 font-bold opacity-80">[SYS] {m.content}</span>
                            ) : (
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <span
                                        onClick={() => setInput(prev => `@${m.from} ${prev}`)}
                                        className="text-amber-500/80 font-black hover:text-amber-400 cursor-pointer"
                                    >
                                        &lt;{m.from}&gt;:
                                    </span>
                                    <span className="text-slate-400 break-all leading-relaxed">{m.content}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="p-3 lg:p-2 bg-slate-900/80 border-t border-white/5 flex items-center gap-3 lg:gap-2">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="輸入訊息... (Enter 送出)"
                    className="flex-1 h-12 lg:h-9 bg-slate-950/80 border border-slate-700/50 rounded-[1.5rem] lg:rounded-xl px-4 py-3 lg:py-2 text-sm lg:text-[10px] text-amber-500 placeholder-slate-600 outline-none focus:border-amber-500/30 font-mono resize-none shadow-inner leading-none flex items-center"
                />
                <button onClick={handleSend} className="shrink-0 w-12 h-12 lg:w-8 lg:h-9 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-full lg:rounded-xl transition-all active:scale-95 flex items-center justify-center">
                    <Send size={18} className="lg:w-3.5 lg:h-3.5" />
                </button>
            </div>
        </div>
    );
}

/**
 * [V25] Gifting Modal (Single Select Teammate)
 */
function GiftingModal({ isOpen, onClose, onConfirm, targets, selectedItemsCount }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-slate-950/50">
                    <div>
                        <h3 className="text-lg font-black text-amber-500">選擇軍援對象</h3>
                        <p className="text-[10px] text-slate-400">已準備 {selectedItemsCount} 件物資將撥付至對方倉庫</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    {targets.length === 0 ? (
                        <div className="text-center py-6 text-slate-500 font-bold text-sm">目前沒有可接收軍援的戰友</div>
                    ) : (
                        targets.map(m => (
                            <button
                                key={m.displayName}
                                onClick={() => onConfirm(m)}
                                className="w-full p-4 bg-slate-800/50 hover:bg-amber-500/20 border border-white/5 hover:border-amber-500/50 rounded-2xl flex items-center gap-4 transition-all group active:scale-95"
                            >
                                <Avatar avatarId={m.avatar || m.displayName} size="md" />
                                <div className="flex-1 text-left">
                                    <div className="font-black text-white group-hover:text-amber-400">{m.displayName}</div>
                                    <div className="text-[10px] text-slate-400">點擊確認發送</div>
                                </div>
                                <ArrowRight className="text-slate-600 group-hover:text-amber-500 transition-colors" />
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}


/**
 * [V28.7] Join Team Modal
 */
function JoinTeamModal({ isOpen, onClose, onJoin }) {
    const [code, setCode] = useState('');
    if (!isOpen) return null;

    const handleSubmit = () => {
        if (code.length < 5) return;
        onJoin(code.toUpperCase());
        onClose();
        setCode('');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-slate-900 border border-sky-500/30 rounded-[3rem] shadow-[0_0_50px_rgba(14,165,233,0.2)] overflow-hidden animate-in zoom-in-95">
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
                    <div>
                        <h3 className="text-xl font-black text-sky-400">連線至目標領地</h3>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Authorized Access Only</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">輸入 6 位授權碼</label>
                        <input
                            autoFocus
                            autoComplete="off"
                            type="text"
                            value={code}
                            onChange={e => setCode(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            placeholder="_ _ _ _ _ _"
                            maxLength={8}
                            className="w-full bg-slate-950 border-2 border-slate-800 focus:border-sky-500/50 rounded-2xl p-6 text-4xl font-mono font-black text-sky-400 text-center tracking-[0.3em] outline-none transition-all shadow-inner uppercase"
                        />
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={code.length < 5}
                        className={`w-full py-5 rounded-2xl text-lg font-black tracking-[0.2em] transition-all active:scale-95 shadow-2xl ${code.length >= 5 ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                        核 准 連 線
                    </button>
                    <p className="text-center text-[10px] text-slate-600">加入隊伍將會離開目前的屬地連線</p>
                </div>
            </div>
        </div>
    );
}

/**
 * [V25] Main Sovereign Lobby Component
 */
export default function ExpeditionLobby() {
    const {
        team, actions, gameStates,
        displayName,
        // [SOVEREIGN] Recovered Assets & Identity from Context
        userCoins, inventory, backpack, shopItems,
        isOwner, myMember, otherMembers,
        provisionToBackpack, returnToWarehouse, handlePurchase,
        BACKPACK_LIMITS, CAPTAIN_ONLY_ITEMS
    } = useExpedition();

    const { messages = [], lastGiftRecipient, loadedSave } = gameStates || {};
    const {
        joinTeam: handleJoinTeam,
        sendGift: handleGiftSend, sendMessage: onSendMessage, onClearGiftSuccess,
        toggleReady: onToggleReady,
        leaveTeam: onLeaveTeam,
        disbandTeam: onDisbandTeam
    } = actions;

    const { guestAvatar } = useAuth();
    const [copied, setCopied] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [mobileTab, setMobileTab] = useState('main'); // 'shop' | 'main' | 'storage'

    // [V25] Gifting Logic
    const [isGiftingMode, setIsGiftingMode] = useState(false);
    const [showGiftModal, setShowGiftModal] = useState(false);

    // [V26] 倉庫購物車（共用於「裝備至背包」與「軍援贈送」）
    const [warehouseCart, setWarehouseCart] = useState({}); // { [itemId]: qty }

    // [Mobile Chat] 未讀訊息紅點
    const [unreadCount, setUnreadCount] = useState(0);
    const prevMessagesLength = useRef(messages.length);

    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            if (mobileTab !== 'chat') {
                setUnreadCount(c => c + (messages.length - prevMessagesLength.current));
            }
        }
        prevMessagesLength.current = messages.length;
    }, [messages, mobileTab]);

    useEffect(() => {
        if (mobileTab === 'chat') {
            setUnreadCount(0);
        }
    }, [mobileTab]);

    const warehouseCartTotal = Object.values(warehouseCart).reduce((a, b) => a + b, 0);

    const addToWarehouseCart = (itemId, delta) => {
        setWarehouseCart(prev => {
            const current = prev[itemId] || 0;
            const inInventory = inventory[itemId] || 0;
            const inBackpack = backpack[itemId] || 0;
            const limit = BACKPACK_LIMITS?.[itemId] ?? Infinity;
            const captainOnly = CAPTAIN_ONLY_ITEMS?.includes(itemId);
            if (captainOnly && !isOwner) return prev;

            const maxAdd = isGiftingMode
                ? inInventory  // 贈送：只受倉庫庫存限制
                : Math.min(inInventory, limit - inBackpack - current); // 裝備：受背包上限限制

            const newQty = Math.max(0, Math.min(current + delta, current + maxAdd));
            if (newQty === 0) {
                const next = { ...prev };
                delete next[itemId];
                return next;
            }
            return { ...prev, [itemId]: newQty };
        });
    };

    const confirmTransferToBackpack = () => {
        Object.entries(warehouseCart).forEach(([itemId, qty]) => {
            for (let i = 0; i < qty; i++) provisionToBackpack(itemId, 1, isOwner);
        });
        setWarehouseCart({});
        setStorageTab('backpack');
    };

    // [Shop]
    const [cart, setCart] = useState({});
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    // [Storage Tabs]
    const [storageTab, setStorageTab] = useState('warehouse'); // 'backpack' | 'warehouse'

    // [CRITICAL LOGIC] Button enablement (Using unified otherMembers)
    const allTeammatesReady = (otherMembers || []).length === 0 || (otherMembers || []).every(m => m.isReady || !m.online);

    useEffect(() => {
        if (lastGiftRecipient) {
            setIsGiftingMode(false);
            setWarehouseCart({});
            onClearGiftSuccess();
        }
    }, [lastGiftRecipient]);


    // --- Shop Logic ---
    const cartTotal = Object.entries(cart).reduce((total, [id, qty]) => total + (shopItems.find(i => i.id === id)?.price || 0) * qty, 0);
    const addToCart = (itemId) => {
        const item = shopItems.find(i => i.id === itemId);
        if (item?.maxPurchase && ((inventory[itemId] || 0) + (backpack[itemId] || 0) + (cart[itemId] || 0)) >= item.maxPurchase) return;
        setCart(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
    };
    const handleCheckout = async () => {
        if (cartTotal === 0 || userCoins < cartTotal || isCheckingOut) return;
        setIsCheckingOut(true);
        for (const [itemId, qty] of Object.entries(cart)) {
            const item = shopItems.find(i => i.id === itemId);
            if (item) await handlePurchase(itemId, item.price, qty);
        }
        setCart({});
        setIsCheckingOut(false);
    };
    const commitGifting = (targetMember) => {
        const itemsToGift = Object.entries(warehouseCart)
            .filter(([_, qty]) => qty > 0)
            .map(([id, quantity]) => ({ id, quantity }));
        handleGiftSend(targetMember.displayName, itemsToGift);
        setWarehouseCart({});
        setIsGiftingMode(false);
        setShowGiftModal(false);
    };

    const handleStartOrResume = () => {
        const provisioning = myMember?.displayName ? { [myMember.displayName]: backpack } : {};
        if (loadedSave) {
            actions.resumeGame({ ...loadedSave, provisioning });
        } else {
            actions.startGame({ reset: true, provisioning });
        }
    };

    // [SOVEREIGN] Physical Render Guard: Final gate before return to satisfy Rules of Hooks
    if (!team) return null;

    return (
        <div className="flex-1 h-full w-full overflow-hidden flex flex-col">

            {/* Mobile Tab Bar */}
            <div className="lg:hidden shrink-0 flex items-stretch border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
                <button onClick={() => setMobileTab('shop')} className={`flex-1 py-3.5 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors ${mobileTab === 'shop' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500'}`}>
                    <ShoppingCart size={16} /> 補給
                </button>
                <button onClick={() => setMobileTab('main')} className={`flex-1 py-3.5 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors ${mobileTab === 'main' ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-500'}`}>
                    <Users size={16} /> 大廳
                </button>
                <button onClick={() => setMobileTab('chat')} className={`relative flex-1 py-3.5 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors ${mobileTab === 'chat' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500'}`}>
                    <MessageSquare size={16} /> 通訊
                    {unreadCount > 0 && <span className="absolute top-2.5 right-3 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(243,24,96,0.8)]" />}
                </button>
                <button onClick={() => setMobileTab('storage')} className={`flex-1 py-3.5 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors ${mobileTab === 'storage' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-500'}`}>
                    <Backpack size={16} /> 背包
                </button>
            </div>

            <div className="flex-1 overflow-hidden py-2 px-2 lg:py-6 lg:px-6">
            <div className="flex h-full gap-3 lg:gap-5 w-full">

                {/* ==================================================== */}
                {/* [LEFT COLUMN] Logistics (District D - Stretched)     */}
                {/* ==================================================== */}
                <section className={`flex flex-col lg:w-[22%] ${mobileTab === 'shop' ? 'flex-1' : 'hidden lg:flex'}`}>
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl flex-1 flex flex-col shadow-2xl overflow-hidden">
                        {/* Shop Header — 桌機才顯示 */}
                        <div className="hidden lg:flex px-5 py-4 border-b border-white/5 bg-slate-900/40 items-center justify-between">
                            <h3 className="text-sm font-black text-white flex items-center gap-2">
                                <ShoppingCart size={14} className="text-amber-500" /> 補給中心
                            </h3>
                            <span className="text-amber-400 font-black text-xs flex items-center gap-1">
                                <Coins size={11} /> {(userCoins - cartTotal).toLocaleString()}
                            </span>
                        </div>

                        {/* 商品區：手機=上下排（上商品格 + 下結帳條），桌機=直排 */}
                        <div className="flex-1 flex flex-col min-h-0 relative">

                            {/* 手機 Shop 標題 */}
                            <div className="lg:hidden px-4 py-4 border-b border-white/5 bg-slate-900/40 flex items-center gap-3">
                                <div className="w-14 h-14 rounded-2xl p-1 bg-slate-800 shadow-lg border border-amber-500/30 shrink-0">
                                    <Avatar avatarId={myMember?.avatar || guestAvatar} size="full" className="rounded-xl" />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1 mb-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 偵察隊補給站
                                    </div>
                                    <div className="text-xl font-black text-white">補給商店</div>
                                    <div className="text-[10px] text-slate-400 mt-1">為你的遠征補充資源，做好萬全準備。</div>
                                </div>
                            </div>

                            {/* 商品格：手機 2欄捲動，桌機保留捲動 */}
                            <div className="flex-1 p-4 lg:overflow-y-auto min-h-0 custom-scrollbar overflow-y-auto pb-28 lg:pb-0">
                                <div className="grid grid-cols-2 gap-4 lg:gap-3 h-auto">
                                    {shopItems.slice(0, 6).map(item => {
                                        const inCart = cart[item.id] || 0;
                                        const tooPoor = item.price > (userCoins - cartTotal);
                                        return (
                                            <div key={item.id} onClick={() => !tooPoor && addToCart(item.id)}
                                                className={`relative p-5 lg:p-3 rounded-[2rem] lg:rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center gap-3 lg:gap-0.5 text-center select-none lg:aspect-square ${tooPoor ? 'bg-slate-950/40 border-slate-800 opacity-50 grayscale cursor-not-allowed' : inCart > 0 ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20' : 'bg-slate-800/30 border-white/5 hover:border-amber-500/40 hover:bg-slate-800/70'} active:scale-95 shadow-inner`}>
                                                <div className="text-[3rem] lg:text-5xl leading-none">{item.icon}</div>
                                                <div className="text-base lg:text-sm font-black text-slate-200 leading-tight">{item.name}</div>
                                                <div className="text-amber-400 text-sm lg:text-xs font-black bg-slate-950/50 px-3 py-1 rounded-full flex items-center gap-1.5"><Coins size={12}/> {item.price}</div>
                                                {inCart > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setCart(prev => { const n = {...prev}; if (n[item.id] > 1) n[item.id]--; else delete n[item.id]; return n; }); }}
                                                        className="absolute -top-2 -right-2 bg-amber-500 hover:bg-red-500 text-slate-950 hover:text-white text-sm font-black w-8 h-8 lg:w-6 lg:h-6 rounded-full flex items-center justify-center border-2 border-slate-900 transition-colors z-10 shadow-lg">
                                                        {inCart}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 手機：底部結帳條 */}
                            <div className="lg:hidden absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-slate-900/95 backdrop-blur-xl flex items-center justify-between z-50 rounded-b-3xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center relative">
                                        <ShoppingCart size={20} className="text-slate-400" />
                                        {Object.values(cart).reduce((a,b)=>a+b, 0) > 0 && (
                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full text-[10px] font-black text-white flex items-center justify-center border-2 border-slate-900 shadow-lg">
                                                {Object.values(cart).reduce((a,b)=>a+b, 0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <div className="text-xs text-slate-400 font-bold mb-0.5">購物車 ({Object.values(cart).reduce((a,b)=>a+b, 0)})</div>
                                        <div className="text-amber-400 font-black text-lg flex items-center gap-1.5 leading-none"><Coins size={14}/> {cartTotal}</div>
                                    </div>
                                </div>
                                <button onClick={handleCheckout} disabled={cartTotal === 0 || userCoins < cartTotal || isCheckingOut}
                                    className={`px-8 py-3.5 rounded-2xl font-black text-base flex items-center gap-3 transition-all active:scale-95 shadow-xl ${cartTotal > 0 && userCoins >= cartTotal ? 'bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                                    結帳 <ArrowRight size={18} />
                                </button>
                            </div>

                            {/* 桌機：底部結帳列 */}
                            <div className="hidden lg:flex flex-col p-4 bg-slate-950/40 border-t border-white/5 gap-2">
                                {cartTotal > 0 && (
                                    <button onClick={() => setCart({})}
                                        className="w-full py-2 rounded-xl text-xs font-black text-slate-500 hover:text-red-400 transition-colors tracking-widest uppercase">
                                        × 清除全部選擇
                                    </button>
                                )}
                                <button onClick={handleCheckout} disabled={cartTotal === 0 || userCoins < cartTotal || isCheckingOut}
                                    className={`w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95 ${cartTotal > 0 && userCoins >= cartTotal ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-500'}`}>
                                    結帳{cartTotal > 0 ? ` (${cartTotal} 🪙)` : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ==================================================== */}
                {/* [MIDDLE COLUMN] Tactical Console (Dual Wing B'/C)    */}
                {/* ==================================================== */}
                <section className={`flex flex-col lg:flex-1 min-w-0 ${mobileTab === 'main' || mobileTab === 'chat' ? 'flex-1' : 'hidden lg:flex'}`}>
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl flex-1 flex flex-col shadow-2xl relative overflow-hidden">

                        {/* [Compact Header] Identity strip */}
                        <div className="px-5 py-6 lg:px-6 lg:py-4 border-b border-white/5 bg-slate-900/40 flex flex-wrap lg:flex-nowrap items-center gap-4 lg:gap-3">
                            {/* Avatar + role badge */}
                            <div className="relative shrink-0">
                                <div className="w-20 h-20 lg:w-16 lg:h-16 rounded-[1.25rem] lg:rounded-2xl p-1 bg-slate-800 shadow-lg border border-amber-500/30">
                                    <Avatar avatarId={myMember?.avatar || guestAvatar} size="full" className="rounded-xl" />
                                </div>
                                <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap font-black text-[10px] lg:text-[9px] px-3 py-1 lg:px-2 lg:py-0.5 rounded-full border border-slate-900 shadow-lg ${isOwner ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                                    {isOwner ? '隊長' : '隊員'}
                                </span>
                            </div>

                            {/* Territory name */}
                            <div className="flex-1 min-w-0 px-1">
                                <div className="text-xs lg:text-[10px] uppercase font-black text-slate-500 tracking-widest mb-1 lg:mb-0.5">
                                    {isOwner ? '您的營地' : '目標營地'}
                                </div>
                                <div className="text-2xl lg:text-xl font-black text-white truncate leading-tight">{team?.name || '—'}</div>
                            </div>

                            {/* Team code */}
                            <div className="w-full lg:w-auto shrink-0 flex items-center justify-between lg:justify-start gap-3 lg:gap-2 mt-2 lg:mt-0">
                                <div className="flex-1 lg:flex-none bg-slate-800/60 border border-sky-500/20 rounded-2xl lg:rounded-xl px-4 py-3 lg:px-4 lg:py-2 flex items-center justify-between lg:justify-start gap-4 lg:gap-3">
                                    <div className="flex flex-col">
                                        <div className="text-[10px] lg:text-[8px] text-sky-500/60 uppercase tracking-widest mb-0.5 lg:mb-0">營地代碼</div>
                                        <div className="text-xl lg:text-xl font-mono font-black text-sky-400 tracking-wider leading-tight">{team?.id || '—'}</div>
                                    </div>
                                    <button onClick={() => { navigator.clipboard.writeText(team?.id || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                        className="shrink-0 px-4 py-2 lg:px-3 lg:py-1.5 rounded-xl lg:rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-all active:scale-95 text-xs lg:text-[10px] font-black">
                                        {copied ? '✓' : '複製'}
                                    </button>
                                </div>
                                <button onClick={() => setShowJoinModal(true)}
                                    className="shrink-0 w-14 h-14 lg:w-10 lg:h-10 rounded-2xl lg:rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-slate-950 border border-amber-500/20 flex items-center justify-center transition-all active:scale-90"
                                    title="加入其他隊伍">
                                    <UserPlus size={22} className="lg:w-[18px] lg:h-[18px]" />
                                    <div className="hidden lg:block text-[10px] font-black ml-1">邀請</div>
                                </button>
                            </div>
                        </div>

                        {/* [BODY] 手機=二欄下拉（隊員格｜聊天），桌機=雙翼+底部列 */}
                        <div className="flex-1 flex min-h-0 overflow-hidden relative">

                            {/* 隊員格 */}
                            <div className={`p-4 lg:p-3 border-r border-white/5 flex flex-col gap-3 overflow-y-auto custom-scrollbar pb-28 lg:pb-0 ${mobileTab === 'chat' ? 'hidden lg:flex lg:w-1/2 lg:flex-1' : 'flex-1 lg:flex-none lg:w-1/2'}`}>
                                <div className="hidden lg:flex text-[8px] font-black text-slate-600 uppercase tracking-widest items-center gap-1 shrink-0">
                                    <Users size={9} /> 隊員
                                </div>
                                {/* 手機: 2欄 支援捲動 ｜ 桌機: 4×2 填滿 */}
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:grid-rows-2 lg:h-full lg:content-stretch"
                                    style={{gridTemplateRows: 'auto'}}>
                                    {Array.from({ length: 8 }).map((_, idx) => {
                                        const member = otherMembers[idx];
                                        const isEmpty = !member;
                                        return (
                                            <div key={idx}
                                                onClick={() => member && window.dispatchEvent(new CustomEvent('expedition:tag', { detail: { name: member.displayName } }))}
                                                className={`rounded-2xl border flex flex-row lg:flex-col items-center lg:justify-center p-3 gap-3 relative transition-all duration-300 ${isEmpty ? 'bg-slate-950/20 border-white/5 border-dashed' : 'bg-slate-800/40 border-slate-700 hover:border-amber-500/50 cursor-pointer active:scale-95 group'}`}>
                                                {isEmpty ? (
                                                    <div className="flex items-center gap-3 opacity-40 w-full justify-center lg:justify-center">
                                                        <UserPlus size={16} className="text-slate-500 hidden lg:block" />
                                                        <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center lg:hidden shrink-0 border border-slate-700/50">
                                                            <Shield size={16} className="text-slate-500" />
                                                        </div>
                                                        <div className="flex-1 lg:hidden min-w-0">
                                                            <div className="text-xs text-slate-400 font-bold">{idx + 1}. 成員</div>
                                                            <div className="text-[10px] text-slate-500 mt-0.5">等待加入</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="w-10 h-10 lg:w-10 lg:h-10 rounded-full overflow-hidden relative shrink-0 border border-slate-700 shadow-md">
                                                            <Avatar avatarId={member.avatar || member.displayName} size="full" />
                                                            {!member.online && <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-[8px] font-black text-white/50">OFF</div>}
                                                        </div>
                                                        <div className="flex-1 text-left lg:text-center min-w-0">
                                                            <div className="text-sm lg:text-[10px] font-black text-slate-300 truncate group-hover:text-amber-400 leading-tight">
                                                                {member.displayName}
                                                            </div>
                                                            <div className="text-xs lg:text-[8px] text-slate-500 mt-0.5">
                                                                {member.isOwner ? '隊長' : (member.isReady ? '已就緒' : '未就緒')} 
                                                            </div>
                                                        </div>
                                                        {member.online && (
                                                            <div className={`absolute top-2 right-2 lg:top-1 lg:right-1 w-2.5 h-2.5 lg:w-1.5 lg:h-1.5 rounded-full shadow ${member.isReady ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-slate-600'}`} />
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 聊天區 */}
                            <div className={`flex flex-col bg-slate-950/20 min-w-0 ${mobileTab === 'main' ? 'hidden lg:flex lg:flex-1' : 'flex-1'}`}>
                                <ExpeditionChat messages={messages} onSendMessage={onSendMessage} currentUserDisplayName={displayName} />
                            </div>

                            {/* 手機：底部操作條 */}
                            <div className={`lg:hidden absolute bottom-0 left-0 right-0 p-4 bg-slate-900/95 border-t border-white/10 backdrop-blur-xl flex gap-3 z-50 ${mobileTab === 'chat' ? 'hidden' : 'flex'}`}>
                                {/* 橘色/綠色：確認/準備/開始 */}
                                {!isOwner ? (
                                    <button onClick={() => onToggleReady(team.id, backpack)}
                                        className={`flex-1 py-3.5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl ${myMember?.isReady ? 'bg-emerald-600 text-white shadow-emerald-900/20' : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-900/20'}`}>
                                        <Check size={20} />
                                        <span>{myMember?.isReady ? '已準備就緒' : '準備就緒'}</span>
                                    </button>
                                ) : (
                                    <button onClick={handleStartOrResume} disabled={!allTeammatesReady}
                                        className={`flex-1 py-3.5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl ${allTeammatesReady ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                                        <Tent size={24} />
                                        <span>{allTeammatesReady ? '開始遠征' : '等待隊員'}</span>
                                    </button>
                                )}
                                {/* 紅色：離隊/解散 */}
                                <button
                                    onClick={() => !isOwner ? onLeaveTeam?.(team.id) : onDisbandTeam?.(team.id)}
                                    className="w-[72px] shrink-0 rounded-2xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-colors shadow-inner">
                                    {!isOwner ? <LogOut size={20} /> : <Trash2 size={20} />}
                                    <span className="text-[11px] font-black">{!isOwner ? '離開' : '解散'}</span>
                                </button>
                            </div>
                        </div>

                        {/* [桌機：Action Bar] */}
                        <div className="hidden lg:flex px-5 py-3 border-t border-white/5 bg-slate-900/40 gap-2">
                            {!isOwner ? (
                                <>
                                    <button onClick={() => onToggleReady(team.id, backpack)}
                                        className={`flex-1 py-3 rounded-xl text-sm font-black tracking-widest transition-all active:scale-95 ${myMember?.isReady ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-amber-600 hover:bg-amber-500 text-slate-950'}`}>
                                        {myMember?.isReady ? '已就緒 ✓' : '準備就緒'}
                                    </button>
                                    <button onClick={() => onLeaveTeam && onLeaveTeam(team.id)}
                                        className="px-4 py-3 rounded-xl transition-all active:scale-95 bg-red-900/30 hover:bg-red-600/40 text-red-400 border border-red-500/30">
                                        <LogOut size={14} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={handleStartOrResume} disabled={!allTeammatesReady}
                                        className={`flex-1 py-3 rounded-xl text-sm font-black tracking-widest transition-all active:scale-95 ${allTeammatesReady ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                                        {allTeammatesReady ? '開始挑戰 ▶' : '等待全員就緒...'}
                                    </button>
                                    <button onClick={() => onDisbandTeam && onDisbandTeam(team.id)}
                                        className="px-4 py-3 rounded-xl transition-all active:scale-95 bg-red-900/30 hover:bg-red-600/40 text-red-400 border border-red-500/30">
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </section>


                {/* ==================================================== */}
                {/* [RIGHT COLUMN] Storage (33/66 Layout Rule)         */}
                {/* ==================================================== */}
                <section className={`flex flex-col lg:w-[22%] ${mobileTab === 'storage' ? 'flex-1' : 'hidden lg:flex'}`}>
                    <div className={`flex-1 flex flex-col bg-slate-900/60 backdrop-blur-xl border-2 rounded-3xl shadow-2xl overflow-hidden transition-colors duration-500 ${isGiftingMode ? 'border-rose-500/50 bg-rose-950/20' : 'border-white/10'}`}>

                        {/* Tab bar + gift toggle */}
                        <div className="flex border-b border-white/5 bg-slate-950/40">
                            <button onClick={() => setStorageTab('backpack')}
                                className={`flex-1 py-4 lg:py-4 text-sm lg:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border-b-2 ${storageTab === 'backpack' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                                <Backpack size={16} className="lg:w-3 lg:h-3" /> 背包
                            </button>
                            <button onClick={() => setStorageTab('warehouse')}
                                className={`flex-1 py-4 lg:py-4 text-sm lg:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border-b-2 ${storageTab === 'warehouse' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                                <Package size={16} className="lg:w-3 lg:h-3" /> 倉庫
                            </button>
                            <button onClick={() => setIsGiftingMode(!isGiftingMode)}
                                className={`px-5 lg:px-4 text-sm font-black flex items-center gap-1 border-l border-white/5 transition-colors ${isGiftingMode ? 'text-rose-400 bg-rose-500/10' : 'text-slate-500 hover:text-rose-400'}`}>
                                <Gift size={16} className="lg:w-3 lg:h-3" />
                            </button>
                        </div>

                        {/* Backpack Tab */}
                        {storageTab === 'backpack' && !isGiftingMode && (
                            <div className="flex-1 p-4 lg:overflow-y-auto lg:p-3 custom-scrollbar overflow-y-auto">
                                {Object.entries(backpack).filter(([_, q]) => q > 0).length === 0 ? (
                                    <div className="h-full flex items-center justify-center opacity-30 italic text-sm font-mono pb-20">背包是空的</div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4 h-auto lg:grid-cols-2 lg:gap-3">
                                        {Object.entries(backpack).filter(([_, q]) => q > 0).map(([id, q]) => {
                                            const itemDef = shopItems.find(i => i.id === id);
                                            return (
                                                <div key={id}
                                                    className="relative p-5 lg:p-3 rounded-[2rem] lg:rounded-2xl border bg-amber-500/10 border-amber-500/30 flex flex-col items-center justify-center gap-3 lg:gap-0.5 text-center select-none aspect-square lg:aspect-square shadow-inner">
                                                    <div className="text-[3rem] lg:text-5xl leading-none">{itemDef?.icon}</div>
                                                    <div className="text-base lg:text-sm font-black text-slate-200 leading-tight">{itemDef?.name}</div>
                                                    <div className="text-amber-400 text-sm lg:text-xs font-black bg-slate-950/50 px-3 py-1 rounded-full">擁有 {q} 件</div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); returnToWarehouse(id, 1); }}
                                                        className="absolute -top-2 -right-2 w-8 h-8 lg:w-6 lg:h-6 rounded-full bg-amber-500 hover:bg-red-500 text-slate-950 hover:text-white font-black text-sm flex items-center justify-center border-2 border-slate-900 transition-colors z-10 shadow-lg">
                                                        -1
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Warehouse Tab */}
                        {(storageTab === 'warehouse' || isGiftingMode) && (
                            <div className="flex-1 flex flex-col min-h-0">
                                {isGiftingMode && (
                                    <div className="px-3 py-1.5 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between shrink-0">
                                        <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">選擇軍援道具及數量</span>
                                        <button onClick={() => { setIsGiftingMode(false); setWarehouseCart({}); }}
                                            className="text-[9px] text-slate-500 hover:text-white transition-colors">取消</button>
                                    </div>
                                )}

                                {/* 手機=上下排（左商品格 + 底部確認條），桌機=直排 */}
                                <div className="flex-1 flex flex-col min-h-0 relative">

                                    {/* 商品格 */}
                                    <div className="flex-1 p-4 lg:overflow-y-auto lg:p-3 custom-scrollbar overflow-y-auto pb-28 lg:pb-0">
                                        {Object.entries(inventory).filter(([_, q]) => q > 0).length === 0 ? (
                                            <div className="h-full flex items-center justify-center opacity-30 italic text-sm font-mono pb-20">倉庫空空的</div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4 h-auto lg:grid-cols-2 lg:gap-3">
                                            {Object.entries(inventory).filter(([_, q]) => q > 0).map(([id, q]) => {
                                                const itemDef = shopItems.find(i => i.id === id);
                                                const inCart = warehouseCart[id] || 0;
                                                const inBackpack = backpack[id] || 0;
                                                const limit = BACKPACK_LIMITS?.[id] ?? Infinity;
                                                const captainOnly = CAPTAIN_ONLY_ITEMS?.includes(id);
                                                const maxAdd = isGiftingMode ? q : Math.min(q, limit - inBackpack - inCart);
                                                const isLocked = captainOnly && !isOwner;
                                                const canAdd = !isLocked && maxAdd > 0;

                                                return (
                                                    <div key={id}
                                                        onClick={() => canAdd && addToWarehouseCart(id, 1)}
                                                        className={`relative p-5 lg:p-3 rounded-[2rem] lg:rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center gap-3 lg:gap-0.5 text-center select-none active:scale-95 aspect-square lg:aspect-square shadow-inner ${isLocked ? 'opacity-40 grayscale cursor-not-allowed' : !canAdd ? 'opacity-60 cursor-not-allowed' : ''} ${inCart > 0 ? (isGiftingMode ? 'bg-rose-500/10 border-rose-500/40 hover:bg-rose-500/20' : 'bg-indigo-500/10 border-indigo-500/40 hover:bg-indigo-500/20') : 'bg-slate-800/30 border-white/5 hover:border-white/20 hover:bg-slate-800/70'}`}>
                                                        <div className="text-[3rem] lg:text-5xl leading-none">{itemDef?.icon}</div>
                                                        <div className="text-base lg:text-sm font-black text-slate-200 leading-tight">{itemDef?.name}</div>
                                                        <div className="text-slate-400 text-sm lg:text-xs font-black bg-slate-950/50 px-3 py-1 rounded-full">庫存 {q} 件</div>
                                                        {inCart > 0 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); addToWarehouseCart(id, -1); }}
                                                                className={`absolute -top-2 -right-2 w-8 h-8 lg:w-6 lg:h-6 rounded-full font-black text-sm flex items-center justify-center border-2 border-slate-900 transition-colors z-10 shadow-lg ${isGiftingMode ? 'bg-rose-500 hover:bg-red-600 text-white' : 'bg-indigo-500 hover:bg-red-500 text-white'}`}>
                                                                {inCart}
                                                            </button>
                                                        )}
                                                        {isLocked && (
                                                            <div className="absolute bottom-2 text-[10px] text-amber-500/60 font-black">隊長限定</div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            </div>
                                        )}
                                    </div>

                                    {/* 手機：底部確認條（同商店結帳條樣式） */}
                                    <div className="lg:hidden absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-slate-900/95 backdrop-blur-xl flex items-center justify-between z-50 rounded-b-3xl">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-full border flex items-center justify-center relative ${isGiftingMode ? 'bg-rose-950/50 border-rose-900/50' : 'bg-indigo-950/50 border-indigo-900/50'}`}>
                                                {isGiftingMode ? <Send size={20} className="text-rose-400" /> : <Backpack size={20} className="text-indigo-400" />}
                                                {warehouseCartTotal > 0 && (
                                                    <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center border-2 border-slate-900 shadow-lg ${isGiftingMode ? 'bg-rose-500' : 'bg-indigo-500'}`}>
                                                        {warehouseCartTotal}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col justify-center">
                                                <div className="text-xs text-slate-400 font-bold mb-0.5">{isGiftingMode ? '準備軍援' : '準備裝備'}</div>
                                                <div className="text-white font-black text-lg flex items-center gap-1.5 leading-none">共 {warehouseCartTotal} 件</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => warehouseCartTotal > 0 && (isGiftingMode ? setShowGiftModal(true) : confirmTransferToBackpack())}
                                            disabled={warehouseCartTotal === 0}
                                            className={`px-8 py-3.5 rounded-2xl font-black text-base flex items-center gap-3 transition-all active:scale-95 shadow-xl ${warehouseCartTotal > 0 ? (isGiftingMode ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20') : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                                            {isGiftingMode ? '送出' : '裝備'} <ArrowRight size={18} />
                                        </button>
                                    </div>

                                    {/* 桌機：底部確認列 */}
                                    {warehouseCartTotal > 0 && (
                                    <div className="hidden lg:flex flex-col p-3 border-t border-white/5 bg-slate-950/60 gap-2">
                                        <button onClick={() => setWarehouseCart({})}
                                            className="w-full py-1.5 text-[10px] font-black text-slate-500 hover:text-red-400 transition-colors tracking-widest uppercase">
                                            × 清除全部選擇
                                        </button>
                                        {isGiftingMode ? (
                                            <button onClick={() => setShowGiftModal(true)}
                                                className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
                                                確認軍援 ({warehouseCartTotal} 件) <Send size={13} />
                                            </button>
                                        ) : (
                                            <button onClick={confirmTransferToBackpack}
                                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
                                                裝備至背包 ({warehouseCartTotal} 件) <Backpack size={13} />
                                            </button>
                                        )}
                                    </div>
                                )}
                                </div>{/* end flex-row */}
                            </div>
                        )}
                    </div>
                </section>

            </div>

            {/* [V28.7] Join Team Modal */}
            <JoinTeamModal 
                isOpen={showJoinModal} 
                onClose={() => setShowJoinModal(false)} 
                onJoin={handleJoinTeam} 
            />

            {/* RPG Gifting Modal */}
            <GiftingModal
                isOpen={showGiftModal}
                onClose={() => setShowGiftModal(false)}
                targets={otherMembers}
                selectedItemsCount={warehouseCartTotal}
                onConfirm={commitGifting}
            />
            </div>
        </div>
    );
}
