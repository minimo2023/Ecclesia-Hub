import React from 'react';

export default function WarningModal({ message, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl p-8 max-w-md w-full mx-4 animate-slide-up">
                <div className="text-center mb-6">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-rose-600">
                        提醒
                    </h2>
                </div>

                <p className="text-slate-800 text-lg text-center mb-8">
                    {message}
                </p>

                <button
                    onClick={onClose}
                    className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold rounded-xl transition"
                >
                    我知道了
                </button>
            </div>
        </div>
    );
}
