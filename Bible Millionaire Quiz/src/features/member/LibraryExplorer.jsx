/**
 * LibraryExplorer - 經文探索
 * 模式選擇入口：自由閱讀 vs 聖經導讀
 */
import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Map, Sparkles } from 'lucide-react';
import ScriptureReader from './ScriptureReader';

export default function LibraryExplorer({ onBack }) {
    const [mode, setMode] = useState(null); // null = 選擇模式, 'free' = 自由閱讀, 'guided' = 聖經導讀

    // 返回模式選擇
    const handleBackToModeSelection = () => {
        setMode(null);
    };

    // 模式選擇畫面
    const renderModeSelection = () => (
        <div className="min-h-screen bg-stone-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-stone-500" />
                </button>
                <h1 className="text-lg font-bold text-stone-800">📖 經文探索</h1>
            </div>

            {/* Mode Cards */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="max-w-md w-full space-y-4">
                    <h2 className="text-center text-stone-600 mb-6">選擇閱讀模式</h2>

                    {/* 自由閱讀 */}
                    <button
                        onClick={() => setMode('free')}
                        className="w-full bg-white rounded-2xl p-6 border border-stone-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left group"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                <BookOpen className="w-7 h-7 text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-stone-800 mb-1">自由閱讀</h3>
                                <p className="text-sm text-stone-500 leading-relaxed">
                                    隨選經卷章節，多譯本對照，選取經文查詢
                                </p>
                            </div>
                        </div>
                    </button>

                    {/* 聖經導讀 */}
                    <button
                        onClick={() => setMode('guided')}
                        className="w-full bg-white rounded-2xl p-6 border border-stone-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all text-left group"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                                <Map className="w-7 h-7 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-stone-800 mb-1">聖經導讀</h3>
                                <p className="text-sm text-stone-500 leading-relaxed">
                                    系統查經旅程，逐段閱讀，配合導讀與反思
                                </p>
                                <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                                    敬請期待
                                </span>
                            </div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );

    // 聖經導讀佔位畫面
    const renderGuidedReading = () => (
        <div className="min-h-screen bg-stone-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
                <button
                    onClick={handleBackToModeSelection}
                    className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-stone-500" />
                </button>
                <h1 className="text-lg font-bold text-stone-800">📚 聖經導讀</h1>
            </div>

            {/* Coming Soon */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-stone-800 mb-2">聖經導讀 · 敬請期待</h2>
                <p className="text-stone-500 max-w-xs">
                    系統查經旅程功能正在開發中，將提供逐段導讀與反思問題
                </p>
                <button
                    onClick={handleBackToModeSelection}
                    className="mt-6 px-6 py-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors"
                >
                    返回選擇
                </button>
            </div>
        </div>
    );

    // 根據模式渲染
    if (mode === 'free') {
        return <ScriptureReader onBack={handleBackToModeSelection} />;
    }
    if (mode === 'guided') {
        return renderGuidedReading();
    }
    return renderModeSelection();
}
