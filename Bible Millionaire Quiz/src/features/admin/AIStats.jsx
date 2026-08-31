import React, { useState, useEffect } from 'react';
import { database } from '../../services/database/DatabaseAdapter';
import { Bot, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export default function AIStats() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const allLogs = await database.query('ai_logs');

            // Sort by timestamp descending and limit to 50
            const sortedLogs = allLogs
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 50)
                .map(log => ({
                    ...log,
                    timestamp: new Date(log.timestamp || Date.now())
                }));

            setLogs(sortedLogs);
        } catch (error) {
            console.error("Error fetching AI logs:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const getIcon = (type) => {
        switch (type) {
            case 'duplicate_rejected': return <AlertTriangle size={16} className="text-yellow-400" />;
            case 'generation_success': return <CheckCircle size={16} className="text-green-400" />;
            case 'generation_failed': return <AlertTriangle size={16} className="text-red-400" />;
            default: return <Bot size={16} className="text-blue-400" />;
        }
    };

    const getLabel = (type) => {
        switch (type) {
            case 'duplicate_rejected': return '攔截重複';
            case 'generation_success': return '生成成功';
            case 'generation_failed': return '生成失敗';
            default: return type;
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Bot className="text-purple-400" size={20} />
                    AI 運作監控
                </h3>
                <button
                    onClick={fetchLogs}
                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                    重新整理
                </button>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">載入中...</div>
                ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">尚無 AI 運作紀錄</div>
                ) : (
                    <div className="divide-y divide-slate-700">
                        {logs.map(log => (
                            <div key={log.id} className="p-4 hover:bg-slate-700/30 transition text-sm">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                        {getIcon(log.type)}
                                        <span className={`font-bold ${log.type === 'duplicate_rejected' ? 'text-yellow-400' :
                                            log.type === 'generation_failed' ? 'text-red-400' :
                                                'text-slate-300'
                                            }`}>
                                            {getLabel(log.type)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-500 text-xs">
                                        <Clock size={12} />
                                        {log.timestamp.toLocaleString()}
                                    </div>
                                </div>

                                <div className="pl-6 space-y-1">
                                    {log.type === 'duplicate_rejected' && (
                                        <>
                                            <div className="text-slate-300">
                                                <span className="text-slate-500">新題：</span>
                                                {log.details.newQuestion}
                                            </div>
                                            <div className="text-slate-400 text-xs">
                                                <span className="text-slate-600">重複：</span>
                                                {log.details.existingQuestion}
                                                <span className="ml-2 bg-slate-700 px-1 rounded">
                                                    相似度: {(log.details.similarity * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {log.type !== 'duplicate_rejected' && (
                                        <pre className="text-xs text-slate-400 overflow-x-auto">
                                            {JSON.stringify(log.details, null, 2)}
                                        </pre>
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
