import React, { useState, useEffect } from 'react';
import { EXPERT_DB } from '../data/constants';

export default function LifelineModal({ type, data, onClose, onExpertSelect }) {
    const [dialing, setDialing] = useState(false);
    const [selectedExpert, setSelectedExpert] = useState(null);
    const [exitingDial, setExitingDial] = useState(false);

    //Reset state when type changes
    useEffect(() => {
        // Transition from dialing to phone (advice)
        if (type === 'phone' && dialing) {
            setExitingDial(true);
            // Do NOT setDialing(false) immediately. Let them overlap.
            setTimeout(() => {
                setDialing(false);
                setExitingDial(false);
            }, 1000);
        } else if (type === 'phone' && !exitingDial && !dialing) {
            // Normal state (e.g. re-opening or after transition)
            setDialing(false);
        }
    }, [type, dialing, exitingDial]);

    const handleExpertClick = (expert) => {
        setDialing(true);
        setSelectedExpert(expert);
        // Notify parent immediately, let parent handle the delay/async operation
        onExpertSelect(expert);
    };

    if (!type) return null;

    // Handle background click - only allow for 'phone' (expert advice) and 'audience'
    const handleBackgroundClick = () => {
        if (type === 'phone' || type === 'audience') {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
            onClick={handleBackgroundClick}
        >
            <div
                className={`bg-slate-800 border-2 border-yellow-500 rounded-2xl p-4 md:p-6 w-full shadow-2xl relative flex flex-col transition-all duration-300 ${type === 'phone' || type === 'dialing' ? 'max-w-xl' : 'max-w-[85vw]'} ${type === 'phone-select' ? 'max-h-[85vh] overflow-y-auto justify-start' : 'min-h-[350px] justify-center'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {type !== 'dialing' && type !== 'phone-select' && type !== 'phone' && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold z-20"
                    >
                        ✕
                    </button>
                )}

                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-yellow-500 mb-4 text-center relative z-0 flex flex-wrap items-center justify-center gap-2 md:gap-3 shrink-0">
                    {type === 'audience' && '👥 觀眾投票結果'}
                    {type === 'phone-select' && !dialing && !exitingDial && '📞 選擇連線專家'}
                    {(type === 'dialing' || dialing || exitingDial) && '📞 連線中...'}
                    {type === 'phone' && !dialing && !exitingDial && '📞 專家建議'}
                </h3>

                {type === 'audience' && (
                    <div className="flex justify-center items-end h-64 md:h-80 gap-2 md:gap-8 px-4 pb-4">
                        {Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([option, percentage]) => (
                            <AudienceBarVertical key={option} option={option} percentage={percentage} />
                        ))}
                    </div>
                )}

                {type === 'phone-select' && !dialing && (
                    <div className="flex flex-col flex-1 relative w-full mt-2">
                        <ExpertCarousel experts={EXPERT_DB} onSelect={handleExpertClick} onClose={onClose} />
                    </div>
                )}

                {(type === 'dialing' || dialing || exitingDial) && (
                    <div className={`flex flex-col items-center justify-center py-6 space-y-4 ${exitingDial ? 'absolute inset-0 z-10 bg-slate-800 animate-fade-out pointer-events-none' : ''}`}>
                        <div className="relative">
                            <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center text-4xl animate-pulse shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                                📞
                            </div>
                            <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-75"></div>
                        </div>
                        <p className="text-xl md:text-2xl lg:text-3xl text-green-400 font-mono animate-pulse">正在撥號給 {selectedExpert?.name || '專家'}...</p>
                    </div>
                )}

                {type === 'phone' && (
                    <div className="flex flex-col w-full animate-fade-in relative pt-2">
                        {/* Top Profile Header Card */}
                        <div className="bg-[#1e293b] border border-slate-600 rounded-xl p-3 md:p-4 flex items-center gap-4 mb-2 shadow-lg">
                            {/* Avatar */}
                            <div className="w-20 h-20 md:w-24 md:h-24 shrink-0 bg-slate-700 rounded-full border-2 border-slate-400 overflow-hidden shadow-md">
                                {data.avatar ? (
                                    <img src={`/experts/${encodeURIComponent(data.avatar)}`} alt={data.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>
                                )}
                            </div>
                            
                            {/* Header Text */}
                            <div className="flex-1 pr-2">
                                <p className="text-slate-300 text-sm md:text-base">
                                    你的朋友 <span className="text-white font-bold text-lg md:text-xl tracking-wide ml-1">{data.name}</span> 說：
                                </p>
                                <div className="h-px bg-slate-600 w-full mt-3 relative">
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-[#1e293b] pl-2 text-yellow-500/80 text-lg">
                                        💬
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Advice Text Bubble */}
                        <div className="bg-[#1e293b] border border-slate-600 rounded-xl p-3 md:p-4 shadow-inner relative max-h-[50vh] overflow-y-auto custom-scrollbar">
                            <div className="text-lg md:text-xl text-slate-200 leading-snug whitespace-pre-wrap">
                                {data.message.split(/(\*\*.*?\*\*|\[[A-D]\])/g).map((part, index) => {
                                    if (part.match(/^\[[A-D]\]$/)) {
                                        return <span key={index} className="text-yellow-400 font-bold mx-1 text-xl">{part.replaceAll('[', '').replaceAll(']', '')}</span>;
                                    }
                                    if (part.startsWith('**') && part.endsWith('**')) {
                                        return <span key={index} className="text-yellow-400 font-bold mx-1">{part.slice(2, -2)}</span>;
                                    }
                                    return part;
                                })}
                            </div>
                        </div>

                        {/* Decorative Dots */}
                        <div className="flex justify-center gap-2 mt-2 -mb-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                            <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                            <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                        </div>
                    </div>
                )}

                {type !== 'phone-select' && type !== 'dialing' && !dialing && (
                    <div className="flex justify-center">
                        <button
                            onClick={onClose}
                            className="mt-6 py-3 md:py-4 px-10 md:px-14 bg-yellow-600 hover:bg-yellow-700 text-white text-lg md:text-xl lg:text-2xl font-bold rounded-xl transition-colors shadow-lg"
                        >
                            確定
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function AudienceBarVertical({ option, percentage }) {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        // Add a small delay for a "reveal" effect
        const timer = setTimeout(() => {
            setHeight(percentage);
        }, 300);
        return () => clearTimeout(timer);
    }, [percentage]);

    return (
        <div className="flex flex-col items-center justify-end h-full flex-1 max-w-[6rem] group">
            {/* Percentage Label (Floating above) */}
            <div className={`text-xl md:text-3xl font-bold mb-2 transition-opacity duration-500 ${height > 0 ? 'opacity-100' : 'opacity-0'} text-yellow-400`}>
                {percentage}%
            </div>

            {/* The Bar */}
            <div className="w-full bg-slate-700 rounded-t-lg relative overflow-hidden flex items-end shadow-lg border border-slate-600 group-hover:border-yellow-500/50 transition-colors flex-1">
                <div
                    className="w-full bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-1000 ease-out rounded-t-lg relative"
                    style={{ height: `${height}%` }}
                >
                    {/* Shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-[200%] -translate-x-full animate-[shimmer_2s_infinite]"></div>
                </div>
            </div>

            {/* Option Label (A, B, C, D) */}
            <div className="mt-3 w-10 h-10 md:w-14 md:h-14 flex items-center justify-center bg-slate-800 border-2 border-yellow-500 rounded-full text-xl md:text-3xl font-bold text-yellow-500 shadow-md shrink-0">
                {option}
            </div>
        </div>
    );
}

function ExpertCarousel({ experts, onSelect, onClose }) {
    // 建立一個夠長的陣列來達成「假」的無限循環（左右各可滑動 20 輪，一般使用者極難滑到底）
    const REPEAT_COUNT = 40;
    const extendedExperts = React.useMemo(() => {
        return Array.from({ length: REPEAT_COUNT }).flatMap(() => experts);
    }, [experts]);
    
    // 起始位置設在中間的某一輪的第 0 個
    const START_INDEX = Math.floor(REPEAT_COUNT / 2) * experts.length;
    
    const [currentIndex, setCurrentIndex] = useState(START_INDEX);
    const scrollRef = React.useRef(null);
    const hasInitialized = React.useRef(false);

    // 初始載入時，直接跳到中間位置
    useEffect(() => {
        if (scrollRef.current && !hasInitialized.current) {
            hasInitialized.current = true;
            scrollRef.current.scrollTo({ left: START_INDEX * scrollRef.current.clientWidth, behavior: 'instant' });
        }
    }, [START_INDEX]);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const scrollLeft = scrollRef.current.scrollLeft;
        const itemWidth = scrollRef.current.clientWidth;
        if (itemWidth === 0) return; // Prevent division by zero during render
        
        const newIndex = Math.round(scrollLeft / itemWidth);
        if (newIndex !== currentIndex && newIndex >= 0 && newIndex < extendedExperts.length) {
            setCurrentIndex(newIndex);
        }
    };

    const handleNext = () => {
        if (scrollRef.current && currentIndex < extendedExperts.length - 1) {
            scrollRef.current.scrollTo({ left: (currentIndex + 1) * scrollRef.current.clientWidth, behavior: 'smooth' });
        }
    };

    const handlePrev = () => {
        if (scrollRef.current && currentIndex > 0) {
            scrollRef.current.scrollTo({ left: (currentIndex - 1) * scrollRef.current.clientWidth, behavior: 'smooth' });
        }
    };

    // 用來顯示真正的索引 (0 到 experts.length - 1)
    const realIndex = currentIndex % experts.length;

    return (
        <div className="flex flex-col w-full h-full justify-between items-center relative">
            {/* Carousel Container */}
            <div className="w-full relative flex items-center justify-center mb-6">
                {/* Left Arrow */}
                <button 
                    onClick={handlePrev} 
                    className="absolute left-0 z-20 text-4xl text-yellow-500 transition-opacity p-2 opacity-100 hover:scale-110"
                >
                    ‹
                </button>

                {/* Cards Scroll Area */}
                <div 
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {extendedExperts.map((expert, idx) => {
                        const isActive = idx === currentIndex;
                        return (
                            <div key={`${expert.id}-${idx}`} className="snap-center shrink-0 w-full flex justify-center items-center px-8 transition-transform duration-300">
                                <div className={`relative flex flex-col items-center w-full max-w-[280px] rounded-2xl border transition-all duration-300 p-6 ${isActive ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.2)] bg-slate-800/80 scale-100' : 'border-slate-600 bg-slate-800/40 scale-90 opacity-60'}`}>
                                    {isActive && <div className="absolute top-2 right-4 text-yellow-300 text-2xl animate-pulse">✨</div>}
                                    
                                    {/* Avatar */}
                                    <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center overflow-hidden mb-4 bg-slate-700 transition-colors ${isActive ? 'border-yellow-500 shadow-lg' : 'border-slate-500'}`}>
                                        {expert.avatar ? (
                                            <img src={`/experts/${encodeURIComponent(expert.avatar)}`} alt={expert.name} className="w-full h-full object-cover" loading="lazy" />
                                        ) : (
                                            <span className="text-4xl">👤</span>
                                        )}
                                    </div>

                                    {/* Name & Title */}
                                    <h4 className="text-2xl font-bold text-yellow-400 tracking-wide mb-1 text-center">{expert.name}</h4>
                                    <div className="text-sm text-slate-300 mb-3 text-center">{expert.title}・{expert.focus}</div>

                                    {/* Divider */}
                                    <div className="flex items-center justify-center w-full mb-4">
                                        <div className="flex-1 h-px bg-yellow-500/50"></div>
                                        <div className="w-2 h-2 rotate-45 bg-yellow-400 mx-2"></div>
                                        <div className="flex-1 h-px bg-yellow-500/50"></div>
                                    </div>

                                    {/* Personality/Description */}
                                    <p className="text-slate-300 text-sm text-center leading-relaxed min-h-[5rem] flex items-center justify-center">
                                        {expert.personality}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Right Arrow */}
                <button 
                    onClick={handleNext} 
                    className="absolute right-0 z-20 text-4xl text-yellow-500 transition-opacity p-2 opacity-100 hover:scale-110"
                >
                    ›
                </button>
            </div>

            {/* Pagination Indicators */}
            <div className="flex flex-col items-center mb-6">
                <div className="text-slate-400 text-sm flex items-center gap-2 mt-2">
                    <span className="text-yellow-500">👆</span> 左右滑動選擇專家
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 w-full px-4 pb-2">
                <button 
                    onClick={onClose}
                    className="flex-1 py-3.5 rounded-xl text-lg font-bold border border-slate-500 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                    取消
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onSelect(experts[realIndex]); }}
                    className="flex-1 py-3.5 rounded-xl text-lg font-bold bg-gradient-to-b from-yellow-500 to-yellow-600 text-slate-900 border border-yellow-400 shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                    📞 立即連線
                </button>
            </div>
        </div>
    );
}
