import React from 'react';
import { PRIZE_LEVELS } from '../data/constants';

export default function MoneyLadder({ currentLevel }) {
    // Reverse levels to show highest at top
    const levels = [...PRIZE_LEVELS].reverse();

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 w-full md:w-64 shadow-xl">
            <h3 className="text-yellow-500 font-bold text-center mb-4 border-b border-slate-700 pb-2">
                獎金階梯
            </h3>
            <div className="space-y-1">
                {levels.map((level, index) => {
                    // Calculate actual level index (0-14) from reversed index
                    const actualLevelIndex = 14 - index;
                    const isCurrent = actualLevelIndex === currentLevel;
                    const isPassed = actualLevelIndex < currentLevel;
                    const isSafe = level.safe;

                    let rowClass = "flex justify-between items-center px-3 py-1 rounded ";

                    if (isCurrent) {
                        rowClass += "bg-yellow-600 text-white font-bold border border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.5)] transform scale-105 transition-transform";
                    } else if (isPassed) {
                        rowClass += "text-green-400 opacity-60";
                    } else {
                        if (isSafe) {
                            rowClass += "text-white font-semibold";
                        } else {
                            rowClass += "text-slate-400";
                        }
                    }

                    return (
                        <div key={actualLevelIndex} className={rowClass}>
                            <span className={`text-sm ${isCurrent ? 'text-yellow-200' : 'text-slate-500'}`}>
                                {actualLevelIndex + 1}
                            </span>
                            <span className={isSafe && !isPassed && !isCurrent ? "text-yellow-500" : ""}>
                                ${level.value.toLocaleString()}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
