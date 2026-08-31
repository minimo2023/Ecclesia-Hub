import React from 'react';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';
import { Smartphone, RotateCw } from 'lucide-react';

/**
 * OrientationGuard - optionally enforces landscape orientation on mobile devices.
 */
export default function OrientationGuard({ children, forceLandscape = false }) {
    const { isMobile, isPortrait } = useDeviceDetection();

    // Show guard only if on mobile AND in portrait mode
    if (forceLandscape && isMobile && isPortrait) {
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-8 text-center overflow-hidden">
                {/* Visual Backdrop */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600 blur-[120px] rounded-full" />
                </div>

                <div className="relative z-10 space-y-8 animate-in fade-in zoom-in duration-500">
                    {/* Device Animation */}
                    <div className="relative w-32 h-32 mx-auto">
                        <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-pulse" />
                        <div className="relative flex items-center justify-center h-full">
                            <div className="relative animate-bounce">
                                <Smartphone className="w-16 h-16 text-amber-500" />
                                <div className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-lg animate-spin-slow">
                                    <RotateCw className="w-5 h-5 text-slate-900" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-2xl font-black text-white tracking-widest uppercase">請旋轉您的行動裝置</h2>
                        <div className="h-1 w-12 bg-amber-500 mx-auto rounded-full" />
                        <p className="text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
                            聖經智匯現已升級為「沉浸式全橫向」體驗。請將手機轉至橫向，以獲得最完美的遊戲佈局。
                        </p>
                    </div>

                    <div className="pt-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700 text-xs font-bold text-slate-500 italic">
                            Landscape Only Mode / v3.0 Powered
                        </div>
                    </div>
                </div>
                
                {/* Prevent any touch propagation */}
                <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
            </div>
        );
    }

    // Otherwise render children normally
    return children;
}
