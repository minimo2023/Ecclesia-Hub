import { soundManager } from '../utils/SoundManager';

/**
 * Custom hook for managing game audio
 * Handles BGM transitions, countdown sounds, and answer SFX
 */
export function useGameAudio({ backgroundMusicEnabled = true } = {}) {

    /**
     * Play countdown sequence with sounds
     * @param {Function} setCountdown - State setter for countdown value
     * @param {Function} onComplete - Callback when countdown completes
     */
    const playCountdownSequence = (setCountdown, onComplete) => {
        // [V4.2 SOVEREIGN] 徹底清理音訊狀態：
        // 在倒數開始前停止所有聲音（包含 BGM 與正在播放的 Game Over/Win 長音效）。
        // 確保 3、2、1 音效與後續張力音樂絕對純淨，不與前場失敗/勝場音樂重疊。
        soundManager.stopAll();

        // 500ms 初始延遲保留給畫面切換動畫
        setTimeout(() => {
            setCountdown(3);
            soundManager.playCountdown();

            setTimeout(() => {
                setCountdown(2);
                soundManager.playCountdown();

                setTimeout(() => {
                    setCountdown(1);
                    soundManager.playCountdown();

                    setTimeout(() => {
                        // Start Game Buffer Phase
                        setCountdown("GO!");
                        soundManager.playGo();
                        if (backgroundMusicEnabled) soundManager.playBGM('tension');

                        // Buffer time for GO animation
                        setTimeout(() => {
                            setCountdown(null);
                            if (onComplete) {
                                onComplete();
                            }
                        }, 800); // 800ms buffer for GO animation
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 500); // Initial delay
    };

    /**
     * Play correct answer sound effect
     */
    const playCorrectSound = () => {
        soundManager.playCorrect();
    };

    /**
     * Play wrong answer sound effect
     */
    const playWrongSound = () => {
        soundManager.playWrong();
    };

    /**
     * Stop all sounds
     */
    const stopAllSounds = () => {
        soundManager.stopAll();
    };

    /**
     * Play background music
     * @param {string} trackName - Name of the track ('theme', 'tension', etc.)
     */
    const playBGM = (trackName) => {
        soundManager.playBGM(trackName);
    };

    /**
     * Play victory music
     */
    const playVictoryMusic = () => {
        soundManager.playWin();
    };

    /**
     * Play game over music
     */
    const playGameOverMusic = () => {
        soundManager.playGameOver();
    };

    return {
        playCountdownSequence,
        playCorrectSound,
        playWrongSound,
        stopAllSounds,
        playBGM,
        playVictoryMusic,
        playGameOverMusic
    };
}
