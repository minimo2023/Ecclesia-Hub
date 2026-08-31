import React from 'react';
import { Heart, X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-slate-100 rounded-2xl border border-slate-300 shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 opacity-100">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header Section */}
                <div className="pt-8 pb-6 px-6 text-center bg-slate-200 border-b border-slate-300">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 mb-4 ring-1 ring-rose-200 shadow-sm">
                        <Heart className="w-8 h-8 text-rose-500 fill-rose-500 animate-pulse-slow" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-wide">支持我們</h2>
                    <p className="text-rose-700 text-sm font-medium">成為聖經智匯的後盾</p>
                </div>

                {/* Body Section */}
                <div className="p-6 md:p-8 space-y-6">
                    {/* Wording Box */}
                    <div className="text-center space-y-3">
                        <p className="text-slate-700 leading-relaxed text-sm md:text-base text-justify md:text-center">
                            平安！本平台致力於提供免費優質的聖經學習資源。
                            <span className="text-amber-700 font-semibold">目前網站維護與 AI 運算皆由開發者自行吸收。</span>
                            若您覺得這裡對您有幫助，並願意分擔日益增長的營運成本，
                            歡迎小額奉獻支持，讓我們能走得更長遠！❤
                        </p>
                    </div>

                    {/* QR Code Area */}
                    <div className="bg-white p-4 rounded-xl shadow-inner flex flex-col items-center justify-center gap-3 w-64 mx-auto">
                        <div className="relative w-full aspect-square bg-slate-100 rounded-lg overflow-hidden">
                            {/* Assuming support-qr.jpg exists in public folder */}
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
                    <div className="bg-white/85 rounded-xl p-4 border border-slate-300 text-center relative group">
                        <p className="text-slate-600 text-sm mb-1">{bankInfo.bankName}</p>
                        <div className="flex items-center justify-center gap-3">
                            <span className="text-2xl font-mono font-bold text-emerald-700 tracking-wider">
                                {bankInfo.account}
                            </span>
                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 hover:text-slate-900 transition-all active:scale-95"
                                title="複製帳號"
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                        {copied && (
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-emerald-500 animate-fade-in-up">
                                已複製！
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
