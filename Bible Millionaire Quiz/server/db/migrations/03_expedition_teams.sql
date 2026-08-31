-- ============================================
-- 遠征隊專用資料表 (games.db)
-- ============================================

-- 隊伍表
CREATE TABLE IF NOT EXISTS expedition_teams (
    id TEXT PRIMARY KEY,                     -- 隊伍碼 (UUID)
    name TEXT NOT NULL,                      -- 隊名
    owner_id INTEGER,                        -- 建立者 ID (NULL = 訪客)
    owner_name TEXT NOT NULL,                -- 建立者顯示名稱
    current_question INTEGER DEFAULT 0,      -- 當前題數
    current_stage INTEGER DEFAULT 1,         -- 當前階段 (1-4)
    lives INTEGER DEFAULT 3,                 -- 剩餘生命
    score INTEGER DEFAULT 0,                 -- 累計分數
    status TEXT DEFAULT 'waiting',           -- waiting/playing/paused/ended
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 隊伍成員表
CREATE TABLE IF NOT EXISTS expedition_team_members (
    team_id TEXT NOT NULL,
    user_id INTEGER,                         -- NULL = 訪客
    display_name TEXT NOT NULL,
    is_owner INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES expedition_teams(id)
);

-- 遠征專用題庫 (6 選項)
CREATE TABLE IF NOT EXISTS expedition_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    options TEXT NOT NULL,                   -- JSON: 固定 6 個選項
    correct_index INTEGER NOT NULL,          -- 正確答案索引 (0-5)
    difficulty INTEGER DEFAULT 1,            -- 難度 1-4
    question_type TEXT DEFAULT 'choice',     -- choice/fill/true_false
    source_verse TEXT,                       -- 來源經文
    source TEXT DEFAULT 'ai_generated',      -- manual/ai_generated
    times_used INTEGER DEFAULT 0,            -- 被使用次數
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 遊戲中已答題目記錄
CREATE TABLE IF NOT EXISTS expedition_answered (
    team_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_correct INTEGER,
    PRIMARY KEY (team_id, question_id),
    FOREIGN KEY (team_id) REFERENCES expedition_teams(id),
    FOREIGN KEY (question_id) REFERENCES expedition_questions(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_teams_owner ON expedition_teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_status ON expedition_teams(status);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON expedition_questions(difficulty);
