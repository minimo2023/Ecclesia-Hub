import React, { useState, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * 百萬問答 Intro 畫面
 * 只顯示 Intro 動畫，點擊後進入模式選擇
 */
export default function GameIntroScreen({ onProceed, onBack }) {
    const [isTransitioning, setIsTransitioning] = useState(false);
    const timeoutRef = useRef(null);

    const handleStart = () => {
        setIsTransitioning(true);
        timeoutRef.current = setTimeout(() => {
            onProceed();
        }, 2000);
    };

    // 點擊跳過過場動畫
    const handleSkip = () => {
        if (isTransitioning && timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            onProceed();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-black text-white overflow-hidden relative z-50 fixed inset-0">
            {/* Back Button */}
            {!isTransitioning && (
                <button
                    onClick={onBack}
                    className="absolute top-4 left-4 z-50 p-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>聖經智匯首頁</span>
                </button>
            )}

            {/* Main Content */}
            <div className={`flex flex-col items-center z-10 ${isTransitioning ? 'animate-zoom-in-out' : ''}`}>
                {/* Logo */}
                <div className="text-[15vw] md:text-[10vw] mb-4 animate-pulse">
                    🏆
                </div>

                {/* Title */}
                {/* Title */}
                <h1 className="text-[8vw] md:text-[5vw] font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 mb-4 text-center">
                    聖經智匯問答
                </h1>
                <p className="text-[4vw] md:text-[2vw] text-gray-400 mb-12 tracking-wider">
                    Bible Wisdom Quiz
                </p>

                {/* Start Button */}
                {!isTransitioning && (
                    <button
                        onClick={handleStart}
                        className="px-[8vw] py-[3vw] md:px-[4vw] md:py-[1.5vw] bg-gradient-to-r from-amber-500 to-orange-600 rounded-full text-[6vw] md:text-[2vw] font-bold hover:scale-105 transition-transform duration-300 shadow-lg border border-amber-400/30 animate-pulse"
                    >
                        開始挑戰
                    </button>
                )}

                {/* Loading Indicator - 點擊可跳過 */}
                {isTransitioning && (
                    <div
                        onClick={handleSkip}
                        className="flex flex-col items-center gap-3 text-amber-400 cursor-pointer hover:scale-105 transition-transform"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xl">載入中...</span>
                        </div>
                        <span className="text-sm text-gray-400 animate-pulse">點擊螢幕跳過</span>
                    </div>
                )}
            </div>

            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-900/20 via-black to-black -z-0"></div>
        </div>
    );
}
