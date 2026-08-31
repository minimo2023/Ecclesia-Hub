import React, { useState, useEffect } from 'react';
import {
    Check,
    X,
    Edit2,
    Eye,
    AlertTriangle,
    ArrowRight,
    Save,
    FileText
} from 'lucide-react';

export default function ReviewQueue() {
    const [reviews, setReviews] = useState([]);
    const [selectedReview, setSelectedReview] = useState(null);
    const [loading, setLoading] = useState(true);

    // 模擬資料 (之後會換成真實 Firestore 查詢)
    const mockReviews = [
        {
            id: 'review_1',
            entityName: '愛因斯坦',
            type: 'person',
            confidence: 0.95,
            generatedAt: Date.now() - 3600000, // 1 hour ago
            aiModel: 'GPT-4o',
            issues: ['可能需要更多關於早期教育的細節'],
            content: {
                brief_description: '阿爾伯特·愛因斯坦（Albert Einstein，1879年3月14日－1955年4月18日）是一位德國出生的理論物理學家，他發展了相對論，這是現代物理學的兩大支柱之一。他的質能等價公式E=mc²成為世界上最著名的方程式。',
                life_events: [
                    { year: 1879, event: '出生於德國烏爾姆', source_ref: '傳記A' },
                    { year: 1905, event: '發表了四篇劃時代的論文，包括狹義相對論', source_ref: '科學期刊B' },
                    { year: 1921, event: '因對理論物理學的貢獻，特別是發現光電效應定律，獲得諾貝爾物理學獎', source_ref: '諾貝爾委員會' },
                    { year: 1933, event: '因納粹黨上台而移居美國，在普林斯頓高等研究院任職', source_ref: '歷史文獻C' },
                    { year: 1955, event: '在美國普林斯頓逝世', source_ref: '訃告D' },
                ]
            },
            provenance: [
                { ref: 'Wikipedia', quote: 'Albert Einstein was a German-born theoretical physicist...' },
                { ref: 'Biography.com', quote: 'Einstein developed the theory of relativity...' }
            ]
        },
        // ... (Keep other mock data or fetch real data)
    ];

    useEffect(() => {
        const fetchReviews = async () => {
            try {
                // Use DatabaseAdapter to query
                // const realReviews = await database.query('encyclopedia_drafts', { status: 'pending_review' });
                // if (realReviews.length > 0) {
                //     setReviews(realReviews);
                // } else {
                setReviews(mockReviews);
                // }
            } catch (error) {
                console.error("Error fetching reviews:", error);
                setReviews(mockReviews); // Fallback to mock
            } finally {
                setLoading(false);
            }
        };
        fetchReviews();
    }, []);

    const handleApprove = async (review) => {
        if (window.confirm(`確定要發布 "${review.entityName}" 嗎？`)) {
            try {
                // 1. Update status in drafts
                // await database.save('encyclopedia_drafts', review.id, { status: 'published' });

                // 2. Add to knowledgeGraph (real implementation would go here)
                // await database.save('knowledgeGraph', review.entityName, review.content);

                alert('已發布！');
                setReviews(reviews.filter(r => r.id !== review.id));
                setSelectedReview(null);
            } catch (error) {
                console.error("Error approving review:", error);
                alert('發布失敗');
            }
        }
    };

    const handleReject = async (review) => {
        if (window.confirm(`確定要拒絕 "${review.entityName}" 嗎？`)) {
            try {
                // await database.save('encyclopedia_drafts', review.id, { status: 'rejected' });
                alert('已拒絕');
                setReviews(reviews.filter(r => r.id !== review.id));
                setSelectedReview(null);
            } catch (error) {
                console.error("Error rejecting review:", error);
                alert('操作失敗');
            }
        }
    };

    return (
        <div className="flex h-[calc(100vh-200px)] gap-6">
            {/* List Column */}
            <div className="w-full md:w-1/3 bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden flex flex-col hidden md:flex">
                <div className="p-4 border-b border-stone-100 bg-stone-50">
                    <h3 className="font-bold text-stone-700">待審核項目 ({reviews.length})</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {reviews.map(review => (
                        <div
                            key={review.id}
                            onClick={() => setSelectedReview(review)}
                            className={`p-4 rounded-xl cursor-pointer transition-all border ${selectedReview?.id === review.id
                                ? 'bg-amber-50 border-amber-200 shadow-sm'
                                : 'bg-white border-stone-100 hover:border-amber-200 hover:bg-stone-50'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-stone-800">{review.entityName}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${review.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                    {(review.confidence * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="text-xs text-stone-500 flex justify-between">
                                <span>{review.type.toUpperCase()}</span>
                                <span>{new Date(review.generatedAt).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Mobile List View (Only visible when no selection) */}
            <div className={`w-full bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden flex flex-col md:hidden ${selectedReview ? 'hidden' : 'flex'}`}>
                <div className="p-4 border-b border-stone-100 bg-stone-50">
                    <h3 className="font-bold text-stone-700">待審核項目 ({reviews.length})</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {reviews.map(review => (
                        <div
                            key={review.id}
                            onClick={() => setSelectedReview(review)}
                            className="p-4 rounded-xl cursor-pointer bg-white border border-stone-100 hover:bg-stone-50"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-stone-800">{review.entityName}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${review.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {(review.confidence * 100).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>


            {/* Detail Column */}
            <div className={`flex-1 bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden flex flex-col ${!selectedReview ? 'hidden md:flex' : 'flex'}`}>
                {selectedReview ? (
                    <>
                        {/* Toolbar */}
                        <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedReview(null)} className="md:hidden text-stone-500">
                                    <ArrowRight className="rotate-180" size={20} />
                                </button>
                                <h2 className="text-xl font-bold text-stone-800">{selectedReview.entityName}</h2>
                                <div className="hidden md:flex gap-2">
                                    <span className="text-xs bg-stone-200 text-stone-600 px-2 py-1 rounded-md">
                                        {selectedReview.aiModel}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleReject(selectedReview)}
                                    className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2 transition"
                                >
                                    <X size={18} /> <span className="hidden md:inline">拒絕</span>
                                </button>
                                <button
                                    onClick={() => handleApprove(selectedReview)}
                                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 transition shadow-sm"
                                >
                                    <Check size={18} /> <span className="hidden md:inline">批准</span>
                                </button>
                            </div>
                        </div>

                        {/* Content Preview */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8">
                            {/* Warnings */}
                            {selectedReview.issues.length > 0 && (
                                <div className="mb-6 bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                                    <h4 className="flex items-center gap-2 text-yellow-800 font-bold mb-2">
                                        <AlertTriangle size={18} />
                                        AI 標記的潛在問題
                                    </h4>
                                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                                        {selectedReview.issues.map((issue, idx) => (
                                            <li key={idx}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* Main Content */}
                                <div className="lg:col-span-2 prose max-w-none">
                                    <div className="mb-6">
                                        <label className="block text-sm font-bold text-stone-400 mb-2 uppercase tracking-wider">簡介</label>
                                        <div className="p-4 bg-stone-50 rounded-xl border border-stone-100 text-stone-800 leading-relaxed">
                                            {selectedReview.content.brief_description}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-stone-400 mb-2 uppercase tracking-wider">生平事件</label>
                                        <div className="space-y-3">
                                            {selectedReview.content.life_events.map((event, idx) => (
                                                <div key={idx} className="flex gap-4 p-3 bg-white border border-stone-100 rounded-lg hover:border-amber-200 transition group">
                                                    <span className="font-mono text-amber-600 font-bold w-20 shrink-0">{event.year}</span>
                                                    <span className="text-stone-700 flex-1">{event.event}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Provenance Sidebar */}
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-stone-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                                            <FileText size={14} />
                                            資料來源
                                        </label>
                                        <div className="bg-stone-50 rounded-xl border border-stone-100 p-4 space-y-3">
                                            {selectedReview.provenance.map((source, idx) => (
                                                <div key={idx} className="text-sm">
                                                    <div className="font-bold text-stone-700 mb-1 flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                        {source.ref}
                                                    </div>
                                                    <p className="text-stone-500 italic pl-3.5 border-l-2 border-stone-200">
                                                        "{source.quote}"
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
                        <Eye size={48} className="mb-4 opacity-20" />
                        <p>請從左側選擇一個項目進行審核</p>
                    </div>
                )}
            </div>
        </div>
    );
}
