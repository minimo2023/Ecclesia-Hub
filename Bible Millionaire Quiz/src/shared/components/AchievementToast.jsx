import React, { useState, useEffect } from 'react';
import { Trophy, X } from 'lucide-react';
import { soundManager } from '../../utils/SoundManager';

export default function AchievementToast() {
    const [achievements, setAchievements] = useState([]);

    useEffect(() => {
        const handleUnlock = (event) => {
            const achievement = event.detail;
            
            // Add to list
            setAchievements(prev => [...prev, { ...achievement, id: Date.now() + Math.random() }]);
            
            // Play sound if you have one, or just the standard win sound
            try {
                soundManager.playWin();
            } catch (e) { }
        };

        window.addEventListener('achievementUnlocked', handleUnlock);
        return () => window.removeEventListener('achievementUnlocked', handleUnlock);
    }, []);

    // Auto-remove after 5 seconds
    useEffect(() => {
        if (achievements.length > 0) {
            const timer = setTimeout(() => {
                setAchievements(prev => prev.slice(1));
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [achievements]);

    if (achievements.length === 0) return null;

    return (
        <div className="fixed top-4 left-0 right-0 flex flex-col items-center gap-2 z-50 pointer-events-none px-4">
            {achievements.map((achievement) => (
                <div 
                    key={achievement.id}
                    className="pointer-events-auto max-w-sm w-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl shadow-2xl p-4 flex items-start gap-4 animate-in slide-in-from-top fade-in duration-500"
                >
                    <div className="bg-white/20 p-2 rounded-full shrink-0">
                        <span className="text-2xl" role="img" aria-label="icon">{achievement.icon || '🏆'}</span>
                    </div>
                    <div className="flex-1 text-white">
                        <div className="flex items-center gap-2">
                            <h4 className="font-black text-lg">成就解鎖！</h4>
                        </div>
                        <p className="font-bold">{achievement.name}</p>
                        <p className="text-amber-100 text-sm mt-0.5 line-clamp-2">{achievement.description}</p>
                    </div>
                    <button 
                        onClick={() => setAchievements(prev => prev.filter(a => a.id !== achievement.id))}
                        className="text-white/60 hover:text-white shrink-0 p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            ))}
        </div>
    );
}
