import React, { useState, useEffect } from 'react';

export default function OrientationGuard({ children, forceLandscape = false }) {
    const [isPortrait, setIsPortrait] = useState(false);

    useEffect(() => {
        // Only check orientation if forceLandscape is true
        if (!forceLandscape) {
            setIsPortrait(false);
            return;
        }

        const checkOrientation = () => {
            // 检测是否为竖屏（高度大于宽度）且是移动设备尺寸
            const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 768;
            setIsPortrait(portrait);
        };

        // 初始检测
        checkOrientation();

        // 监听窗口大小变化和方向变化
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);

        return () => {
            window.removeEventListener('resize', checkOrientation);
            window.removeEventListener('orientationchange', checkOrientation);
        };
    }, [forceLandscape]);

    // 如果是竖屏且强制横屏，显示提示遮罩
    if (isPortrait && forceLandscape) {
        return (
            <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50 p-8">
                <div className="text-center animate-fade-in">
                    {/* 旋转手机图标动画 */}
                    <div className="mb-8 flex justify-center">
                        <div className="relative">
                            <div className="text-8xl animate-bounce">📱</div>
                            <div className="absolute top-0 right-0 text-6xl animate-spin-slow">↻</div>
                        </div>
                    </div>

                    {/* 提示文字 */}
                    <h2 className="text-3xl md:text-4xl font-bold text-yellow-500 mb-4">
                        請旋轉您的裝置
                    </h2>
                    <p className="text-xl md:text-2xl text-slate-300">
                        本遊戲需要橫向顯示以獲得最佳體驗
                    </p>
                    <p className="text-lg text-slate-400 mt-4">
                        請將手機轉為橫向模式
                    </p>
                </div>
            </div>
        );
    }

    // 横屏或桌面设备，或者不强制横屏，显示正常内容
    return <>{children}</>;
}
