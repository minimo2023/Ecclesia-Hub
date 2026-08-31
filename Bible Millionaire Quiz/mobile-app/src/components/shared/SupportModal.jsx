import React, { useState } from 'react';
import { Heart, X, Copy, Check } from 'lucide-react';

export default function SupportModal({ isOpen, onClose }) {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const bankInfo = {
        bankName: '(013) 國泰世華銀行',
        account: '218700693738'
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(bankInfo.account);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 opacity-100 ring-1 ring-white/10">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header Section */}
                <div className="pt-8 pb-6 px-6 text-center bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-700/50">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/10 mb-4 ring-1 ring-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                        <Heart className="w-8 h-8 text-rose-500 fill-rose-500 animate-pulse" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2 tracking-wide">支持我們</h2>
                    <p className="text-rose-200/80 text-sm font-medium">成為聖經智匯的後盾</p>
                </div>

                {/* Body Section */}
                <div className="p-6 md:p-8 space-y-6">
                    {/* Wording Box */}
                    <div className="text-center space-y-3">
                        <p className="text-slate-300 leading-relaxed text-sm md:text-base text-justify md:text-center">
                            平安。本平台致力於提供免費且優質的聖經學習資源。
                            <span className="text-amber-400">目前網站維護與 AI 運算皆由開發團隊自行吸收。</span>
                            若您覺得這裡對您有幫助，並願意分擔日益增長的營運成本，
                            若您願意，歡迎小額奉獻支持，陪伴我們持續前行。
                        </p>
                    </div>

                    {/* QR Code Area */}
                    <div className="bg-white p-4 rounded-xl shadow-inner flex flex-col items-center justify-center gap-3 w-48 sm:w-64 mx-auto">
                        <div className="relative w-full aspect-square bg-slate-100 rounded-lg overflow-hidden">
                            <img
                                src="/support-qr.jpg"
                                alt="Support QR Code"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = "https://placehold.co/400x400/png?text=QR+Code"; // Fallback
                                }}
                            />
                        </div>
                        <p className="text-xs text-slate-500 font-medium">請使用 銀行/支付 App 掃描</p>
                    </div>

                    {/* Bank Info */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center relative group">
                        <p className="text-slate-400 text-sm mb-1">{bankInfo.bankName}</p>
                        <div className="flex items-center justify-center gap-3">
                            <span className="text-[20px] sm:text-2xl font-mono font-bold text-emerald-400 tracking-wider">
                                {bankInfo.account}
                            </span>
                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-all active:scale-95"
                                title="複製帳號"
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                        {copied && (
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-emerald-500 animate-in slide-in-from-bottom-2 fade-in">
                                已複製
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
