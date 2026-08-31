import { useState, useEffect } from 'react';
import { Database, Download, RefreshCw, CheckCircle, AlertCircle, Layers, Package } from 'lucide-react';

import { API_BASE_URL } from '../../config/api';

export function KnowledgeManager() {
    const [stats, setStats] = useState(null);
    const [crawlJob, setCrawlJob] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        loadStats();
    }, []);



    async function loadStats() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/knowledge/stats`);
            if (!res.ok) throw new Error('API not ready');
            const data = await res.json();
            setStats(data);
        } catch (error) {
            // API 尚未實作，使用模擬資料
            console.warn('API not available, using mock data');
            setStats({
                verses: 0,
                people: 0,
                locations: 0,
                events: 0,
                themes: 0,
                relationships: 0,
                coverage: {
                    verses: 0,
                    aiTagged: 0,
                    graphDensity: 0
                },
                quality: {
                    aiConfidence: 0,
                    lowConfidenceCount: 0,
                    pendingReview: 0
                }
            });
        }
    }

    async function startCrawl(source) {
        try {
            console.log('Starting crawl for:', source);
            const res = await fetch(`${API_BASE_URL}/api/admin/crawl/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Start crawl failed');
            }

            const job = await res.json();
            console.log('Crawl job started:', job);
            setCrawlJob(job);
            monitorJob(job.jobId);
        } catch (error) {
            console.error('Crawl error:', error);
            alert(`啟動失敗: ${error.message}\n請檢查後端伺服器是否正在執行。`);
        }
    }

    async function monitorJob(jobId) {
        const interval = setInterval(async () => {
            const res = await fetch(`${API_BASE_URL}/api/admin/crawl/status/${jobId}`);
            const status = await res.json();

            setCrawlJob(status);

            if (status.completed) {
                clearInterval(interval);
                loadStats(); // 重新載入統計
                alert('✅ 資料爬取完成！');
            }
        }, 2000);
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* 標題 */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        🧩 聖經知識庫管理
                    </h1>
                    <p className="text-gray-600">
                        零件抽屜式資料庫 - 自動收集、智能分類、AI 組裝
                    </p>
                </div>

                {/* 分頁導航 */}
                <div className="bg-white rounded-lg shadow mb-6">
                    <div className="flex border-b">
                        {[
                            { id: 'overview', label: '總覽', icon: Layers },
                            { id: 'crawl', label: '資料爬取', icon: Download },
                            { id: 'components', label: '零件庫', icon: Package },
                            { id: 'quality', label: '品質監控', icon: CheckCircle }
                        ].map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${activeTab === id
                                    ? 'text-blue-600 border-b-2 border-blue-600'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <Icon size={20} />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 內容區 */}
                {activeTab === 'overview' && <OverviewTab stats={stats} />}
                {activeTab === 'crawl' && <CrawlTab onStart={startCrawl} job={crawlJob} />}
                {activeTab === 'components' && <ComponentsTab stats={stats} />}
                {activeTab === 'quality' && <QualityTab stats={stats} />}
            </div>
        </div>
    );
}

