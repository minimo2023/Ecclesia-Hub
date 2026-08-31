
export default function GuestDataMergeDialog({ 
    isOpen, 
    onClose, 
    onMerge, 
    onDiscard, 
    isLoading = false,
    coinCount = 0
}) {
    if (!isOpen) return null;

    const handleMerge = async () => {
        if (onMerge) {
            const result = await onMerge();
            // 只有在合併成功時才呼叫 onClose（讓 isMergeRequired 自然消失）
            // 若失敗，對話框保持開啟讓用戶重試
            if (result?.success !== false && onClose) onClose();
        }
    };

    const handleDiscard = () => {
        if (confirm('確定要放棄這些遊客紀錄嗎？放棄後將無法復原。')) {
            if (onDiscard) onDiscard();
            if (onClose) onClose();
        }
    };

    // [已修正] 原本此處有多餘的 `if (!open) return null` 導致對話框永遠不顯示
    return (
        <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-100 border border-slate-300 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="text-center">
                    <div className="w-16 h-16 bg-amber-100 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">💰</span>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 mb-2">
                        發現遊客遊戲紀錄
                    </h2>

                    <p className="text-slate-700 mb-6">
                        系統偵測到您在未登入時累積了 <span className="text-amber-700 font-bold text-lg">{coinCount}</span> 枚智匯金幣。
                        <br />
                        是否要將這些智匯金幣合併到您目前的帳號？
                    </p>

                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={handleDiscard}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-200 transition"
                        >
                            放棄紀錄
                        </button>

                        <button
                            onClick={handleMerge}
                            disabled={isLoading}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {isLoading ? '處理中...' : '確認合併'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
