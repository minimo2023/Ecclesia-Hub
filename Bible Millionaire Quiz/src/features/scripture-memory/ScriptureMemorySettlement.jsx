import React from 'react';
import { Coins, Timer, Trophy } from 'lucide-react';
import './ScriptureMemorySettlement.css';

function formatDuration(milliseconds) {
    const value = Math.max(0, Number(milliseconds) || 0);
    return `${(value / 1000).toFixed(1)} 秒`;
}

function settlementCopy(reward, completed) {
    if (reward?.localOnly && reward?.awarded) {
        return completed ? {
            title: `獲得 ${reward.coins} 枚訪客智匯金幣`,
            detail: '片段與通關加成已暫存在此瀏覽器；離開遊戲區時會再次提醒。'
        } : {
            title: `已保留 ${reward.coins} 枚訪客智匯金幣`,
            detail: '答對片段已即時入帳，可在本次瀏覽器工作階段的遊戲中使用。'
        };
    }
    if (reward?.reason === 'MEMBER_REQUIRED' || reward?.eligible === false) {
        return {
            title: '登入會員可獲得挑戰金幣',
            detail: '訪客仍可完整遊玩；登入後每答對一片就會立即入帳。'
        };
    }
    if (!completed) {
        if (reward?.awarded && Number(reward.coins) > 0) {
            return {
                title: `已保留 ${reward.coins} 枚智匯金幣`,
                detail: '答對片段的金幣已即時入帳；未完成不發放通關、時間與速度加成。'
            };
        }
        if (reward?.reason === 'RANGE_ALREADY_REWARDED_TODAY') {
            return {
                title: '本段今日已有金幣交易紀錄',
                detail: '本次仍會保留遊戲進度與時間，但不會重複發放金幣。'
            };
        }
        return {
            title: '本次不發放金幣',
            detail: '尚未答對可入帳的片段；可重新挑戰。'
        };
    }
    if (reward?.awarded) {
        return {
            title: `獲得 ${reward.coins} 枚智匯金幣`,
            detail: '片段金幣已逐次入帳，通關與表現加成也已完成結算。'
        };
    }
    if (reward?.reason === 'RANGE_ALREADY_REWARDED_TODAY') {
        return {
            title: '本段今日已有金幣交易紀錄',
            detail: reward.newBest
                ? '沒有重複發幣，但已刷新這一段的今日最佳時間。'
                : '重玩不重複發幣，仍會保留較快的完成時間。'
        };
    }
    return {
        title: '本次沒有發放金幣',
        detail: '遊戲結果已保留，可再次挑戰。'
    };
}

export default function ScriptureMemorySettlement({ reward, completed = true, variant = 'light' }) {
    const copy = settlementCopy(reward, completed);
    const breakdown = reward?.breakdown;
    const items = breakdown ? [
        ['答對片段', breakdown.correctCoins],
        ...(breakdown.completionCoins > 0 ? [['完成挑戰', breakdown.completionCoins]] : []),
        ...(breakdown.timeBonus > 0 ? [['時間獎勵', breakdown.timeBonus]] : []),
        ...(breakdown.uninterruptedBonus > 0 ? [['全程無誤', breakdown.uninterruptedBonus]] : []),
        ...(breakdown.speedBonus > 0 ? [['快速 20% 進位', breakdown.speedBonus]] : [])
    ].filter(([, value]) => Number(value) > 0) : [];

    return (
        <section
            className={`scripture-memory-settlement is-${variant}${completed ? '' : ' is-failed'}`}
            role="status"
            aria-live="polite"
        >
            <div className="scripture-memory-settlement__summary">
                <span className="scripture-memory-settlement__icon"><Coins aria-hidden="true" /></span>
                <span>
                    <strong>{copy.title}</strong>
                    <small>{copy.detail}</small>
                </span>
            </div>

            {reward?.awarded && items.length > 0 ? (
                <dl className="scripture-memory-settlement__breakdown" aria-label="金幣計算明細">
                    {items.map(([label, value]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>+{value}</dd>
                        </div>
                    ))}
                    <div className="is-total">
                        <dt>本次合計</dt>
                        <dd>{reward.coins}</dd>
                    </div>
                </dl>
            ) : null}

            {completed && reward?.eligible && reward.bestDurationMs > 0 ? (
                <div className="scripture-memory-settlement__record">
                    {reward.newBest ? <Trophy aria-hidden="true" /> : <Timer aria-hidden="true" />}
                    <span>{reward.newBest ? '今日最佳' : '今日最佳時間'} <strong>{formatDuration(reward.bestDurationMs)}</strong></span>
                </div>
            ) : null}

            {reward?.awarded && Number.isFinite(Number(reward.balance)) ? (
                <p className="scripture-memory-settlement__balance">目前餘額：{reward.balance} 枚</p>
            ) : null}
        </section>
    );
}
