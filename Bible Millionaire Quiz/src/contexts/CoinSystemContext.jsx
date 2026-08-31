/* eslint-disable react-refresh/only-export-components -- Economy constants, provider, and hook form one public context API. */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const LIFELINE_COSTS = {
    fiftyFifty: 10,
    phoneFriend: 15,
    askAudience: 15,
    addTime: 10
};

const CoinSystemContext = createContext(null);

/**
 * [SOVEREIGN] CoinSystemProvider
 * 全局唯一錢包 — 所有功能模組共用同一個 pendingGain / sessionCoins
 */
export function CoinSystemProvider({ children }) {
    const { user, getToken, refreshUser } = useAuth();
    const [sessionCoins, setSessionCoins] = useState(0);
    const [pendingGain, setPendingGain] = useState(0);
    const [optimisticDeduction, setOptimisticDeduction] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [economyConfig, setEconomyConfig] = useState(null);
    const [activeGameSessionId, setActiveGameSessionId] = useState(
        () => sessionStorage.getItem('active_game_reward_session')
    );

    const createRequestId = () => {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
        return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    };

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/expedition/config`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(data => { if (data.success) setEconomyConfig(data.config); })
            .catch(err => console.error('Failed to load economy config:', err));
    }, []);

    const _getRawGuestCoins = () => {
        try {
            const raw = sessionStorage.getItem('guest_coins');
            const num = Number(raw);
            return (raw !== null && Number.isFinite(num)) ? num : 0;
        } catch { return 0; }
    };

    const [guestCoins, setGuestCoins] = useState(() => _getRawGuestCoins());

    useEffect(() => {
        // 同步外部變動或初次加載
        setGuestCoins(_getRawGuestCoins());
    }, [user]);

    const serverCoins = user?.coins ?? (getToken() ? 0 : guestCoins);
    const coins = Number.isFinite(serverCoins + pendingGain - optimisticDeduction) 
        ? Math.max(0, serverCoins + pendingGain - optimisticDeduction) 
        : 0;

    const commitCoins = useCallback(async (amount, _reason = 'game_settlement') => {
        if (amount === 0) return { success: true };
        setError(null);
        const token = getToken();

        if (!token) {
            const currentStored = _getRawGuestCoins();
            const delta = Number.isFinite(Number(amount)) ? Number(amount) : 0;
            const newBalance = Math.max(0, currentStored + delta);
            sessionStorage.setItem('guest_coins', newBalance.toString());
            setGuestCoins(newBalance);
            setPendingGain(0);
            return { success: true, localOnly: true };
        }

        const message = '會員資產只能由伺服器依已驗證事件異動';
        setError(message);
        return { success: false, error: message, code: 'SERVER_AUTHORITY_REQUIRED' };
    }, [getToken]);

    const earnCoins = useCallback((amount, reason = 'game', syncImmediately = false) => {
        if (amount === 0) return;
        setSessionCoins(prev => prev + amount);
        setPendingGain(prev => prev + amount);
        if (syncImmediately || !getToken()) commitCoins(amount, reason);
    }, [commitCoins, getToken]);

    const addCoins = useCallback(async (amount, reason = 'manual_credit') => {
        return await commitCoins(amount, reason);
    }, [commitCoins]);

    const startGameSession = useCallback(async ({ mode, questionCount, selectedBooks, isInfiniteMode, clientSessionKey }) => {
        const token = getToken();
        if (!token) return { success: true, localOnly: true, session: null };
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/game-sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ mode, questionCount, selectedBooks, isInfiniteMode, clientSessionKey })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || data.error || '無法建立遊戲階段');
            sessionStorage.setItem('active_game_reward_session', data.session.id);
            setActiveGameSessionId(data.session.id);
            return data;
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setIsLoading(false);
        }
    }, [getToken]);

    const settleSession = useCallback(async (reason = 'unknown') => {
        const token = getToken();
        if (!token) {
            if (pendingGain <= 0) return { success: true, localOnly: true };
            return commitCoins(pendingGain, reason);
        }
        const sessionId = activeGameSessionId || sessionStorage.getItem('active_game_reward_session');
        if (!sessionId) return { success: false, error: '找不到可結算的遊戲階段' };

        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/game-sessions/${encodeURIComponent(sessionId)}/settle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reason })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || data.error || '遊戲結算失敗');
            setPendingGain(0);
            setSessionCoins(Number(data.coinsAwarded || 0));
            sessionStorage.removeItem('active_game_reward_session');
            setActiveGameSessionId(null);
            await refreshUser(true);
            (data.newlyUnlocked || []).forEach((achievement) => {
                window.dispatchEvent(new CustomEvent('achievementUnlocked', { detail: achievement }));
            });
            return data;
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setIsLoading(false);
        }
    }, [activeGameSessionId, commitCoins, getToken, pendingGain, refreshUser]);

    const redeemLifeline = useCallback(async (lifelineType, overrideCost = null) => {
        setError(null);
        const token = getToken();
        const cost = overrideCost !== null ? overrideCost : LIFELINE_COSTS[lifelineType];
        if (cost === undefined || cost === null) return { success: false, error: '無效的道具類型' };
        if (coins < cost) return { success: false, error: '智匯金幣餘額不足', required: cost, current: coins };

        if (!token) {
            const rawStored = sessionStorage.getItem('guest_coins');
            const currentStored = Number.isFinite(Number(rawStored)) ? Number(rawStored) : 0;
            let stillToDeduct = Number.isFinite(Number(cost)) ? Number(cost) : 0;
            if (pendingGain > 0) {
                const deduction = Math.min(pendingGain, stillToDeduct);
                setPendingGain(prev => { const next = prev - deduction; return Number.isFinite(next) ? next : 0; });
                stillToDeduct -= deduction;
            }
            if (stillToDeduct > 0) {
                const newBalance = Math.max(0, currentStored - stillToDeduct);
                sessionStorage.setItem('guest_coins', newBalance.toString());
                setGuestCoins(newBalance);
            }
            setSessionCoins(prev => prev - cost);
            return { success: true, localOnly: true, spent: cost };
        }

        if (cost === 0) return { success: true, spent: 0, serverDeferred: true };

        setIsLoading(true);
        setOptimisticDeduction(prev => prev + cost); // Optimistic UI Update
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/coins/spend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    lifelineType,
                    gameSessionId: activeGameSessionId || sessionStorage.getItem('active_game_reward_session'),
                    requestId: createRequestId()
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || '兌換失敗');
            await refreshUser(true);
            return { success: true, coins: data.coins, spent: data.spent };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setOptimisticDeduction(prev => Math.max(0, prev - cost)); // 復原樂觀扣款（伺服器已更新餘額）
            setIsLoading(false);
        }
    }, [activeGameSessionId, getToken, coins, pendingGain, refreshUser]);

    const spendCoins = useCallback(async (amount, reason = 'transaction') => {
        const numericAmount = Math.abs(Number(amount));
        if (numericAmount <= 0) return { success: true };
        if (coins < numericAmount) { setError('餘額不足'); return { success: false, error: '餘額不足' }; }
        if (!getToken()) return commitCoins(-numericAmount, reason);
        return { success: false, error: '此支出必須由對應的伺服器操作處理', code: 'SERVER_AUTHORITY_REQUIRED' };
    }, [coins, commitCoins, getToken]);

    const mergeGuestData = useCallback(async () => {
        if (!getToken()) return { success: false, error: '請先登入' };
        return {
            success: false,
            error: '訪客金幣未具伺服器簽章，無法匯入會員錢包',
            code: 'UNVERIFIED_GUEST_ASSET'
        };
    }, [getToken]);

    const discardGuestData = useCallback(() => {
        sessionStorage.removeItem('guest_coins');
        setGuestCoins(0);
        setSessionCoins(0);
        setPendingGain(0);
    }, []);

    const resetSession = useCallback(() => {
        setSessionCoins(0);
        setPendingGain(0);
        setError(null);
    }, []);

    const updateGameStats = useCallback(async (stats) => {
        const token = getToken();
        if (!token) return { success: true, localOnly: true };
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/stats`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(stats)
            });
            const data = await response.json();
            if (data.success) await refreshUser(true);
            return data;
        } catch (err) {
            console.error('Failed to update game stats:', err);
            return { success: false, error: err.message };
        }
    }, [getToken, refreshUser]);

    const canAfford = useCallback((lifelineType) => {
        const cost = LIFELINE_COSTS[lifelineType];
        return cost && coins >= cost;
    }, [coins]);

    const isMergeRequired = false;

    const value = {
        coins, serverCoins, sessionCoins, pendingGain,
        guestCoins, // 暴露訪客金幣讓 GuestDataMergeDialog 顯示正確數量
        isMergeRequired, isLoading, error,
        earnCoins, spendCoins, addCoins,
        mergeGuestData, discardGuestData,
        settleSession, startGameSession, activeGameSessionId,
        redeemLifeline, updateGameStats,
        resetSession, canAfford,
        LIFELINE_COSTS, economyConfig
    };

    return (
        <CoinSystemContext.Provider value={value}>
            {children}
        </CoinSystemContext.Provider>
    );
}

export function useCoinSystem() {
    const ctx = useContext(CoinSystemContext);
    if (!ctx) throw new Error('useCoinSystem must be used within CoinSystemProvider');
    return ctx;
}
