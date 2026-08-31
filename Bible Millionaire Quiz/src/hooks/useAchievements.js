/**
 * useAchievements - Hook for achievement system
 */
import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function useAchievements() {
    const { getToken, isLoggedIn } = useAuth();
    const [achievements, setAchievements] = useState([]);
    const [newlyUnlocked, setNewlyUnlocked] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch all achievements with user's unlock status
    const fetchAchievements = useCallback(async () => {
        if (!isLoggedIn) return [];

        setIsLoading(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/achievements/user`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success) {
                setAchievements(Array.isArray(data.achievements) ? data.achievements : []);
                return data;
            }
            return { achievements: [], stats: { total: 0, unlocked: 0, percentage: 0 } };
        } catch (error) {
            console.error('Fetch achievements error:', error);
            return { achievements: [], stats: { total: 0, unlocked: 0, percentage: 0 } };
        } finally {
            setIsLoading(false);
        }
    }, [isLoggedIn, getToken]);

    // Check achievements after game ends
    const checkAchievements = useCallback(async () => {
        // Game achievements are evaluated and returned by the authoritative
        // game-session settlement response.
        return [];
    }, []);

    // Clear newly unlocked (after showing notification)
    const clearNewlyUnlocked = useCallback(() => {
        setNewlyUnlocked([]);
    }, []);

    // Sync achievements on login (retroactive check for old players)
    const syncAchievements = useCallback(async () => {
        if (!isLoggedIn) return { newlyUnlocked: [], count: 0 };

        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/api/achievements/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success && data.newlyUnlocked?.length > 0) {
                setNewlyUnlocked(data.newlyUnlocked);
                data.newlyUnlocked.forEach(achievement => {
                    window.dispatchEvent(new CustomEvent('achievementUnlocked', { detail: achievement }));
                });
            }

            return data;
        } catch (error) {
            console.error('Sync achievements error:', error);
            return { newlyUnlocked: [], count: 0 };
        }
    }, [isLoggedIn, getToken]);

    return {
        achievements,
        newlyUnlocked,
        isLoading,
        fetchAchievements,
        checkAchievements,
        syncAchievements,
        clearNewlyUnlocked
    };
}

export default useAchievements;
