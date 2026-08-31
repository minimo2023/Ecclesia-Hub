import React, { useState } from 'react';

export default function ReportModal({ question, onClose, onSubmit }) {
    const [reason, setReason] = useState([]);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        await onSubmit({
            questionId: question.id,
            questionContent: question.question,
            reason,
            comment,
            timestamp: new Date().toISOString()
        });
        setIsSubmitting(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-800 border border-red-500/50 rounded-2xl p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold"
                >
                    ✕
                </button>

                <h3 className="text-2xl font-bold text-red-400 mb-6 flex items-center gap-2">
                    🚨 回報問題
                </h3>

                <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                    <p className="text-slate-300 text-sm mb-2">題目：</p>
                    <p className="text-white font-bold">{question.question}</p>
                </div>

                <div className="space-y-4 mb-6">
                    <p className="text-slate-300">請協助檢核此題目的問題 (可複選)：</p>

                    <label className="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition">
                        <input
                            type="checkbox"
                            checked={reason.includes('meaning')}
                            onChange={(e) => {
                                if (e.target.checked) setReason([...reason, 'meaning']);
                                else setReason(reason.filter(r => r !== 'meaning'));
                            }}
                            className="w-5 h-5 text-red-500 bg-slate-600 border-slate-500 focus:ring-red-500 rounded"
                        />
                        <span className="text-white">題意不清 (題目語意模糊或有錯字)</span>
                    </label>

                    <label className="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition">
                        <input
                            type="checkbox"
                            checked={reason.includes('answer')}
                            onChange={(e) => {
                                if (e.target.checked) setReason([...reason, 'answer']);
                                else setReason(reason.filter(r => r !== 'answer'));
                            }}
                            className="w-5 h-5 text-red-500 bg-slate-600 border-slate-500 focus:ring-red-500 rounded"
                        />
                        <span className="text-white">答案錯誤 (標準答案不正確)</span>
                    </label>

                    <label className="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition">
                        <input
                            type="checkbox"
                            checked={reason.includes('correlation')}
                            onChange={(e) => {
                                if (e.target.checked) setReason([...reason, 'correlation']);
                                else setReason(reason.filter(r => r !== 'correlation'));
                            }}
                            className="w-5 h-5 text-red-500 bg-slate-600 border-slate-500 focus:ring-red-500 rounded"
                        />
                        <span className="text-white">關聯性低 (題目與答案缺乏邏輯關聯)</span>
                    </label>

                    <label className="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition">
                        <input
                            type="checkbox"
                            checked={reason.includes('other')}
                            onChange={(e) => {
                                if (e.target.checked) setReason([...reason, 'other']);
                                else setReason(reason.filter(r => r !== 'other'));
                            }}
                            className="w-5 h-5 text-red-500 bg-slate-600 border-slate-500 focus:ring-red-500 rounded"
                        />
                        <span className="text-white">其他問題</span>
                    </label>
                </div>

                <div className="mb-6">
                    <label className="block text-slate-300 mb-2">補充說明 (選填)：</label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none h-24 resize-none"
                        placeholder="請簡述問題細節..."
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isSubmitting ? '傳送中...' : '送出回報'}
                </button>
            </div>
        </div>
    );
}
