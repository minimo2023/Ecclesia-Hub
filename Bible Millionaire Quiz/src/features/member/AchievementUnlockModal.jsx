/**
 * AchievementUnlockModal - 成就解鎖通知彈窗
 */
import React, { useEffect, useState } from 'react';

export default function AchievementUnlockModal({ achievements, onClose }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(true);

    useEffect(() => {
        if (!achievements || achievements.length === 0) return;

        // Auto-advance after delay
        const timer = setTimeout(() => {
            if (currentIndex < achievements.length - 1) {
                setIsAnimating(false);
                setTimeout(() => {
                    setCurrentIndex(prev => prev + 1);
                    setIsAnimating(true);
                }, 300);
            } else {
                // All shown, close after delay
                setTimeout(onClose, 2000);
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [currentIndex, achievements, onClose]);

    if (!achievements || achievements.length === 0) return null;

    const current = achievements[currentIndex];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
            <div
                className={`relative bg-gradient-to-br from-yellow-900/90 to-amber-950/90 rounded-3xl p-8 border-4 border-yellow-500 shadow-2xl shadow-yellow-500/30 max-w-sm w-full mx-4 text-center transform transition-all duration-300 ${isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            >
                {/* Confetti Effect */}
                <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                    <div className="absolute top-0 right-1/4 w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="absolute top-2 left-1/3 w-1 h-1 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    <div className="absolute top-4 right-1/3 w-1 h-1 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0.6s' }} />
                </div>

                {/* Header */}
                <div className="text-sm text-yellow-400 font-bold uppercase tracking-widest mb-2">
                    🎊 成就解鎖
                </div>

                {/* Icon */}
                <div className="text-7xl mb-4 animate-bounce">
                    {current.icon}
                </div>

                {/* Name */}
                <h2 className="text-2xl font-bold text-yellow-400 mb-2">
                    {current.name}
                </h2>

                {/* Description */}
                <p className="text-slate-300 text-lg mb-4">
                    {current.description}
                </p>

                {/* Progress indicator */}
                {achievements.length > 1 && (
                    <div className="flex justify-center gap-2 mb-4">
                        {achievements.map((_, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-yellow-400 w-4' : 'bg-slate-600'}`}
                            />
                        ))}
                    </div>
                )}

                {/* Close hint */}
                <p className="text-slate-500 text-sm">
                    自動關閉中...
                </p>

                {/* Manual close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
