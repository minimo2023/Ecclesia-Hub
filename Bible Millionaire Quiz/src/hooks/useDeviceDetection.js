import { useState, useEffect } from 'react';

/**
 * Custom hook for detecting device type and screen orientation
 * @returns {Object} Device detection state and utilities
 */
// 靜態偵測：UA + 觸控，不隨 resize 變動
const detectMobileHardware = () => {
    const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
    return isTouchDevice || isMobileUA;
};

export function useDeviceDetection() {
    const isMobileHardware = detectMobileHardware();

    const [deviceInfo, setDeviceInfo] = useState({
        isMobile: false,
        isPortrait: false,
        screenSize: 'large',
        width: window.innerWidth,
        height: window.innerHeight
    });

    useEffect(() => {
        const detectDevice = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isPortrait = height > width;
            const isMobile = isMobileHardware || width < 768;

            let screenSize = 'large';
            if (width < 640) {
                screenSize = 'small';
            } else if (width < 1024) {
                screenSize = 'medium';
            }

            setDeviceInfo({ isMobile, isPortrait, screenSize, width, height });
        };

        detectDevice();

        window.addEventListener('resize', detectDevice);
        window.addEventListener('orientationchange', detectDevice);

        return () => {
            window.removeEventListener('resize', detectDevice);
            window.removeEventListener('orientationchange', detectDevice);
        };
    }, []);

    return {
        ...deviceInfo,
        useMobileInterface: isMobileHardware || deviceInfo.width < 1024,
    };
}
