import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { soundManager } from '../utils/SoundManager';

export default function VolumeControl({ variant = 'default' }) {
    const [volume, setVolume] = useState(() => soundManager.getVolume());
    const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
    const [lastVolume, setLastVolume] = useState(0.7);

    // Initial sync
    useEffect(() => {
        setVolume(soundManager.getVolume());
        setIsMuted(soundManager.isMuted());
    }, []);

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        soundManager.setVolume(newVolume);
        
        if (newVolume > 0 && isMuted) {
            soundManager.unmute();
            setIsMuted(false);
        } else if (newVolume === 0 && !isMuted) {
            soundManager.mute();
            setIsMuted(true);
        }
    };

    const toggleMute = () => {
        if (isMuted) {
            // Unmute: Restore last volume or default 0.7
            const restoreVol = lastVolume > 0 ? lastVolume : 0.7;
            setVolume(restoreVol);
            soundManager.setVolume(restoreVol);
            soundManager.unmute();
            setIsMuted(false);
        } else {
            // Mute: Save current volume then set to 0
            setLastVolume(volume);
            setVolume(0);
            soundManager.mute();
            setIsMuted(true);
        }
    };

    // Simple Variant (Mobile) - Keep it centered and simple
    if (variant === 'simple') {
        return (
            <button
                onClick={toggleMute}
                className={`p-3 rounded-2xl transition-all active:scale-95 ${isMuted ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'}`}
                title={isMuted ? "開啟音效" : "關閉音效"}
            >
                {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
        );
    }

    // Default Variant (Desktop) - Hover to Expand
    return (
        <div className="group relative flex items-center bg-slate-900/40 backdrop-blur-md rounded-full border border-white/10 p-1 transition-all duration-500 hover:bg-slate-800/80 hover:border-amber-500/30 shadow-xl overflow-hidden">
            {/* Left Mute/Unmute Button */}
            <button
                onClick={toggleMute}
                className={`z-10 p-2 rounded-full transition-all duration-300 ${isMuted ? 'text-slate-500 hover:text-slate-300' : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'}`}
                title={isMuted ? "取消靜音" : "靜音"}
            >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            {/* Hover Expandable Slider Container */}
            <div className="w-0 group-hover:w-32 transition-all duration-500 ease-out overflow-hidden flex items-center">
                <div className="w-28 px-2 flex items-center h-full">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                        style={{
                            background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${volume * 100}%, #334155 ${volume * 100}%, #334155 100%)`
                        }}
                    />
                </div>
            </div>

            {/* Volume Percentage - Only visible when expanded */}
            <span className="w-0 group-hover:w-10 text-[10px] font-mono text-amber-500/80 opacity-0 group-hover:opacity-100 transition-all duration-500 select-none text-right pr-3">
                {Math.round(volume * 100)}%
            </span>
        </div>
    );
}
