import React from 'react';
import { ChevronLeft, FileX, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function HistoryPage({ isTab = false }) {
    const navigate = useNavigate();

    return (
        <div className={`app-page flex flex-col ${isTab ? 'h-full' : 'flex-1 pb-safe animate-in slide-in-from-right-full duration-300'}`}>
            {/* Header */}
            {!isTab && (
                <header className="app-topbar flex items-center px-4 z-10 sticky top-0">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 active:bg-slate-100 rounded-full transition">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="flex-1 text-base font-black text-slate-900 tracking-wider text-center mr-6">歷史與錯題回顧</h1>
                </header>
            )}

            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                <div className="app-card flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6">
                        <FileX className="w-12 h-12 text-red-400" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800 mb-2">錯題回顧功能準備中</h2>
                    <p className="app-supporting mb-8">
                        錯題本與學習分析功能正在準備中。
                    </p>

                    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                            <ShieldAlert size={14} /> 規劃中的功能
                        </h3>
                        <div className="space-y-3 text-sm font-medium text-slate-600">
                            <p className="flex items-center gap-2"><span className="text-indigo-400">•</span> 自動收錄錯題</p>
                            <p className="flex items-center gap-2"><span className="text-indigo-400">•</span> 依經文與主題篩選</p>
                            <p className="flex items-center gap-2"><span className="text-indigo-400">•</span> 針對弱點安排複習</p>
                            <p className="flex items-center gap-2"><span className="text-indigo-400">•</span> 追蹤學習掌握度</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
