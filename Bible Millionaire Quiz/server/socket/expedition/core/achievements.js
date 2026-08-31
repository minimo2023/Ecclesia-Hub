import { dbOps } from '../../../database/index.js';
import { getPublicMemberData } from '../utils.js';

/**
 * Check and award achievements (Async)
 */
export async function checkAchievements(io, room, type, data) {
    if (!room || !room.members) return;
    const expeditionNamespace = io.of('/expedition');

    for (const member of room.members.values()) {
        if (!member.userId) continue;

        const newAchievements = [];
        if (type === 'milestone') {
            if (data.stage === 2) newAchievements.push('milestone_stage_2');
            if (data.stage === 3) newAchievements.push('milestone_stage_3');
            if (data.stage === 4) newAchievements.push('milestone_stage_4');
            if (data.questionCount >= 1000) newAchievements.push('milestone_1000q');
            if (data.questionCount >= 2000) newAchievements.push('milestone_2000q');
        }

        for (const key of newAchievements) {
            try {
                const achievement = await dbOps.gamesDb.get('SELECT id, name FROM achievements WHERE key = $1', [key]);
                if (!achievement) continue;

                const info = await dbOps.gamesDb.run('INSERT INTO user_achievements (user_id, achievement_id) ON CONFLICT DO NOTHING VALUES ($1, $2)', [member.userId, achievement.id]);

                if (info && info.changes > 0) {
                    if (member.socketId) {
                        try {
                            expeditionNamespace.to(member.socketId).emit('achievement:unlocked', {
                                key: key,
                                name: achievement.name
                            });
                        } catch(e) {}
                    }
                }
            } catch (err) {
                console.error(`Failed to award achievement ${key}:`, err);
            }
        }
    }
}
