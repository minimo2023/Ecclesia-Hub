-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL, -- e.g., 'stage_2_reached', 'cold_blooded'
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL, -- 'milestone', 'teamwork', 'survival', 'dark', 'lifetime'
    icon TEXT, -- Emoji or image path
    condition_data JSON -- Optional: store parameters like { count: 500 }
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id INTEGER NOT NULL,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id),
    UNIQUE(user_id, achievement_id)
);

-- Insert Initial Achievements
INSERT INTO achievements (key, name, description, type, icon) VALUES 
-- Milestones
('milestone_stage_2', '初出茅廬', '到達 Stage 2 (通過 70 題)', 'milestone', '🌱'),
('milestone_stage_3', '荒野行者', '到達 Stage 3 (通過 210 題)', 'milestone', '🌵'),
('milestone_stage_4', '幽谷之光', '到達 Stage 4 (通過 500 題)', 'milestone', '🕯️'),
('milestone_1000q', '登峰造極', '單場遠征達到 1000 題', 'milestone', '🏔️'),
('milestone_2000q', '聖經百科', '單場遠征達到 2000 題', 'milestone', '📚'),

-- Teamwork
('team_shield_5', '守護天使', '單場使用護盾成功抵擋傷害 5 次', 'teamwork', '🛡️'),
('team_heal_5', '神醫再世', '單場使用藥水治療隊友 5 次', 'teamwork', '💊'),
('team_revive_1', '復活的奇蹟', '成功復活一名隊友', 'teamwork', '✨'),
('team_scroll_assist_10', '神助攻', '使用聖靈卷軸後，隊伍在該題成功過關 (累計 10 次)', 'teamwork', '📜'),

-- Survival
('survival_low_hp_10', '九死一生', '全隊僅剩 1 點生命的情況下，連續通過 10 題', 'survival', '❤️‍🩹'),
('survival_perfect_stage1', '毫髮無傷', '在 Stage 1 (前 70 題) 全隊保持滿血過關', 'survival', '💎'),
('survival_solo_10', '獨行俠', '當所有隊友死亡後，單人連續答對 10 題', 'survival', '🤠'),

-- Dark Achievements
('dark_cold_blooded', '見死不救', '當隊友死亡時，擁有復活道具卻不使用，並持續過關 5 輪', 'dark', '🧊'),
('dark_burden', '拖油瓶', '單場答錯超過 10 題，但依靠隊友 Cover 依然過關', 'dark', '🪨'),
('dark_survivor_guilt', '倖存者罪惡', '全隊 4 人僅剩你 1 人存活，並獨自推進超過 20 題', 'dark', '🥀'),
('dark_parasite', '吸血鬼', '到達 Stage 2 時，個人答對率低於 10%', 'dark', '🦟'),
('dark_big_spender', '揮霍無度', '在商店將所有金幣花光，但一題未答即死亡', 'dark', '💸');
