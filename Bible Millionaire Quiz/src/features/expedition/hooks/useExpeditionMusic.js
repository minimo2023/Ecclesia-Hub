import { useEffect, useRef } from 'react';
import { soundManager } from '../../../utils/SoundManager';

/**
 * 遠征模式音樂管理 Hook
 * 根據遊戲狀態和階段自動切換背景音樂
 */

// 遠征音樂配置
const EXPEDITION_MUSIC = {
    camp: ['/audio/入口營地.mp3'],
    1: ['/audio/平安平原.mp3', '/audio/平安平原2.mp3'], // 隨機輪播
    2: ['/audio/曠野行軍.mp3'],
    3: ['/audio/死蔭幽谷.mp3'],
    4: ['/audio/至聖之巔.mp3'],
    gameover: ['/audio/遠征結束.mp3']
};

// 從曲目列表中隨機選擇
function getRandomTrack(tracks) {
    if (!tracks || tracks.length === 0) return null;
    return tracks[Math.floor(Math.random() * tracks.length)];
}

export default function useExpeditionMusic(gameState, stage) {
    const currentTrackRef = useRef(null);
    const isFirstRender = useRef(true);

    useEffect(() => {
        let targetTracks;
        let targetKey;

        if (gameState === 'gameover') {
            targetTracks = EXPEDITION_MUSIC.gameover;
            targetKey = 'gameover';
        } else if (gameState === 'playing') {
            targetTracks = EXPEDITION_MUSIC[stage] || EXPEDITION_MUSIC[1];
            targetKey = `stage_${stage}`;
        } else {
            // Lobby/camp state
            targetTracks = EXPEDITION_MUSIC.camp;
            targetKey = 'camp';
        }

        // Skip if already playing this category
        if (currentTrackRef.current === targetKey) {
            return;
        }

        const newTrack = getRandomTrack(targetTracks);
        if (!newTrack) return;

        console.log(`🎵 [ExpeditionMusic] Switching to ${targetKey}: ${newTrack}`);
        currentTrackRef.current = targetKey;

        // First render: play directly with fade-in
        // Subsequent changes: fade out then play
        if (isFirstRender.current) {
            isFirstRender.current = false;
            soundManager.playBGMFromUrl(newTrack, true);
        } else {
            soundManager.switchBGM(newTrack, 800, true);
        }
    }, [gameState, stage]);

    // Cleanup: stop music when component unmounts
    useEffect(() => {
        return () => {
            console.log('🎵 [ExpeditionMusic] Cleanup: fading out');
            soundManager.fadeOutBGM(500);
        };
    }, []);
}
