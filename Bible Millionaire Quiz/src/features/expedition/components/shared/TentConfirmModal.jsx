import React from 'react';

export default function TentConfirmModal({ isOpen, onClose, onConfirm, team, user, displayName }) {
    if (!isOpen) return null;

    const isCaptain = (user?.id && team?.ownerId === user.id) || (!user?.id && team?.ownerName === displayName);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-800 border border-amber-500/30 rounded-2xl p-6 max-w-md w-[90%] shadow-2xl">
                <h3 className="text-xl font-bold text-amber-400 mb-3 flex items-center gap-2">
                    ⛺ 搭建帳篷
                </h3>
                <p className="text-slate-300 mb-6 leading-relaxed">
                    使用帳篷可以保存目前的進度（關卡 {team?.currentStage || 1}）。請選擇：
                </p>
                <div className="flex flex-col gap-3">
                    {isCaptain && (
                        <button
                            onClick={() => onConfirm(true)}
                            className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            🏕️ 存檔並返回營地
                        </button>
                    )}
                    <button
                        onClick={() => onConfirm(false)}
                        className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        💾 存檔繼續
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2 text-slate-400 hover:text-white transition-colors text-sm"
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
}
