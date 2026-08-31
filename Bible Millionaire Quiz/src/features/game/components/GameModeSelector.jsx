import React, { useEffect, useState } from 'react';
import {
    Trophy, BookOpen, Users, ArrowLeft, Sparkles, Lock,
    MessageSquare, HelpCircle, Map, X, Monitor,
    List, Clock, User, Zap, Flag, Star, Radio,
    Infinity as InfinityIcon, RefreshCw, GraduationCap, Info, CloudRain, Grid2X2
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import FeedbackModal from './FeedbackModal';
import HelpModal from './HelpModal';
import { soundManager } from '../../../utils/SoundManager';

/**
 * 遊戲模式選擇頁面
 * 在進入遊戲前選擇遊戲模式
 */
export default function GameModeSelector({ onSelectMode, onBack, initialSection = 'quiz' }) {
    const { user } = useAuth();
    const [showFeedback, setShowFeedback] = useState(false);
    const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [activeSection, setActiveSection] = useState(
        ['quiz', 'memory', 'online'].includes(initialSection) ? initialSection : 'quiz'
    );

    useEffect(() => {
        soundManager.stopBGM();
    }, []);

    // 根據時間生成問候語
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return '早安';
        if (hour < 18) return '午安';
        return '晚安';
    };

    const displayName = user?.displayName || user?.username || '朋友';

    const scriptureOrderEnabled = import.meta.env.DEV
        || import.meta.env.VITE_SCRIPTURE_ORDER_LAB_ENABLED === 'true'
        || import.meta.env.VITE_SCRIPTURE_ORDER_ENABLED === 'true';
    const scriptureRainVisible = import.meta.env.DEV || import.meta.env.VITE_SCRIPTURE_RAIN_ENABLED === 'true';
    const modes = [
        {
            id: 'classic',
            section: 'quiz',
            icon: Trophy,
            title: '經典問答',
            subtitle: 'Classic Mode',
            description: '挑戰 15 道題，答錯即出局！完成可獲得金幣獎勵',
            color: {
                bg: 'bg-gradient-to-br from-amber-500 to-orange-600',
                border: 'border-amber-400/50',
                shadow: 'shadow-[0_0_30px_rgba(245,158,11,0.3)]',
                btnText: 'text-orange-600'
            },
            badges: [
                { icon: List, text: '15 題挑戰' },
                { icon: Clock, text: '答錯淘汰' },
                { icon: Star, text: '金幣獎勵' }
            ],
            buttonText: '開始',
            recommended: true,
            available: true
        },
        {
            id: 'speed',
            section: 'quiz',
            icon: Sparkles,
            title: '快問快答',
            subtitle: 'Speed Round',
            description: '答錯不淘汰！每題限時 7 秒，完成後檢視挑戰成功題數！',
            color: {
                bg: 'bg-gradient-to-br from-purple-600 to-fuchsia-600',
                border: 'border-purple-400/50',
                shadow: 'shadow-[0_0_30px_rgba(168,85,247,0.3)]',
                btnText: 'text-purple-600'
            },
            badges: [
                { icon: Clock, text: '7 秒限時' },
                { icon: Zap, text: '快速反應' },
                { icon: Trophy, text: '最終計分' }
            ],
            buttonText: '開始',
            available: true
        },
        {
            id: 'expedition',
            section: 'quiz',
            icon: Map,
            title: '聖經遠征',
            subtitle: 'Bible Expedition',
            description: '挑戰四大闖關階段，分段累積積分！支援個人或組隊挑戰',
            color: {
                bg: 'bg-gradient-to-br from-rose-500 to-red-600',
                border: 'border-rose-400/50',
                shadow: 'shadow-[0_0_30px_rgba(244,63,94,0.3)]',
                btnText: 'text-rose-600'
            },
            badges: [
                { icon: Flag, text: '四大階段' },
                { icon: Star, text: '分段積分' },
                { icon: Users, text: '個人/組隊' }
            ],
            buttonText: '開始',
            available: true
        },
        {
            id: 'multiplayer',
            section: 'online',
            icon: Users,
            title: '連線模式',
            subtitle: 'Multiplayer Mode',
            description: '多人同台！主持人投影出題，所有人用手機即時搶答',
            color: {
                bg: 'bg-gradient-to-br from-blue-600 to-indigo-600',
                border: 'border-blue-400/50',
                shadow: 'shadow-[0_0_30px_rgba(59,130,246,0.3)]',
                btnText: 'text-blue-600'
            },
            badges: [
                { icon: Radio, text: '即時搶答' },
                { icon: Users, text: '多人同台' },
                { icon: Monitor, text: '投影顯示' }
            ],
            buttonText: '建立 / 加入',
            available: true
        },
        {
            id: 'practice',
            section: 'quiz',
            icon: BookOpen,
            title: '練習模式',
            subtitle: 'Practice Mode',
            description: '無壓練習！答錯不淘汰，可自選題目數量，邊學邊成長',
            color: {
                bg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
                border: 'border-emerald-400/50',
                shadow: 'shadow-[0_0_30px_rgba(16,185,129,0.3)]',
                btnText: 'text-emerald-600'
            },
            badges: [
                { icon: List, text: '自選題數' },
                { icon: RefreshCw, text: '答錯可試' },
                { icon: GraduationCap, text: '輕鬆無壓' }
            ],
            buttonText: '開始',
            available: true
        },
        {
            id: 'scripture-order',
            section: 'memory',
            icon: Grid2X2,
            title: '經文四宮格',
            subtitle: 'Scripture Order',
            description: '從四個經文片段中，依照原文順序選出下一片。',
            color: {
                bg: 'bg-gradient-to-br from-cyan-500 to-teal-600',
                border: 'border-cyan-400/50',
                shadow: 'shadow-[0_0_30px_rgba(6,182,212,0.3)]',
                btnText: 'text-cyan-700'
            },
            badges: [
                { icon: Grid2X2, text: '四格排序' },
                { icon: BookOpen, text: '經文記憶' },
                { icon: Star, text: scriptureOrderEnabled ? '順序挑戰' : '尚未開放' }
            ],
            buttonText: scriptureOrderEnabled ? '開始挑戰' : '尚未開放',
            available: scriptureOrderEnabled,
            comingSoon: !scriptureOrderEnabled
        },
        {
            id: 'scripture-rain',
            section: 'memory',
            icon: CloudRain,
            title: '經文雨',
            subtitle: 'Scripture Rain',
            description: '依序接住落下的和合本經文片段，訓練閱讀順序與經文記憶。',
            color: {
                bg: 'bg-gradient-to-br from-sky-500 to-indigo-600',
                border: 'border-sky-400/50',
                shadow: 'shadow-[0_0_30px_rgba(56,189,248,0.3)]',
                btnText: 'text-sky-700'
            },
            badges: [
                { icon: CloudRain, text: '片段落下' },
                { icon: List, text: '順序挑戰' },
                { icon: Star, text: '動態挑戰' }
            ],
            buttonText: '開始挑戰',
            available: true,
            visible: scriptureRainVisible
        },
    ].filter(mode => mode.visible !== false);

    const sections = [
        { id: 'quiz', label: '問答挑戰', description: '經典、快答、遠征與練習', icon: Trophy },
        { id: 'memory', label: '經文記憶', description: '從片段順序熟悉經文', icon: BookOpen },
        { id: 'online', label: '連線同樂', description: '邀請朋友一起即時挑戰', icon: Users },
    ];
    const activeSectionInfo = sections.find((section) => section.id === activeSection) || sections[0];
    const visibleModes = modes.filter((mode) => mode.section === activeSection);

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 p-4 flex flex-col items-center overflow-y-auto relative">
            {/* Top Bar */}
            <div className="w-full max-w-[90rem] flex items-center justify-between mb-4 z-10">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-indigo-700 rounded-full transition-colors border border-slate-200 shadow-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="font-medium">返回</span>
                </button>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => activeSection === 'memory'
                            ? onSelectMode('scripture-memory-guide')
                            : setShowHelp(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 rounded-full transition-colors text-sm font-medium border border-slate-200 shadow-sm"
                    >
                        <HelpCircle size={16} />
                        <span className="hidden md:inline">{activeSection === 'memory' ? '經文記憶玩法' : '遊戲說明'}</span>
                    </button>
                    <button
                        onClick={() => setShowFeedback(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 rounded-full transition-colors text-sm font-medium border border-slate-200 shadow-sm"
                    >
                        <MessageSquare size={16} />
                        <span className="hidden md:inline">問題回報</span>
                    </button>
                </div>
            </div>

            {!showMultiplayerModal ? (
                <>
                    {/* Greeting & Title */}
                    <div className="text-center mb-5 z-10 animate-fade-in">
                        <div className="flex items-center justify-center gap-4 mb-2">
                            <Sparkles className="text-amber-500 w-4 h-4" />
                            <h2 className="text-2xl font-bold text-amber-500 tracking-wide">
                                {getGreeting()}，{displayName}！
                            </h2>
                            <Sparkles className="text-amber-500 w-5 h-5" />
                        </div>
                        <p className="text-amber-400/80 text-base mb-2">今天要學習哪些經文呢？</p>

                        <div className="flex items-center justify-center gap-4 mt-1">
                            <Sparkles className="text-yellow-400 w-5 h-5 animate-pulse" />
                            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500 tracking-wider">
                                聖經智匯遊戲
                            </h1>
                            <Sparkles className="text-yellow-400 w-5 h-5 animate-pulse" />
                        </div>
                    </div>

                    <div
                        className="mb-5 grid w-full max-w-3xl grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm z-10"
                        role="tablist"
                        aria-label="遊戲分類"
                    >
                        {sections.map((section) => {
                            const SectionIcon = section.icon;
                            const isActive = section.id === activeSection;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setActiveSection(section.id)}
                                    className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${isActive
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-700'
                                        }`}
                                >
                                    <SectionIcon className="h-4 w-4 shrink-0" />
                                    <span>{section.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <p className="mb-4 text-center text-sm font-medium text-slate-500 z-10">
                        {activeSectionInfo.description}
                    </p>

                    {/* Cards Container */}
                    <div className="w-full max-w-[80rem] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 z-10 pb-4">
                        {visibleModes.map((mode) => (
                            <ModeCard key={mode.id} mode={mode} onSelectMode={onSelectMode} setShowMultiplayerModal={setShowMultiplayerModal} />
                        ))}
                    </div>

                    {/* Footer Info */}
                    <div className="mt-auto z-10 flex items-center gap-2 text-slate-400 text-sm bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
                        <Info size={16} className="text-slate-500" />
                        <span>選擇適合你的模式，開始學習並加深對聖經的認識！</span>
                    </div>
                </>
            ) : (
                /* Multiplayer Modal Logic remains unchanged */
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
                    onClick={() => setShowMultiplayerModal(false)}
                >
                    <div
                        className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-12 max-w-4xl w-full shadow-2xl relative animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => setShowMultiplayerModal(false)}
                            className="absolute top-3 right-3 md:top-6 md:right-6 p-2 md:p-4 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors z-[60]"
                        >
                            <X size={48} />
                        </button>

                        {/* Title */}
                        <div className="text-center mb-6 md:mb-12">
                            <h2 className="text-2xl md:text-5xl font-bold text-white flex items-center justify-center gap-2 md:gap-4">
                                <Users size={64} className="text-blue-400" />
                                連線模式
                            </h2>
                            <p className="text-slate-400 mt-2 md:mt-4 text-base md:text-2xl">選擇房間類型</p>
                        </div>

                        {/* Options */}
                        <div className="space-y-4 md:space-y-6">
                            <button
                                onClick={() => onSelectMode('multiplayer')}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 p-4 md:p-10 rounded-2xl md:rounded-3xl flex items-center justify-between group transition-all transform hover:scale-[1.02] border border-blue-500/30"
                            >
                                <div className="flex items-center gap-4 md:gap-10">
                                    <div className="bg-white/20 p-3 md:p-6 rounded-xl md:rounded-2xl">
                                        <Sparkles size={64} className="text-white" />
                                    </div>
                                    <div className="text-left">
                                        <div className="flex items-center gap-2 md:gap-4 mb-1 md:mb-2">
                                            <h3 className="text-xl md:text-5xl font-bold text-white">連線遊戲</h3>
                                            <span className="bg-green-500 text-black text-xs md:text-xl font-bold px-2 md:px-4 py-0.5 md:py-1 rounded-full">NEW</span>
                                        </div>
                                        <p className="text-blue-100 text-sm md:text-3xl">搶答模式 & 團隊合作</p>
                                    </div>
                                </div>
                                <ArrowLeft size={48} className="text-white rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        </div>

                        {/* Footer Note */}
                        <div className="mt-6 md:mt-12 text-center bg-slate-800/30 py-3 md:py-6 rounded-xl md:rounded-2xl border border-slate-700/50">
                            <p className="text-slate-400 text-sm md:text-xl flex items-center justify-center gap-2 md:gap-3">
                                <Monitor size={32} />
                                使用電腦或平板作為投影片出題
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
            <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
        </div>
    );
}

// 獨立的 ModeCard 元件
function ModeCard({ mode, onSelectMode, setShowMultiplayerModal }) {
    const Icon = mode.icon;

    const handleClick = () => {
        if (!mode.available) return;
        if (mode.id === 'multiplayer') {
            setShowMultiplayerModal(true);
            return;
        }
        soundManager.unlockAudio();
        onSelectMode(mode.id);
    };

    return (
        <button
            onClick={handleClick}
            disabled={!mode.available}
            className={`relative w-full flex flex-col items-center p-4 rounded-[1.25rem] border border-slate-200 bg-white ${mode.available ? 'hover:-translate-y-1 hover:shadow-xl cursor-pointer' : 'opacity-60 cursor-not-allowed'} transition-all duration-300 text-center overflow-hidden group shadow-sm`}
        >
            {/* 推薦斜角緞帶 */}
            {mode.recommended && (
                <div className="absolute -top-6 -left-6 w-32 h-32 overflow-hidden z-20 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 py-1.5 bg-gradient-to-r from-orange-400 to-rose-500 text-white font-black text-sm tracking-widest shadow-md -rotate-45">
                        推薦
                    </div>
                </div>
            )}

            {mode.comingSoon && (
                <div className="absolute top-4 right-4 bg-slate-900/80 text-slate-300 text-xs px-3 py-1 rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3" /> 敬請期待
                </div>
            )}

            {/* Icon & Titles */}
            <div className="flex flex-col items-center mt-2">
                <div className={`w-14 h-14 rounded-2xl ${mode.color.bg} flex items-center justify-center mb-3 shadow-sm`}>
                    <Icon className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-1 tracking-wider">{mode.title}</h3>
                <p className="text-indigo-500 text-[11px] font-semibold mb-2 tracking-widest uppercase">{mode.subtitle}</p>
                <p className="text-slate-500 text-[13px] mb-3 leading-snug h-10 flex items-center justify-center">
                    {mode.description}
                </p>
            </div>

            {/* Badges */}
            <div className="flex items-center justify-center gap-2 mb-4 w-full px-1">
                {mode.badges.map((badge, idx) => {
                    const BadgeIcon = badge.icon;
                    return (
                        <div key={idx} className="flex flex-1 flex-row items-center justify-center gap-1.5 py-1.5 px-1.5 bg-slate-100 rounded-lg border border-slate-200 whitespace-nowrap overflow-hidden">
                            <BadgeIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                            <span className="text-slate-600 text-[10px] xl:text-[11px] font-medium truncate">{badge.text}</span>
                        </div>
                    );
                })}
            </div>

            {/* Action Button */}
            <div className={`w-full py-2 rounded-xl font-bold text-lg shadow-md transition-colors ${mode.id === 'classic' ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white group-hover:from-orange-400 group-hover:to-rose-400' : 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100'}`}>
                {mode.buttonText}
            </div>
        </button>
    );
}
