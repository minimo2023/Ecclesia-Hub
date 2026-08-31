import React from 'react';
import { ArrowLeft, FileX } from 'lucide-react';

/**
 * 错题复习组件
 * TODO: 整合 LearningStatsService
 */
export default function WrongAnswersReview({ onBack }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 text-white">
            {/* Header */}
            <div className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold">📝 錯題複習</h1>
                        <p className="text-slate-400 text-sm">智能錯題管理系統</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="bg-red-900/30 border-2 border-red-500/50 rounded-2xl p-12 text-center">
                    <FileX className="w-24 h-24 mx-auto mb-6 text-red-400" />
                    <h2 className="text-3xl font-bold mb-4">功能開發中</h2>
                    <p className="text-lg text-slate-300 mb-6">
                        錯題本功能即將推出
                    </p>

                    <div className="max-w-2xl mx-auto text-left bg-slate-800/50 rounded-xl p-6 space-y-3">
                        <h3 className="font-bold text-red-300 mb-3">📋 規劃功能：</h3>
                        <div className="space-y-2 text-sm text-slate-300">
                            <p>✅ <strong>自動收錄</strong> - 遊戲中的錯題自動保存</p>
                            <p>✅ <strong>分類篩選</strong> - 按書卷、難度、主題篩選</p>
                            <p>✅ <strong>複習模式</strong> - 專注練習錯題</p>
                            <p>✅ <strong>掌握追蹤</strong> - 標記已掌握的題目</p>
                            <p>✅ <strong>智能推薦</strong> - 根據錯誤率推薦複習</p>
                            <p>✅ <strong>數據同步</strong> - Firestore 雲端保存</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
