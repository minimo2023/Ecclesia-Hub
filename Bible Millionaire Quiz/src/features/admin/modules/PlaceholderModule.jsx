import React from 'react';

/**
 * 通用管理模組占位符 (v1.5)
 */
export default function PlaceholderModule({ title, description }) {
    return (
        <div className="bg-white rounded-3xl p-10 border border-stone-100 shadow-sm min-h-[400px] flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-stone-50 rounded-2xl flex items-center justify-center mb-6">
                <span className="text-4xl opacity-50">🏗️</span>
            </div>
            <h2 className="text-2xl font-bold text-stone-800 mb-2">{title}</h2>
            <p className="text-stone-500 max-w-md mx-auto mb-8">
                {description || '此模組正在根據《Governor 360 系統規劃書 v3.0》進行深度開發中。'}
            </p>
            <div className="flex gap-3">
                <div className="px-4 py-1.5 bg-stone-100 text-stone-400 text-xs font-bold rounded-full uppercase tracking-wider">
                    Phase 4
                </div>
                <div className="px-4 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-full uppercase tracking-wider">
                    In Development
                </div>
            </div>
        </div>
    );
}
