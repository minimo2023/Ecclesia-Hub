import { useState, useEffect, useCallback, useMemo } from 'react';
import useCoinSystem from '../../../hooks/useCoinSystem';
import { useAuth } from '../../../contexts/AuthContext';

// 背包容量上限（倉庫無上限）
const BACKPACK_LIMITS = {
    healthPotion: 3,
    scroll: 3,
    shield: 3,
    tent: 2,
    revive: 2,
    shoes: 1,
};
// 僅隊長可帶入背包的道具
const CAPTAIN_ONLY_ITEMS = ['tent', 'revive'];

const SHOP_ITEMS_META = [
    { id: 'scroll', name: '聖靈卷軸', icon: '📜', price: 50, desc: '移除兩個錯誤選項' },
    { id: 'healthPotion', name: '恩典藥水', icon: '🧪', price: 30, desc: '恢復一點生命' },
    { id: 'shield', name: '信德盾牌', icon: '🛡️', price: 40, desc: '抵擋一次傷害' },
    { id: 'tent', name: '安息帳篷', icon: '⛺', price: 100, desc: '暫停並保存進度(限隊長使用)' },
    { id: 'revive', name: '復活號角', icon: '🔄', price: 150, desc: '復活已死亡的隊友' },
    { id: 'shoes', name: '福音鞋', icon: '👟', price: 150, desc: '隊長斷線後自動保存當前進度' }
];

/**限
 * [SOVEREIGN] useExpeditionAssets
 * 倉庫庫存以伺服器為真相來源 (server-authoritative)
 * 購買後重新從伺服器拉取，不依賴雙向同步
 */
export function useExpeditionAssets(user, isLoggedIn, API_BASE_URL, config) {
    const { coins: userCoins } = useCoinSystem();
    const { refreshUser, getToken } = useAuth();
    const [inventory, setInventory] = useState({});
    const [backpack, setBackpack] = useState({});

    // [SOVEREIGN] 從伺服器載入倉庫庫存
    const loadInventory = useCallback(async () => {
        if (!isLoggedIn || !user?.id) return;
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/expedition/inventory`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) setInventory(data.inventory || {});
        } catch (err) {
            console.error('[Inventory] Load failed:', err);
        }
    }, [isLoggedIn, user?.id, API_BASE_URL, getToken]);

    // Mount 時載入庫存 + 取得最新金幣
    useEffect(() => {
        loadInventory();
        if (isLoggedIn) refreshUser();
    }, [isLoggedIn, user?.id]);

    // --- Shop Items Logic ---
    const shopItems = useMemo(() => {
        const activeConfig = config || {};
        if (activeConfig.shop_items && activeConfig.shop_items.length > 0) {
            return activeConfig.shop_items.map(item => {
                const base = SHOP_ITEMS_META.find(s => s.id === item.id) || {};
                return { ...base, ...item, desc: item.desc || item.description || base.desc };
            });
        }
        return SHOP_ITEMS_META;
    }, [config]);

    // --- Handlers ---

    const provisionToBackpack = (itemId, quantity, isOwner = false) => {
        if (!inventory[itemId] || inventory[itemId] < quantity) return false;

        // 隊長限定道具
        if (CAPTAIN_ONLY_ITEMS.includes(itemId) && !isOwner) return false;

        // 背包容量上限
        const limit = BACKPACK_LIMITS[itemId];
        if (limit !== undefined) {
            const currentInBackpack = backpack[itemId] || 0;
            if (currentInBackpack + quantity > limit) return false;
        }

        setInventory(prev => ({ ...prev, [itemId]: prev[itemId] - quantity }));
        setBackpack(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + quantity }));
        return true;
    };

    const returnToWarehouse = (itemId, quantity) => {
        if (!backpack[itemId] || backpack[itemId] < quantity) return;
        setBackpack(prev => ({ ...prev, [itemId]: prev[itemId] - quantity }));
        setInventory(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + quantity }));
    };

    // 購買後從伺服器重新拉取庫存（server-authoritative）
    const handlePurchase = async (itemId, price, qty = 1) => {
        const total = price * qty;
        if (userCoins < total) return false;
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE_URL}/api/expedition/purchase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ itemId, quantity: qty })
            });
            const data = await res.json();
            if (data.success) {
                // 不重拉整個庫存（loadInventory 會覆蓋背包已扣掉的本地狀態）
                // 只把剛買的數量加進倉庫，其餘維持現狀
                setInventory(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + qty }));
                await refreshUser();   // 更新金幣顯示
                return true;
            }
            console.error('[Purchase] Failed:', data.error);
            return false;
        } catch (err) {
            console.error('[Purchase] Error:', err);
            return false;
        }
    };

    const handleBalanceDistribute = (members) => {
        console.log('Distributing assets to members:', members);
    };

    const refundBackpackToWarehouse = async () => {
        // [SOVEREIGN] 以後端 DB 為真相來源，不自行計算剩餘量。
        // 後端 refundRoomMembers 已正確將戰場剩餘量退還至 DB，
        // 前端只需清空背包意向，再重新從 DB 拉取最新庫存即可。
        setBackpack({});
        await loadInventory();
    };

    const syncInventoryWithServer = async (newInventory) => {
        if (!isLoggedIn || !user?.id) return;
        try {
            const token = getToken();
            await fetch(`${API_BASE_URL}/api/expedition/inventory/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ inventory: newInventory })
            });
        } catch (err) { console.error('Failed to sync inventory:', err); }
    };

    return {
        userCoins, inventory, setInventory, backpack, setBackpack, shopItems,
        provisionToBackpack, returnToWarehouse,
        handlePurchase, handleBalanceDistribute,
        refundBackpackToWarehouse, syncInventoryWithServer,
        BACKPACK_LIMITS, CAPTAIN_ONLY_ITEMS
    };
}
