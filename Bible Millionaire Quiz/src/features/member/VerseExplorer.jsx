import React from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';

/**
 * 经文探索组件 - 整合信望愛 API
 * TODO: 整合 BibleAPIService
 */
export default function VerseExplorer({ onBack }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 text-white">
            {/* Header */}
            <div className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold">📖 經文探索</h1>
                        <p className="text-slate-400 text-sm">深入研讀聖經 • 原文分析 • 註釋串珠</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Coming Soon Notice */}
                <div className="bg-blue-900/30 border-2 border-blue-500/50 rounded-2xl p-12 text-center">
                    <BookOpen className="w-24 h-24 mx-auto mb-6 text-blue-400" />
                    <h2 className="text-3xl font-bold mb-4">功能開發中</h2>
                    <p className="text-lg text-slate-300 mb-6">
                        經文探索功能即將推出
                    </p>

                    <div className="max-w-2xl mx-auto text-left bg-slate-800/50 rounded-xl p-6 space-y-3">
                        <h3 className="font-bold text-blue-300 mb-3">📋 規劃功能：</h3>
                        <div className="space-y-2 text-sm text-slate-300">
                            <p>✅ <strong>多譯本對照</strong> - 和合本、現代中文譯本等</p>
                            <p>✅ <strong>原文編號</strong> - Strong's Number 希伯來文/希臘文</p>
                            <p>✅ <strong>原文字典</strong> - 詞彙分析與解釋</p>
                            <p>✅ <strong>經文註釋</strong> - 深入背景與神學解釋</p>
                            <p>✅ <strong>串珠功能</strong> - 相關經文快速查詢</p>
                            <p>✅ <strong>關鍵字搜尋</strong> - 全聖經經文搜索</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