// 總覽分頁
function OverviewTab({ stats }) {
    if (!stats) {
        return <div className="text-center py-12">載入中...</div>;
    }

    const components = [
        { name: '經文零件', count: stats.verses || 0, icon: '📖', color: 'blue' },
        { name: '人物零件', count: stats.people || 0, icon: '👤', color: 'green' },
        { name: '地點零件', count: stats.locations || 0, icon: '📍', color: 'yellow' },
        { name: '事件零件', count: stats.events || 0, icon: '⚡', color: 'purple' },
        { name: '主題零件', count: stats.themes || 0, icon: '🎯', color: 'pink' },
        { name: '知識關聯', count: stats.relationships || 0, icon: '🔗', color: 'indigo' }
    ];

    return (
        <div className="space-y-6">
            {/* 零件庫狀態 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {components.map(comp => (
                    <div key={comp.name} className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-3xl">{comp.icon}</span>
                            <span className={`text-3xl font-bold text-${comp.color}-600`}>
                                {comp.count.toLocaleString()}
                            </span>
                        </div>
                        <p className="text-gray-600 font-medium">{comp.name}</p>
                    </div>
                ))}
            </div>

            {/* 資料健康度 */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-bold mb-4">📊 資料健康度</h3>
                <div className="space-y-4">
                    <HealthBar
                        label="經文覆蓋率"
                        value={stats.coverage?.verses || 0}
                        target={100}
                    />
                    <HealthBar
                        label="AI 標籤完成度"
                        value={stats.coverage?.aiTagged || 0}
                        target={100}
                    />
                    <HealthBar
                        label="知識圖譜密度"
                        value={stats.coverage?.graphDensity || 0}
                        target={100}
                    />
                </div>
            </div>
        </div>
    );
}

// 資料爬取分頁
function CrawlTab({ onStart, job }) {
    const sources = [
        {
            id: 'wldeh',
            name: '開源聖經數據庫 (GitHub)',
            desc: '提供超過 200 種語言的聖經文本原始檔',
            size: '預估 ~3GB',
            time: '預估 6-12 小時'
        },
        {
            id: 'fhl',
            name: '信望愛聖經資源網',
            desc: '包含和合本經文、原文編號 (Strong Number) 與註釋',
            size: '預估 ~200MB',
            time: '預估 2-3 小時'
        },
        {
            id: 'biblia',
            name: 'Biblia 專業聖經研讀',
            desc: '提供高品質的經文對照與神學資源',
            size: '預估 ~150MB',
            time: '預估 1-2 小時'
        }
    ];

    return (
        <div className="space-y-6">
            {/* 爬取控制 */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">🚀 資料來源</h3>
                    <button
                        onClick={() => onStart('all')}
                        disabled={job?.status === 'running'}
                        className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Download size={20} />
                        一鍵全部爬取
                    </button>
                </div>
                <div className="grid gap-4">
                    {sources.map(source => (
                        <div key={source.id} className="border rounded-lg p-4 hover:shadow-md transition">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h4 className="font-bold text-lg">{source.name}</h4>
                                    <p className="text-gray-600 text-sm">{source.desc}</p>
                                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                                        <span>📦 {source.size}</span>
                                        <span>⏱️ {source.time}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onStart(source.id)}
                                    disabled={job?.status === 'running'}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
                                >
                                    <Download size={16} />
                                    開始爬取
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 進度顯示 */}
            {job && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-xl font-bold mb-4">📈 爬取進度</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-sm text-gray-600">
                                    {job.current || '準備中...'}
                                </span>
                                <span className="text-sm font-bold">
                                    {job.percentage || 0}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                                <div
                                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${job.percentage || 0}%` }}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <p className="text-2xl font-bold text-blue-600">
                                    {job.completed || 0}
                                </p>
                                <p className="text-sm text-gray-600">已完成</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-400">
                                    {job.total || 0}
                                </p>
                                <p className="text-sm text-gray-600">總數</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-green-600">
                                    {job.status === 'running' ? '進行中' : job.status}
                                </p>
                                <p className="text-sm text-gray-600">狀態</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// 零件庫分頁
function ComponentsTab({ stats }) {
    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">🧩 零件抽屜</h3>
            <p className="text-gray-600 mb-6">
                所有資料以原子化零件存儲，AI 可自由組合成教學內容
            </p>

            <div className="space-y-4">
                <ComponentDrawer
                    name="經文零件"
                    count={stats?.verses || 0}
                    desc="31,102 節聖經經文，5個版本"
                    icon="📖"
                />
                <ComponentDrawer
                    name="人物零件"
                    count={stats?.people || 0}
                    desc="生平、特質、關係、教學點"
                    icon="👤"
                />
                <ComponentDrawer
                    name="地點零件"
                    count={stats?.locations || 0}
                    desc="座標、歷史、事件、圖片"
                    icon="📍"
                />
            </div>
        </div>
    );
}

// 品質監控分頁
function QualityTab({ stats }) {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-bold mb-4">✅ 資料品質</h3>
                <div className="space-y-4">
                    <QualityMetric
                        label="AI 信心度平均"
                        value={(stats?.quality?.aiConfidence || 0) * 100}
                        status={stats?.quality?.aiConfidence > 0.8 ? 'good' : 'warning'}
                    />
                    <QualityMetric
                        label="低信心度項目"
                        value={stats?.quality?.lowConfidenceCount || 0}
                        status={stats?.quality?.lowConfidenceCount < 100 ? 'good' : 'warning'}
                        unit="項"
                    />
                    <QualityMetric
                        label="待審核項目"
                        value={stats?.quality?.pendingReview || 0}
                        status={stats?.quality?.pendingReview < 50 ? 'good' : 'warning'}
                        unit="項"
                    />
                </div>
            </div>
        </div>
    );
}

// 輔助組件
function HealthBar({ label, value, target }) {
    const percentage = Math.min((value / target) * 100, 100);
    const color = percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';

    return (
        <div>
            <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm font-bold">{percentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                    className={`bg-${color}-500 h-2 rounded-full`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

function ComponentDrawer({ name, count, desc, icon }) {
    return (
        <div className="border rounded-lg p-4 hover:shadow-md transition">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{icon}</span>
                    <div>
                        <h4 className="font-bold">{name}</h4>
                        <p className="text-sm text-gray-600">{desc}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">
                        {count.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">零件數量</p>
                </div>
            </div>
        </div>
    );
}

function QualityMetric({ label, value, status, unit = '%' }) {
    const statusColors = {
        good: 'text-green-600',
        warning: 'text-yellow-600',
        error: 'text-red-600'
    };

    return (
        <div className="flex items-center justify-between p-3 border rounded">
            <span className="text-gray-700">{label}</span>
            <span className={`text-xl font-bold ${statusColors[status]}`}>
                {value}{unit}
            </span>
        </div>
    );
}
