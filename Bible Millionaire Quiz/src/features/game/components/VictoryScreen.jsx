import React, { useEffect, useRef, useState } from 'react';

/**
 * VictoryScreen — 經典模式通關過場動畫
 *
 * 設計理念：
 * - 僅用於「經典模式 15 關全對通關」，不用於練習/無限/速答模式
 * - 作為純過場動畫，3 秒後自動推進至金幣結算頁（GameResultPage）
 * - 點擊畫面可立即跳過
 * - 透過 useRef 防止重複觸發 onVictory（倒數 + 點擊並發時）
 */
export default function VictoryScreen({ onVictory, onRestart }) {
    const [countdown, setCountdown] = useState(3);
    const hasTriggered = useRef(false);

    const triggerVictory = () => {
        if (hasTriggered.current) return;
        hasTriggered.current = true;
        onVictory?.();
    };

    // 3 秒後自動推進至結算頁
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    triggerVictory();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div
            className="flex flex-col items-center justify-center h-[100dvh] bg-slate-100 text-slate-900 p-8 text-center cursor-pointer select-none animate-fade-in"
            onClick={triggerVictory}
        >
            {/* 主要慶祝動畫 */}
            <div className="text-7xl md:text-9xl mb-6 animate-bounce">🎉</div>

            <h1 className="text-5xl md:text-7xl font-black text-orange-500 mb-4 drop-shadow-lg">
                恭喜通關！
            </h1>

            <p className="text-lg md:text-2xl text-emerald-600 font-bold mb-2">
                15 關全數完成
            </p>

            <p className="text-slate-500 text-sm mt-8 animate-pulse">
                {countdown > 0 ? `${countdown} 秒後查看結算...` : '跳轉中...'}
            </p>

            <p className="text-slate-600 text-xs mt-2">
                點擊畫面可立即跳過
            </p>
        </div>
    );
}
