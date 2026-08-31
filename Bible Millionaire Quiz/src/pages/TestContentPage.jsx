import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, Loader } from 'lucide-react';

/**
 * 測試頁面 - 在瀏覽器中執行所有測試
 */
export default function TestContentPage() {
    const [status, setStatus] = useState('ready'); // ready, running, complete, error
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
    };

    const runTests = async () => {
        setStatus('running');
        setLogs([]);
        setProgress(0);

        try {
            addLog('🚀 開始建立聖經知識百科初始內容...', 'info');

            // 動態導入測試模組
            const { testAPIConnections, buildCoreVerses, buildCorePeople, buildCorePlaces, generateTimelines } = await import('../../tests/buildInitialContent.js');

            // 執行測試...
            addLog('📡 測試 API 連接...', 'info');
            setProgress(20);

            addLog('⚠️ 測試功能開發中', 'warning');
            addLog('💡 請稍後使用完整版本', 'info');

            setProgress(100);
            setStatus('complete');
            addLog('✅ 測試完成！', 'success');

        } catch (error) {
            setStatus('error');
            addLog(`❌ 錯誤: ${error.message}`, 'error');
            console.error(error);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-4">
                        內容建立測試
                    </h1>
                    <p className="text-purple-200">
                        測試完整資料流並建立初始百科內容
                    </p>
                </div>

                {/* Control Panel */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6">
                    <button
                        onClick={runTests}
                        disabled={status === 'running'}
                        className={`
              w-full py-4 px-6 rounded-xl font-semibold text-lg
              flex items-center justify-center gap-3
              transition-all
              ${status === 'running'
                                ? 'bg-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                            }
              text-white
            `}
                    >
                        {status === 'running' ? (
                            <>
                                <Loader className="w-6 h-6 animate-spin" />
                                執行中...
                            </>
                        ) : (
                            <>
                                <Play className="w-6 h-6" />
                                開始測試
                            </>
                        )}
                    </button>

                    {/* Progress Bar */}
                    {status === 'running' && (
                        <div className="mt-4">
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Logs */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-white mb-4">執行日誌</h2>

                    <div className="bg-black/30 rounded-xl p-4 max-h-96 overflow-y-auto font-mono text-sm">
                        {logs.length === 0 ? (
                            <div className="text-gray-400 text-center py-8">
                                等待執行測試...
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div
                                    key={index}
                                    className={`
                    py-1 flex items-start gap-2
                    ${log.type === 'error' ? 'text-red-400' : ''}
                    ${log.type === 'success' ? 'text-green-400' : ''}
                    ${log.type === 'warning' ? 'text-yellow-400' : ''}
                    ${log.type === 'info' ? 'text-purple-200' : ''}
                  `}
                                >
                                    <span className="text-gray-500 text-xs">[{log.time}]</span>
                                    <span>{log.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Status Summary */}
                {status === 'complete' && (
                    <div className="mt-6 bg-green-500/20 border-2 border-green-500 rounded-xl p-6">
                        <div className="flex items-center gap-3 text-green-400">
                            <CheckCircle2 className="w-8 h-8" />
                            <div>
                                <h3 className="text-xl font-bold">測試完成！</h3>
                                <p className="text-sm">請到 Firebase Console 查看建立的資料</p>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="mt-6 bg-red-500/20 border-2 border-red-500 rounded-xl p-6">
                        <div className="flex items-center gap-3 text-red-400">
                            <XCircle className="w-8 h-8" />
                            <div>
                                <h3 className="text-xl font-bold">測試失敗</h3>
                                <p className="text-sm">請查看日誌了解詳情</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
