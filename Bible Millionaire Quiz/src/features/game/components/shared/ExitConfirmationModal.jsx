import React from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';

export default function ExitConfirmationModal({ onConfirm, onCancel, currentPrize }) {
    const { user } = useAuth();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-md border border-slate-200 shadow-2xl animate-scale-in">
                <h3 className="text-2xl font-bold text-slate-900 mb-4 text-center">確定要離開嗎？</h3>
                <p className="text-slate-700 mb-6 text-center text-lg">
                    本次已獲得：<span className="text-orange-600 font-bold text-xl">💰 {currentPrize} 枚智匯金幣</span>
                </p>

                {!user && currentPrize > 0 && (
                    <div className="mb-6 bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
                        <div className="text-left">
                            <p className="text-orange-800 font-bold text-sm mb-1">您尚未登入</p>
                            <p className="text-orange-700 text-xs">
                                這些智匯金幣將暫時保存在此瀏覽器中。若關閉瀏覽器將會遺失，建議註冊以永久保存！
                            </p>
                        </div>
                    </div>
                )}

                <p className="text-slate-600 text-sm mb-8 text-center">
                    離開後將無法繼續本次挑戰。
                </p>
                <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-lg transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-lg transition shadow-lg"
                    >
                        確定離開
                    </button>
                </div>
            </div>
        </div>
    );
}
