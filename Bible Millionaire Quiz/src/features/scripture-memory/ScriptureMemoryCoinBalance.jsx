import React from 'react';
import { Coins } from 'lucide-react';
import './ScriptureMemoryCoinBalance.css';

export default function ScriptureMemoryCoinBalance({ coins = 0, variant = 'light' }) {
    const balance = Math.max(0, Number(coins) || 0);
    const formatted = balance.toLocaleString('zh-TW');
    return (
        <div
            className={`scripture-memory-coin-balance is-${variant}`}
            aria-label={`智匯金幣庫存 ${formatted} 枚`}
        >
            <Coins aria-hidden="true" />
            <span>
                <small>金幣庫存</small>
                <strong>{formatted}</strong>
            </span>
        </div>
    );
}

