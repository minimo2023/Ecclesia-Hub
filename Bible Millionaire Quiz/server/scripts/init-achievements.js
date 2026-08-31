/**
 * Initialize Achievements
 * Populates the achievements table from seed data
 * Run: node server/scripts/init-achievements.js
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import to handle path resolution safely on Windows
const dbPath = join(__dirname, '..', 'database', 'index.js');
const { dbOps, initializeDatabase } = await import(pathToFileURL(dbPath).href);

async function seedAchievements() {
    console.log('🏆 Starting achievement initialization...');

    await initializeDatabase();

    const achievements = [
        // Milestones
        { key: 'milestone_stage_2', name: '初出茅廬', description: '到達 Stage 2 (通過 70 題)', type: 'milestone', icon: '🌱', category: 'classic', sort_order: 10 },
        { key: 'milestone_stage_3', name: '荒野行者', description: '到達 Stage 3 (通過 210 題)', type: 'milestone', icon: '🌵', category: 'classic', sort_order: 20 },
        { key: 'milestone_stage_4', name: '幽谷之光', description: '到達 Stage 4 (通過 500 題)', type: 'milestone', icon: '🕯️', category: 'classic', sort_order: 30 },
        { key: 'milestone_1000q', name: '登峰造極', description: '單場遠征達到 1000 題', type: 'milestone', icon: '🏔️', category: 'classic', sort_order: 40 },
        { key: 'milestone_2000q', name: '聖經百科', description: '單場遠征達到 2000 題', type: 'milestone', icon: '📚', category: 'classic', sort_order: 50 },

        // Teamwork
        { key: 'team_shield_5', name: '守護天使', description: '單場使用護盾成功抵擋傷害 5 次', type: 'teamwork', icon: '🛡️', category: 'classic', sort_order: 100 },
        { key: 'team_heal_5', name: '神醫再世', description: '單場使用藥水治療隊友 5 次', type: 'teamwork', icon: '💊', category: 'classic', sort_order: 110 },
        { key: 'team_revive_1', name: '復活的奇蹟', description: '成功復活一名隊友', type: 'teamwork', icon: '✨', category: 'classic', sort_order: 120 },
        { key: 'team_scroll_assist_10', name: '神助攻', description: '使用聖靈卷軸後，隊伍在該題成功過關 (累計 10 次)', type: 'teamwork', icon: '📜', category: 'classic', sort_order: 130 },

        // Survival
        { key: 'survival_low_hp_10', name: '九死一生', description: '全隊僅剩 1 點生命的情況下，連續通過 10 題', type: 'survival', icon: '❤️‍🩹', category: 'classic', sort_order: 200 },
        { key: 'survival_perfect_stage1', name: '毫髮無傷', description: '在 Stage 1 (前 70 題) 全隊保持滿血過關', type: 'survival', icon: '💎', category: 'classic', sort_order: 210 },
        { key: 'survival_solo_10', name: '獨行俠', description: '當所有隊友死亡後，單人連續答對 10 題', type: 'survival', icon: '🤠', category: 'classic', sort_order: 220 },

        // Dark Achievements
        { key: 'dark_cold_blooded', name: '見死不救', description: '當隊友死亡時，擁有復活道具卻不使用，並持續過關 5 輪', type: 'dark', icon: '🧊', category: 'misc', sort_order: 900 },
        { key: 'dark_burden', name: '拖油瓶', description: '單場答錯超過 10 題，但依靠隊友 Cover 依然過關', type: 'dark', icon: '🪨', category: 'misc', sort_order: 910 },
        { key: 'dark_survivor_guilt', name: '倖存者罪惡', description: '全隊 4 人僅剩你 1 人存活，並獨自推進超過 20 題', type: 'dark', icon: '🥀', category: 'misc', sort_order: 920 },
        { key: 'dark_parasite', name: '吸血鬼', description: '到達 Stage 2 時，個人答對率低於 10%', type: 'dark', icon: '🦟', category: 'misc', sort_order: 930 },
        { key: 'dark_big_spender', name: '揮霍無度', description: '在商店將所有金幣花光，但一題未答即死亡', type: 'dark', icon: '💸', category: 'misc', sort_order: 940 }
    ];

    try {
        await dbOps.usersDb.transaction(async () => {
            // Create table if not exists (in case migration didn't run)
            await dbOps.usersDb.prepare(`
                CREATE TABLE IF NOT EXISTS achievements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    type TEXT NOT NULL,
                    icon TEXT,
                    condition_data JSON,
                    category TEXT DEFAULT 'classic',
                    sort_order INTEGER DEFAULT 0
                )
            `).run();

            await dbOps.usersDb.prepare(`
                CREATE TABLE IF NOT EXISTS user_achievements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    achievement_id INTEGER NOT NULL,
                    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (achievement_id) REFERENCES achievements(id),
                    UNIQUE(user_id, achievement_id)
                )
            `).run();

            for (const a of achievements) {
                console.log(`Inserting ${a.name}...`);
                await dbOps.usersDb.prepare(`
                    INSERT INTO achievements (key, name, description, type, icon, category, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        type = EXCLUDED.type,
                        icon = EXCLUDED.icon,
                        category = EXCLUDED.category,
                        sort_order = EXCLUDED.sort_order
                `).run(a.key, a.name, a.description, a.type, a.icon, a.category, a.sort_order);
            }
        });

        console.log('✅ Achievement initialization complete!');
    } catch (error) {
        console.error('❌ Seed failed:', error);
    }

    process.exit(0);
}

seedAchievements();
