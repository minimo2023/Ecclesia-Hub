import React from 'react';
import ExpeditionShop from './ExpeditionShop';
import ExpeditionInventory from './ExpeditionInventory';
import { RefreshCw } from 'lucide-react';

export default function ExpeditionSidebar({
    shopItems = [],
    inventory = {},
    coins = 0,
    onPurchase,
    onUseItem
}) {
    return (
        <div className="w-96 bg-slate-900/80 backdrop-blur-xl border-l border-slate-700 flex flex-col shadow-2xl h-full">
            {/* Shop Section - Top 2/3 */}
            <div className="flex-1 flex flex-col min-h-0 border-b border-slate-700/50 relative">
                {shopItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 py-8">
                        <RefreshCw className="w-8 h-8 animate-spin mb-2 opacity-50" />
                        <p>正在聯絡補給商隊...</p>
                    </div>
                ) : (
                    <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-2">
                        <ExpeditionShop
                            items={shopItems}
                            coins={coins}
                            isInGame={false}
                            inventory={inventory}
                            onPurchase={onPurchase}
                        />
                    </div>
                )}
            </div>

            {/* My Inventory Section - Bottom 1/3 */}
            <div className="h-1/3 flex flex-col min-h-0">
                <ExpeditionInventory
                    inventory={inventory}
                    shopItems={shopItems}
                />
            </div>
        </div>
    );
}
