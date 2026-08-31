import React from 'react';
import introImage from '../assets/intro_image.webp';

export default function IntroAnimation({ showIntro, isTransitioning, onStartIntro, onBack }) {
    if (!showIntro) return null;

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-black text-white overflow-hidden relative z-50 fixed inset-0">
            {/* Back Button */}
            {!isTransitioning && onBack && (
                <button
                    onClick={onBack}
                    className="absolute top-4 left-4 z-50 p-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span className="hidden md:inline">聖經智匯首頁</span>
                </button>
            )}

            <div className="flex-1 flex flex-col items-center justify-evenly w-full max-w-4xl mx-auto z-10 h-screen py-10">
                <div
                    className={`text-center transition-all duration-[3000ms] ${isTransitioning ? '-translate-y-20 opacity-0' : 'translate-y-0 opacity-100 animate-fade-in'}`}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' }}
                >
                    <img src={introImage} alt="Intro" className="w-[40vmin] md:w-[30vmin] mx-auto mb-[2vh] rounded-lg shadow-2xl shadow-yellow-500/20" />
                    <p className="text-gray-400 tracking-widest text-[3vmin] md:text-[2vmin]">刺刺家族工作室 製作</p>
                </div>

                <h1 className={`text-[12vmin] font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-lg transition-all duration-[3000ms] text-center leading-tight ${isTransitioning ? 'scale-[50] opacity-0' : 'scale-100 opacity-100'}`} style={{ transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' }}>
                    聖經智匯問答
                </h1>

                <div
                    className={`text-center transition-all duration-[3000ms] ${isTransitioning ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100 animate-fade-in'}`}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' }}
                >
                    <button onClick={onStartIntro} className="px-[8vw] py-[3vw] md:px-[4vw] md:py-[1.5vw] bg-gradient-to-r from-blue-600 to-blue-800 rounded-full text-[6vw] md:text-[2.5vw] font-bold hover:scale-105 transition-transform duration-300 shadow-lg border border-blue-400/30 animate-pulse">
                        請點選啟動
                    </button>
                </div>
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black -z-0"></div>
        </div>
    );
}
