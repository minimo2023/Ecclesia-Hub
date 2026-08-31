/**
 * AchievementWall - 成就牆組件
 * 用於在個人檔案頁面顯示用戶的成就解鎖狀態
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, RefreshCw } from 'lucide-react';
import { useAchievements } from '../../hooks/useAchievements';

export default function AchievementWall() {
    const { achievements, fetchAchievements, syncAchievements, isLoading } = useAchievements();
    const [stats, setStats] = useState({ total: 0, unlocked: 0, percentage: 0 });
    const [isSyncing, setIsSyncing] = useState(false);

    const loadAchievements = useCallback(async () => {
        const data = await fetchAchievements();
        if (data?.stats) {
            setStats(data.stats);
        }
    }, [fetchAchievements]);

    useEffect(() => {
        loadAchievements();
    }, [loadAchievements]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            console.log('🔄 Syncing achievements...');
            const result = await syncAchievements();
            console.log('📊 Sync result:', result);
            // Always reload achievements after sync
            await loadAchievements();
        } catch (error) {
            console.error('Sync error:', error);
        }
        setIsSyncing(false);
    };

    // Group achievements by category (Only unlocked)
    const groupedAchievements = achievements.reduce((acc, a) => {
        if (!a.unlocked) return acc; // Only show unlocked achievements
        const category = a.category || 'misc';
        if (!acc[category]) acc[category] = [];
        acc[category].push(a);
        return acc;
    }, {});

    const categoryLabels = {
        classic: '🎮 經典問答',
        speed: '⚡ 快問快答',
        bible: '📖 聖經探索',
        devotional: '🌅 靈修相關',
        misc: '✨ 特別成就'
    };

    return (
        <div className="space-y-4">
            {/* Header with Stats */}
            <div className="bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl p-6 border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Trophy className="w-8 h-8 text-amber-600" />
                        <div>
                            <h3 className="text-xl font-bold text-amber-800">我的成就</h3>
                            <p className="text-amber-600 text-sm">
                                已解鎖 {stats.unlocked} / {stats.total} ({stats.percentage}%)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-2 hover:bg-amber-200 rounded-full transition-colors disabled:opacity-50"
                        title="同步成就"
                    >
                        <RefreshCw className={`w-5 h-5 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="h-3 bg-amber-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.percentage}%` }}
                    />
                </div>
            </div>

            {/* Achievement Categories */}
            {isLoading ? (
                <div className="text-center py-8 text-stone-400">載入中...</div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedAchievements).map(([category, items]) => (
                        <div key={category} className="bg-white rounded-xl border border-stone-100 overflow-hidden">
                            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">
                                <h4 className="font-bold text-stone-700">
                                    {categoryLabels[category] || category}
                                </h4>
                            </div>
                            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {items.map(achievement => (
                                    <div
                                        key={achievement.id}
                                        className={`p-3 rounded-xl text-center transition-all ${achievement.unlocked
                                            ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400'
                                            : 'bg-stone-100 border border-stone-200 opacity-60'
                                            }`}
                                    >
                                        <div className="text-3xl mb-1">{achievement.icon}</div>
                                        <p className={`text-sm font-medium truncate ${achievement.unlocked ? 'text-stone-800' : 'text-stone-500'
                                            }`}>
                                            {achievement.name}
                                        </p>
                                        <p className="text-xs text-stone-400 mt-1 line-clamp-2">
                                            {achievement.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
