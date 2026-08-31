import React from 'react';

export default function ConfirmationModal({ books, chapterRange, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl border border-orange-200 shadow-2xl p-8 max-w-2xl w-full mx-4 animate-slide-up">
                <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">
                    ✅ 確認您的選擇
                </h2>

                <div className="bg-slate-100 rounded-xl p-6 mb-6 max-h-96 overflow-y-auto">
                    <p className="text-slate-700 mb-4 text-lg">
                        您已選擇以下經卷：
                    </p>

                    <ul className="space-y-2">
                        {books.map((book, index) => (
                            <li key={`${book}-${index}`} className="flex items-center text-slate-800 text-lg">
                                <span className="text-emerald-600 mr-3">✓</span>
                                <span className="font-bold">{book}</span>
                                {chapterRange && books.length === 1 && (
                                    <span className="ml-2 text-indigo-600">
                                        ({chapterRange.start}章 - {chapterRange.end}章)
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>

                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <p className="text-slate-600">
                            共 <span className="text-orange-600 font-bold">{books.length}</span> 卷
                        </p>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-800 text-lg font-bold rounded-xl transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 px-6 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-slate-800 text-lg font-bold rounded-xl shadow-lg transition"
                    >
                        確定開始！
                    </button>
                </div>
            </div>
        </div>
    );
}
