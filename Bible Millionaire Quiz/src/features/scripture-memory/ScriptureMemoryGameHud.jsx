import React from 'react';
import { ArrowLeft, Heart, Timer } from 'lucide-react';
import ScriptureMemoryCoinBalance from './ScriptureMemoryCoinBalance';
import './ScriptureMemoryGameHud.css';

function clampedLives(value) {
    return Math.max(0, Math.min(3, Number(value) || 0));
}

export default function ScriptureMemoryGameHud({
    onLeave,
    lives = 3,
    multiplier = 1,
    streak = 0,
    elapsedMs = 0,
    coins = 0
}) {
    const remainingLives = clampedLives(lives);
    const seconds = (Math.max(0, Number(elapsedMs) || 0) / 1000).toFixed(1);

    return (
        <header className="scripture-memory-game-hud" aria-label="遊戲狀態">
            <button type="button" className="scripture-memory-game-hud__leave" onClick={onLeave} aria-label="離開本局">
                <ArrowLeft aria-hidden="true" />
                <span>離開</span>
            </button>
            <div className="scripture-memory-game-hud__metric is-lives">
                <small>生命</small>
                <span aria-label={`剩餘 ${remainingLives} 顆愛心`}>
                    {[0, 1, 2].map(index => (
                        <Heart key={index} className={index < remainingLives ? 'is-active' : ''} aria-hidden="true" />
                    ))}
                </span>
            </div>
            <div className="scripture-memory-game-hud__metric">
                <small>倍率</small>
                <strong className="is-multiplier">×{Math.max(1, Number(multiplier) || 1)}</strong>
            </div>
            <div className="scripture-memory-game-hud__metric">
                <small>連續</small>
                <strong>{Math.max(0, Number(streak) || 0)} 片</strong>
            </div>
            <div className="scripture-memory-game-hud__metric is-time">
                <small>時間</small>
                <strong><Timer aria-hidden="true" />{seconds}</strong>
            </div>
            <ScriptureMemoryCoinBalance coins={coins} variant="dark" />
        </header>
    );
}
