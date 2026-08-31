import React, { createContext, useContext } from 'react';

const ExpeditionContext = createContext(null);

/**
 * [SOVEREIGN] ExpeditionProvider
 * 遠征模式的核心數據主權層，負責管理 Socket 通訊、遊戲狀態與資產同步。
 */
export function ExpeditionProvider({ 
    children, user, isLoggedIn, guestAvatar, 
    socket, team, actions, gameStates,
    assets, displayName, setDisplayName, handleUseItem
}) {
    
    // We wrap the passed states and actions into a unified value
    const value = {
        // Identity
        user,
        isLoggedIn,
        guestAvatar,
        displayName,
        setDisplayName,

        // Socket & Actions
        socket,
        actions,
        handleUseItem,

        // [SOVEREIGN] Asset Integration & Cleansing
        ...(assets || {}),
        userCoins: Math.floor(Number(assets?.userCoins || 0)),
        userPoints: Math.floor(Number(user?.points || 0)),

        // Game State (Flattened for backward compatibility)
        ...gameStates,
        gameStates, // Keep object ref for specific destructuring

        // Team Core
        team,
        
        // Identity Sovereignty (Unified Logic)
        isOwner: !!(team && (
            (user?.id && String(team.ownerId) === String(user.id)) || 
            (!user?.id && team.ownerName === (user?.displayName || localStorage.getItem('bible_quiz_guest_name')))
        )),
        isJoined: !!(team?.members?.find(m => m.displayName === (user?.displayName || localStorage.getItem('bible_quiz_guest_name') || '訪客'))?.isJoined),
        myMember: team?.members?.find(m => m.displayName === (user?.displayName || localStorage.getItem('bible_quiz_guest_name') || '訪客')),
        otherMembers: team?.members?.filter(m => m.displayName !== (user?.displayName || localStorage.getItem('bible_quiz_guest_name')) && (m.isJoined || m.isOwner)) || []
    };

    // [SOVEREIGN] Priority Inventory Sync:
    // ONLY override if game is currently in progress (not waiting/lobby).
    // In waiting state, myMember.inventory is cleared to {} and assets.inventory (warehouse DB truth) should be used.
    if (value.team?.status === 'playing' && value.myMember?.inventory) {
        value.inventory = value.myMember.inventory;
    }

    // [SOVEREIGN] Real-time Asset Sync:
    // Ensure the top UI reflects real-time socket updates for coins and points
    if (value.myMember) {
        if (typeof value.myMember.coins === 'number') {
            value.userCoins = value.myMember.coins;
        }
        if (typeof value.myMember.points === 'number') {
            value.userPoints = value.myMember.points;
        }
    }

    return (
        <ExpeditionContext.Provider value={value}>
            {children}
        </ExpeditionContext.Provider>
    );
}

/**
 * Hook to consume the Expedition context
 */
export function useExpedition() {
    const context = useContext(ExpeditionContext);
    if (!context) {
        throw new Error('useExpedition must be used within an ExpeditionProvider');
    }
    return context;
}
