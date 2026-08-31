import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { Play, Square, Terminal, Download, RefreshCw, Layers } from 'lucide-react';

export default function CrawlerModule() {
    const [activeJob, setActiveJob] = useState(null);
    const [logs, setLogs] = useState([]);
    const logsEndRef = useRef(null);

    const sources = [
        { id: 'wldeh', name: '開源聖經數據庫 (GitHub)', desc: '原始 JSON 資料' },
        { id: 'fhl', name: '信望愛聖經資源網', desc: '和合本經文 (FHL)' },
        { id: 'biblia', name: 'Biblia 聖經工具', desc: '研讀資源' }
    ];

    useEffect(() => {
        if (activeJob) {
            const interval = setInterval(checkStatus, 1000);
            return () => clearInterval(interval);
        }
    }, [activeJob]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    async function startCrawl(source) {
        try {
            addLog(`[SYSTEM] Starting crawler for ${source}...`);
            const res = await fetch(`${API_BASE_URL}/api/admin/crawl/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source })
            });

            if (!res.ok) throw new Error('Start failed');

            const job = await res.json();
            setActiveJob(job);
            addLog(`[SYSTEM] Job started: ${job.jobId}`);
        } catch (error) {
            addLog(`[ERROR] ${error.message}`);
        }
    }

    async function checkStatus() {
        if (!activeJob) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/crawl/status/${activeJob.jobId}`);
            const status = await res.json();

            // Update logs if there's a new message
            if (status.message && status.message !== activeJob.message) {
                addLog(`[${status.source.toUpperCase()}] ${status.message}`);
            }

            setActiveJob(status);

            if (status.completed) {
                addLog(`[SYSTEM] Job completed successfully.`);
                setActiveJob(null);
            }
        } catch (error) {
            console.error(error);
        }
    }

    function addLog(msg) {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${time}] ${msg}`].slice(-50)); // Keep last 50 lines
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-140px)]">
            {/* Control Panel - Smaller */}
            <div className="lg:col-span-1 space-y-4 overflow-y-auto">
                <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm">
                    <h3 className="text-base font-bold text-stone-800 mb-3 flex items-center gap-2">
                        <Download size={18} className="text-amber-500" />
                        資料來源
                    </h3>
                    <div className="space-y-2">
                        {sources.map(source => (
                            <div key={source.id} className="bg-stone-50 p-3 rounded-xl border border-stone-100 hover:border-amber-200 transition-colors group">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-stone-800 text-sm">{source.name}</span>
                                    {activeJob?.source === source.id && (
                                        <span className="flex h-2 w-2 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-stone-500 mb-3 font-medium">{source.desc}</p>
                                <button
                                    onClick={() => startCrawl(source.id)}
                                    disabled={!!activeJob}
                                    className="w-full py-1.5 bg-white border border-stone-200 hover:bg-stone-800 hover:text-white hover:border-stone-800 text-stone-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-stone-100"
                                >
                                    <Play size={10} fill="currentColor" />
                                    執行任務
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm">
                    <h3 className="text-base font-bold text-stone-800 mb-3 flex items-center gap-2">
                        <Layers size={18} className="text-stone-400" />
                        全域操作
                    </h3>
                    <button
                        onClick={() => startCrawl('all')}
                        disabled={!!activeJob}
                        className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-stone-900/10 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={16} />
                        全部同步
                    </button>
                </div>
            </div>

            {/* Terminal Output - Larger */}
            <div className="lg:col-span-4 bg-stone-900 rounded-xl border border-stone-800 p-4 font-mono text-sm overflow-hidden flex flex-col shadow-2xl">
                <div className="flex items-center gap-2 text-stone-500 mb-2 pb-2 border-b border-stone-800">
                    <Terminal size={14} className="text-stone-400" />
                    <span className="font-bold text-stone-400">system_output.log</span>
                    {activeJob && <span className="ml-auto text-amber-500 text-xs font-bold animate-pulse">● PROCESSING</span>}
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar p-2">
                    {logs.length === 0 && (
                        <div className="text-stone-600 italic">等待指令中...</div>
                    )}
                    {logs.map((log, i) => (
                        <div key={i} className="text-stone-300 break-all font-medium">
                            <span className="text-stone-600 mr-2">$</span>
                            {log}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>

                {/* Progress Bar */}
                {activeJob && (
                    <div className="mt-4 pt-4 border-t border-stone-800">
                        <div className="flex justify-between text-xs text-stone-400 mb-1 font-bold">
                            <span>執行進度</span>
                            <span className="text-amber-500">{activeJob.percentage}%</span>
                        </div>
                        <div className="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                            <div
                                className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${activeJob.percentage}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
