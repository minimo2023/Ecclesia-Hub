import React, { useState, useEffect } from 'react';
import { X, Check, Shield, Heart, User } from 'lucide-react';

const TargetSelectorModal = ({
    isOpen,
    onClose,
    onConfirm,
    members,
    itemId,
    itemCount,
    currentUserDisplayName
}) => {
    const [selectedNames, setSelectedNames] = useState([]);

    useEffect(() => {
        if (isOpen) setSelectedNames([]);
    }, [isOpen]);

    if (!isOpen) return null;

    // 根據道具類型定義規則
    const isPotion = itemId === 'healthPotion';
    const isShield = itemId === 'shield';
    const isRevive = itemId === 'revive';

    const getIsTargetable = (member) => {
        if (isPotion) return member.lives < 3 && member.lives > 0;
        if (isShield) return member.displayName !== currentUserDisplayName && !member.hasShield && member.lives > 0;
        if (isRevive) return member.lives <= 0;
        return true;
    };

    const handleToggle = (name) => {
        if (selectedNames.includes(name)) {
            setSelectedNames(prev => prev.filter(n => n !== name));
        } else {
            if (selectedNames.length < itemCount) {
                setSelectedNames(prev => [...prev, name]);
            }
        }
    };

    const getItemName = () => {
        if (isPotion) return '🧪 恩典藥水';
        if (isShield) return '🛡️ 信德盾牌';
        if (isRevive) return '🔄 復活號角';
        return '道具';
    };

    const promptText = isShield
        ? `請選擇要保護的隊友 (最多 ${itemCount} 名)`
        : `請選擇使用對象 (最多 ${itemCount} 名)`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-blue-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-blue-500/20">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-blue-900/40 to-slate-900">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {getItemName()}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <p className="text-sm text-blue-300 font-medium">
                        {promptText}
                        <span className="ml-2 bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-xs">
                            已選 {selectedNames.length} / {itemCount}
                        </span>
                    </p>

                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {members.map(member => {
                            const isTargetable = getIsTargetable(member);
                            const isSelected = selectedNames.includes(member.displayName);
                            const isMaxReached = selectedNames.length >= itemCount && !isSelected;

                            return (
                                <button
                                    key={member.displayName}
                                    disabled={!isTargetable || (isMaxReached && !isSelected)}
                                    onClick={() => handleToggle(member.displayName)}
                                    className={`
                                        flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left
                                        ${isSelected
                                            ? 'bg-blue-600/30 border-blue-500 ring-1 ring-blue-500'
                                            : isTargetable
                                                ? 'bg-slate-800/50 border-white/10 hover:border-blue-400/50 hover:bg-slate-800'
                                                : 'bg-slate-950/50 border-transparent opacity-50 grayscale cursor-not-allowed'}
                                    `}
                                >
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden border border-white/10">
                                            <User className="w-full h-full p-2 text-slate-400" />
                                        </div>
                                        {isSelected && (
                                            <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full p-0.5 shadow-lg">
                                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-hidden">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-white truncate">
                                                {member.displayName}
                                                {member.displayName === currentUserDisplayName && (
                                                    <span className="ml-1 text-[10px] text-blue-400 font-normal">(你)</span>
                                                )}
                                            </span>
                                            <div className="flex gap-1">
                                                {[...Array(3)].map((_, i) => (
                                                    <Heart
                                                        key={i}
                                                        className={`w-3 h-3 ${i < member.lives ? 'fill-red-500 text-red-500' : 'text-slate-600'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {member.hasShield && (
                                                <span className="flex items-center gap-1 text-[10px] text-blue-400">
                                                    <Shield className="w-2.5 h-2.5 fill-blue-400" /> 已有護盾
                                                </span>
                                            )}
                                            {!isTargetable && !member.hasShield && member.lives >= 3 && isPotion && (
                                                <span className="text-[10px] text-slate-500 italic">生命已滿</span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-950/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-bold hover:bg-white/5 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        disabled={selectedNames.length === 0}
                        onClick={() => {
                            onConfirm(selectedNames);
                            onClose();
                        }}
                        className={`
                            flex-1 py-2.5 rounded-xl font-bold transition-all
                            ${selectedNames.length > 0
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 active:scale-95'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
                        `}
                    >
                        確認使用
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TargetSelectorModal;
