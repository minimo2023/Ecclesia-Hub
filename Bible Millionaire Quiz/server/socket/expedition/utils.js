/**
 * Filter member data for public broadcast to reduce payload size
 */
export function getPublicMemberData(member) {
    if (!member) return null;
    return {
        displayName: member.displayName,
        lives: member.lives,
        coins: member.coins,
        points: member.points,
        isOwner: member.isOwner,
        isJoined: member.isJoined,
        inventory: member.inventory, // Keep inventory for UI icons
        isReady: member.isReady,
        hasShield: member.hasShield, // UI flag
        online: member.online,
        intentItemId: member.intentItemId, // Real-time intent persistence
        avatar: member.avatar
    };
}

/**
 * Sync member's hasShield status based on inventory OR active status
 */
export function syncMemberShield(member) {
    if (!member) return;
    const inventoryCount = member.inventory ? (member.inventory['shield'] || 0) : 0;
    member.hasShield = !!(member.hasActiveShield || inventoryCount > 0);
}
