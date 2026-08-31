import React, { useCallback, useState } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { useCoinSystem } from '../../../../contexts/CoinSystemContext';
import GuestGameExitDialog from './GuestGameExitDialog';

export function useGuestGameExitGuard() {
    const { isLoggedIn } = useAuth();
    const coinSystem = useCoinSystem();
    const [pendingExit, setPendingExit] = useState(null);

    const requestGuestGameExit = useCallback(action => {
        if (typeof action !== 'function') return false;
        if (!isLoggedIn && Number(coinSystem.coins) > 0) {
            setPendingExit(() => action);
            return false;
        }
        return action();
    }, [coinSystem.coins, isLoggedIn]);

    const stayInGame = useCallback(() => setPendingExit(null), []);
    const confirmExit = useCallback(() => {
        const action = pendingExit;
        setPendingExit(null);
        action?.();
    }, [pendingExit]);

    return {
        requestGuestGameExit,
        guestGameExitDialog: (
            <GuestGameExitDialog
                open={Boolean(pendingExit)}
                coins={coinSystem.coins}
                onStay={stayInGame}
                onLeave={confirmExit}
            />
        )
    };
}

export default useGuestGameExitGuard;
