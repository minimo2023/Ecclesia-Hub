import React, { useEffect } from 'react';
import { soundManager } from '../../../utils/SoundManager';

export default function CountdownScreen({ countdown }) {
    useEffect(() => {
        // 倒數開始時淡出 BGM (主題曲)
        soundManager.fadeOutBGM(800);
    }, []);

    useEffect(() => {
        // 倒數數字變化時撥放音效
        if (countdown !== null) {
            soundManager.playCountdown();
        }
    }, [countdown]);

    return (
        <div className="flex flex-col items-center justify-center h-[100dvh] w-full bg-slate-100 text-slate-900 overflow-hidden">
            <div className="relative flex items-center justify-center w-full flex-1">
                <div key={countdown} className={`${String(countdown).length > 1 ? 'text-[6rem]' : 'text-[40vmin]'} font-bold text-orange-500 animate-ping absolute opacity-20 select-none whitespace-nowrap`}>
                    {countdown}
                </div>
                <div key={`${countdown}-main`} className={`${String(countdown).length > 1 ? 'text-[6rem]' : 'text-[40vmin]'} font-bold text-orange-500 animate-bounce relative z-10 select-none whitespace-nowrap`}>
                    {countdown}
                </div>
            </div>
            <p className="text-xl text-slate-500 mb-4 animate-pulse shrink-0">準備開始...</p>
        </div>
    );
}
