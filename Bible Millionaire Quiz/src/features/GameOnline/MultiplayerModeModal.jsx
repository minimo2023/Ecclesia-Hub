import React from 'react';
import { X, Zap, Users, ArrowRight } from 'lucide-react';

const multiplayerModes = [
    {
        id: 'buzzer',
        icon: Zap,
        title: '搶答模式',
        subtitle: 'Buzzer Mode',
        description: '即時搶答、多人競賽',
        available: true,
        isNew: true
    },
    {
        id: 'team',
        icon: Users,
        title: '團隊合作',
        subtitle: 'Team Mode',
        description: '分組對戰、協力答題',
        available: true,
        isNew: true
    }
];

export default function MultiplayerModeModal({ isOpen, onClose, onSelectMode, isMobile }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 w-full max-w-lg border border-slate-700 shadow-2xl">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white transition-colors">
                    <X size={24} />
                </button>

                <div className="text-center mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                        🌐 連線模式
                    </h2>
                    <p className="text-slate-400">
                        {isMobile ? '選擇要加入的遊戲類型' : '選擇房間類型'}
                    </p>
                </div>

                <div className="space-y-4">
                    {multiplayerModes.map((mode) => {
                        const Icon = mode.icon;
                        const isAvailable = mode.available;

                        return (
                            <button
                                key={mode.id}
                                onClick={() => {
                                    console.log('🎯 Button clicked:', mode.id, 'available:', isAvailable);
                                    if (isAvailable) {
                                        console.log('✅ Calling onSelectMode');
                                        onSelectMode(mode.id);
                                    }
                                }}
                                disabled={!isAvailable}
                                className={`w-full p-4 md:p-5 rounded-2xl flex items-center gap-4 transition-all ${isAvailable
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 cursor-pointer'
                                    : 'bg-slate-700/50 cursor-not-allowed opacity-60'
                                    }`}
                            >
                                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${isAvailable ? 'bg-white/20' : 'bg-slate-600/50'
                                    }`}>
                                    <Icon className="w-7 h-7 text-white" />
                                </div>

                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-white">{mode.title}</h3>
                                        {mode.isNew && (
                                            <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">
                                                NEW
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-white/70 text-sm">{mode.description}</p>
                                </div>

                                {isAvailable && (
                                    <ArrowRight className="w-5 h-5 text-white/50" />
                                )}
                            </button>
                        );
                    })}
                </div>

                <p className="text-center text-slate-500 text-sm mt-6">
                    {isMobile ? '📱 使用手機加入房間參與遊戲' : '💻 使用電腦建立房間投影出題'}
                </p>
            </div>
        </div>
    );
}
