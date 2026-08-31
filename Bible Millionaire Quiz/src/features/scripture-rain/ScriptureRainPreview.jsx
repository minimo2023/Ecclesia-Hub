import React from 'react';
import { ArrowLeft, CheckCircle2, CloudRain, Play, ShieldCheck } from 'lucide-react';

export default function ScriptureRainPreview({ session, onBack, onStart }) {
    return (
        <section className="scripture-rain__preview-main" aria-labelledby="scripture-rain-preview-heading">
            <div className="scripture-rain__preview-heading">
                <span><CloudRain size={18} />遊戲準備完成</span>
                <h1 id="scripture-rain-preview-heading">{session.passage.title}</h1>
                <p>{session.passage.reference}・和合本</p>
            </div>

            <section className="scripture-rain__preview-card" aria-labelledby="scripture-rain-preview-title">
                <div className="scripture-rain__preview-card-heading">
                    <div>
                        <span>先熟悉經文順序</span>
                        <h2 id="scripture-rain-preview-title">完整經文</h2>
                    </div>
                    <strong>{session.fragmentCount} 片</strong>
                </div>
                <div className="scripture-rain__preview-verses">
                    {session.verses.map(verse => (
                        <p key={verse.verse}><sup>{verse.verse}</sup>{verse.text}</p>
                    ))}
                </div>
            </section>

            <div className="scripture-rain__readiness" aria-label="遊戲準備狀態">
                <span><CheckCircle2 size={17} />健康切片完成</span>
                <span><ShieldCheck size={17} />逐字重組通過</span>
                <span><ShieldCheck size={17} />遊戲中不呼叫 AI</span>
            </div>

            <div className="scripture-rain__preview-actions">
                <button type="button" onClick={onBack}><ArrowLeft size={18} />重新選擇</button>
                <button type="button" onClick={onStart}><Play className="fill-current" size={19} />開始落雨</button>
            </div>
        </section>
    );
}
