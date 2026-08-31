import React, { useState, useEffect } from 'react';
import { database } from '../../services/database/DatabaseAdapter';
import { Flag, MessageSquare, CheckCircle, XCircle } from 'lucide-react';

export default function ReportList() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const allReports = await database.query('reports');

            // Sort by createdAt descending and limit to 50
            const sortedReports = allReports
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                .slice(0, 50)
                .map(report => ({
                    ...report,
                    createdAt: new Date(report.createdAt || Date.now())
                }));

            setReports(sortedReports);
        } catch (error) {
            console.error("Error fetching reports:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Flag className="text-red-400" size={20} />
                    問題回報中心
                </h3>
                <button
                    onClick={fetchReports}
                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                    重新整理
                </button>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">載入中...</div>
                ) : reports.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">目前沒有待處理的回報</div>
                ) : (
                    <div className="divide-y divide-slate-700">
                        {reports.map(report => (
                            <div key={report.id} className="p-4 hover:bg-slate-700/30 transition">
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${report.type === 'error' ? 'bg-red-900/30 text-red-400 border-red-800' :
                                        'bg-yellow-900/30 text-yellow-400 border-yellow-800'
                                        }`}>
                                        {report.reason || '其他問題'}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {report.createdAt.toLocaleString()}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                        <p className="text-slate-300 font-medium text-sm mb-1">
                                            {report.question?.question}
                                        </p>
                                        <div className="flex gap-2 text-xs text-slate-500">
                                            <span>ID: {report.questionId}</span>
                                            <span>•</span>
                                            <span>{report.question?.book} {report.question?.chapter}章</span>
                                        </div>
                                    </div>

                                    {report.comment && (
                                        <div className="flex gap-2 text-sm text-slate-400 bg-slate-700/30 p-2 rounded">
                                            <MessageSquare size={16} className="shrink-0 mt-0.5" />
                                            <p>{report.comment}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
