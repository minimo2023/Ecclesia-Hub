import React from 'react';
import { AlertTriangle, Coins } from 'lucide-react';

export default function GuestGameExitDialog({ open, coins = 0, onStay, onLeave }) {
    if (!open) return null;

    const balance = Math.max(0, Number(coins) || 0).toLocaleString('zh-TW');
    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <section
                className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="guest-game-exit-title"
            >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                </div>
                <h2 id="guest-game-exit-title" className="mt-4 text-center text-xl font-black text-slate-900">
                    要離開遊戲區嗎？
                </h2>
                <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
                    <Coins className="h-5 w-5" aria-hidden="true" />
                    <strong>目前有 {balance} 枚訪客智匯金幣</strong>
                </div>
                <p className="mt-4 text-center text-sm font-medium leading-6 text-slate-600">
                    金幣可繼續在遊戲中使用，但只暫存在本次瀏覽器工作階段，不會同步到會員帳號；關閉分頁後會遺失。
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onStay}
                        className="min-h-12 rounded-xl bg-slate-100 px-4 font-black text-slate-700 transition hover:bg-slate-200"
                    >
                        繼續遊戲
                    </button>
                    <button
                        type="button"
                        onClick={onLeave}
                        className="min-h-12 rounded-xl bg-amber-600 px-4 font-black text-white shadow-lg shadow-amber-200 transition hover:bg-amber-500"
                    >
                        仍要離開
                    </button>
                </div>
            </section>
        </div>
    );
}
