import React from 'react';
import { Anchor } from 'lucide-react';
import SeaPatrolTab from '../components/SeaPatrolTab';

/**
 * PatrolModule — 補題艦隊管理
 * 將 KnowledgeModule 的海巡艦隊 tab 升格為頂層主權模組。
 */
export default function PatrolModule() {
    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-2xl font-black text-stone-800 tracking-tight flex items-center gap-2">
                    <Anchor size={24} className="text-blue-500" />
                    補題艦隊
                </h1>
                <p className="text-xs text-stone-400 mt-1 font-medium">三大艦隊巡航狀態、譯本輪替與出題成果監控</p>
            </div>
            <SeaPatrolTab />
        </div>
    );
}
