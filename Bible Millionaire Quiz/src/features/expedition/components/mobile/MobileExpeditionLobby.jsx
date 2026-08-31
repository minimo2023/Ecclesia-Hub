import React, { useState, useEffect, useRef } from 'react';
import {
    ShoppingCart, Users, Backpack, Package, Gift, Send, Coins,
    UserPlus, LogOut, Play, Trash2, ArrowRight, X, Check, MessageSquare
} from 'lucide-react';
import Avatar from '../../../../components/common/Avatar';
import { useAuth } from '../../../../contexts/AuthContext';
import { useExpedition } from '../../contexts/ExpeditionContext';

// ─── Chat (compact mobile version) ───────────────────────────────────────────
function MobileChat({ messages, onSendMessage, currentUserDisplayName }) {
    const [input, setInput] = useState('');
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    useEffect(() => {
        const handler = (e) => { if (e.detail?.name) setInput(p => `@${e.detail.name} ${p}`); };
        window.addEventListener('expedition:tag', handler);
        return () => window.removeEventListener('expedition:tag', handler);
    }, []);

    const handleSend = () => {
        if (!input.trim()) return;
        onSendMessage(input);
        setInput('');
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/60 border border-white/10 rounded-2xl overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-sm">
                {messages.length === 0 && <div className="text-slate-700 italic text-center py-2">--- 終端待機中 ---</div>}
                {messages.map((m, i) => {
                    const isSystem = m.type === 'system' || m.from === 'SYSTEM';
                    return (
                        <div key={i}>
                            {isSystem ? (
                                <span className="text-indigo-400">[SYS] {m.content}</span>
                            ) : (
                                <span>
                                    <span onClick={() => setInput(p => `@${m.from} ${p}`)} className="text-amber-500 cursor-pointer">&lt;{m.from}&gt;: </span>
                                    <span className="text-slate-400">{m.content}</span>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-2 p-2 border-t border-white/5 bg-slate-900/60">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                    placeholder="輸入訊息..."
                    className="flex-1 bg-slate-950 border border-slate-700/50 rounded-xl px-3 py-3 text-sm text-amber-400 placeholder-slate-700 outline-none font-mono"
                />
                <button onClick={handleSend} className="w-12 h-11 bg-amber-600 text-slate-950 rounded-xl flex items-center justify-center shrink-0">
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}

// ─── Gifting target modal ─────────────────────────────────────────────────────
function GiftingModal({ isOpen, onClose, onConfirm, targets, count }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-slate-900 border-t border-amber-500/30 rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
                <div className="p-5 border-b border-white/10 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-black text-amber-500">選擇軍援對象</h3>
                        <p className="text-sm text-slate-400">已準備 {count} 件物資</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-500"><X size={24} /></button>
                </div>
                <div className="p-4 space-y-3 pb-10">
                    {targets.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-base">沒有可接收的戰友</div>
                    ) : targets.map(m => (
                        <button key={m.displayName} onClick={() => onConfirm(m)}
                            className="w-full p-4 bg-slate-800/50 hover:bg-amber-500/20 border border-white/5 hover:border-amber-500/50 rounded-2xl flex items-center gap-4 transition-all active:scale-95">
                            <Avatar avatarId={m.avatar || m.displayName} size="lg" />
                            <div className="flex-1 text-left">
                                <div className="font-black text-white text-base">{m.displayName}</div>
                                <div className="text-sm text-slate-400">點擊確認發送</div>
                            </div>
                            <ArrowRight className="text-slate-600" size={20} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Join modal ───────────────────────────────────────────────────────────────
function JoinModal({ isOpen, onClose, onJoin }) {
    const [code, setCode] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-slate-900 border-t border-sky-500/30 rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
                <div className="p-5 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-black text-sky-400">連線至目標領地</h3>
                    <button onClick={onClose} className="p-2 text-slate-500"><X size={24} /></button>
                </div>
                <div className="p-5 space-y-5 pb-10">
                    <input autoFocus type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && code.length >= 5 && (onJoin(code.toUpperCase()), onClose())}
                        placeholder="輸入 6 位授權碼" maxLength={8}
                        className="w-full bg-slate-950 border-2 border-slate-800 focus:border-sky-500/50 rounded-2xl p-5 text-4xl font-mono font-black text-sky-400 text-center tracking-widest outline-none uppercase" />
                    <button onClick={() => { if (code.length >= 5) { onJoin(code.toUpperCase()); onClose(); } }}
                        disabled={code.length < 5}
                        className={`w-full py-5 rounded-2xl font-black text-lg tracking-widest transition-all active:scale-95 ${code.length >= 5 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                        核 准 連 線
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Item card (shared between shop / warehouse / backpack) ───────────────────
function ItemCard({ icon, name, label, inCart, onAdd, onRemove, disabled, cartColor = 'amber', title, hideControls = false }) {
    return (
        <div title={title}
            className={`relative p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 text-center select-none transition-all
                ${disabled ? 'opacity-50 grayscale bg-slate-950/40 border-slate-800' :
                inCart > 0 ? `bg-${cartColor}-500/10 border-${cartColor}-500/40` :
                'bg-slate-800/30 border-white/5'}`}>
            <div className="text-4xl leading-none mt-1">{icon}</div>
            <div className="text-sm font-black text-slate-200 leading-tight px-1 mt-1">{name}</div>
            {label && <div className="text-xs font-black text-slate-400 mb-1">{label}</div>}
            
            {!hideControls && (
                <div className="flex items-center gap-2 mt-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
                        disabled={inCart === 0}
                        className={`w-7 h-7 rounded-full font-black text-sm flex items-center justify-center transition-colors active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed bg-slate-700 hover:bg-${cartColor}-600 text-white`}
                        title="減少數量">
                        −
                    </button>
                    <span className={`text-sm font-black w-6 text-center ${inCart > 0 ? `text-${cartColor}-400` : 'text-slate-500'}`}>
                        {inCart}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
                        disabled={disabled}
                        className={`w-7 h-7 rounded-full font-black text-sm flex items-center justify-center transition-colors active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed bg-slate-700 hover:bg-${cartColor}-600 text-white`}
                        title="增加數量">
                        +
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Main Mobile Lobby ────────────────────────────────────────────────────────
export default function MobileExpeditionLobby() {
    const {
        team, user, actions, gameStates,
        userCoins, inventory, backpack, shopItems,
        isOwner, myMember, otherMembers,
        provisionToBackpack, returnToWarehouse, handlePurchase,
        BACKPACK_LIMITS, CAPTAIN_ONLY_ITEMS
    } = useExpedition();

    const { messages = [], lastGiftRecipient, loadedSave } = gameStates || {};
    const {
        sendGift: handleGiftSend, sendMessage: onSendMessage, onClearGiftSuccess,
        toggleReady: onToggleReady, leaveTeam: onLeaveTeam, disbandTeam: onDisbandTeam
    } = actions;

    const { guestAvatar } = useAuth();
    const [tab, setTab] = useState('squad');         // 'shop' | 'squad' | 'chat' | 'storage'
    const [storageTab, setStorageTab] = useState('warehouse');  // 'warehouse' | 'backpack'
    const [isGiftingMode, setIsGiftingMode] = useState(false);
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [copied, setCopied] = useState(false);

    // Shop cart
    const [cart, setCart] = useState({});
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    // Warehouse cart (equip / gift)
    const [warehouseCart, setWarehouseCart] = useState({});
    const warehouseCartTotal = Object.values(warehouseCart).reduce((a, b) => a + b, 0);

    const cartTotal = Object.entries(cart).reduce((t, [id, qty]) => t + (shopItems.find(i => i.id === id)?.price || 0) * qty, 0);
    const allTeammatesReady = (otherMembers || []).length === 0 || (otherMembers || []).every(m => m.isReady || !m.online);

    // Notifications state
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [hasNewMember, setHasNewMember] = useState(false);
    const prevMessagesLen = useRef(messages.length);
    const prevMembersCount = useRef((otherMembers || []).length);

    useEffect(() => {
        if (messages.length > prevMessagesLen.current) {
            if (tab !== 'chat') setUnreadMessages(prev => prev + (messages.length - prevMessagesLen.current));
        }
        prevMessagesLen.current = messages.length;
    }, [messages, tab]);

    useEffect(() => {
        if (tab === 'chat') setUnreadMessages(0);
    }, [tab]);

    useEffect(() => {
        const currentCount = (otherMembers || []).length;
        if (currentCount > prevMembersCount.current) {
            if (tab !== 'squad') setHasNewMember(true);
        }
        prevMembersCount.current = currentCount;
    }, [otherMembers, tab]);

    useEffect(() => {
        if (tab === 'squad') setHasNewMember(false);
    }, [tab]);

    useEffect(() => {
        if (lastGiftRecipient) {
            setIsGiftingMode(false);
            setWarehouseCart({});
            onClearGiftSuccess();
        }
    }, [lastGiftRecipient]);

    const addToCart = (itemId) => {
        const item = shopItems.find(i => i.id === itemId);
        if (item?.maxPurchase && ((inventory[itemId] || 0) + (backpack[itemId] || 0) + (cart[itemId] || 0)) >= item.maxPurchase) return;
        setCart(p => ({ ...p, [itemId]: (p[itemId] || 0) + 1 }));
    };
    const removeFromCart = (itemId) => setCart(p => { const n = { ...p }; if (n[itemId] > 1) n[itemId]--; else delete n[itemId]; return n; });

    const addToWarehouseCart = (itemId, delta) => {
        setWarehouseCart(prev => {
            const current = prev[itemId] || 0;
            const inInventory = inventory[itemId] || 0;
            const inBackpack = backpack[itemId] || 0;
            const limit = BACKPACK_LIMITS?.[itemId] ?? Infinity;
            if (CAPTAIN_ONLY_ITEMS?.includes(itemId) && !isOwner) return prev;
            const maxAdd = isGiftingMode ? inInventory - current : Math.min(inInventory, limit - inBackpack - current);
            const newQty = Math.max(0, Math.min(current + delta, current + maxAdd));
            if (newQty === 0) { const n = { ...prev }; delete n[itemId]; return n; }
            return { ...prev, [itemId]: newQty };
        });
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

    const confirmTransferToBackpack = () => {
        Object.entries(warehouseCart).forEach(([itemId, qty]) => {
            for (let i = 0; i < qty; i++) provisionToBackpack(itemId, 1, isOwner);
        });
        setWarehouseCart({});
        setStorageTab('backpack');
    };

    const commitGifting = (targetMember) => {
        const items = Object.entries(warehouseCart).filter(([, qty]) => qty > 0).map(([id, quantity]) => ({ id, quantity }));
        handleGiftSend(targetMember.displayName, items);
        setWarehouseCart({});
        setIsGiftingMode(false);
        setShowGiftModal(false);
    };

    const handleStartOrResume = () => {
        const provisioning = myMember?.displayName ? { [myMember.displayName]: backpack } : {};
        if (loadedSave) actions.resumeGame({ ...loadedSave, provisioning });
        else actions.startGame({ reset: true, provisioning });
    };

    if (!team) return null;

    // ─── Tab content ─────────────────────────────────────────────────────────

    const ShopTab = (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-slate-900/40">
                <span className="text-sm font-black text-white flex items-center gap-2"><ShoppingCart size={18} className="text-amber-500" /> 補給中心</span>
                <span className="text-amber-400 font-black text-sm flex items-center gap-1.5"><Coins size={16} /> {(userCoins - cartTotal).toLocaleString()}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {shopItems.map(item => {
                        const inCart = cart[item.id] || 0;
                        const tooPoor = item.price > (userCoins - cartTotal);
                        return (
                            <ItemCard key={item.id}
                                icon={item.icon} name={item.name} label={`${item.price} 🪙`}
                                inCart={inCart} title={item.desc}
                                onAdd={() => !tooPoor && addToCart(item.id)}
                                onRemove={() => removeFromCart(item.id)}
                                disabled={tooPoor}
                                cartColor="amber"
                            />
                        );
                    })}
                </div>
            </div>
            <div className="p-4 border-t border-white/5 bg-slate-950/40 flex flex-col gap-3">
                {cartTotal > 0 && (
                    <button onClick={() => setCart({})} className="text-sm font-black text-slate-500 hover:text-red-400 uppercase tracking-widest">× 清除選擇</button>
                )}
                <button onClick={handleCheckout} disabled={cartTotal === 0 || userCoins < cartTotal || isCheckingOut}
                    className={`w-full py-4 rounded-2xl font-black text-base tracking-widest uppercase transition-all active:scale-95 ${cartTotal > 0 && userCoins >= cartTotal ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-500'}`}>
                    結帳{cartTotal > 0 ? ` (${cartTotal} 🪙)` : ''}
                </button>
            </div>
        </div>
    );

    const HeaderStrip = (
        <div className="px-3 py-2.5 border-b border-white/5 bg-slate-900/40 shrink-0 overflow-hidden">
            <div className="flex items-center gap-2 min-w-0">
                {/* Avatar */}
                <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800">
                        <Avatar avatarId={myMember?.avatar || guestAvatar} size="full" />
                    </div>
                    <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap font-black text-[8px] px-1.5 py-0 rounded-full leading-4 ${isOwner ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                        {isOwner ? '隊長' : '隊員'}
                    </span>
                </div>
                {/* Name + Code stacked */}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-white truncate leading-tight">{team?.name || '—'}</div>
                    <div className="text-xs font-mono font-black text-sky-400 tracking-wider leading-tight">{team?.id || '—'}</div>
                </div>
                {/* Actions */}
                <button onClick={() => { navigator.clipboard.writeText(team?.id || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="px-3 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center text-xs font-black active:scale-90 shrink-0">
                    {copied ? '✓' : '複製'}
                </button>
                <button onClick={() => setShowJoinModal(true)}
                    className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center active:scale-90 shrink-0">
                    <UserPlus size={16} />
                </button>
            </div>
        </div>
    );

    const ActionBar = (
        <div className="px-4 pb-4 shrink-0 pt-2 border-t border-white/5 bg-slate-900/40 mt-auto">
            {!isOwner ? (
                <div className="flex gap-3">
                    <button onClick={() => onToggleReady(team.id, backpack)}
                        className={`flex-1 py-4 rounded-2xl text-lg font-black tracking-widest transition-all active:scale-95 ${myMember?.isReady ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-slate-950'}`}>
                        {myMember?.isReady ? '已就緒 ✓' : '準備就緒'}
                    </button>
                    <button onClick={() => onLeaveTeam?.(team.id)}
                        className="px-5 py-4 rounded-2xl bg-red-900/30 hover:bg-red-600/40 text-red-400 border border-red-500/30 active:scale-95">
                        <LogOut size={22} />
                    </button>
                </div>
            ) : (
                <div className="flex gap-3">
                    <button onClick={handleStartOrResume} disabled={!allTeammatesReady}
                        className={`flex-1 py-4 rounded-2xl text-lg font-black tracking-widest transition-all active:scale-95 ${allTeammatesReady ? 'bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                        {allTeammatesReady ? '開始挑戰 ▶' : '等待全員就緒...'}
                    </button>
                    <button onClick={() => onDisbandTeam?.(team.id)}
                        className="px-5 py-4 rounded-2xl bg-red-900/30 hover:bg-red-600/40 text-red-400 border border-red-500/30 active:scale-95">
                        <Trash2 size={22} />
                    </button>
                </div>
            )}
        </div>
    );

    const SquadTab = (
        <div className="flex-1 flex flex-col min-h-0">
            {HeaderStrip}
            {/* Squad grid */}
            <div className="px-4 py-4 flex-1 overflow-y-auto">
                <div className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Users size={14} /> 隊員</div>
                <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, idx) => {
                        const member = otherMembers[idx];
                        const isEmpty = !member;
                        return (
                            <div key={idx}
                                onClick={() => {
                                    if (member) {
                                        setTab('chat');
                                        setTimeout(() => window.dispatchEvent(new CustomEvent('expedition:tag', { detail: { name: member.displayName } })), 100);
                                    }
                                }}
                                className={`aspect-square rounded-2xl border flex flex-col items-center justify-center p-2 gap-2 relative transition-all
                                    ${isEmpty ? 'bg-slate-950/20 border-white/5 border-dashed' : 'bg-slate-800/40 border-slate-700 active:scale-95 cursor-pointer'}`}>
                                {isEmpty ? (
                                    <UserPlus size={24} className="text-slate-800" />
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-xl overflow-hidden relative shrink-0">
                                            <Avatar avatarId={member.avatar || member.displayName} size="full" />
                                            {!member.online && <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-[10px] font-black text-white/50">OFF</div>}
                                        </div>
                                        <div className="text-[11px] font-black text-slate-300 truncate w-full text-center leading-tight">{member.displayName}</div>
                                        {member.online && <div className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-slate-800 ${member.isReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            {ActionBar}
        </div>
    );

    const ChatTab = (
        <div className="flex-1 flex flex-col min-h-0">
            {HeaderStrip}
            <div className="flex-1 min-h-0 p-4">
                <MobileChat messages={messages} onSendMessage={onSendMessage} currentUserDisplayName={user?.displayName || myMember?.displayName || ''} />
            </div>
            {ActionBar}
        </div>
    );

    const StorageTab = (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Sub-tabs + gift toggle */}
            <div className={`flex border-b border-white/5 bg-slate-950/40 ${isGiftingMode ? 'border-rose-500/30' : ''}`}>
                <button onClick={() => setStorageTab('backpack')}
                    className={`flex-1 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors ${storageTab === 'backpack' && !isGiftingMode ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500'}`}>
                    <Backpack size={16} /> 背包
                </button>
                <button onClick={() => { setStorageTab('warehouse'); setIsGiftingMode(false); }}
                    className={`flex-1 py-4 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors ${storageTab === 'warehouse' && !isGiftingMode ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-500'}`}>
                    <Package size={16} /> 倉庫
                </button>
                <button onClick={() => { setIsGiftingMode(p => !p); setStorageTab('warehouse'); setWarehouseCart({}); }}
                    className={`px-4 text-sm font-black flex items-center gap-2 border-l border-white/5 transition-colors ${isGiftingMode ? 'text-rose-400 bg-rose-500/10' : 'text-slate-500'}`}>
                    <Gift size={18} />
                </button>
            </div>

            {isGiftingMode && (
                <div className="px-4 py-3 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between shrink-0">
                    <span className="text-xs font-black text-rose-400 uppercase tracking-widest">選擇軍援道具及數量</span>
                    <button onClick={() => { setIsGiftingMode(false); setWarehouseCart({}); }} className="text-xs text-slate-500 font-bold">取消</button>
                </div>
            )}

            {/* Backpack */}
            {storageTab === 'backpack' && !isGiftingMode && (
                <div className="flex-1 overflow-y-auto p-4">
                    {Object.entries(backpack).filter(([, q]) => q > 0).length === 0 ? (
                        <div className="text-center py-10 text-slate-700 italic text-sm">背包是空的</div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(backpack).filter(([, q]) => q > 0).map(([id, q]) => {
                                const itemDef = shopItems.find(i => i.id === id);
                                const canAdd = (inventory[id] || 0) > 0 && q < (BACKPACK_LIMITS?.[id] ?? Infinity);
                                return (
                                    <ItemCard key={id}
                                        icon={itemDef?.icon} name={itemDef?.name} label={`×${q}`}
                                        inCart={q} title={itemDef?.desc}
                                        onAdd={() => canAdd && provisionToBackpack(id, 1, isOwner)}
                                        onRemove={() => returnToWarehouse(id, 1)}
                                        disabled={false}
                                        cartColor="amber"
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Warehouse */}
            {(storageTab === 'warehouse' || isGiftingMode) && (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-4">
                        {Object.entries(inventory).filter(([, q]) => q > 0).length === 0 ? (
                            <div className="text-center py-10 text-slate-700 italic text-sm">倉庫空空的</div>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {Object.entries(inventory).filter(([, q]) => q > 0).map(([id, q]) => {
                                    const itemDef = shopItems.find(i => i.id === id);
                                    const inCart = warehouseCart[id] || 0;
                                    const inBackpack = backpack[id] || 0;
                                    const limit = BACKPACK_LIMITS?.[id] ?? Infinity;
                                    const captainOnly = CAPTAIN_ONLY_ITEMS?.includes(id);
                                    const maxAdd = isGiftingMode ? q : Math.min(q, limit - inBackpack - inCart);
                                    const isLocked = captainOnly && !isOwner;
                                    const color = isGiftingMode ? 'rose' : 'indigo';

                                    return (
                                        <ItemCard key={id}
                                            icon={itemDef?.icon} name={itemDef?.name} label={`×${q}`}
                                            inCart={inCart} title={itemDef?.desc}
                                            onAdd={() => addToWarehouseCart(id, 1)}
                                            onRemove={() => addToWarehouseCart(id, -1)}
                                            disabled={isLocked || maxAdd <= 0}
                                            cartColor={color}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {warehouseCartTotal > 0 && (
                        <div className="p-4 border-t border-white/5 bg-slate-950/60 flex flex-col gap-3 shrink-0">
                            <button onClick={() => setWarehouseCart({})} className="text-sm font-black text-slate-500 hover:text-red-400 uppercase tracking-widest">× 清除選擇</button>
                            {isGiftingMode ? (
                                <button onClick={() => setShowGiftModal(true)}
                                    className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-base tracking-widest active:scale-95 flex items-center justify-center gap-2">
                                    確認軍援 ({warehouseCartTotal} 件) <Send size={18} />
                                </button>
                            ) : (
                                <button onClick={confirmTransferToBackpack}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-base tracking-widest active:scale-95 flex items-center justify-center gap-2">
                                    裝備至背包 ({warehouseCartTotal} 件) <Backpack size={18} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div className="flex-1 h-full w-full flex flex-col bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
                {[
                    { id: 'shop', icon: <ShoppingCart size={20} />, label: '補給', active: 'border-amber-500 text-amber-400' },
                    { id: 'squad', icon: <Users size={20} />, label: '大廳', active: 'border-sky-400 text-sky-300', dot: hasNewMember },
                    { id: 'chat', icon: <MessageSquare size={20} />, label: '通訊', active: 'border-emerald-400 text-emerald-300', badge: unreadMessages },
                    { id: 'storage', icon: <Backpack size={20} />, label: '背包', active: 'border-indigo-400 text-indigo-300' },
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest flex flex-col items-center justify-center gap-1 border-b-2 transition-colors relative ${tab === t.id ? t.active : 'border-transparent text-slate-500'}`}>
                        {t.icon}
                        <span>{t.label}</span>
                        {t.dot && <div className="absolute top-2 right-4 w-2 h-2 rounded-full bg-red-500" />}
                        {t.badge > 0 && <div className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[9px] font-bold">{t.badge > 99 ? '99+' : t.badge}</div>}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'shop' && ShopTab}
            {tab === 'squad' && SquadTab}
            {tab === 'chat' && ChatTab}
            {tab === 'storage' && StorageTab}

            {/* Modals */}
            <JoinModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} onJoin={actions.joinTeam} />
            <GiftingModal isOpen={showGiftModal} onClose={() => setShowGiftModal(false)} targets={otherMembers} count={warehouseCartTotal} onConfirm={commitGifting} />
        </div>
    );
}
