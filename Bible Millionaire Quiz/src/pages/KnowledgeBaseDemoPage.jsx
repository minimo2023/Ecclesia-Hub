import React, { useState } from 'react';
import { Book, Database, Network, CheckCircle2 } from 'lucide-react';

/**
 * 知識庫建構演示頁面
 * 展示 Layer 1-3 的運作
 */
export default function KnowledgeBaseDemoPage() {
    const [currentLayer, setCurrentLayer] = useState(1);
    const [progress, setProgress] = useState({
        layer1: false,
        layer2: false,
        layer3: false
    });

    const layers = [
        {
            id: 1,
            name: 'Layer 1: Data Ingestion',
            icon: Database,
            color: 'bg-blue-500',
            description: '從外部 API 抓取原始資料',
            status: progress.layer1 ? 'complete' : 'pending',
            details: [
                '信望愛 API - 經文與詞典',
                'Free Use Bible - 多譯本',
                'Bible Brain - 音訊資源'
            ]
        },
        {
            id: 2,
            name: 'Layer 2: Normalization',
            icon: Book,
            color: 'bg-green-500',
            description: '標準化資料格式',
            status: progress.layer2 ? 'complete' : 'pending',
            details: [
                '書卷代碼統一 (GEN, EXO...)',
                '經文引用標準化 (GEN.012.003)',
                '實體 ID 映射 (PERSON:ABRAHAM)'
            ]
        },
        {
            id: 3,
            name: 'Layer 3: Knowledge Graph',
            icon: Network,
            color: 'bg-purple-500',
            description: '建立知識圖資料庫',
            status: progress.layer3 ? 'complete' : 'pending',
            details: [
                '實體節點 (人物/地點/主題)',
                '關係網絡 (Person ↔ Verse)',
                '可追溯來源'
            ]
        }
    ];

    const handleRunLayer = async (layerId) => {
        setCurrentLayer(layerId);

        // 模擬執行過程
        await new Promise(r => setTimeout(r, 1000));

        setProgress(prev => ({
            ...prev,
            [`layer${layerId}`]: true
        }));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-5xl font-bold text-white mb-4">
                        聖經知識百科系統
                    </h1>
                    <p className="text-xl text-purple-200">
                        Blueprint v2.0 - 可追溯、可驗證、可重建的知識基建
                    </p>
                </div>

                {/* Architecture Overview */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8">
                    <h2 className="text-2xl font-bold text-white mb-6">
                        系統架構 (3層核心已完成)
                    </h2>

                    <div className="grid md:grid-cols-3 gap-6">
                        {layers.map((layer) => {
                            const Icon = layer.icon;
                            const isActive = currentLayer === layer.id;
                            const isComplete = progress[`layer${layer.id}`];

                            return (
                                <div
                                    key={layer.id}
                                    className={`
                    relative p-6 rounded-xl border-2 transition-all
                    ${isActive
                                            ? 'border-white bg-white/20 scale-105'
                                            : 'border-white/20 bg-white/5 hover:bg-white/10'
                                        }
                  `}
                                >
                                    {/* Status Icon */}
                                    {isComplete && (
                                        <div className="absolute top-4 right-4">
                                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                                        </div>
                                    )}

                                    {/* Layer Icon */}
                                    <div className={`w-12 h-12 ${layer.color} rounded-lg flex items-center justify-center mb-4`}>
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>

                                    {/* Layer Name */}
                                    <h3 className="text-lg font-bold text-white mb-2">
                                        {layer.name}
                                    </h3>

                                    {/* Description */}
                                    <p className="text-sm text-purple-200 mb-4">
                                        {layer.description}
                                    </p>

                                    {/* Details */}
                                    <ul className="space-y-2 mb-4">
                                        {layer.details.map((detail, idx) => (
                                            <li key={idx} className="text-xs text-purple-300 flex items-start">
                                                <span className="mr-2">•</span>
                                                <span>{detail}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {/* Action Button */}
                                    <button
                                        onClick={() => handleRunLayer(layer.id)}
                                        disabled={isComplete}
                                        className={`
                      w-full py-2 px-4 rounded-lg font-semibold transition-all
                      ${isComplete
                                                ? 'bg-green-500/50 text-white cursor-not-allowed'
                                                : 'bg-white text-slate-900 hover:bg-purple-100'
                                            }
                    `}
                                    >
                                        {isComplete ? '已完成 ✓' : '執行測試'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Data Flow Visualization */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                    <h2 className="text-2xl font-bold text-white mb-6">
                        資料流向
                    </h2>

                    <div className="flex items-center justify-center space-x-4 text-white">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-2">
                                <Database className="w-8 h-8" />
                            </div>
                            <p className="text-sm">Raw Data</p>
                        </div>

                        <div className="text-2xl">→</div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-2">
                                <Book className="w-8 h-8" />
                            </div>
                            <p className="text-sm">Normalized</p>
                        </div>

                        <div className="text-2xl">→</div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mb-2">
                                <Network className="w-8 h-8" />
                            </div>
                            <p className="text-sm">Knowledge Graph</p>
                        </div>

                        <div className="text-2xl">→</div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mb-2">
                                <span className="text-2xl">🤖</span>
                            </div>
                            <p className="text-sm">Encyclopedia</p>
                            <p className="text-xs text-purple-300">(待建構)</p>
                        </div>
                    </div>
                </div>

                {/* Footer Note */}
                <div className="mt-8 text-center text-purple-200 text-sm">
                    <p>✨ 系統已建立 Layer 1-3 核心架構</p>
                    <p className="mt-2">下一步：Layer 4 Validation, Layer 5 Encyclopedia Builder</p>
                </div>
            </div>
        </div>
    );
}
