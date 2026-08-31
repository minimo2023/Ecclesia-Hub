import React from 'react';
import { Bot } from 'lucide-react';

export default function LoadingScreen({ message, progress, fadeOut = false }) {
    return (
        <div className={`absolute inset-0 h-full w-full bg-slate-100 text-slate-900 transition-opacity duration-500 overflow-hidden ${fadeOut ? 'opacity-0' : 'opacity-100'} z-50`}>

            {/* 行動版橫向（高度 ≤ 500px）：左轉圈 + 右文字 */}
            <div className="hidden [@media(max-height:500px)]:flex flex-row items-center justify-center h-full px-6 gap-6">
                <div className="flex-shrink-0">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Bot size={36} className="text-slate-500" />
                        </div>
                    </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
                    <h2 className="text-base font-bold text-indigo-600 animate-pulse leading-tight">
                        AI 正在研讀聖經出題中...
                    </h2>
                    <div className="w-full bg-white rounded-full h-3 overflow-hidden border border-slate-200">
                        <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full transition-all duration-500 ease-out relative" style={{ width: `${progress}%` }}>
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                    </div>
                    <p className="text-indigo-600 font-mono text-sm">{progress}%</p>
                    <p className="text-xs text-slate-700 leading-snug line-clamp-2">{message}</p>
                    <p className="text-slate-500 text-xs">初次生成可能需要 10-15 秒，請耐心等候...</p>
                </div>
            </div>

            {/* 直向 / 桌機（高度 > 500px）：垂直置中 */}
            <div className="flex [@media(max-height:500px)]:hidden flex-col items-center justify-center h-full gap-3 md:gap-8 px-8">
                <div className="relative">
                    <div className="w-16 h-16 md:w-40 md:h-40 border-4 md:border-8 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Bot size={28} className="text-slate-500 md:hidden" />
                        <Bot size={80} className="text-slate-500 hidden md:block" />
                    </div>
                </div>
                <h2 className="text-xl md:text-5xl font-bold text-indigo-600 animate-pulse text-center">
                    AI 正在研讀聖經出題中...
                </h2>
                <div className="w-full max-w-sm md:max-w-2xl bg-white rounded-full h-3 md:h-6 overflow-hidden border border-slate-200">
                    <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full transition-all duration-500 ease-out relative" style={{ width: `${progress}%` }}>
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    </div>
                </div>
                <p className="text-indigo-600 font-mono text-base md:text-2xl">{progress}%</p>
                <p className="text-base md:text-3xl text-slate-700 text-center max-w-xl md:max-w-3xl leading-relaxed">{message}</p>
                <p className="text-slate-500 text-xs md:text-lg text-center hidden sm:block">初次生成可能需要 10-15 秒，請耐心等候...</p>
            </div>
        </div>
    );
}
