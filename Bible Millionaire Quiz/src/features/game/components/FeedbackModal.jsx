import React, { useState } from 'react';
import { X, Send, MessageSquare, Bug, Lightbulb, HelpCircle } from 'lucide-react';

/**
 * 問題/建議回報 Modal
 * 讓玩家可以提交問題或建議
 */
export default function FeedbackModal({ isOpen, onClose }) {
    const [type, setType] = useState('suggestion'); // 'bug' | 'suggestion' | 'question'
    const [message, setMessage] = useState('');
    const [contact, setContact] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const types = [
        { id: 'bug', label: '問題回報', icon: Bug, color: 'text-red-400 bg-red-500/20 border-red-500/50' },
        { id: 'suggestion', label: '功能建議', icon: Lightbulb, color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50' },
        { id: 'question', label: '使用疑問', icon: HelpCircle, color: 'text-blue-400 bg-blue-500/20 border-blue-500/50' }
    ];

    const handleSubmit = async () => {
        if (!message.trim()) return;

        setSubmitting(true);
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    message: message.trim(),
                    contact: contact.trim() || null,
                    createdAt: Date.now(),
                    status: 'pending',
                    userAgent: navigator.userAgent
                })
            });

            if (response.ok) {
                setSubmitted(true);
                setTimeout(() => {
                    onClose();
                    // Reset after close
                    setTimeout(() => {
                        setSubmitted(false);
                        setMessage('');
                        setContact('');
                        setType('suggestion');
                    }, 300);
                }, 1500);
            } else {
                throw new Error('提交失敗');
            }
        } catch (error) {
            console.error('Feedback submission error:', error);
            alert('提交失敗，請稍後再試');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <MessageSquare className="text-purple-400" size={24} />
                        問題與建議
                    </h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {submitted ? (
                        <div className="py-12 text-center">
                            <div className="text-6xl mb-4">✅</div>
                            <h3 className="text-2xl font-bold text-green-400 mb-2">感謝您的回饋！</h3>
                            <p className="text-slate-400">我們會盡快處理您的意見</p>
                        </div>
                    ) : (
                        <>
                            {/* Type Selection */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">回報類型</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {types.map(t => {
                                        const Icon = t.icon;
                                        const isActive = type === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => setType(t.id)}
                                                className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${isActive ? t.color : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                                                    }`}
                                            >
                                                <Icon size={20} />
                                                <span className="text-xs font-medium">{t.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Message */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">詳細說明 *</label>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="請描述您遇到的問題或想法..."
                                    className="w-full h-32 px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                                />
                            </div>

                            {/* Contact (Optional) */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">聯絡方式（選填）</label>
                                <input
                                    type="text"
                                    value={contact}
                                    onChange={e => setContact(e.target.value)}
                                    placeholder="Email 或其他聯絡方式"
                                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                                />
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={!message.trim() || submitting}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>提交中...</>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        提交意見
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
