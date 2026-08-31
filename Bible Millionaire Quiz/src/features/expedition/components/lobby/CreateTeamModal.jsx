import React from 'react';

export default function CreateTeamModal({ isOpen, onClose, onConfirm, userSave }) {
    if (!isOpen || !userSave) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 max-w-md w-[90%] shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    📂 發現存檔
                </h3>
                <div className="bg-slate-800/80 rounded-xl p-4 border border-cyan-500/20 mb-6">
                    <div className="text-sm text-slate-400 mb-1">存檔記錄</div>
                    <div className="text-lg font-bold text-cyan-400">
                        階段 {userSave.stage}, 第 {userSave.question} 題
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                        {new Date(userSave.savedAt).toLocaleString()}
                    </div>
                </div>
                <p className="text-slate-300 mb-6 text-sm">
                    您想讀取此存檔繼續挑戰，還是開始新的遊戲？<br />
                    (選擇新遊戲將會刪除此存檔)
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => onConfirm(true)}
                        className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-cyan-500/20"
                    >
                        📥 讀取存檔並建立隊伍
                    </button>
                    <button
                        onClick={() => onConfirm(false)}
                        className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors"
                    >
                        🆕 開始新遊戲
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
